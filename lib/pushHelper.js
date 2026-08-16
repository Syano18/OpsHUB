import webpush from 'web-push';
import { createClient } from '@libsql/client';

if (process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:kalinga@psa.gov.ph',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPushNotification(emails, payload) {
  if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.TURSO_DB_URL) return;
  
  const turso = createClient({ 
    url: process.env['TURSO_DB_URL'], 
    authToken: process.env['TURSO_DB_AUTH_TOKEN'] 
  });

  try {
    const placeholders = emails.map(() => '?').join(',');
    const sql = `SELECT * FROM Push_Subscriptions WHERE user_email IN (${placeholders})`;
    
    const res = await turso.execute({
      sql: sql,
      args: emails
    });

    const sendPromises = res.rows.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription has expired or is no longer valid, delete it
          await turso.execute({
            sql: `DELETE FROM Push_Subscriptions WHERE endpoint = ?`,
            args: [row.endpoint]
          });
        } else {
          console.error("Push Error:", err);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error("Failed to fetch subscriptions:", err);
  }
}
