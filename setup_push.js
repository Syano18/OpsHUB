import { createClient } from '@libsql/client/web';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function setup() {
  if (!process.env.TURSO_DB_URL) {
    console.error("TURSO_DB_URL not found in .env.local");
    return;
  }
  const client = createClient({
    url: process.env.TURSO_DB_URL,
    authToken: process.env.TURSO_DB_AUTH_TOKEN
  });

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS Push_Subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Push_Subscriptions table created successfully!");
  } catch (err) {
    console.error("Error creating table:", err);
  }
}

setup();
