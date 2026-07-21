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
