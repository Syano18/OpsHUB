import { createClient } from "@libsql/client/web";
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // Optional security check (if CRON_SECRET is set in Vercel)
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.TURSO_DB_URL;
  const authToken = process.env.TURSO_DB_AUTH_TOKEN;

  if (!url) {
    return res.status(500).json({ error: "Database URL not configured" });
  }

  const client = createClient({ url, authToken });

  try {
    // 1. Calculate tomorrow's date in Manila timezone (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
    const tomorrowDate = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const dateString = formatter.format(tomorrowDate);

    // 2. Fetch activities starting tomorrow that are not completed
    const actRes = await client.execute({
      sql: "SELECT * FROM Office_Activities WHERE start_date = ? AND status != 'Completed'",
      args: [dateString]
    });

    const activities = actRes.rows;

    if (activities.length === 0) {
      return res.status(200).json({ success: true, message: `No upcoming activities for ${dateString}` });
    }

    // 3. Fetch all active users with emails to map assigned_to names
    const usersRes = await client.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE Email IS NOT NULL AND Email != ''");
    const allUsers = usersRes.rows.map(u => {
      const displayName = `${u.First_Name || ''} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name || ''}`.trim();
      return { email: u.Email, name: displayName };
    });

    // 4. Set up nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let emailsSentCount = 0;

    // 5. Process each activity and send emails
    for (const activity of activities) {
      let assignedArray = [];
      try {
        assignedArray = JSON.parse(activity.assigned_to);
      } catch(e) {}
      
      let targetEmails = [];
      if (assignedArray.includes('All')) {
        targetEmails = allUsers.map(u => u.email);
      } else {
        targetEmails = allUsers.filter(u => assignedArray.includes(u.name)).map(u => u.email);
      }

      if (targetEmails.length > 0) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
          bcc: targetEmails.join(', '),
          subject: `Reminder: Upcoming Activity - ${activity.title}`,
          text: `Reminder: You have an upcoming activity starting tomorrow.\n\nTitle: ${activity.title}\nDates: ${activity.start_date} to ${activity.end_date || activity.start_date}\n\nDescription: ${activity.description}\n\n---\nPlease do not reply to this message. This is an automated notification from OpsHUB.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #0f766e;">Upcoming Activity Reminder</h2>
              <p>You have an upcoming activity starting tomorrow.</p>
              <p><strong>Title:</strong> ${activity.title}</p>
              <p><strong>Dates:</strong> ${activity.start_date} to ${activity.end_date || activity.start_date}</p>
              <p><strong>Description:</strong></p>
              <p style="white-space: pre-wrap;">${activity.description || 'No description provided.'}</p>
              <div style="margin-top: 25px; margin-bottom: 25px;">
                <a href="https://operations-hub-iota.vercel.app" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Go to OpsHUB</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
              <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
            </div>
          `
        });
        
        emailsSentCount += targetEmails.length;
      }
    }

    res.status(200).json({ success: true, message: `Sent ${emailsSentCount} reminder(s) for ${activities.length} activity(s).` });
  } catch (err) {
    console.error("Cron Reminder Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
