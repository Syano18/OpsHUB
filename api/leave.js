import { createClient } from '@libsql/client';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import nodemailer from 'nodemailer';
import { renderEmailLayout, escapeHtml, getBaseUrl } from '../lib/emailTemplate.js';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL?.trim(),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();
import { verifyToken } from '@clerk/backend';

function parseFormattedDates(dateStr) {
  const dates = [];
  const groups = dateStr.split(';').map(s => s.trim());
  for (const group of groups) {
    const yearMatch = group.match(/(\d{4})$/);
    if (!yearMatch) continue;
    const year = yearMatch[1];
    
    const monthMatch = group.match(/^([a-zA-Z]+)/);
    if (!monthMatch) continue;
    const monthStr = monthMatch[1];
    const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth() + 1;
    const mm = String(monthIndex).padStart(2, '0');
    
    const daysStr = group.substring(monthStr.length, group.lastIndexOf(year)).replace(/,$/, '').trim();
    const cleanDaysStr = daysStr.endsWith(',') ? daysStr.slice(0, -1) : daysStr;
    const dayTokens = cleanDaysStr.split(',').map(d => d.trim()).filter(d => d);
    
    for (const d of dayTokens) {
       const dd = String(parseInt(d)).padStart(2, '0');
       dates.push(`${year}-${mm}-${dd}`);
    }
  }
  return dates;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
};

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

    // Create tables if they don't exist
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Leave_Credits (
        user_email TEXT PRIMARY KEY,
        vl_balance REAL DEFAULT 0,
        sl_balance REAL DEFAULT 0,
        fl_balance REAL DEFAULT 0,
        wl_balance REAL DEFAULT 0,
        use_balance REAL DEFAULT 0,
        spl_balance REAL DEFAULT 0
      )
    `);
    
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Leave_History (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        leave_type TEXT NOT NULL,
        days_applied REAL NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        signed_document TEXT,
        reason TEXT,
        status TEXT DEFAULT 'Pending'
      )
    `);

    // GET Requests
    if (req.method === 'GET') {
      const { action, email, type, id } = req.query;
      
      if (action === 'getCredits') {
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        let rs = await turso.execute({
          sql: 'SELECT * FROM Leave_Credits WHERE LOWER(user_email) = LOWER(?)',
          args: [email]
        });
        
        if (rs.rows.length === 0) {
          // Auto-insert row with 0s if none exists
          await turso.execute({
            sql: 'INSERT INTO Leave_Credits (user_email) VALUES (?)',
            args: [email]
          });
          rs = await turso.execute({
            sql: 'SELECT * FROM Leave_Credits WHERE LOWER(user_email) = LOWER(?)',
            args: [email]
          });
        }
        
        // Also fetch user stats for position, salary etc.
        const userRs = await turso.execute({
          sql: "SELECT emp_stat, Role, Position, Salary_Grade, Salary, First_Name, Middle_Name, Last_Name, Suffix FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
          args: [email]
        });
        
        return res.status(200).json({ 
          credits: rs.rows[0], 
          user: userRs.rows[0] || null 
        });
        
      } else if (action === 'getSignatories') {
        const sigRs = await turso.execute(`
          SELECT First_Name, Middle_Name, Last_Name, Suffix, Position, is_regional 
          FROM User_Permissions 
          WHERE Position LIKE '%HR Designate%' 
             OR Position LIKE '%Supervising Statistical Specialist%' 
             OR Position LIKE '%Chief Statistical Specialist%'
             OR is_regional = 1
        `);
        return res.status(200).json({ signatories: sigRs.rows });
        
      } else if (action === 'getHistory') {
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        let sql = `SELECT id, user_email, leave_type, start_date, days_applied, created_at, reason, status, disapproval_reason,
                CASE WHEN signed_document IS NOT NULL THEN 1 ELSE 0 END as has_document 
                FROM Leave_History 
                WHERE LOWER(user_email) = LOWER(?)`;
        const args = [email];
        if (type && type !== 'all') {
          sql += ` AND leave_type = ?`;
          args.push(type);
        }
        sql += ` ORDER BY created_at DESC`;
        const rs = await turso.execute({ sql, args });
        return res.status(200).json({ history: rs.rows });
        
      } else if (action === 'getDocument') {
        const docType = req.query.docType;
        if (!id) return res.status(400).json({ error: 'ID required' });
        const columnName = docType === 'final' ? 'final_document' : 'signed_document';
        const docRs = await turso.execute({
          sql: `SELECT ${columnName} FROM Leave_History WHERE id = ?`,
          args: [id]
        });
        
        const document = docRs.rows[0]?.[columnName];
        if (!document || document === 'CLEARED_DOCUMENT') return res.status(200).json({ document: null });
        
        try {
          if (document.startsWith('R2:')) {
             const fileKey = document.substring(3);
             const command = new GetObjectCommand({
               Bucket: BUCKET_NAME,
               Key: fileKey,
             });
             const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
             return res.status(200).json({ document: url, type: 'url' });
          } else {
             return res.status(200).json({ document: document, type: 'base64' });
          }
        } catch (err) {
          console.error("Error generating presigned URL:", err);
          return res.status(500).json({ error: 'Failed to retrieve document' });
        }
        
      } else if (action === 'getAllUsersData') {
        const usersRs = await turso.execute("SELECT First_Name, Middle_Name, Last_Name, Email, Role, emp_stat, Status FROM User_Permissions WHERE IFNULL(Status, '') != 'Inactive' AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') != 'Super Admin'");
        const creditsRs = await turso.execute("SELECT * FROM Leave_Credits");
        return res.status(200).json({ users: usersRs.rows, credits: creditsRs.rows });
      } else if (action === 'getAllLeaves') {
        const rs = await turso.execute(`
          SELECT lh.id, lh.user_email, lh.leave_type, lh.start_date, lh.days_applied, lh.created_at, lh.reason, lh.status, lh.disapproval_reason,
                 CASE WHEN lh.signed_document IS NOT NULL THEN 1 ELSE 0 END as has_document,
                 CASE WHEN lh.final_document IS NOT NULL THEN 1 ELSE 0 END as has_final_document,
                 up.First_Name, up.Last_Name, up.Position
          FROM Leave_History lh
          LEFT JOIN User_Permissions up ON LOWER(lh.user_email) = LOWER(up.Email)
          ORDER BY lh.created_at DESC
        `);
        return res.status(200).json({ leaves: rs.rows });
      } else if (action === 'getPendingLeaves') {
        const rs = await turso.execute(`
          SELECT lh.id, lh.user_email, lh.leave_type, lh.start_date, lh.days_applied, lh.created_at, up.First_Name, up.Last_Name
          FROM Leave_History lh
          LEFT JOIN User_Permissions up ON LOWER(lh.user_email) = LOWER(up.Email)
          WHERE lh.status IN ('Pending', 'Transmitted')
          ORDER BY lh.created_at DESC
        `);
        return res.status(200).json({ pendingLeaves: rs.rows });
      }
      
      return res.status(400).json({ error: 'Invalid GET action' });
    } 
    
    // POST Requests
    else if (req.method === 'POST') {
      const { action } = req.body;
      
      if (action === 'fileLeave') {
        const { 
          email, leaveType, daysApplied, startDate, endDate, reason
        } = req.body;
        
        // 1. Get current credits
        const creditsRs = await turso.execute({
          sql: "SELECT * FROM Leave_Credits WHERE LOWER(user_email) = LOWER(?)",
          args: [email]
        });
        
        if (creditsRs.rows.length === 0) {
          return res.status(404).json({ error: 'User credits not found' });
        }
        const currentCredits = creditsRs.rows[0];
        
        if (leaveType === 'Forced Leave' || leaveType === 'Forced/Mandatory Leave' || leaveType === 'Mandatory/Forced Leave') {
          const currentFl = Number(currentCredits.fl_balance || 0);
          const currentVl = Number(currentCredits.vl_balance || 0);
          const days = Number(daysApplied);

          const newFlBalance = Number((currentFl - days).toFixed(4));
          const newVlBalance = Number((currentVl - days).toFixed(4));

          // 2. Insert history
          const insertRs = await turso.execute({
            sql: `INSERT INTO Leave_History (user_email, leave_type, days_applied, start_date, reason) 
                  VALUES (?, ?, ?, ?, ?) RETURNING id`,
            args: [email, leaveType, daysApplied, startDate, reason]
          });
          const newId = insertRs.rows[0].id;

          // 3. Update credits: deduct from both fl_balance and vl_balance per CSC rules
          await turso.execute({
            sql: `UPDATE Leave_Credits 
                  SET fl_balance = ?, vl_balance = ? 
                  WHERE LOWER(user_email) = LOWER(?)`,
            args: [newFlBalance, newVlBalance, email]
          });
        } else {
          const balanceColumn = {
            'Vacation Leave': 'vl_balance',
            'Sick Leave': 'sl_balance',
            'Special Privilege Leave': 'spl_balance',
            'USE Leave': 'use_balance',
            'Wellness Leave': 'wl_balance'
          }[leaveType];

          let newBalanceValue = 0;
          if (balanceColumn && currentCredits[balanceColumn] !== undefined) {
            newBalanceValue = Number((Number(currentCredits[balanceColumn]) - Number(daysApplied)).toFixed(4));
          }

          // 2. Insert history
          const insertRs = await turso.execute({
            sql: `INSERT INTO Leave_History (user_email, leave_type, days_applied, start_date, reason) 
                  VALUES (?, ?, ?, ?, ?) RETURNING id`,
            args: [email, leaveType, daysApplied, startDate, reason]
          });
          const newId = insertRs.rows[0].id;
          
          // 3. Update credits
          if (balanceColumn) {
            await turso.execute({
              sql: `UPDATE Leave_Credits 
                    SET ${balanceColumn} = ? 
                    WHERE LOWER(user_email) = LOWER(?)`,
              args: [newBalanceValue, email]
            });
          }
        }
        
        // 4. Send Push Notification to Admins
        try {
          const adminsRs = await turso.execute("SELECT Email FROM User_Permissions WHERE (Role = 'Admin' OR Role = 'Super Admin') AND LOWER(Status) != 'inactive'");
          const adminEmails = adminsRs.rows.map(r => r.Email).filter(Boolean);
          
          if (adminEmails.length > 0) {
            import('../lib/pushHelper.js').then(({ sendPushNotification }) => {
              sendPushNotification(adminEmails, {
                title: `New Leave Request`,
                body: `${email} has filed for ${leaveType}`,
                url: '/leave-credits'
              }).catch(e => console.error("Push failed:", e));
            });
          }
        } catch (e) {
          console.error("Failed to notify admins for leave:", e);
        }

        return res.status(200).json({ success: true, id: newId });
      } else if (action === 'notifyTransmit' || action === 'notify-transmit') {
        const { leaveId } = req.body;
        if (!leaveId) {
          return res.status(400).json({ success: false, error: 'leaveId is required' });
        }

        // Fetch the leave record
        const leaveRs = await turso.execute({
          sql: "SELECT * FROM Leave_History WHERE id = ?",
          args: [leaveId]
        });
        if (leaveRs.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Leave record not found' });
        }
        const leaveRecord = leaveRs.rows[0];

        // Fetch the filer's name
        const userRs = await turso.execute({
          sql: "SELECT First_Name, Middle_Name, Last_Name, Suffix, Position FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
          args: [leaveRecord.user_email]
        });

        let fullName = leaveRecord.user_email;
        let isCSS = false;
        if (userRs.rows.length > 0) {
          const u = userRs.rows[0];
          const mi = u.Middle_Name ? `${u.Middle_Name.charAt(0)}.` : '';
          fullName = [u.First_Name, mi, u.Last_Name, u.Suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
          if (u.Position && u.Position.toLowerCase().includes('chief statistical')) {
            isCSS = true;
          }
        }

        let toEmails = [];
        let ccEmails = [];

        if (isCSS) {
          // Notify regional staff
          const regionalRs = await turso.execute("SELECT Email FROM User_Permissions WHERE IFNULL(is_regional, 0) = 1 AND IFNULL(Status, '') != 'Inactive'");
          toEmails = regionalRs.rows.map(r => r.Email).filter(Boolean);

          // CC HR Designate
          const hrRs = await turso.execute("SELECT Email FROM User_Permissions WHERE Position LIKE '%HR Designate%' AND IFNULL(is_regional, 0) != 1 AND IFNULL(Status, '') != 'Inactive'");
          ccEmails = hrRs.rows.map(r => r.Email).filter(Boolean);
        } else {
          // Fetch the admins
          const adminsRs = await turso.execute("SELECT Email FROM User_Permissions WHERE Role IN ('Admin', 'Super Admin') AND IFNULL(Status, '') != 'Inactive'");
          toEmails = adminsRs.rows.map(r => r.Email).filter(Boolean);
        }

        if (toEmails.length === 0) {
          return res.status(200).json({ success: true, message: 'No recipients found to notify' });
        }

        // Set up nodemailer
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        if (!process.env.SMTP_USER) {
          throw new Error("SMTP credentials not set");
        }

        const ccParam = ccEmails.length > 0 ? `&cc=${encodeURIComponent(ccEmails.join(','))}` : '';
        const appBaseUrl = getBaseUrl(req);
        const leaveBodyHtml = `
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
            A leave application has been transmitted by <strong>${escapeHtml(fullName)}</strong>.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Application Summary</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 35%;">Applicant</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(fullName)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Leave Type</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(leaveRecord.leave_type || 'N/A')}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Days Applied</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(leaveRecord.days_applied || 'N/A')}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Inclusive Dates</td>
                <td style="padding: 4px 0; color: #0f766e; font-weight: 700;">${escapeHtml(leaveRecord.start_date || 'N/A')}</td>
              </tr>
            </table>
          </div>

          ${isCSS ? `
          <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #22c55e; border-radius: 8px;">
            <p style="margin: 0; color: #166534; font-size: 13px; line-height: 1.6;">
              <strong>🔒 Official Transaction Verified</strong><br/>
              This leave application was personally filed and transmitted by the applicant through the secure OpsHUB System. The attached document is the authentic, digitally generated leave form. This is an official system-generated notification.
            </p>
          </div>
          ` : `
          <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569;">
            Please review the application and its details in the OpsHUB system.
          </p>
          `}

          <div style="text-align: center; margin-bottom: 8px;">
            ${!isCSS ? `
              <a href="${appBaseUrl}/leave-credits" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Review in OpsHUB &rarr;
              </a>
            ` : `
              <a href="mailto:${escapeHtml(leaveRecord.user_email)}?subject=Signed%20Leave%20Application%20-%20${encodeURIComponent(leaveRecord.leave_type || 'Leave')}${ccParam}" style="display: inline-block; padding: 12px 28px; background-color: #16a34a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.3);">
                Email Signed Leave to Applicant
              </a>
            `}
          </div>
        `;

        const mailOptions = {
          from: {
            name: 'OpsHUB Notification',
            address: process.env.SMTP_USER || 'kalinga@psa.gov.ph'
          },
          to: toEmails.join(', '),
          subject: `Leave Application Transmitted: ${leaveRecord.leave_type || 'Leave'}`,
          text: `A leave application has been transmitted by ${fullName}.\n\nLeave Type: ${leaveRecord.leave_type || 'N/A'}\nDays Applied: ${leaveRecord.days_applied || 'N/A'}\nInclusive Dates: ${leaveRecord.start_date || 'N/A'}${!isCSS ? '\n\nPlease review the application in the OpsHUB system.' : '\n\nVERIFICATION NOTICE: This leave application was officially filed and transmitted directly by the applicant through the internal OpsHUB System. The attached document is the authentic, signed leave form generated securely by the system. You can personally contact the filer to verify the received email.'}`,
          html: renderEmailLayout({
            headerTitle: 'Leave Application Transmitted',
            theme: 'teal',
            bodyHtml: leaveBodyHtml
          })
        };

        if (ccEmails.length > 0) {
          mailOptions.cc = ccEmails.join(', ');
        }

        if (isCSS && leaveRecord.signed_document) {
          if (leaveRecord.signed_document.startsWith('R2:')) {
            try {
              const fileKey = leaveRecord.signed_document.substring(3);
              const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
              const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
              mailOptions.attachments = [{ filename: 'Signed_Leave_Application.pdf', path: url }];
            } catch (err) {
              console.error("Failed to fetch R2 attachment for CSS", err);
            }
          } else {
            mailOptions.attachments = [{ filename: 'Signed_Leave_Application.pdf', content: leaveRecord.signed_document.split(',')[1], encoding: 'base64' }];
          }
        }

        const info = await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true, messageId: info.messageId });
      }
    }
    
    // PUT Requests
    else if (req.method === 'PUT') {
      const { action } = req.body;
      
      if (action === 'uploadDocument') {
        const { id, base64Str } = req.body;
        if (!id || !base64Str) return res.status(400).json({ error: 'Missing id or document' });
        
        try {
          if (process.env.R2_BUCKET_NAME) {
            const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
              return res.status(400).json({ error: 'Invalid base64 format' });
            }
            const mimeType = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const fileKey = `leave-${id}.pdf`;
            
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: fileKey,
              Body: buffer,
              ContentType: mimeType
            }));
            
            await turso.execute({
              sql: "UPDATE Leave_History SET signed_document = ? WHERE id = ?",
              args: [`R2:${fileKey}`, id]
            });
          } else {
            await turso.execute({
              sql: "UPDATE Leave_History SET signed_document = ? WHERE id = ?",
              args: [base64Str, id]
            });
          }
          return res.status(200).json({ success: true });
        } catch (error) {
          console.error("Upload Error:", error);
          return res.status(500).json({ error: 'Failed to upload document' });
        }
        
      } else if (action === 'uploadFinalDocument') {
        const { id, base64Str } = req.body;
        if (!id || !base64Str) return res.status(400).json({ error: 'Missing id or document' });
        
        try {
          if (process.env.R2_BUCKET_NAME) {
            const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
              return res.status(400).json({ error: 'Invalid base64 format' });
            }
            const mimeType = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const fileKey = `leave-${id}-final.pdf`;
            
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: fileKey,
              Body: buffer,
              ContentType: mimeType
            }));
            
            await turso.execute({
              sql: "UPDATE Leave_History SET final_document = ? WHERE id = ?",
              args: [`R2:${fileKey}`, id]
            });
          } else {
            await turso.execute({
              sql: "UPDATE Leave_History SET final_document = ? WHERE id = ?",
              args: [base64Str, id]
            });
          }
          return res.status(200).json({ success: true });
        } catch (error) {
          console.error("Upload Final Error:", error);
          return res.status(500).json({ error: 'Failed to upload final document' });
        }
        
      } else if (action === 'transmitLeave') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        
        await turso.execute({
          sql: "UPDATE Leave_History SET status = 'Transmitted' WHERE id = ?",
          args: [id]
        });
        return res.status(200).json({ success: true });
        
      } else if (action === 'updateStatus') {
        const { id, status, disapproval_reason } = req.body;
        
        const existingRs = await turso.execute({
          sql: "SELECT * FROM Leave_History WHERE id = ?",
          args: [id]
        });
        if (existingRs.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const record = existingRs.rows[0];

        const userRs = await turso.execute({
          sql: "SELECT Position FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
          args: [record.user_email]
        });
        const isCSS = userRs.rows.length > 0 && userRs.rows[0].Position && userRs.rows[0].Position.toLowerCase().includes('chief statistical');
        
        if (status === 'Disapproved' || status === 'Approved') {
          await turso.execute({
            sql: "UPDATE Leave_History SET status = ?, disapproval_reason = ?, signed_document = CASE WHEN signed_document IS NOT NULL THEN 'CLEARED_DOCUMENT' ELSE NULL END, final_document = CASE WHEN final_document IS NOT NULL THEN 'CLEARED_DOCUMENT' ELSE NULL END WHERE id = ?",
            args: [status, status === 'Disapproved' ? (disapproval_reason || null) : null, id]
          });

          if (status === 'Disapproved') {
            if (record.leave_type === 'Forced Leave' || record.leave_type === 'Forced/Mandatory Leave' || record.leave_type === 'Mandatory/Forced Leave') {
              await turso.execute({
                sql: `UPDATE Leave_Credits SET fl_balance = fl_balance + ?, vl_balance = vl_balance + ? WHERE LOWER(user_email) = LOWER(?)`,
                args: [record.days_applied, record.days_applied, record.user_email]
              });
            } else {
              let balanceColumn = '';
              if (record.leave_type === 'Vacation Leave') balanceColumn = 'vl_balance';
              else if (record.leave_type === 'Sick Leave') balanceColumn = 'sl_balance';
              else if (record.leave_type === 'Special Privilege Leave') balanceColumn = 'spl_balance';
              else if (record.leave_type === 'USE Leave') balanceColumn = 'use_balance';
              else if (record.leave_type === 'Wellness Leave') balanceColumn = 'wl_balance';

              if (balanceColumn) {
                await turso.execute({
                  sql: `UPDATE Leave_Credits SET ${balanceColumn} = ${balanceColumn} + ? WHERE LOWER(user_email) = LOWER(?)`,
                  args: [record.days_applied, record.user_email]
                });
              }
            }
          }

          let attachmentUrl = null;
          let finalKeyToDelete = null;
          if (process.env.R2_BUCKET_NAME) {
            if (record.signed_document && record.signed_document.startsWith('R2:')) {
              try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: record.signed_document.split('R2:')[1] })); } 
              catch (err) { console.error("Error deleting original from R2", err); }
            }
            if (record.final_document && record.final_document.startsWith('R2:')) {
              finalKeyToDelete = record.final_document.split('R2:')[1];
              try {
                attachmentUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: finalKeyToDelete }), { expiresIn: 3600 });
              } catch (err) { console.error("Error generating URL for final from R2", err); }
            }
          }

          if (!isCSS) {
            try {
              const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_PORT === '465',
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
              });
              
              const isApproved = status === 'Approved';
              const subject = isApproved 
                ? `Leave Application Approved: ${record.leave_type}` 
                : `Leave Application Disapproved: ${record.leave_type}`;
                
              const appBaseUrl = getBaseUrl(req);
              const htmlContent = isApproved
                ? renderEmailLayout({
                    headerTitle: 'Leave Application Approved',
                    theme: 'emerald',
                    bodyHtml: `
                      <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
                        Great news! Your leave application for <strong>${escapeHtml(record.leave_type)}</strong> has been approved.
                      </p>

                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
                        <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Approved Details</p>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                          <tr>
                            <td style="padding: 4px 0; color: #64748b; width: 35%;">Leave Type</td>
                            <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(record.leave_type)}</td>
                          </tr>
                          <tr>
                            <td style="padding: 4px 0; color: #64748b;">Inclusive Dates</td>
                            <td style="padding: 4px 0; color: #059669; font-weight: 700;">${escapeHtml(record.start_date)}</td>
                          </tr>
                          <tr>
                            <td style="padding: 4px 0; color: #64748b;">Status</td>
                            <td style="padding: 4px 0; color: #059669; font-weight: 700;">Approved</td>
                          </tr>
                        </table>
                      </div>

                      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; color: #166534; line-height: 1.5;">
                        📎 <strong>Attached Document:</strong> The final approved and signed leave application PDF is attached to this email for your records.
                      </div>

                      <div style="text-align: center; margin-bottom: 8px;">
                        <a href="${appBaseUrl}/leave-credits" style="display: inline-block; padding: 11px 24px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
                          View in OpsHUB &rarr;
                        </a>
                      </div>
                    `
                  })
                : renderEmailLayout({
                    headerTitle: 'Leave Application Disapproved',
                    theme: 'rose',
                    bodyHtml: `
                      <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
                        Your leave application for <strong>${escapeHtml(record.leave_type)}</strong> (${escapeHtml(record.start_date)}) has been disapproved.
                      </p>

                      <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9f1239; letter-spacing: 0.5px;">Reason for Disapproval</p>
                        <p style="margin: 0; font-size: 13px; color: #881337; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(disapproval_reason || 'No reason provided.')}</p>
                      </div>

                      <div style="background: #f8fafc; border-left: 4px solid #64748b; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; color: #334155; line-height: 1.5;">
                        ℹ️ <strong>Credits Restored:</strong> Your leave credits have been automatically refunded back to your available balance.
                      </div>

                      <div style="text-align: center; margin-bottom: 8px;">
                        <a href="${appBaseUrl}/leave-credits" style="display: inline-block; padding: 11px 24px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
                          View in OpsHUB &rarr;
                        </a>
                      </div>
                    `
                  });
                
              const mailOptions = {
                from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
                to: record.user_email,
                subject,
                html: htmlContent
              };
              
              const attachmentName = isApproved ? 'Approved_Leave_Application.pdf' : 'Disapproved_Leave_Application.pdf';
              if (attachmentUrl) {
                mailOptions.attachments = [{ filename: attachmentName, path: attachmentUrl }];
              } else if (record.final_document && !record.final_document.startsWith('R2:')) {
                 mailOptions.attachments = [{ filename: attachmentName, content: record.final_document.split(',')[1], encoding: 'base64' }];
              }
              await transporter.sendMail(mailOptions);
            } catch (err) { console.error("Error sending status email", err); }
          }
          
          if (finalKeyToDelete) {
             try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: finalKeyToDelete }));
             } catch (err) { console.error("Error deleting final from R2", err); }
          }
          
          if (status === 'Approved' && record.start_date) {
            try {
              const dates = parseFormattedDates(record.start_date);
              for (const dateStr of dates) {
                await turso.execute({
                  sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description) VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [
                    record.user_email,
                    `Approved Leave: ${record.leave_type}`,
                    'Leave',
                    dateStr,
                    dateStr,
                    `Leave ID: ${record.id}`
                  ]
                });
              }
            } catch (calErr) { console.error("Error adding to calendar", calErr); }
          }

        } else {
          await turso.execute({
            sql: "UPDATE Leave_History SET status = ? WHERE id = ?",
            args: [status, id]
          });
        }
        
        return res.status(200).json({ success: true, record });
        
      } else if (action === 'updateUserCredits') {
        const { email, vl, sl, fl, wl, use, spl } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const rs = await turso.execute({
          sql: "SELECT * FROM Leave_Credits WHERE LOWER(user_email) = LOWER(?)",
          args: [email]
        });
        
        if (rs.rows.length === 0) {
          await turso.execute({
            sql: `INSERT INTO Leave_Credits (
                    user_email, vl_balance, sl_balance, fl_balance, wl_balance, use_balance, spl_balance,
                    last_reset_year, last_accrual_month
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [email, vl, sl, fl, wl, use, spl, currentYear, currentMonth]
          });
        } else {
          await turso.execute({
            sql: `UPDATE Leave_Credits 
                  SET vl_balance = ?, sl_balance = ?, fl_balance = ?, wl_balance = ?, use_balance = ?, spl_balance = ?,
                      last_reset_year = ?, last_accrual_month = ?
                  WHERE LOWER(user_email) = LOWER(?)`,
            args: [vl, sl, fl, wl, use, spl, currentYear, currentMonth, email]
          });
        }
        
        return res.status(200).json({ success: true });
      }
      
      return res.status(400).json({ error: 'Invalid PUT action' });
    }
    
    // DELETE Requests
    else if (req.method === 'DELETE') {
      const { id, email, daysApplied, leaveType } = req.query;
      if (!id || !email) return res.status(400).json({ error: 'Missing required parameters' });
      
      // Map leaveType to balance column
      if (leaveType === 'Forced Leave' || leaveType === 'Forced/Mandatory Leave' || leaveType === 'Mandatory/Forced Leave') {
        await turso.execute({
          sql: `UPDATE Leave_Credits SET fl_balance = fl_balance + ?, vl_balance = vl_balance + ? WHERE LOWER(user_email) = LOWER(?)`,
          args: [daysApplied, daysApplied, email]
        });
      } else {
        let balanceColumn = '';
        if (leaveType === 'Vacation Leave') balanceColumn = 'vl_balance';
        else if (leaveType === 'Sick Leave') balanceColumn = 'sl_balance';
        else if (leaveType === 'Special Privilege Leave') balanceColumn = 'spl_balance';
        else if (leaveType === 'USE Leave') balanceColumn = 'use_balance';
        else if (leaveType === 'Wellness Leave') balanceColumn = 'wl_balance';

        if (balanceColumn) {
          await turso.execute({
            sql: `UPDATE Leave_Credits SET ${balanceColumn} = ${balanceColumn} + ? WHERE LOWER(user_email) = LOWER(?)`,
            args: [daysApplied, email]
          });
        }
      }
      
      const recordRs = await turso.execute({
        sql: 'SELECT signed_document, final_document FROM Leave_History WHERE id = ?',
        args: [id]
      });
      if (recordRs.rows.length > 0 && process.env.R2_BUCKET_NAME) {
        const record = recordRs.rows[0];
        if (record.signed_document && record.signed_document.startsWith('R2:')) {
           try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: record.signed_document.split('R2:')[1] })); } catch(e) {}
        }
        if (record.final_document && record.final_document.startsWith('R2:')) {
           try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: record.final_document.split('R2:')[1] })); } catch(e) {}
        }
      }

      await turso.execute({
        sql: 'DELETE FROM Leave_History WHERE id = ?',
        args: [id]
      });
      
      // Fetch updated balances to return to client
      const creditsRs = await turso.execute({
        sql: 'SELECT * FROM Leave_Credits WHERE LOWER(user_email) = LOWER(?)',
        args: [email]
      });
      
      return res.status(200).json({ success: true, credits: creditsRs.rows[0] });
    }
    
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/leave:", err);
    res.status(500).json({ error: err.message });
  }
}
