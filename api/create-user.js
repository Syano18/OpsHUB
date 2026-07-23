import { createClerkClient, verifyToken } from '@clerk/backend';
import { createClient } from '@libsql/client';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error("Unauthorized: Missing or invalid token");
    }
    const token = authHeader.split(' ')[1];

    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error("CLERK_SECRET_KEY is missing");
    }

    // Verify the session token
    try {
      await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    } catch (err) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { email, firstName, lastName, middleName, suffix, role, empStat } = req.body;

    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const turso = createClient({ url: process.env.VITE_TURSO_DB_URL, authToken: process.env.VITE_TURSO_DB_AUTH_TOKEN });

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
      sql: `INSERT INTO User_Permissions (Email, First_Name, Last_Name, Middle_Name, Suffix, Role, emp_stat) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [email, firstName, lastName, middleName || '', suffix || '', role, empStat || '']
    });

    // 5. Send Email
    const transporter = nodemailer.createTransport({
      host: process.env.VITE_SMTP_HOST,
      port: parseInt(process.env.VITE_SMTP_PORT || '587'),
      secure: process.env.VITE_SMTP_PORT === '465',
      auth: { user: process.env.VITE_SMTP_USER, pass: process.env.VITE_SMTP_PASS },
    });

    const mailOptions = {
      from: process.env.VITE_SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
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

    res.status(200).json({ success: true, clerkUserId: clerkUser.id });
  } catch (err) {
    console.error("Create User Error:", err);
    res.status(500).json({ success: false, error: err.errors?.[0]?.message || err.message });
  }
}
