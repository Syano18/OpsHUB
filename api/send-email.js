import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { to, subject, text, html } = req.body;

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

    const info = await transporter.sendMail({
      from: {
        name: 'OpsHUB Notifier',
        address: process.env.SMTP_USER || 'kalinga@psa.gov.ph'
      },
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: subject,
      text: text,
      html: html
    });

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("SMTP Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
