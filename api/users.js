import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';

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

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/users:", err);
    res.status(500).json({ error: err.message });
  }
}
