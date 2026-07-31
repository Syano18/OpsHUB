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
      url: process.env.VITE_TURSO_DB_URL, 
      authToken: process.env.VITE_TURSO_DB_AUTH_TOKEN 
    });

    // Create table if it doesn't exist
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Personal_Calendar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        title TEXT NOT NULL,
        event_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (req.method === 'GET') {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: 'Email required' });

      const rs = await turso.execute({
        sql: "SELECT * FROM Personal_Calendar WHERE LOWER(user_email) = LOWER(?) ORDER BY start_date ASC",
        args: [email]
      });

      return res.status(200).json({ events: rs.rows });
      
    } else if (req.method === 'POST') {
      const { email, title, event_type, start_date, end_date, description } = req.body;
      if (!email || !title) return res.status(400).json({ error: 'Missing required fields' });
      
      await turso.execute({
        sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [email, title, event_type, start_date, end_date, description]
      });
      
      return res.status(200).json({ success: true });
      
    } else if (req.method === 'PUT') {
      const { id, email, title, event_type, start_date, end_date, description } = req.body;
      if (!id || !email || !title) return res.status(400).json({ error: 'Missing required fields' });
      
      await turso.execute({
        sql: `UPDATE Personal_Calendar 
              SET title = ?, event_type = ?, start_date = ?, end_date = ?, description = ?
              WHERE id = ? AND LOWER(user_email) = LOWER(?)`,
        args: [title, event_type, start_date, end_date, description, id, email]
      });
      
      return res.status(200).json({ success: true });
      
    } else if (req.method === 'DELETE') {
      const { id, email } = req.query;
      if (!id || !email) return res.status(400).json({ error: 'Missing id or email' });
      
      const checkRes = await turso.execute({
        sql: "SELECT event_type FROM Personal_Calendar WHERE id = ? AND LOWER(user_email) = LOWER(?)",
        args: [id, email]
      });
      if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      if (checkRes.rows[0].event_type === 'Office Activity' || checkRes.rows[0].event_type === 'Leave') {
        return res.status(403).json({ error: 'Cannot delete Office Activities or Leaves directly from the personal calendar.' });
      }

      await turso.execute({
        sql: "DELETE FROM Personal_Calendar WHERE id = ? AND LOWER(user_email) = LOWER(?)",
        args: [id, email]
      });
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/calendar:", err);
    res.status(500).json({ error: err.message });
  }
}
