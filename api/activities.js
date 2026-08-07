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
      // Local dev bypass since CLERK_SECRET_KEY is missing from .env.local
      // In production (Vercel), ensure CLERK_SECRET_KEY is set in the environment variables!
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
      const empRes = await turso.execute("SELECT First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') != 'Super Admin' ORDER BY First_Name ASC");
      const uniqueEmps = new Set();
      empRes.rows.forEach(row => {
        if (row.First_Name && row.Last_Name) {
          const name = `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name}`.trim();
          uniqueEmps.add(name);
        }
      });

      // Fetch Activities
      const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");

      return res.status(200).json({ 
        user: roleRes.rows[0] || null,
        employees: Array.from(uniqueEmps),
        activities: actRes.rows 
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

      // We do NOT block on sending emails, but Vercel requires waiting for promises before returning if not using edge/background functions.
      // We will do it synchronously but fast.
      const assignedNames = formData.assigned_to;
      let emails = [];

      if (assignedNames.includes('All')) {
        const allRes = await turso.execute("SELECT Email FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1");
        emails = allRes.rows.map(r => r.Email).filter(Boolean);
      } else {
        const allRes = await turso.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1");
        emails = allRes.rows.filter(r => {
          const fullName = `${r.First_Name} ${r.Middle_Name ? r.Middle_Name.charAt(0) + '. ' : ''}${r.Last_Name}`.trim();
          return assignedNames.includes(fullName);
        }).map(r => r.Email).filter(Boolean);
      }

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

        // Send Emails
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const mailPromises = emails.map(targetEmail => {
          return transporter.sendMail({
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
          }).catch(e => {
            console.error("Failed to email", targetEmail, e);
            failedCount++;
          });
        });
        
        await Promise.all(mailPromises);
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
        await turso.execute({
          sql: "UPDATE Office_Activities SET title = ?, description = ?, start_date = ?, end_date = ?, assigned_to = ?, status = ? WHERE id = ?",
          args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, formData.status, id]
        });
        
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
        
        let emails = [];
        if (assignedNames.includes('All')) {
          const allRes = await turso.execute("SELECT Email FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1");
          emails = allRes.rows.map(r => r.Email).filter(Boolean);
        } else {
          const allRes = await turso.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1");
          emails = allRes.rows.filter(r => {
            const fullName = `${r.First_Name} ${r.Middle_Name ? r.Middle_Name.charAt(0) + '. ' : ''}${r.Last_Name}`.trim();
            return assignedNames.includes(fullName);
          }).map(r => r.Email).filter(Boolean);
        }

        if (emails.length > 0) {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });

          const mailPromises = emails.map(targetEmail => {
            return transporter.sendMail({
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
            }).catch(e => console.error("Failed to email", targetEmail, e));
          });
          
          await Promise.all(mailPromises);
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
