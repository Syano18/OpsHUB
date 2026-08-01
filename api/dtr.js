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
      // Local dev bypass since CLERK_SECRET_KEY is missing from .env.local
      // In production (Vercel), ensure CLERK_SECRET_KEY is set in the environment variables!
      session = { id: 'local-bypass' };
    }

    const turso = createClient({ 
      url: process.env.TURSO_DB_URL, 
      authToken: process.env.TURSO_DB_AUTH_TOKEN 
    });

    if (req.method === 'GET') {
      const { email, firstName, lastName } = req.query;
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ error: 'Email, firstName, and lastName are required' });
      }

      // Fetch User Role
      let role = null;
      let currentUserDisplayName = '';
      
      const roleRes = await turso.execute({
        sql: "SELECT Role, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });

      if (roleRes.rows.length > 0) {
        const u = roleRes.rows[0];
        role = u.Role;
        if (u.First_Name && u.Last_Name) {
          currentUserDisplayName = `${u.First_Name} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name}`.trim();
        }
      }

      const isAdmin = role === 'Admin' || role === 'Super Admin';
      const firstInitial = firstName.charAt(0);
      const searchPattern = `${firstInitial}.%${lastName}`;

      let querySql = `
        SELECT 
          a.id, 
          a.employee_id, 
          a.full_name,
          a.date, 
          a.time_in_am, 
          a.time_out_am, 
          a.time_in_pm, 
          a.time_out_pm, 
          a.remarks,
          p.error_message,
          u.First_Name,
          u.Last_Name,
          u.Middle_Name
        FROM attendance a
        LEFT JOIN punch_errors p 
          ON a.employee_id = p.employee_id AND a.date = p.scan_date
        LEFT JOIN User_Permissions u
          ON REPLACE(a.full_name, ' ', '') = SUBSTR(u.First_Name, 1, 1) || '.' || REPLACE(u.Last_Name, ' ', '')
      `;
      let queryArgs = [];

      if (!isAdmin) {
        querySql += ` WHERE a.employee_id LIKE ? OR a.full_name LIKE ? `;
        queryArgs.push(searchPattern, searchPattern);
      }

      querySql += ` ORDER BY a.date DESC LIMIT 2000 `;

      const attendanceRes = await turso.execute({
        sql: querySql,
        args: queryArgs
      });

      // Map rows
      const mappedRows = attendanceRes.rows.map(row => {
        let displayName = row.full_name || row.employee_id;
        if (row.First_Name && row.Last_Name) {
          displayName = `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name}`.trim();
        }
        return { ...row, display_name: displayName };
      });

      return res.status(200).json({ 
        role, 
        currentUserDisplayName,
        attendance: mappedRows 
      });

    } else if (req.method === 'PUT') {
      const { id, remarks } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });

      await turso.execute({
        sql: "UPDATE attendance SET remarks = ?, updated_at = strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch') WHERE id = ?",
        args: [remarks, id]
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/dtr:", err);
    res.status(500).json({ error: err.message });
  }
}
