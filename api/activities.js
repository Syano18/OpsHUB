import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';
import nodemailer from 'nodemailer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { renderEmailLayout } from '../lib/emailTemplate.js';

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

async function ensureTablesAndColumns(turso) {
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Office_Activity_Reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        user_email TEXT NOT NULL,
        user_name TEXT,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_id, user_email)
      )
    `);

    await turso.execute(`
      CREATE TABLE IF NOT EXISTS Office_Activity_Email_Logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        recipient_name TEXT,
        recipient_email TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await turso.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_email_logs ON Office_Activity_Email_Logs (activity_id, recipient_email)
    `);

    const tableInfo = await turso.execute("PRAGMA table_info(Office_Activities)");
    const columnNames = tableInfo.rows.map(r => r.name);
    if (!columnNames.includes('emails_sent')) {
      await turso.execute("ALTER TABLE Office_Activities ADD COLUMN emails_sent INTEGER DEFAULT 0");
    }
    if (!columnNames.includes('emails_failed')) {
      await turso.execute("ALTER TABLE Office_Activities ADD COLUMN emails_failed INTEGER DEFAULT 0");
    }
  } catch (err) {
    console.warn("[Activities DB Setup Notice]:", err.message);
  }
}

async function resolveAssigneeEmailsWithNames(turso, assignedNames) {
  if (!assignedNames || !Array.isArray(assignedNames) || assignedNames.length === 0) {
    return [];
  }

  const allRes = await turso.execute(
    "SELECT Email, First_Name, Middle_Name, Last_Name, Suffix FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory')"
  );

  const allEmployees = allRes.rows.map(r => {
    const f = (r.First_Name || '').trim();
    const m = (r.Middle_Name || '').trim();
    const l = (r.Last_Name || '').trim();
    const s = (r.Suffix || '').trim();
    const fullNameWithMi = `${f} ${m ? m.charAt(0) + '. ' : ''}${l}${s ? ' ' + s : ''}`.trim();
    const fullNameNoMi = `${f} ${l}${s ? ' ' + s : ''}`.trim();
    const plainFirstLast = `${f} ${l}`.trim();
    return {
      email: (r.Email || '').trim().toLowerCase(),
      name: fullNameWithMi || fullNameNoMi || plainFirstLast || r.Email,
      variants: [fullNameWithMi, fullNameNoMi, plainFirstLast].filter(Boolean),
      normVariants: [fullNameWithMi, fullNameNoMi, plainFirstLast].filter(Boolean).map(normalizeStr)
    };
  }).filter(e => e.email && e.email.includes('@'));

  if (assignedNames.includes('All')) {
    const seen = new Set();
    const list = [];
    for (const emp of allEmployees) {
      if (!seen.has(emp.email)) {
        seen.add(emp.email);
        list.push({ name: emp.name, email: emp.email });
      }
    }
    return list;
  }

  const seen = new Set();
  const list = [];
  for (const assigned of assignedNames) {
    const a = (assigned || '').trim();
    const normA = normalizeStr(a);
    const matched = allEmployees.find(emp =>
      emp.email === a.toLowerCase() ||
      emp.name.toLowerCase() === a.toLowerCase() ||
      emp.variants.some(v => v.toLowerCase() === a.toLowerCase()) ||
      emp.normVariants.some(nv => nv === normA)
    );
    if (matched && !seen.has(matched.email)) {
      seen.add(matched.email);
      list.push({ name: matched.name, email: matched.email });
    } else if (!matched) {
      if (a.includes('@')) {
        const clean = a.toLowerCase();
        if (!seen.has(clean)) {
          seen.add(clean);
          list.push({ name: a, email: clean });
        }
      } else {
        list.push({ name: a, email: null, error: 'No matching email address registered in user permissions' });
      }
    }
  }

  return list;
}

async function resolveAssigneeEmails(turso, assignedNames) {
  const resolved = await resolveAssigneeEmailsWithNames(turso, assignedNames);
  return sanitizeEmails(resolved.map(r => r.email).filter(Boolean));
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

async function sendBatchMailDetailed(transporter, targets, mailOptionsGenerator) {
  if (!targets || targets.length === 0) return [];

  const results = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (target) => {
        if (!target.email) {
          throw new Error(target.error || 'No registered email address found for recipient');
        }
        if (!transporter) {
          throw new Error('SMTP credentials missing or mailer unconfigured');
        }
        const mailOptions = mailOptionsGenerator(target.email, target.name);
        try {
          return await transporter.sendMail(mailOptions);
        } catch (err) {
          console.warn(`[Nodemailer] First dispatch attempt failed for ${target.email}: ${err.message}. Retrying in 400ms...`);
          await new Promise(r => setTimeout(r, 400));
          return await transporter.sendMail(mailOptions);
        }
      })
    );

    for (let idx = 0; idx < batchResults.length; idx++) {
      const target = batch[idx];
      const res = batchResults[idx];
      if (res.status === 'fulfilled') {
        results.push({
          name: target.name,
          email: target.email,
          status: 'sent',
          error: null
        });
      } else {
        const errMsg = res.reason?.message || (typeof res.reason === 'string' ? res.reason : 'Email delivery failed');
        console.error(`[Nodemailer] Final delivery failed for recipient ${target.email || target.name}:`, errMsg);
        results.push({
          name: target.name,
          email: target.email || '',
          status: 'failed',
          error: errMsg
        });
      }
    }
  }

  return results;
}

async function sendBatchMail(transporter, emails, mailOptionsGenerator) {
  const targets = (emails || []).map(e => ({ name: '', email: e }));
  const results = await sendBatchMailDetailed(transporter, targets, mailOptionsGenerator);
  return results.filter(r => r.status === 'failed').length;
}

function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req?.headers?.host;
  if (host) {
    const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return 'https://operations-hub-iota.vercel.app';
}

function getAckSecret() {
  return process.env.CLERK_SECRET_KEY || process.env.TURSO_DB_AUTH_TOKEN || 'opshub-activity-secret-2026';
}

function generateAckToken(activityId, email) {
  const secret = getAckSecret();
  const normalizedEmail = (email || '').trim().toLowerCase();
  return crypto.createHmac('sha256', secret).update(`ack-activity:${activityId}:${normalizedEmail}`).digest('hex');
}

function verifyAckToken(activityId, email, token) {
  if (!activityId || !email || !token) return false;
  const expected = generateAckToken(activityId, email);
  try {
    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAckPage({ success, isAlreadyAcknowledged, title, startDate, endDate, userName, userEmail, readAt, baseUrl, errorMessage }) {
  const primaryColor = success ? '#0d9488' : '#e11d48';
  const badgeBg = success ? (isAlreadyAcknowledged ? '#fef3c7' : '#ecfdf5') : '#ffe4e6';
  const badgeColor = success ? (isAlreadyAcknowledged ? '#92400e' : '#065f46') : '#9f1239';
  const badgeBorder = success ? (isAlreadyAcknowledged ? '#fde68a' : '#a7f3d0') : '#fecdd3';
  const statusLabel = isAlreadyAcknowledged ? 'Already Acknowledged' : (success ? 'Successfully Acknowledged' : 'Verification Issue');

  const formattedDate = readAt ? new Date(readAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) : new Date().toLocaleString();

  const datesFormatted = startDate ? (endDate && endDate !== startDate ? `${startDate} to ${endDate}` : startDate) : 'N/A';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Activity Acknowledged' : 'Acknowledgment Status'} | OpsHUB</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
      color: #334155;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      max-width: 520px;
      width: 100%;
      border-radius: 20px;
      padding: 36px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.2);
      text-align: center;
    }
    .header-logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
      padding: 6px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 9999px;
    }
    .header-logo span {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.5px;
    }
    .icon-wrapper {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${success ? '#f0fdf4' : '#fff1f2'};
      border: 2px solid ${success ? '#bbf7d0' : '#fecdd3'};
      color: ${primaryColor};
    }
    .icon-wrapper svg {
      width: 34px;
      height: 34px;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
      background: ${badgeBg};
      color: ${badgeColor};
      border: 1px solid ${badgeBorder};
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .details-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
      text-align: left;
      margin-bottom: 26px;
    }
    .detail-row {
      margin-bottom: 12px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .detail-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .detail-value {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }
    .detail-subvalue {
      font-size: 12px;
      color: #64748b;
      font-weight: 400;
      margin-top: 1px;
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: #0f172a;
      color: #ffffff;
      padding: 13px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2);
    }
    .btn:hover {
      background: #1e293b;
    }
    .footer-note {
      margin-top: 18px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header-logo">
      <span>PSA KALINGA &bull; OpsHUB</span>
    </div>

    <div class="icon-wrapper">
      ${success ? `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ` : `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></polyline>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `}
    </div>

    <div class="badge">${statusLabel}</div>

    <h1>${success ? (isAlreadyAcknowledged ? 'Activity Already Acknowledged' : 'Activity Confirmed') : 'Unable to Acknowledge'}</h1>
    <p class="subtitle">
      ${success ? (isAlreadyAcknowledged ? 'You have previously confirmed receipt of this activity. Your acknowledgment remains safely recorded.' : 'Your receipt and acknowledgment have been recorded in OpsHUB. Administrators can now see your confirmation in their tracking dashboard.') : (errorMessage || 'We could not process this acknowledgment link.')}
    </p>

    ${success ? `
      <div class="details-box">
        <div class="detail-row">
          <div class="detail-label">Activity Title</div>
          <div class="detail-value" style="color: #0d9488;">${escapeHtml(title || 'Office Activity')}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Scheduled Date</div>
          <div class="detail-value">${escapeHtml(datesFormatted)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Acknowledged By</div>
          <div class="detail-value">${escapeHtml(userName || userEmail || '')}</div>
          ${userEmail ? `<div class="detail-subvalue">${escapeHtml(userEmail)}</div>` : ''}
        </div>
        <div class="detail-row">
          <div class="detail-label">Recorded At</div>
          <div class="detail-value" style="font-size: 13px; font-weight: 500; color: #475569;">${escapeHtml(formattedDate)}</div>
        </div>
      </div>
    ` : ''}

    <a href="${baseUrl}/office-activities" class="btn">Open OpsHUB Office Activities &rarr;</a>

    <p class="footer-note">You may now safely close this browser window.</p>
  </div>
</body>
</html>`;
}

function generateActivityEmailHtml({ title, startDate, endDate, description, ackUrl, baseUrl }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0f766e 0%, #0f172a 100%); padding: 24px; color: #ffffff;">
        <h2 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">New Activity Assigned</h2>
      </div>
      
      <div style="padding: 24px;">
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #0f172a;">${escapeHtml(title)}</h3>
          <div style="display: inline-block; padding: 4px 10px; background-color: #f1f5f9; color: #475569; border-radius: 6px; font-size: 12px; font-weight: 600;">
            📅 ${escapeHtml(startDate)}${endDate && endDate !== startDate ? ` to ${escapeHtml(endDate)}` : ''}
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Activity Details</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(description || 'No description provided.')}</div>
        </div>

        <!-- Direct Acknowledgment Card -->
        <div style="background: linear-gradient(180deg, #f0fdfa 0%, #ecfdf5 100%); border: 1.5px solid #99f6e4; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #0f766e;">Action Required: Read &amp; Acknowledge</p>
          <p style="margin: 0 0 16px 0; font-size: 12px; color: #0d9488;">Click the button below to confirm that you have received and read this assignment. No login is required.</p>
          <a href="${ackUrl}" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.3);">
            ✓ Acknowledge Activity
          </a>
        </div>

        <div style="text-align: center; padding-top: 8px;">
          <a href="${baseUrl}/office-activities" style="display: inline-block; padding: 9px 18px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">Open OpsHUB Dashboard &rarr;</a>
        </div>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding: 16px 24px; background-color: #f8fafc; font-size: 12px; color: #64748b;">
        <p style="margin: 0;"><strong>Please do not reply to this email.</strong> This is an automated notification from OpsHUB.</p>
      </div>
    </div>
  `;
}

async function dispatchActivityEmails({
  turso,
  activityId,
  activity,
  targetRecipients = null,
  baseUrl,
  emailAttachments = []
}) {
  let assignedNames = [];
  try {
    assignedNames = typeof activity.assigned_to === 'string' ? JSON.parse(activity.assigned_to) : activity.assigned_to;
  } catch {
    assignedNames = ['All'];
  }

  const allAssigneeTargets = await resolveAssigneeEmailsWithNames(turso, assignedNames);

  let targets = allAssigneeTargets;
  if (Array.isArray(targetRecipients) && targetRecipients.length > 0) {
    const targetSet = new Set(targetRecipients.map(e => (e || '').toLowerCase().trim()));
    targets = allAssigneeTargets.filter(t => t.email && targetSet.has(t.email.toLowerCase()));
  }

  if (targets.length === 0) {
    return { sentCount: 0, failedCount: 0, results: [] };
  }

  // Personal Calendar insertion for valid recipient emails
  const calTargets = targets.filter(t => t.email);
  if (calTargets.length > 0) {
    const calendarPromises = calTargets.map(t =>
      turso.execute({
        sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [t.email, activity.title, 'Office Activity', activity.start_date, activity.end_date || activity.start_date, activity.description]
      }).catch(e => console.error("Calendar insert failed for", t.email, e))
    );
    await Promise.all(calendarPromises);
  }

  const mailer = createMailer();
  const results = await sendBatchMailDetailed(mailer, targets, (targetEmail) => {
    const ackToken = generateAckToken(activityId, targetEmail);
    const ackUrl = `${baseUrl}/api/activities?action=acknowledge&id=${activityId}&email=${encodeURIComponent(targetEmail)}&token=${ackToken}`;

    return {
      from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
      to: targetEmail,
      subject: `New Activity Assigned: ${activity.title}`,
      text: `You have been assigned to an office activity: ${activity.title}\nDates: ${activity.start_date} to ${activity.end_date || activity.start_date}\n\nDescription:\n${activity.description || 'No description provided.'}\n\n----------------------------------------\nACKNOWLEDGE THIS ACTIVITY:\nTo confirm you have read and noted this activity, click the link below:\n${ackUrl}\n----------------------------------------\n\nOr view on OpsHUB:\n${baseUrl}/office-activities\n\n---\nPlease do not reply to this message. This is an automated notification from OpsHUB.`,
      html: generateActivityEmailHtml({
        title: activity.title,
        startDate: activity.start_date,
        endDate: activity.end_date,
        description: activity.description,
        ackUrl,
        baseUrl
      }),
      attachments: emailAttachments
    };
  });

  if (mailer) {
    try { mailer.close(); } catch (_) { }
  }

  // Push notifications
  const pushEmails = results.filter(r => r.status === 'sent' && r.email).map(r => r.email);
  if (pushEmails.length > 0) {
    import('../lib/pushHelper.js').then(({ sendPushNotification }) => {
      sendPushNotification(pushEmails, {
        title: `New Activity Assigned`,
        body: activity.title,
        url: '/office-activities'
      }).catch(e => console.error("Push failed:", e));
    });
  }

  // Save each recipient outcome to Office_Activity_Email_Logs
  for (const item of results) {
    if (item.email) {
      await turso.execute({
        sql: `INSERT INTO Office_Activity_Email_Logs (activity_id, recipient_name, recipient_email, status, error_message, sent_at)
              VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
              ON CONFLICT(activity_id, recipient_email) DO UPDATE SET
                recipient_name = excluded.recipient_name,
                status = excluded.status,
                error_message = excluded.error_message,
                sent_at = datetime('now', 'localtime')`,
        args: [activityId, item.name || '', item.email.toLowerCase(), item.status, item.error || null]
      });
    }
  }

  // Recalculate totals for this activity from Office_Activity_Email_Logs
  const countsRes = await turso.execute({
    sql: `SELECT 
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
          FROM Office_Activity_Email_Logs
          WHERE activity_id = ?`,
    args: [activityId]
  });
  const sentCount = Number(countsRes.rows[0]?.sent_count || 0);
  const failedCount = Number(countsRes.rows[0]?.failed_count || 0);

  await turso.execute({
    sql: "UPDATE Office_Activities SET emails_sent = ?, emails_failed = ? WHERE id = ?",
    args: [sentCount, failedCount, activityId]
  });

  return { sentCount, failedCount, results };
}

async function handleEmailAcknowledgment(req, res, turso) {
  let query = req.query || {};
  if (!query.action && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      query = Object.fromEntries(parsedUrl.searchParams);
    } catch (_) { }
  }

  const { id, email, token } = query;
  const baseUrl = getBaseUrl(req);

  if (!id || !email || !token) {
    const html = renderAckPage({
      success: false,
      baseUrl,
      errorMessage: 'The acknowledgment link is incomplete or malformed. Please use the original link from your email notification.'
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400);
    return res.end(html);
  }

  const isValid = verifyAckToken(id, email, token);
  if (!isValid) {
    const html = renderAckPage({
      success: false,
      baseUrl,
      errorMessage: 'Security verification failed. This link may have expired or is invalid.'
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(403);
    return res.end(html);
  }

  // Find the activity
  const actRes = await turso.execute({
    sql: "SELECT id, title, description, start_date, end_date, status FROM Office_Activities WHERE id = ?",
    args: [id]
  });

  if (actRes.rows.length === 0) {
    const html = renderAckPage({
      success: false,
      baseUrl,
      errorMessage: 'This activity could not be found. It may have been canceled or deleted by an administrator.'
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404);
    return res.end(html);
  }

  const activity = actRes.rows[0];

  // Resolve user's full name from User_Permissions
  let userName = '';
  try {
    const userRes = await turso.execute({
      sql: "SELECT First_Name, Middle_Name, Last_Name, Suffix FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
      args: [email.trim().toLowerCase()]
    });
    if (userRes.rows.length > 0) {
      const u = userRes.rows[0];
      const f = (u.First_Name || '').trim();
      const m = (u.Middle_Name || '').trim() ? u.Middle_Name.trim().charAt(0) + '. ' : '';
      const l = (u.Last_Name || '').trim();
      const s = (u.Suffix || '').trim() ? ' ' + u.Suffix.trim() : '';
      userName = `${f} ${m}${l}${s}`.trim();
    }
  } catch (err) {
    console.error("Error looking up user name for email ack:", err);
  }
  if (!userName) userName = email;

  // Ensure reads table exists
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS Office_Activity_Reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(activity_id, user_email)
    )
  `);

  // Check if already acknowledged
  const existingRead = await turso.execute({
    sql: "SELECT read_at FROM Office_Activity_Reads WHERE activity_id = ? AND LOWER(user_email) = LOWER(?)",
    args: [id, email.trim().toLowerCase()]
  });

  let isAlreadyAcknowledged = false;
  let readAt = '';

  if (existingRead.rows.length > 0) {
    isAlreadyAcknowledged = true;
    readAt = existingRead.rows[0].read_at;
  } else {
    await turso.execute({
      sql: `INSERT INTO Office_Activity_Reads (activity_id, user_email, user_name, read_at)
            VALUES (?, ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(activity_id, user_email) DO UPDATE SET read_at = datetime('now', 'localtime')`,
      args: [id, email.trim().toLowerCase(), userName]
    });
    const checkRes = await turso.execute({
      sql: "SELECT read_at FROM Office_Activity_Reads WHERE activity_id = ? AND LOWER(user_email) = LOWER(?)",
      args: [id, email.trim().toLowerCase()]
    });
    readAt = checkRes.rows[0]?.read_at || new Date().toISOString();
  }

  const html = renderAckPage({
    success: true,
    isAlreadyAcknowledged,
    title: activity.title,
    startDate: activity.start_date,
    endDate: activity.end_date,
    userName,
    userEmail: email,
    readAt,
    baseUrl
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200);
  return res.end(html);
}

export default async function handler(req, res) {
  try {
    // 1. Intercept public one-click email acknowledgment (before Clerk auth requirement)
    let isAckAction = req.method === 'GET' && (req.query?.action === 'acknowledge');
    if (!isAckAction && req.method === 'GET' && req.url && req.url.includes('action=acknowledge')) {
      isAckAction = true;
    }

    if (isAckAction) {
      const turso = createClient({
        url: process.env['TURSO_DB_URL'],
        authToken: process.env['TURSO_DB_AUTH_TOKEN']
      });
      return await handleEmailAcknowledgment(req, res, turso);
    }

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

      // Fetch Employees for Dropdown and Read Receipts
      const empRes = await turso.execute(
        "SELECT Email, First_Name, Middle_Name, Last_Name, Suffix, Position FROM User_Permissions WHERE (LOWER(Status) != 'inactive' OR Status IS NULL) AND IFNULL(is_regional, 0) != 1 AND IFNULL(Role, '') NOT IN ('Super Admin', 'External Signatory') ORDER BY First_Name ASC"
      );
      const uniqueEmps = new Set();
      const allEmployees = empRes.rows.map(row => {
        const name = `${row.First_Name || ''} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name || ''}${row.Suffix ? ' ' + row.Suffix : ''}`.replace(/\s+/g, ' ').trim();
        if (row.First_Name && row.Last_Name) {
          uniqueEmps.add(name);
        }
        return {
          email: (row.Email || '').toLowerCase(),
          name,
          position: row.Position || 'Staff'
        };
      });

      await ensureTablesAndColumns(turso);

      // Fetch Activities
      const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");

      // Ensure Office_Activity_Reads table exists & fetch reads
      let reads = [];
      try {
        const readsRes = await turso.execute("SELECT activity_id, user_email, user_name, read_at FROM Office_Activity_Reads");
        reads = readsRes.rows || [];
      } catch (err) {
        console.error("Error fetching Office_Activity_Reads:", err);
      }

      // Fetch Email Logs
      let emailLogs = [];
      try {
        const emailLogsRes = await turso.execute(
          "SELECT id, activity_id, recipient_name, recipient_email, status, error_message, sent_at FROM Office_Activity_Email_Logs ORDER BY sent_at DESC"
        );
        emailLogs = emailLogsRes.rows || [];
      } catch (err) {
        console.error("Error fetching Office_Activity_Email_Logs:", err);
      }

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
        allEmployees,
        activities: actRes.rows,
        todayBirthdays: todayCelebrants,
        reads,
        emailLogs
      });

    } else if (req.method === 'POST') {
      const { action } = req.body;

      if (action === 'markAsRead') {
        const { activityId, email: userEmail, userName } = req.body;
        if (!activityId || !userEmail) {
          return res.status(400).json({ error: 'activityId and email are required' });
        }
        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Office_Activity_Reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id INTEGER NOT NULL,
            user_email TEXT NOT NULL,
            user_name TEXT,
            read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(activity_id, user_email)
          )
        `);
        await turso.execute({
          sql: `INSERT INTO Office_Activity_Reads (activity_id, user_email, user_name, read_at)
                VALUES (?, ?, ?, datetime('now', 'localtime'))
                ON CONFLICT(activity_id, user_email) DO UPDATE SET read_at = datetime('now', 'localtime')`,
          args: [activityId, userEmail.trim().toLowerCase(), userName || '']
        });
        const readsRes = await turso.execute("SELECT activity_id, user_email, user_name, read_at FROM Office_Activity_Reads");
        return res.status(200).json({ success: true, reads: readsRes.rows || [] });
      }

      if (action === 'markAsReadBatch') {
        const { activityIds, email: userEmail, userName } = req.body;
        if (!Array.isArray(activityIds) || !userEmail) {
          return res.status(400).json({ error: 'activityIds array and email are required' });
        }
        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Office_Activity_Reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id INTEGER NOT NULL,
            user_email TEXT NOT NULL,
            user_name TEXT,
            read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(activity_id, user_email)
          )
        `);
        for (const actId of activityIds) {
          await turso.execute({
            sql: `INSERT INTO Office_Activity_Reads (activity_id, user_email, user_name, read_at)
                  VALUES (?, ?, ?, datetime('now', 'localtime'))
                  ON CONFLICT(activity_id, user_email) DO UPDATE SET read_at = datetime('now', 'localtime')`,
            args: [actId, userEmail.trim().toLowerCase(), userName || '']
          });
        }
        const readsRes = await turso.execute("SELECT activity_id, user_email, user_name, read_at FROM Office_Activity_Reads");
        return res.status(200).json({ success: true, reads: readsRes.rows || [] });
      }

      if (action === 'resendEmails') {
        const { activityId, targetEmails, mode } = req.body;
        if (!activityId) {
          return res.status(400).json({ error: 'activityId is required' });
        }

        const actCheck = await turso.execute({
          sql: "SELECT * FROM Office_Activities WHERE id = ?",
          args: [activityId]
        });
        if (actCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Activity not found' });
        }
        const activity = actCheck.rows[0];

        let targetList = targetEmails;
        if (mode === 'failed_only') {
          const failedLogs = await turso.execute({
            sql: "SELECT recipient_email FROM Office_Activity_Email_Logs WHERE activity_id = ? AND status = 'failed'",
            args: [activityId]
          });
          targetList = failedLogs.rows.map(r => r.recipient_email).filter(Boolean);
          if (targetList.length === 0) {
            return res.status(400).json({ error: 'No failed email recipients found for this activity to resend to.' });
          }
        }

        const baseUrl = getBaseUrl(req);
        const dispatchResult = await dispatchActivityEmails({
          turso,
          activityId,
          activity,
          targetRecipients: targetList,
          baseUrl
        });

        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
        const emailLogsRes = await turso.execute("SELECT id, activity_id, recipient_name, recipient_email, status, error_message, sent_at FROM Office_Activity_Email_Logs ORDER BY sent_at DESC");

        return res.status(200).json({
          success: true,
          activities: actRes.rows,
          emailLogs: emailLogsRes.rows || [],
          emailsSent: dispatchResult.sentCount,
          failedEmails: dispatchResult.failedCount
        });
      }

      // Create Activity & Send Emails
      const { email, formData } = req.body;
      const assignedJson = JSON.stringify(formData.assigned_to);

      const insertRes = await turso.execute({
        sql: `INSERT INTO Office_Activities (title, description, start_date, end_date, assigned_to, created_by, status) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, email, formData.status]
      });

      let newActivityId = insertRes.lastInsertRowid ? Number(insertRes.lastInsertRowid) : null;
      if (!newActivityId) {
        const lastIdRes = await turso.execute("SELECT last_insert_rowid() as id");
        newActivityId = Number(lastIdRes.rows[0]?.id);
      }
      if (!newActivityId) {
        const fallbackRes = await turso.execute("SELECT id FROM Office_Activities ORDER BY id DESC LIMIT 1");
        newActivityId = Number(fallbackRes.rows[0]?.id);
      }

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

      const baseUrl = getBaseUrl(req);
      const activityRecord = {
        title: formData.title,
        description: formData.description,
        start_date: formData.start_date,
        end_date: formData.end_date || formData.start_date,
        assigned_to: formData.assigned_to
      };

      const dispatchResult = await dispatchActivityEmails({
        turso,
        activityId: newActivityId,
        activity: activityRecord,
        baseUrl,
        emailAttachments
      });

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

      // Fetch fresh activities and email logs
      const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
      const emailLogsRes = await turso.execute("SELECT id, activity_id, recipient_name, recipient_email, status, error_message, sent_at FROM Office_Activity_Email_Logs ORDER BY sent_at DESC");
      return res.status(200).json({
        success: true,
        activities: actRes.rows,
        emailLogs: emailLogsRes.rows || [],
        emailsSent: dispatchResult.sentCount,
        failedEmails: dispatchResult.failedCount
      });

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
              html: renderEmailLayout({
                headerTitle: 'Activity Canceled',
                theme: 'rose',
                bodyHtml: `
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">
                    The scheduled activity has been canceled by an administrator.
                  </p>

                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Canceled Activity</p>
                    <h3 style="margin: 0; font-size: 17px; color: #0f172a;">${escapeHtml(title)}</h3>
                  </div>

                  <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
                    <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9f1239; letter-spacing: 0.5px;">Reason for Cancellation</p>
                    <p style="margin: 0; font-size: 13px; color: #881337; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(reason || 'No cancellation reason provided.')}</p>
                  </div>

                  <div style="text-align: center; margin-bottom: 8px;">
                    <a href="${baseUrl}/office-activities" style="display: inline-block; padding: 11px 24px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
                      Open OpsHUB Activities &rarr;
                    </a>
                  </div>
                `
              })
            }));

            try { mailer.close(); } catch (_) { }
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

      await turso.execute({
        sql: "DELETE FROM Office_Activity_Reads WHERE activity_id = ?",
        args: [id]
      }).catch(e => console.error("Error deleting reads for activity:", e));

      await turso.execute({
        sql: "DELETE FROM Office_Activity_Email_Logs WHERE activity_id = ?",
        args: [id]
      }).catch(e => console.error("Error deleting email logs for activity:", e));

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
