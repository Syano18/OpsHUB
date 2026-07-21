import { createClient } from "@libsql/client/web";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const turso = createClient({
  url: process.env.VITE_TURSO_DB_URL,
  authToken: process.env.VITE_TURSO_DB_AUTH_TOKEN,
});

async function main() {
  try {
    console.log("Creating Sections table...");
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );
    `);
    console.log("Sections table created successfully.");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
