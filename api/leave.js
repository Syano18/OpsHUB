import { createClient } from '@libsql/client';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import nodemailer from 'nodemailer';

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
        if (!email || !type) return res.status(400).json({ error: 'Email and type required' });
        
        const rs = await turso.execute({
          sql: `SELECT id, user_email, leave_type, start_date, days_applied, created_at, reason, status, disapproval_reason,
                CASE WHEN signed_document IS NOT NULL THEN 1 ELSE 0 END as has_document 
                FROM Leave_History 
                WHERE LOWER(user_email) = LOWER(?) AND leave_type = ? 
                ORDER BY created_at DESC`,
          args: [email, type]
        });
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
          WHERE lh.status != 'Pending'
          ORDER BY lh.created_at DESC
        `);
        return res.status(200).json({ leaves: rs.rows });
      } else if (action === 'getPendingLeaves') {
        const rs = await turso.execute(`
          SELECT lh.id, lh.user_email, lh.leave_type, lh.start_date, lh.created_at, up.First_Name, up.Last_Name
          FROM Leave_History lh
          LEFT JOIN User_Permissions up ON LOWER(lh.user_email) = LOWER(up.Email)
          WHERE lh.status = 'Pending'
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
        
        const balanceColumn = {
          'Vacation Leave': 'vl_balance',
          'Sick Leave': 'sl_balance',
          'Forced Leave': 'fl_balance',
          'Special Privilege Leave': 'spl_balance',
          'USE Leave': 'use_balance',
          'Wellness Leave': 'wl_balance'
        }[leaveType];

        let newBalanceValue = 0;
        if (balanceColumn && currentCredits[balanceColumn] !== undefined) {
          newBalanceValue = Number(currentCredits[balanceColumn]) - Number(daysApplied);
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
        
        return res.status(200).json({ success: true, id: newId });
      }
      
      return res.status(400).json({ error: 'Invalid POST action' });
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
            let balanceColumn = '';
            if (record.leave_type === 'Vacation Leave') balanceColumn = 'vl_balance';
            else if (record.leave_type === 'Sick Leave') balanceColumn = 'sl_balance';
            else if (record.leave_type === 'Forced Leave') balanceColumn = 'fl_balance';
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
                
              const htmlContent = isApproved
                ? `
                  <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #059669;">Leave Application Approved</h2>
                    <p>Great news! Your leave application for <strong>${record.leave_type}</strong> (${record.start_date}) has been approved.</p>
                    <p>Please find the final approved document attached.</p>

                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                    <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
                  </div>
                `
                : `
                  <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #dc2626;">Leave Application Disapproved</h2>
                    <p>Your leave application for <strong>${record.leave_type}</strong> (${record.start_date}) has been disapproved.</p>
                    <p><strong>Reason:</strong> ${disapproval_reason || 'No reason provided.'}</p>
                    <p>Your leave credits have been automatically refunded.</p>

                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                    <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
                  </div>
                `;
                
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
      let balanceColumn = '';
      if (leaveType === 'Vacation Leave') balanceColumn = 'vl_balance';
      else if (leaveType === 'Sick Leave') balanceColumn = 'sl_balance';
      else if (leaveType === 'Forced Leave' || leaveType === 'Forced/Mandatory Leave') balanceColumn = 'fl_balance';
      else if (leaveType === 'Special Privilege Leave') balanceColumn = 'spl_balance';
      else if (leaveType === 'USE Leave') balanceColumn = 'use_balance';
      else if (leaveType === 'Wellness Leave') balanceColumn = 'wl_balance';

      if (balanceColumn) {
        await turso.execute({
          sql: `UPDATE Leave_Credits SET ${balanceColumn} = ${balanceColumn} + ? WHERE LOWER(user_email) = LOWER(?)`,
          args: [daysApplied, email]
        });
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
