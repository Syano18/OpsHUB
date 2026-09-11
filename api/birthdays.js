import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];

    let session;
    if (process.env.CLERK_SECRET_KEY) {
      try {
        session = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } else {
      session = { id: 'local-bypass' };
    }

    const turso = createClient({ 
      url: process.env['TURSO_DB_URL'], 
      authToken: process.env['TURSO_DB_AUTH_TOKEN'] 
    });

    // Auto-migrate: ensure birthdate column exists in User_Permissions
    try {
      await turso.execute("ALTER TABLE User_Permissions ADD COLUMN birthdate TEXT");
    } catch (e) {
      // Column already exists
    }

    if (req.method === 'GET') {
      const { email } = req.query;

      // Current logged in user info
      let currentUser = null;
      if (email) {
        const uRes = await turso.execute({
          sql: "SELECT Role, Email, First_Name, Last_Name, Position, birthdate FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
          args: [email]
        });
        if (uRes.rows.length > 0) {
          currentUser = uRes.rows[0];
        }
      }

      // Fetch all active internal staff
      const query = `
        SELECT 
          Email, First_Name, Middle_Name, Last_Name, Suffix, 
          Role, emp_stat, Position, sex, birthdate
        FROM User_Permissions 
        WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) 
          AND IFNULL(is_regional, 0) != 1 
          AND IFNULL(Role, '') != 'External Signatory'
        ORDER BY First_Name ASC, Last_Name ASC
      `;

      const result = await turso.execute(query);

      return res.status(200).json({
        success: true,
        employees: result.rows,
        currentUser
      });

    } else if (req.method === 'PUT') {
      const { email, targetEmail, birthdate } = req.body;

      if (!email || !targetEmail) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Check caller's role
      const callerRes = await turso.execute({
        sql: "SELECT Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });
      const callerRole = callerRes.rows[0]?.Role;
      const isAdmin = callerRole === 'Admin' || callerRole === 'Super Admin';

      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Only Super Admin and Admin can enter or edit birthdates.' });
      }

      await turso.execute({
        sql: "UPDATE User_Permissions SET birthdate = ? WHERE LOWER(Email) = LOWER(?)",
        args: [birthdate || null, targetEmail]
      });

      return res.status(200).json({ success: true, message: 'Birthdate updated successfully' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/birthdays:", err);
    res.status(500).json({ error: err.message });
  }
}
