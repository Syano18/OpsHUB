import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';
import nodemailer from 'nodemailer';

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

    const { email } = req.query;
    let userRole = null;

    if (email) {
      const roleRes = await turso.execute({
        sql: "SELECT Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
        args: [email]
      });
      if (roleRes.rows.length > 0) {
        userRole = roleRes.rows[0].Role;
      }
    }

    // Role check - only Super Admin, Admin, Focal Person can access
    const allowedRoles = ['Super Admin', 'Admin', 'Focal Person'];
    if (email && !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access this resource.' });
    }

    if (req.method === 'GET') {
      const { action } = req.query;
      
      if (action === 'getEmployments') {
        let sql = "SELECT * FROM Employments";
        let args = [];
        if (userRole === 'Focal Person') {
          sql += " WHERE LOWER(focal_person_email) = LOWER(?)";
          args.push(email);
        }
        sql += " ORDER BY id DESC";
        const rs = await turso.execute({ sql, args });
        return res.status(200).json({ employments: rs.rows });
      } else if (action === 'getPendingEvaluations') {
        let sql = "SELECT * FROM Employments WHERE (rating IS NULL OR rating = '')";
        let args = [];
        if (userRole === 'Focal Person') {
          sql += " AND LOWER(focal_person_email) = LOWER(?)";
          args.push(email);
        }
        sql += " ORDER BY id DESC";
        const rs = await turso.execute({ sql, args });
        return res.status(200).json({ pendingEvaluations: rs.rows });
      } else if (action === 'getFocalPersons') {
        const fpRes = await turso.execute("SELECT First_Name, Middle_Name, Last_Name, Email FROM User_Permissions WHERE Role = 'Focal Person' OR Role = 'Admin' OR Role = 'Super Admin'");
        const persons = fpRes.rows.map(r => ({
          name: `${r.First_Name} ${r.Middle_Name ? r.Middle_Name.charAt(0) + '. ' : ''}${r.Last_Name}`.trim(),
          email: r.Email
        }));
        return res.status(200).json({ focalPersons: persons });
      }
      return res.status(400).json({ error: 'Invalid GET action' });
    }


    if (req.method === 'PUT') {
      const { action } = req.body;
      
      if (action === 'updateEmployment') {
        const { id, employee_name, position, survey_name, contract_start_date, contract_end_date, focal_person_email, rating, remarks } = req.body.data;
        
        await turso.execute({
          sql: `UPDATE Employments 
                SET employee_name = ?, position = ?, survey_name = ?, contract_start_date = ?, contract_end_date = ?, focal_person_email = ?, rating = ?, remarks = ?
                WHERE id = ?`,
          args: [employee_name, position, survey_name, contract_start_date, contract_end_date, focal_person_email || null, rating || null, remarks || null, id]
        });

        if (rating) {
          try {
            const pacdRes = await turso.execute("SELECT Email FROM User_Permissions WHERE Role = 'PACD'");
            const pacdEmails = pacdRes.rows.map(r => r.Email).filter(Boolean);
            
            if (pacdEmails.length > 0) {
              const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_PORT === '465',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                },
              });

              const emailHtml = `
                <div style="font-family: sans-serif; color: #333;">
                  <h2>COSW Rating Submitted</h2>
                  <p>A performance rating has been successfully submitted for <strong>${employee_name}</strong> (${position}).</p>
                  <p>Please log in to the <strong>HireTrack</strong> System, click on <strong>Sync from Cloud</strong>, and issue the certificate to the requester.</p>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                  <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
                </div>
              `;

              await transporter.sendMail({
                from: { name: 'OpsHUB Notifier', address: process.env.SMTP_USER || 'kalinga@psa.gov.ph' },
                to: pacdEmails.join(', '),
                subject: `Action Required: Rating Submitted for ${employee_name}`,
                html: emailHtml
              });
            }
          } catch (emailErr) {
            console.error("Failed to send notification email:", emailErr);
          }
        }
        
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid PUT action' });
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (error) {
    console.error("API Error in employments.js:", error);
    return res.status(500).json({ error: error.message });
  }
}
