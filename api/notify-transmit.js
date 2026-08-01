import nodemailer from 'nodemailer';
import { createClient } from '@libsql/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL?.trim(),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { leaveId } = req.body;
    if (!leaveId) {
      return res.status(400).json({ success: false, error: 'leaveId is required' });
    }

    const turso = createClient({
      url: process.env.TURSO_DB_URL,
      authToken: process.env.TURSO_DB_AUTH_TOKEN
    });

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
    const mailOptions = {
      from: {
        name: 'OpsHUB Notification',
        address: process.env.SMTP_USER || 'kalinga@psa.gov.ph'
      },
      to: toEmails.join(', '),
      subject: `Leave Application Transmitted: ${leaveRecord.leave_type || 'Leave'}`,
      text: `A leave application has been transmitted by ${fullName}.\n\nLeave Type: ${leaveRecord.leave_type || 'N/A'}\nDays Applied: ${leaveRecord.days_applied || 'N/A'}\nInclusive Dates: ${leaveRecord.start_date || 'N/A'}${!isCSS ? '\\n\\nPlease review the application in the OpsHUB system.' : '\\n\\nVERIFICATION NOTICE: This leave application was officially filed and transmitted directly by the applicant through the internal OpsHUB System. The attached document is the authentic, signed leave form generated securely by the system. You can personally contact the filer to verify the received email.'}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #0f766e;">Leave Application</h2>
          <p>A leave application has been transmitted by <strong>${fullName}</strong>.</p>
          <p><strong>Leave Type:</strong> ${leaveRecord.leave_type || 'N/A'}</p>
          <p><strong>Days Applied:</strong> ${leaveRecord.days_applied || 'N/A'}</p>
          <p><strong>Inclusive Dates:</strong> ${leaveRecord.start_date || 'N/A'}</p>
          
          ${isCSS ? `
          <div style="margin-top: 20px; padding: 15px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #22c55e; border-radius: 6px;">
            <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">
              <strong>🔒 Official Transaction Verified</strong><br/>
              This leave application was personally filed and transmitted by the applicant through the secure OpsHUB System. The attached document is the authentic, digitally generated leave form. This is not a scam or fraud; it is an official system-generated notification. You can personally contact the filer to verify the received email.
            </p>
          </div>
          ` : ''}

          ${!isCSS ? '<p>Please review the application in the OpsHUB system.</p>' : ''}
          <div style="margin-top: 25px; margin-bottom: 25px;">
            ${!isCSS ? `<a href="https://operations-hub-iota.vercel.app" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Go to OpsHUB</a>` : ''}
            ${isCSS ? `<a href="mailto:${leaveRecord.user_email}?subject=Signed%20Leave%20Application%20-%20${encodeURIComponent(leaveRecord.leave_type || 'Leave')}${ccParam}" style="display: inline-block; padding: 10px 20px; background-color: #16a34a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Email Signed Leave to Applicant</a>` : ''}
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
          <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
        </div>
      `
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

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
