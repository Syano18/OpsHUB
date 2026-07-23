import { createClient } from '@libsql/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const turso = createClient({ url: process.env.VITE_TURSO_DB_URL, authToken: process.env.VITE_TURSO_DB_AUTH_TOKEN });

    const checkRes = await turso.execute({
      sql: "SELECT Status FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
      args: [email]
    });

    if (checkRes.rows.length > 0) {
      res.status(200).json({ success: true, status: checkRes.rows[0].Status });
    } else {
      res.status(200).json({ success: true, status: null });
    }
  } catch (err) {
    console.error("Check Status Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
