import { createClient } from '@libsql/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action } = req.body;

  if (action === 'check_status') {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const turso = createClient({ url: process.env.TURSO_DB_URL, authToken: process.env.TURSO_DB_AUTH_TOKEN });

      const checkRes = await turso.execute({
        sql: "SELECT Status FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });

      if (checkRes.rows.length > 0) {
        return res.status(200).json({ success: true, status: checkRes.rows[0].Status });
      } else {
        return res.status(200).json({ success: true, status: null });
      }
    } catch (err) {
      console.error("Check Status Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } 
  
  else if (action === 'verify_turnstile') {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Turnstile token is required' });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error('Missing TURNSTILE_SECRET_KEY environment variable');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);

      const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });

      const outcome = await result.json();

      if (outcome.success) {
        return res.status(200).json({ success: true });
      } else {
        console.error('Turnstile verification failed:', outcome['error-codes']);
        return res.status(400).json({ success: false, error: 'Turnstile verification failed' });
      }
    } catch (error) {
      console.error('Error verifying Turnstile token:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(400).json({ error: 'Invalid action provided' });
}
