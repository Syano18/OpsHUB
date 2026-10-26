import { createClient } from "@libsql/client/web";
import nodemailer from "nodemailer";
import { renderEmailLayout, escapeHtml, getBaseUrl } from "../lib/emailTemplate.js";

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

      const usersRes = await client.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE Email IS NOT NULL AND Email != '' AND (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory')");
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
        try { assignedArray = JSON.parse(activity.assigned_to); } catch (e) { }

        let rawTargetEmails = assignedArray.includes('All') ? allUsers.map(u => u.email) : allUsers.filter(u => assignedArray.includes(u.name)).map(u => u.email);
        let targetEmails = [...new Set((rawTargetEmails || []).map(e => (e || '').trim().toLowerCase()).filter(e => e && e.includes('@')))];

        if (targetEmails.length > 0) {
          const appBaseUrl = getBaseUrl(req);
          const activityBodyHtml = `
            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
              Reminder: You have an assigned office activity starting tomorrow.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Activity</p>
              <h3 style="margin: 0 0 10px 0; font-size: 17px; color: #0f172a;">${escapeHtml(activity.title)}</h3>
              <div style="display: inline-block; padding: 4px 10px; background-color: #f1f5f9; color: #475569; border-radius: 6px; font-size: 12px; font-weight: 600;">
                📅 Starts Tomorrow: ${escapeHtml(activity.start_date || '')}
              </div>
            </div>

            <div style="text-align: center; margin-bottom: 8px;">
              <a href="${appBaseUrl}/office-activities" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.3);">
                Open Office Activities &rarr;
              </a>
            </div>
          `;

          await transporter.sendMail({
            from: process.env.SMTP_FROM || (process.env.SMTP_USER ? `"OpsHUB Notifier" <${process.env.SMTP_USER}>` : '"OpsHUB Notifier" <kalinga@psa.gov.ph>'),
            bcc: targetEmails.join(', '),
            subject: `Reminder: Upcoming Activity - ${activity.title}`,
            text: `Reminder: You have an upcoming activity starting tomorrow.\n\nTitle: ${activity.title}\n\nView on OpsHUB: ${appBaseUrl}/office-activities`,
            html: renderEmailLayout({
              headerTitle: 'Upcoming Activity Reminder',
              theme: 'teal',
              bodyHtml: activityBodyHtml
            })
          });
          emailsSentCount += targetEmails.length;

          try {
            const { sendPushNotification } = await import('../lib/pushHelper.js');
            await sendPushNotification(targetEmails, {
              title: `Upcoming Activity Reminder`,
              body: `Starting tomorrow: ${activity.title}`,
              url: '/office-activities'
            });
          } catch (e) {
            console.error("Push failed:", e);
          }
        }
      }

      // 5. Send emails for personal events
      for (const event of personalEvents) {
        if (event.user_email) {
          const appBaseUrl = getBaseUrl(req);
          const personalBodyHtml = `
            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
              Reminder: You have a scheduled personal calendar event starting tomorrow.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Personal Event</p>
              <h3 style="margin: 0 0 6px 0; font-size: 17px; color: #0f172a;">${escapeHtml(event.title)}</h3>
              ${event.start_date ? `
                <div style="display: inline-block; padding: 4px 10px; background-color: #f1f5f9; color: #475569; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 6px;">
                  📅 Starts Tomorrow: ${escapeHtml(event.start_date)}
                </div>
              ` : ''}
            </div>

            <div style="text-align: center; margin-bottom: 8px;">
              <a href="${appBaseUrl}/" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Open OpsHUB Calendar &rarr;
              </a>
            </div>
          `;

          await transporter.sendMail({
            from: process.env.SMTP_FROM || (process.env.SMTP_USER ? `"OpsHUB Notifier" <${process.env.SMTP_USER}>` : '"OpsHUB Notifier" <kalinga@psa.gov.ph>'),
            to: event.user_email,
            subject: `Reminder: Upcoming Personal Event - ${event.title}`,
            text: `Reminder: You have an upcoming personal event starting tomorrow.\n\nTitle: ${event.title}\n\nView on OpsHUB: ${appBaseUrl}/`,
            html: renderEmailLayout({
              headerTitle: 'Personal Event Reminder',
              theme: 'teal',
              bodyHtml: personalBodyHtml
            })
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
