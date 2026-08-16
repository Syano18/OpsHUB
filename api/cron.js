import { createClient } from "@libsql/client/web";
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // Basic Security Check: Ensure the request comes from Vercel Cron
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
  }

  const url = process.env['TURSO_DB_URL'];
  const authToken = process.env['TURSO_DB_AUTH_TOKEN'];

  if (!url) {
    return res.status(500).json({ error: "Database URL not configured" });
  }

  const client = createClient({ url, authToken });
  const action = req.query.action || 'reminders'; // default to reminders

  try {
    if (action === 'leaves') {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      const currentYear = currentDate.getFullYear();
      
      const targetEmployeesCondition = `
        LOWER(user_email) IN (
          SELECT LOWER(Email) FROM User_Permissions 
          WHERE (emp_stat = 'Permanent' OR emp_stat = 'Contractual')
          AND (Status IS NULL OR Status != 'Inactive')
        )
      `;
  
      const results = [];
  
      // Monthly Addition
      await client.execute(`
        UPDATE Leave_Credits 
        SET vl_balance = vl_balance + 1.25, sl_balance = sl_balance + 1.25 
        WHERE ${targetEmployeesCondition}
      `);
      results.push('Successfully added 1.25 to VL and SL.');
  
      // Yearly Reset
      if (currentMonth === 1) {
        await client.execute(`
          UPDATE Leave_Credits
          SET fl_balance = 5, spl_balance = 3, wl_balance = 5, use_balance = 6
          WHERE ${targetEmployeesCondition}
        `);
        results.push(`Successfully reset FL, SPL, WL, and USE balances for year ${currentYear}.`);
      }
  
      return res.status(200).json({ success: true, message: 'Leaves updated', details: results });
    }

    if (action === 'reminders') {
      // 1. Calculate tomorrow's date
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
      const tomorrowDate = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
      const dateString = formatter.format(tomorrowDate);
  
      // 2. Fetch activities
      const actRes = await client.execute({
        sql: "SELECT * FROM Office_Activities WHERE start_date = ? AND status != 'Completed'",
        args: [dateString]
      });
  
      const activities = actRes.rows;
  
      // 3. Fetch personal calendar events starting tomorrow
      const calRes = await client.execute({
        sql: "SELECT * FROM Personal_Calendar WHERE start_date = ? AND event_type != 'Office Activity'",
        args: [dateString]
      });
      const personalEvents = calRes.rows;

      if (activities.length === 0 && personalEvents.length === 0) {
        return res.status(200).json({ success: true, message: `No upcoming activities for ${dateString}` });
      }
  
      const usersRes = await client.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE Email IS NOT NULL AND Email != ''");
      const allUsers = usersRes.rows.map(u => {
        const displayName = `${u.First_Name || ''} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name || ''}`.trim();
        return { email: u.Email, name: displayName };
      });
  
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
  
      let emailsSentCount = 0;
  
      // 4. Process Office Activities
      for (const activity of activities) {
        let assignedArray = [];
        try { assignedArray = JSON.parse(activity.assigned_to); } catch(e) {}
        
        let targetEmails = assignedArray.includes('All') ? allUsers.map(u => u.email) : allUsers.filter(u => assignedArray.includes(u.name)).map(u => u.email);
  
        if (targetEmails.length > 0) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
            bcc: targetEmails.join(', '),
            subject: `Reminder: Upcoming Activity - ${activity.title}`,
            text: `Reminder: You have an upcoming activity starting tomorrow.\n\nTitle: ${activity.title}`,
            html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Upcoming Activity Reminder</h2><p><strong>Title:</strong> ${activity.title}</p></div>`
          });
          emailsSentCount += targetEmails.length;
          
          try {
            const { sendPushNotification } = await import('../lib/pushHelper.js');
            await sendPushNotification(targetEmails, {
              title: `Upcoming Activity Reminder`,
              body: `Starting tomorrow: ${activity.title}`,
              url: '/office-activities'
            });
          } catch(e) {
            console.error("Push failed:", e);
          }
        }
      }
  
      // 5. Send emails for personal events
      for (const event of personalEvents) {
        if (event.user_email) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || '"OpsHUB" <noreply@opshub.local>',
            to: event.user_email,
            subject: `Reminder: Upcoming Personal Event - ${event.title}`,
            text: `Reminder: You have an upcoming personal event starting tomorrow.\n\nTitle: ${event.title}`,
            html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Upcoming Personal Event Reminder</h2><p><strong>Title:</strong> ${event.title}</p></div>`
          });
          emailsSentCount++;
        }
      }
  
      return res.status(200).json({ success: true, message: `Sent ${emailsSentCount} reminder(s)` });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    console.error("Cron Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
