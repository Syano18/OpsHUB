import { createClient } from "@libsql/client/web";

let client = null;

const url = import.meta.env.VITE_TURSO_DB_URL;
const authToken = import.meta.env.VITE_TURSO_DB_AUTH_TOKEN;

if (url) {
  try {
    client = createClient({
      url,
      authToken,
    });
  } catch (error) {
    console.error("Failed to initialize Turso client:", error);
  }
}

export const turso = client;
