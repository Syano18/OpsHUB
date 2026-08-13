import { createClient } from '@libsql/client';
import { verifyToken, createClerkClient } from '@clerk/backend';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    
    // Validate session token
    let session;
    if (process.env.CLERK_SECRET_KEY) {
      try {
        session = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } else {
      // Local dev bypass since CLERK_SECRET_KEY is missing from .env.local
      // In production (Vercel), ensure CLERK_SECRET_KEY is set in the environment variables!
      session = { id: 'local-bypass' };
    }
    
    const turso = createClient({ 
      url: process.env['TURSO_DB_URL'], 
      authToken: process.env['TURSO_DB_AUTH_TOKEN'] 
    });

    try {
      await turso.execute("ALTER TABLE User_Permissions ADD COLUMN signature_url TEXT");
    } catch (e) {
      // Ignore error if column already exists
    }

    if (req.method === 'GET') {
      const { email, fetchAll } = req.query;
      
      if (!email) return res.status(400).json({ error: 'Email is required' });

      // Fetch the requesting user's profile
      const userRs = await turso.execute({
        sql: "SELECT * FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });
      
      if (userRs.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const loggedInUser = userRs.rows[0];
      let allUsers = [];

      if (fetchAll === 'true' && (loggedInUser.Role === 'Admin' || loggedInUser.Role === 'Super Admin')) {
        const allUsersRs = await turso.execute('SELECT * FROM User_Permissions');
        allUsers = allUsersRs.rows;
      }
      
      return res.status(200).json({ user: loggedInUser, allUsers });
      
    } else if (req.method === 'PUT') {
      // Update own profile
      const { email, editForm } = req.body;
      if (!email || !editForm) return res.status(400).json({ error: 'Missing email or editForm' });
      
      await turso.execute({
        sql: `UPDATE User_Permissions SET 
                First_Name = ?, Middle_Name = ?, Last_Name = ?, Suffix = ?, 
                Position = ?, sex = ?, emp_stat = ?, Salary_Grade = ?, Salary = ?
              WHERE LOWER(Email) = LOWER(?)`,
        args: [
          editForm.First_Name || '', editForm.Middle_Name || '', editForm.Last_Name || '', editForm.Suffix || '',
          editForm.Position || '', editForm.sex || '', editForm.emp_stat || '', 
          editForm.Salary_Grade ? parseInt(editForm.Salary_Grade) : null,
          editForm.Salary ? parseFloat(editForm.Salary) : null,
          email
        ]
      });
      
      return res.status(200).json({ success: true });
      
    } else if (req.method === 'PATCH') {
      // Admin updating a user's role and details
      const { adminEmail, targetEmail, targetRole, firstName, lastName, middleName, suffix, position, salary, salaryGrade, isRegional, emp_stat } = req.body;
      if (!adminEmail || !targetEmail || !targetRole) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const adminRs = await turso.execute({
        sql: "SELECT Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [adminEmail]
      });
      
      if (adminRs.rows.length === 0 || (adminRs.rows[0].Role !== 'Admin' && adminRs.rows[0].Role !== 'Super Admin')) {
        return res.status(403).json({ error: 'Forbidden: Requires Admin role' });
      }
      
      await turso.execute({
        sql: `UPDATE User_Permissions SET 
                Role = ?, First_Name = ?, Last_Name = ?, Middle_Name = ?, Suffix = ?, Position = ?, Salary = ?, Salary_Grade = ?, is_regional = ?, emp_stat = ? 
              WHERE LOWER(Email) = LOWER(?)`,
        args: [
          targetRole, 
          firstName || '', 
          lastName || '', 
          middleName || '', 
          suffix || '', 
          position || '', 
          salary ? parseFloat(salary) : null,
          salaryGrade ? parseInt(salaryGrade) : null,
          isRegional ? 1 : 0, 
          emp_stat || '',
          targetEmail
        ]
      });
      
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST') {
      const { action, email, firstName, lastName, middleName, suffix, role, empStat, position, isRegional } = req.body;
      
      if (action === 'check_status') {
        if (!email) return res.status(400).json({ error: 'Email is required', success: false });
        const rs = await turso.execute({ sql: 'SELECT Status FROM User_Permissions WHERE LOWER(Email) = LOWER(?)', args: [email] });
        if (rs.rows.length === 0) return res.status(200).json({ success: true, status: 'active' }); 
        return res.status(200).json({ success: true, status: rs.rows[0].Status || 'active' });
      }
      
      if (action === 'create') {
        if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is missing");
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const checkRes = await turso.execute({ sql: "SELECT * FROM User_Permissions WHERE LOWER(Email) = LOWER(?)", args: [email] });
        if (checkRes.rows.length > 0) throw new Error("A user with this email already exists in the database.");

        const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
        let clerkUser = null;
        if (role !== 'External Signatory') {
          clerkUser = await clerkClient.users.createUser({ emailAddress: [email], password: tempPassword, firstName, lastName, skipPasswordRequirement: true });
        }

        await turso.execute({
          sql: `INSERT INTO User_Permissions (Email, First_Name, Last_Name, Middle_Name, Suffix, Role, emp_stat, Position, is_regional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [email, firstName, lastName, middleName || '', suffix || '', role, empStat || '', position || '', isRegional ? 1 : 0]
        });

        if (role !== 'External Signatory') {
          const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'), secure: process.env.SMTP_PORT === '465', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }});
          const mailOptions = {
            from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
            to: email, subject: 'Welcome to OpsHUB - Your Account Details',
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #0d9488;">Welcome to OpsHUB!</h2><p>Hello ${firstName} ${lastName},</p><p>An administrator has created an account for you with the role of <strong>${role}</strong>.</p><div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="margin: 0 0 10px 0;"><strong>Your Login Email:</strong> ${email}</p><p style="margin: 0;"><strong>Your Temporary Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${tempPassword}</span></p></div><p>Please log in and change your password as soon as possible.</p><p>Best regards,<br>The OpsHUB Admin</p></div>`
          };
          await transporter.sendMail(mailOptions);
        }
        return res.status(200).json({ success: true, clerkUserId: clerkUser ? clerkUser.id : null });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/users:", err);
    res.status(500).json({ error: err.message });
  }
}
