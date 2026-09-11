import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';
import nodemailer from 'nodemailer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let s3Client;
const BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();
if (BUCKET_NAME) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT_URL?.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    }
  });
}

function sanitizeEmails(emails) {
  if (!Array.isArray(emails)) return [];
  const cleaned = emails
    .map(e => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
    .filter(e => e && e.includes('@') && !e.includes(' '));
  return [...new Set(cleaned)];
}

function normalizeStr(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function resolveAssigneeEmails(turso, assignedNames) {
  if (!assignedNames || !Array.isArray(assignedNames) || assignedNames.length === 0) {
    return [];
  }

  if (assignedNames.includes('All')) {
    const allRes = await turso.execute(
      "SELECT Email FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory')"
    );
    return sanitizeEmails(allRes.rows.map(r => r.Email));
  }

  const allRes = await turso.execute(
    "SELECT Email, First_Name, Middle_Name, Last_Name, Suffix FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory')"
  );

  const matched = allRes.rows.filter(r => {
    const f = (r.First_Name || '').trim();
    const m = (r.Middle_Name || '').trim();
    const l = (r.Last_Name || '').trim();
    const s = (r.Suffix || '').trim();

    const fullNameWithMi = `${f} ${m ? m.charAt(0) + '. ' : ''}${l}${s ? ' ' + s : ''}`.trim();
    const fullNameNoMi = `${f} ${l}${s ? ' ' + s : ''}`.trim();
    const plainFirstLast = `${f} ${l}`.trim();

    return assignedNames.some(assigned => {
      const a = (assigned || '').trim();
      if (a === fullNameWithMi || a === fullNameNoMi || a === plainFirstLast) return true;
      const nAssigned = normalizeStr(a);
      return (
        nAssigned === normalizeStr(fullNameWithMi) ||
        nAssigned === normalizeStr(fullNameNoMi) ||
        nAssigned === normalizeStr(plainFirstLast)
      );
    });
  }).map(r => r.Email);

  return sanitizeEmails(matched);
}

function createMailer() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[Mailer] SMTP credentials missing in environment variables.");
    return null;
  }

  return nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function sendBatchMail(transporter, emails, mailOptionsGenerator) {
  if (!transporter || !emails || emails.length === 0) return 0;

  let failedCount = 0;
  const BATCH_SIZE = 4;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (targetEmail) => {
        const mailOptions = mailOptionsGenerator(targetEmail);
        try {
          return await transporter.sendMail(mailOptions);
        } catch (err) {
          console.warn(`[Nodemailer] First dispatch attempt failed for ${targetEmail}: ${err.message}. Retrying in 400ms...`);
          await new Promise(r => setTimeout(r, 400));
          return await transporter.sendMail(mailOptions);
        }
      })
    );

    for (let idx = 0; idx < results.length; idx++) {
      const res = results[idx];
      if (res.status === 'rejected') {
        console.error(`[Nodemailer] Final delivery failed for recipient ${batch[idx]}:`, res.reason);
        failedCount++;
      }
    }
  }

  return failedCount;
}

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    
    let session;
    if (process.env.CLERK_SECRET_KEY) {
      try {
        session = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } else {
      session = { id: 'local-bypass' };
    }

    const turso = createClient({ 
      url: process.env['TURSO_DB_URL'], 
      authToken: process.env['TURSO_DB_AUTH_TOKEN'] 
    });

    if (req.method === 'GET') {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: 'Email required' });

      // Fetch User Role & Name
      const roleRes = await turso.execute({
        sql: "SELECT Role, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });

      // Fetch Employees for Dropdown
      const empRes = await turso.execute(
        "SELECT First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory') ORDER BY First_Name ASC"
      );
      const uniqueEmps = new Set();
      empRes.rows.forEach(row => {
        if (row.First_Name && row.Last_Name) {
          const name = `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name}`.trim();
          uniqueEmps.add(name);
        }
      });

      // Fetch Activities
      const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");

      // Fetch Today's Birthday Celebrants
      let todayCelebrants = [];
      try {
        const todayBdayRes = await turso.execute(
          "SELECT First_Name, Middle_Name, Last_Name, Suffix, Position, birthdate FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') != 'External Signatory' AND birthdate IS NOT NULL AND birthdate != ''"
        );
        
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        
        todayCelebrants = todayBdayRes.rows.filter(row => {
          if (!row.birthdate) return false;
          const parts = row.birthdate.split('-');
          if (parts.length < 2) return false;
          const m = parseInt(parts[parts.length - 2], 10);
          const d = parseInt(parts[parts.length - 1], 10);
          return m === currentMonth && d === currentDay;
        }).map(row => {
          const f = (row.First_Name || '').trim();
          const m = (row.Middle_Name || '').trim() ? row.Middle_Name.trim().charAt(0) + '. ' : '';
          const l = (row.Last_Name || '').trim();
          const s = (row.Suffix || '').trim() ? ' ' + row.Suffix.trim() : '';
          return {
            name: `${f} ${m}${l}${s}`.trim(),
            firstName: f,
            position: row.Position || 'Staff',
            birthdate: row.birthdate
          };
        });
      } catch (e) {
        console.warn("Could not fetch today's birthdays in activities API:", e);
      }

      return res.status(200).json({ 
        user: roleRes.rows[0] || null,
        employees: Array.from(uniqueEmps),
        activities: actRes.rows,
        todayBirthdays: todayCelebrants
      });

    } else if (req.method === 'POST') {
      // Create Activity & Send Emails
      const { email, formData } = req.body;
      const assignedJson = JSON.stringify(formData.assigned_to);

      await turso.execute({
        sql: `INSERT INTO Office_Activities (title, description, start_date, end_date, assigned_to, created_by, status) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, email, formData.status]
      });

      // Attachment Logic
      let tempR2Key = null;
      let emailAttachments = [];
      
      if (formData.attachment && s3Client) {
        try {
          const matches = formData.attachment.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            tempR2Key = `temp-activity-attachment-${Date.now()}-${formData.attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: tempR2Key,
              Body: buffer,
              ContentType: mimeType
            }));

            emailAttachments.push({
              filename: formData.attachment.name,
              content: buffer
            });
          }
        } catch (err) {
          console.error("Error processing attachment to R2:", err);
        }
      }

      // Resolve emails for assignees (with deduplication & sanitization)
      const emails = await resolveAssigneeEmails(turso, formData.assigned_to);

      let failedCount = 0;
      if (emails.length > 0) {
        // Add to Personal Calendars
        const calendarPromises = emails.map(assigneeEmail => 
          turso.execute({
            sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [assigneeEmail, formData.title, 'Office Activity', formData.start_date, formData.end_date || formData.start_date, formData.description]
          }).catch(e => console.error("Calendar insert failed for", assigneeEmail, e))
        );
        await Promise.all(calendarPromises);

        // Send Emails via pooled transport and chunked batching
        const mailer = createMailer();
        if (mailer) {
          failedCount = await sendBatchMail(mailer, emails, (targetEmail) => ({
            from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
            to: targetEmail,
            subject: `New Activity Assigned: ${formData.title}`,
            text: `You have been assigned to a new activity: ${formData.title}\nDates: ${formData.start_date} to ${formData.end_date || formData.start_date}\n\nDescription: ${formData.description}\n\n---\nPlease do not reply to this message. This is an automated notification from OpsHUB.`,
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #0f766e;">New Activity Assigned</h2>
                <p><strong>Title:</strong> ${formData.title}</p>
                <p><strong>Dates:</strong> ${formData.start_date} to ${formData.end_date || formData.start_date}</p>
                <p><strong>Description:</strong></p>
                <p style="white-space: pre-wrap;">${formData.description || 'No description provided.'}</p>
                <div style="margin-top: 25px; margin-bottom: 25px;">
                  <a href="https://operations-hub-iota.vercel.app" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Go to OpsHUB</a>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
              </div>
            `,
            attachments: emailAttachments
          }));

          try { mailer.close(); } catch (_) {}
        }

        // Send Push Notifications
        import('../lib/pushHelper.js').then(({ sendPushNotification }) => {
          sendPushNotification(emails, {
            title: `New Activity Assigned`,
            body: formData.title,
            url: '/office-activities'
          }).catch(e => console.error("Push failed:", e));
        });
      }

      // Cleanup R2 after emails attempt
      if (tempR2Key && s3Client) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: tempR2Key
          }));
        } catch (err) {
          console.error("Failed to clean up attachment from R2:", err);
        }
      }

      // Fetch fresh activities
      const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
      return res.status(200).json({ success: true, activities: actRes.rows, failedEmails: failedCount });

    } else if (req.method === 'PUT') {
      const { action, id, status, formData } = req.body;
      
      if (action === 'updateStatus') {
        await turso.execute({
          sql: "UPDATE Office_Activities SET status = ? WHERE id = ?",
          args: [status, id]
        });
        return res.status(200).json({ success: true });
      } 
      else if (action === 'updateActivity') {
        const assignedJson = JSON.stringify(formData.assigned_to);
        
        // Fetch old activity details to find old title and start_date
        const oldActRes = await turso.execute({
          sql: "SELECT title, start_date FROM Office_Activities WHERE id = ?",
          args: [id]
        });

        if (oldActRes.rows.length > 0) {
          const oldTitle = oldActRes.rows[0].title;
          const oldStartDate = oldActRes.rows[0].start_date;
          
          // Delete old entries in Personal_Calendar
          await turso.execute({
            sql: "DELETE FROM Personal_Calendar WHERE title = ? AND event_type = 'Office Activity' AND start_date = ?",
            args: [oldTitle, oldStartDate]
          });
        }

        await turso.execute({
          sql: "UPDATE Office_Activities SET title = ?, description = ?, start_date = ?, end_date = ?, assigned_to = ?, status = ? WHERE id = ?",
          args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, formData.status, id]
        });
        
        // Add new entries for all newly assigned users
        const emails = await resolveAssigneeEmails(turso, formData.assigned_to);

        if (emails.length > 0) {
          const calendarPromises = emails.map(assigneeEmail => 
            turso.execute({
              sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [assigneeEmail, formData.title, 'Office Activity', formData.start_date, formData.end_date || formData.start_date, formData.description]
            }).catch(e => console.error("Calendar insert failed for", assigneeEmail, e))
          );
          await Promise.all(calendarPromises);
        }

        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
        return res.status(200).json({ success: true, activities: actRes.rows });
      }
      else if (action === 'cancelActivity') {
        const { reason, title, start_date, assigned_to } = req.body;
        
        await turso.execute({
          sql: "UPDATE Office_Activities SET status = 'Canceled', cancel_reason = ? WHERE id = ?",
          args: [reason, id]
        });

        if (title && start_date) {
          await turso.execute({
            sql: "DELETE FROM Personal_Calendar WHERE title = ? AND event_type = 'Office Activity' AND start_date = ?",
            args: [title, start_date]
          });
        }

        // Send cancellation emails
        let assignedNames = [];
        try {
          assignedNames = JSON.parse(assigned_to);
        } catch {
          assignedNames = ['All'];
        }
        
        const emails = await resolveAssigneeEmails(turso, assignedNames);

        if (emails.length > 0) {
          const mailer = createMailer();
          if (mailer) {
            await sendBatchMail(mailer, emails, (targetEmail) => ({
              from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
              to: targetEmail,
              subject: `Activity Canceled: ${title}`,
              text: `The activity "${title}" has been canceled.\n\nReason: ${reason}\n\n---\nPlease do not reply to this message.`,
              html: `
                <div style="font-family: sans-serif; padding: 20px;">
                  <h2 style="color: #e11d48;">Activity Canceled</h2>
                  <p><strong>Title:</strong> ${title}</p>
                  <p><strong>Reason:</strong></p>
                  <p style="white-space: pre-wrap;">${reason || 'No reason provided.'}</p>
                  <div style="margin-top: 25px; margin-bottom: 25px;">
                  <a href="https://operations-hub-iota.vercel.app" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Go to OpsHUB</a>
                  </div>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                  <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
                </div>
              `
            }));

            try { mailer.close(); } catch (_) {}
          }
        }

        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
        return res.status(200).json({ success: true, activities: actRes.rows });
      }

    } else if (req.method === 'DELETE') {
      const { id, title, start_date } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing ID' });
      
      await turso.execute({
        sql: "DELETE FROM Office_Activities WHERE id = ?",
        args: [id]
      });

      if (title && start_date) {
        await turso.execute({
          sql: "DELETE FROM Personal_Calendar WHERE title = ? AND event_type = 'Office Activity' AND start_date = ?",
          args: [title, start_date]
        });
      }
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/activities:", err);
    res.status(500).json({ error: err.message });
  }
}
