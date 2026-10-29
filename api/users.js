import { createClient } from '@libsql/client';
import { verifyToken, createClerkClient } from '@clerk/backend';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { renderEmailLayout, escapeHtml, getBaseUrl } from '../lib/emailTemplate.js';

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
    } catch (e) {}
    try {
      await turso.execute("ALTER TABLE User_Permissions ADD COLUMN birthdate TEXT");
    } catch (e) {}

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
      
      return res.status(200).json({ 
        user: loggedInUser,
        allUsers 
      });
      
    } else if (req.method === 'PUT') {
      // Update own profile
      const { email, editForm } = req.body;
      if (!email || !editForm) return res.status(400).json({ error: 'Missing email or editForm' });
      
      const userCheck = await turso.execute({
        sql: "SELECT Role, birthdate FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });
      const userRole = userCheck.rows[0]?.Role;
      const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';
      const effectiveBirthdate = isAdmin ? (editForm.birthdate || null) : (userCheck.rows[0]?.birthdate || null);

      await turso.execute({
        sql: `UPDATE User_Permissions SET 
                First_Name = ?, Middle_Name = ?, Last_Name = ?, Suffix = ?, 
                Position = ?, sex = ?, emp_stat = ?, Salary_Grade = ?, Salary = ?, birthdate = ?
              WHERE LOWER(Email) = LOWER(?)`,
        args: [
          editForm.First_Name || '', editForm.Middle_Name || '', editForm.Last_Name || '', editForm.Suffix || '',
          editForm.Position || '', editForm.sex || '', editForm.emp_stat || '', 
          editForm.Salary_Grade ? parseInt(editForm.Salary_Grade) : null,
          editForm.Salary ? parseFloat(editForm.Salary) : null,
          effectiveBirthdate,
          email
        ]
      });
      
      return res.status(200).json({ success: true });
      
    } else if (req.method === 'PATCH') {
      // Admin updating a user's role and details
      const { adminEmail, targetEmail, targetRole, firstName, lastName, middleName, suffix, position, salary, salaryGrade, isRegional, emp_stat, birthdate } = req.body;
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
                Role = ?, First_Name = ?, Last_Name = ?, Middle_Name = ?, Suffix = ?, Position = ?, Salary = ?, Salary_Grade = ?, is_regional = ?, emp_stat = ?, birthdate = ? 
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
          birthdate || null,
          targetEmail
        ]
      });
      
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST') {
      const { action, email, firstName, lastName, middleName, suffix, role, empStat, position, isRegional, birthdate } = req.body;
      
      if (action === 'check_status') {
        if (!email) return res.status(400).json({ error: 'Email is required', success: false });
        const rs = await turso.execute({ sql: 'SELECT Status, Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)', args: [email] });
        if (rs.rows.length === 0) return res.status(200).json({ success: true, status: 'active', role: null }); 
        return res.status(200).json({ success: true, status: rs.rows[0].Status || 'active', role: rs.rows[0].Role });
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
          sql: `INSERT INTO User_Permissions (Email, First_Name, Last_Name, Middle_Name, Suffix, Role, emp_stat, Position, is_regional, birthdate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [email, firstName, lastName, middleName || '', suffix || '', role, empStat || '', position || '', isRegional ? 1 : 0, birthdate || null]
        });

        if (role !== 'External Signatory') {
          const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'), secure: process.env.SMTP_PORT === '465', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }});
          const loginUrl = `${getBaseUrl(req)}/`;
          const bodyHtml = `
            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
              Hello <strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong>,
            </p>
            <p style="margin: 0 0 20px 0; color: #475569;">
              An administrator has created an account for you on <strong>OpsHUB</strong> with the role of <strong style="color: #0f766e;">${escapeHtml(role)}</strong>.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Account Credentials</p>
              <div style="margin-bottom: 12px;">
                <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 2px;">Login Email</span>
                <span style="font-size: 14px; font-weight: 600; color: #0f172a; word-break: break-all;">${escapeHtml(email)}</span>
              </div>
              <div>
                <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Temporary Password</span>
                <span style="display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 15px; font-weight: 700; color: #0f766e; background: #ccfbf1; border: 1px solid #99f6e4; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.5px;">
                  ${escapeHtml(tempPassword)}
                </span>
              </div>
            </div>

            <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; color: #166534; line-height: 1.5;">
              <strong>Security Notice:</strong> Please log in and change your temporary password as soon as possible under your Profile settings.
            </div>

            <div style="text-align: center; margin-bottom: 8px;">
              <a href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.3);">
                Log In to OpsHUB &rarr;
              </a>
            </div>
          `;

          const mailOptions = {
            from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
            to: email,
            subject: 'Welcome to OpsHUB - Your Account Details',
            html: renderEmailLayout({
              headerTitle: 'Welcome to OpsHUB!',
              theme: 'teal',
              bodyHtml
            })
          };
          await transporter.sendMail(mailOptions);
        }
        return res.status(200).json({ success: true, clerkUserId: clerkUser ? clerkUser.id : null });
      }

      if (action === 'subscribe') {
        const { email: subEmail, subscription } = req.body;
        if (!subEmail) return res.status(400).json({ error: 'Email required' });
        if (!subscription || !subscription.endpoint || !subscription.keys) {
          return res.status(400).json({ error: 'Invalid subscription object' });
        }

        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Push_Subscriptions (
            user_email TEXT NOT NULL,
            endpoint TEXT PRIMARY KEY,
            p256dh TEXT,
            auth TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await turso.execute({
          sql: `INSERT INTO Push_Subscriptions (user_email, endpoint, p256dh, auth) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET 
                  user_email = excluded.user_email,
                  p256dh = excluded.p256dh,
                  auth = excluded.auth`,
          args: [
            subEmail, 
            subscription.endpoint, 
            subscription.keys.p256dh, 
            subscription.keys.auth
          ]
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'unsubscribe') {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint) {
          return res.status(400).json({ error: 'Endpoint required for unsubscribe' });
        }
        
        await turso.execute({
          sql: `DELETE FROM Push_Subscriptions WHERE endpoint = ?`,
          args: [subscription.endpoint]
        });

        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/users:", err);
    res.status(500).json({ error: err.message });
  }
}
