import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    
    if (process.env.CLERK_SECRET_KEY) {
      try {
        await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    }

    const { email, subscription, action } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const turso = createClient({ 
      url: process.env['TURSO_DB_URL'], 
      authToken: process.env['TURSO_DB_AUTH_TOKEN'] 
    });

    if (action === 'subscribe') {
      if (!subscription || !subscription.endpoint || !subscription.keys) {
         return res.status(400).json({ error: 'Invalid subscription object' });
      }

      await turso.execute({
        sql: `INSERT INTO Push_Subscriptions (user_email, endpoint, p256dh, auth) 
              VALUES (?, ?, ?, ?)
              ON CONFLICT(endpoint) DO UPDATE SET 
                user_email = excluded.user_email,
                p256dh = excluded.p256dh,
                auth = excluded.auth`,
        args: [
          email, 
          subscription.endpoint, 
          subscription.keys.p256dh, 
          subscription.keys.auth
        ]
      });

      return res.status(200).json({ success: true });
    } else if (action === 'unsubscribe') {
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Endpoint required for unsubscribe' });
      }
      
      await turso.execute({
        sql: `DELETE FROM Push_Subscriptions WHERE endpoint = ?`,
        args: [subscription.endpoint]
      });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    console.error("Push Subscribe Error:", err);
    res.status(500).json({ error: err.message });
  }
}
