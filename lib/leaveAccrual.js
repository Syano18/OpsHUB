/**
 * Helper to ensure leave credits are accurately accrued and kept up to date.
 * Handles catch-up automatically if a scheduled cron execution was missed on serverless hosting (e.g. Vercel).
 */
export async function syncLeaveAccrual(tursoClient) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const results = [];

  // Fetch all leave credits along with user permissions
  const rowsRs = await tursoClient.execute(`
    SELECT lc.user_email, lc.vl_balance, lc.sl_balance, lc.last_accrual_month, lc.last_reset_year,
           up.emp_stat, up.Role, up.Status
    FROM Leave_Credits lc
    LEFT JOIN User_Permissions up ON LOWER(lc.user_email) = LOWER(up.Email)
  `);

  for (const row of rowsRs.rows) {
    const email = row.user_email;
    const lastMonth = row.last_accrual_month;
    const empStat = (row.emp_stat || '').trim().toUpperCase();
    const status = (row.Status || '').trim().toLowerCase();

    // Inactive users do not accrue
    if (status === 'inactive') continue;

    // COSW workers do not earn leave credits per CSC rules, but keep their accrual timestamp current
    const isCOSW = empStat === 'COSW' || empStat === 'CONTRACT OF SERVICE';

    if (lastMonth === currentMonthStr) {
      continue; // Already up to date for this month
    }

    if (!lastMonth) {
      await tursoClient.execute({
        sql: `UPDATE Leave_Credits SET last_accrual_month = ? WHERE LOWER(user_email) = LOWER(?)`,
        args: [currentMonthStr, email]
      });
      continue;
    }

    const [lastY, lastM] = String(lastMonth).split('-').map(Number);
    if (!lastY || !lastM) continue;

    const diff = (currentYear - lastY) * 12 + (currentMonth - lastM);
    if (diff > 0) {
      if (isCOSW) {
        // COSW does not accrue balances, update timestamp to current month
        await tursoClient.execute({
          sql: `UPDATE Leave_Credits SET last_accrual_month = ? WHERE LOWER(user_email) = LOWER(?)`,
          args: [currentMonthStr, email]
        });
      } else {
        // Eligible employee earns 1.25 VL and 1.25 SL per month
        const addedCredits = Number((diff * 1.25).toFixed(4));
        await tursoClient.execute({
          sql: `UPDATE Leave_Credits 
                SET vl_balance = vl_balance + ?, 
                    sl_balance = sl_balance + ?, 
                    last_accrual_month = ? 
                WHERE LOWER(user_email) = LOWER(?)`,
          args: [addedCredits, addedCredits, currentMonthStr, email]
        });
        results.push(`Accrued ${diff} month(s) (+${addedCredits} VL/SL) for ${email} (was ${lastMonth}).`);
      }
    }
  }

  // Handle annual reset of FL, SPL, WL, USE quotas in January
  if (currentMonth === 1) {
    await tursoClient.execute({
      sql: `UPDATE Leave_Credits 
            SET fl_balance = 5, spl_balance = 3, wl_balance = 5, use_balance = 6, last_reset_year = ? 
            WHERE last_reset_year IS NULL OR last_reset_year < ?`,
      args: [currentYear, currentYear]
    });
    results.push(`Reset annual quotas (FL, SPL, WL, USE) for year ${currentYear}.`);
  } else {
    await tursoClient.execute({
      sql: `UPDATE Leave_Credits 
            SET last_reset_year = ? 
            WHERE last_reset_year IS NULL`,
      args: [currentYear]
    });
  }

  return { currentMonthStr, results };
}
