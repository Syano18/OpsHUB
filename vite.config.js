import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import nodemailer from 'nodemailer'

const smtpMiddleware = (env) => {
  return {
    name: 'smtp-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/send-email' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const { to, subject, text, html } = data;

              const transporter = nodemailer.createTransport({
                host: env.VITE_SMTP_HOST,
                port: parseInt(env.VITE_SMTP_PORT || '587'),
                secure: env.VITE_SMTP_PORT === '465',
                auth: {
                  user: env.VITE_SMTP_USER,
                  pass: env.VITE_SMTP_PASS,
                },
              });

              if (!env.VITE_SMTP_USER) {
                throw new Error("SMTP credentials not set in .env.local");
              }

              const info = await transporter.sendMail({
                from: env.VITE_SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: subject,
                text: text,
                html: html
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, messageId: info.messageId }));
            } catch (err) {
              console.error("SMTP Error:", err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else if (req.url === '/api/create-user' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const { email, firstName, lastName, middleName, suffix, role } = data;

              if (!env.CLERK_SECRET_KEY) {
                throw new Error("CLERK_SECRET_KEY is missing in .env.local");
              }

              const { createClerkClient } = await import('@clerk/backend');
              const crypto = await import('crypto');
              const { createClient } = await import('@libsql/client');

              const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
              const turso = createClient({ url: env.VITE_TURSO_DB_URL, authToken: env.VITE_TURSO_DB_AUTH_TOKEN });

              // 1. Check Turso DB
              const checkRes = await turso.execute({
                sql: "SELECT * FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
                args: [email]
              });
              if (checkRes.rows.length > 0) {
                throw new Error("A user with this email already exists in the database.");
              }

              // 2. Generate Password
              const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';

              // 3. Create Clerk User
              const clerkUser = await clerkClient.users.createUser({
                emailAddress: [email],
                password: tempPassword,
                firstName,
                lastName,
                skipPasswordRequirement: true
              });

              // 4. Save to Turso
              await turso.execute({
                sql: `INSERT INTO User_Permissions (Email, First_Name, Last_Name, Middle_Name, Suffix, Role) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [email, firstName, lastName, middleName || '', suffix || '', role]
              });

              // 5. Send Email
              const transporter = nodemailer.createTransport({
                host: env.VITE_SMTP_HOST,
                port: parseInt(env.VITE_SMTP_PORT || '587'),
                secure: env.VITE_SMTP_PORT === '465',
                auth: { user: env.VITE_SMTP_USER, pass: env.VITE_SMTP_PASS },
              });

              const mailOptions = {
                from: env.VITE_SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
                to: email,
                subject: 'Welcome to OpsHUB - Your Account Details',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0d9488;">Welcome to OpsHUB!</h2>
                    <p>Hello ${firstName} ${lastName},</p>
                    <p>An administrator has created an account for you with the role of <strong>${role}</strong>.</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0 0 10px 0;"><strong>Your Login Email:</strong> ${email}</p>
                      <p style="margin: 0;"><strong>Your Temporary Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${tempPassword}</span></p>
                    </div>
                    <p>Please log in and change your password as soon as possible.</p>
                    <p>Best regards,<br>The OpsHUB Admin</p>
                  </div>
                `,
              };
              await transporter.sendMail(mailOptions);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, clerkUserId: clerkUser.id }));
            } catch (err) {
              console.error("Create User Error:", err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.errors?.[0]?.message || err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), smtpMiddleware(env)],
  }
})
