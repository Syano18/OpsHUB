import { createClient } from '@libsql/client';
import { verifyToken } from '@clerk/backend';

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
      const { action, email, baseRef } = req.query;

      if (action === 'checkRef') {
        const resDb = await turso.execute({
          sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE REFERENCE_NUMBER LIKE ?`,
          args: [`${baseRef}%`]
        });
        return res.status(200).json({ references: resDb.rows.map(r => r.REFERENCE_NUMBER) });
      }

      // Default GET: Fetch everything
      const [logbookResult, sectionsResult, transmittalResult] = await Promise.all([
        turso.execute("SELECT * FROM Digital_Logbook ORDER BY CAST(SUBSTR(REFERENCE_NUMBER, INSTR(REFERENCE_NUMBER, '-') + 1) AS INTEGER) DESC, REFERENCE_NUMBER DESC"),
        turso.execute("SELECT * FROM Sections ORDER BY name ASC"),
        turso.execute("SELECT * FROM TransmittalModes ORDER BY name ASC")
      ]);

      let transmitterName = null;
      let userRole = null;

      if (email) {
        const userResult = await turso.execute({
          sql: `SELECT First_Name, Middle_Name, Last_Name, Suffix, Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)`,
          args: [email]
        });
        if (userResult.rows.length > 0) {
          const row = userResult.rows[0];
          const fn = row.First_Name || "";
          const mn = row.Middle_Name ? ` ${row.Middle_Name.charAt(0).toUpperCase()}.` : "";
          const ln = row.Last_Name ? ` ${row.Last_Name}` : "";
          const sx = row.Suffix ? ` ${row.Suffix}` : "";
          transmitterName = `${fn}${mn}${ln}${sx}`.trim();
          userRole = row.Role;
        }
      }

      return res.status(200).json({ 
        entries: logbookResult.rows,
        sectionsList: sectionsResult.rows,
        transmittalModesList: transmittalResult.rows,
        transmitterName,
        userRole
      });

    } else if (req.method === 'POST') {
      const { 
        referenceOverride, timestampOverride, particulars, addresse, 
        transmitterName, section, modeOfTransmittal, remarks, encodedBy 
      } = req.body;

      let generatedRef = "";

      if (referenceOverride) {
        if (timestampOverride) {
          await turso.execute({
            sql: `INSERT INTO Digital_Logbook (
                    REFERENCE_NUMBER, Timestamp, PARTICULARS, ADDRESSE, 
                    TRANSMITTER, SECTION, MODE_OF_TRANSMITTAL, 
                    REMARKS, ENCODED_BY
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              referenceOverride, timestampOverride, particulars, addresse,
              transmitterName, section, modeOfTransmittal, remarks, encodedBy
            ]
          });
        } else {
          await turso.execute({
            sql: `INSERT INTO Digital_Logbook (
                    REFERENCE_NUMBER, PARTICULARS, ADDRESSE, 
                    TRANSMITTER, SECTION, MODE_OF_TRANSMITTAL, 
                    REMARKS, ENCODED_BY
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              referenceOverride, particulars, addresse,
              transmitterName, section, modeOfTransmittal, remarks, encodedBy
            ]
          });
        }
        generatedRef = referenceOverride;
      } else {
        const insertResult = await turso.execute({
          sql: `INSERT INTO Digital_Logbook (
                  PARTICULARS, ADDRESSE, 
                  TRANSMITTER, SECTION, MODE_OF_TRANSMITTAL, 
                  REMARKS, ENCODED_BY
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            particulars, addresse, transmitterName, section, 
            modeOfTransmittal, remarks, encodedBy
          ]
        });

        const refResult = await turso.execute({
          sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE id = ?`,
          args: [Number(insertResult.lastInsertRowid)]
        });
        generatedRef = refResult.rows[0].REFERENCE_NUMBER;
      }

      // Add to dropdown tables if they exist
      if (section && section.trim() !== '') {
        await turso.execute({ sql: `INSERT OR IGNORE INTO Sections (name) VALUES (?)`, args: [section.trim()] });
      }
      if (modeOfTransmittal && modeOfTransmittal.trim() !== '') {
        await turso.execute({ sql: `INSERT OR IGNORE INTO TransmittalModes (name) VALUES (?)`, args: [modeOfTransmittal.trim()] });
      }

      return res.status(200).json({ success: true, generatedRef });

    } else if (req.method === 'PUT') {
      const { 
        id, particulars, addresse, transmitterName, 
        section, modeOfTransmittal, remarks, encodedBy 
      } = req.body;

      if (!id) return res.status(400).json({ error: 'ID is required' });

      await turso.execute({
        sql: `UPDATE Digital_Logbook SET 
                PARTICULARS = ?, ADDRESSE = ?, TRANSMITTER = ?, 
                SECTION = ?, MODE_OF_TRANSMITTAL = ?, REMARKS = ?, ENCODED_BY = ?
              WHERE id = ?`,
        args: [
          particulars, addresse, transmitterName, section, 
          modeOfTransmittal, remarks, encodedBy, id
        ]
      });

      const refResult = await turso.execute({
        sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE id = ?`,
        args: [id]
      });
      
      const generatedRef = refResult.rows[0].REFERENCE_NUMBER;

      // Add to dropdown tables if they exist
      if (section && section.trim() !== '') {
        await turso.execute({ sql: `INSERT OR IGNORE INTO Sections (name) VALUES (?)`, args: [section.trim()] });
      }
      if (modeOfTransmittal && modeOfTransmittal.trim() !== '') {
        await turso.execute({ sql: `INSERT OR IGNORE INTO TransmittalModes (name) VALUES (?)`, args: [modeOfTransmittal.trim()] });
      }

      return res.status(200).json({ success: true, generatedRef });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("API Error in /api/logbook:", err);
    res.status(500).json({ error: err.message });
  }
}
