import { readFileSync } from 'fs';
import { createClient } from '@libsql/client';

const env = readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/VITE_TURSO_DB_URL=(.+)/);
const tokenMatch = env.match(/VITE_TURSO_DB_AUTH_TOKEN=(.+)/);

const turso = createClient({
  url: urlMatch[1].trim().replace(/"/g, ''),
  authToken: tokenMatch[1].trim().replace(/"/g, '')
});

async function run() {
  const rs = await turso.execute("SELECT * FROM Users");
  console.log("Users:", rs.rows);
}

run();
