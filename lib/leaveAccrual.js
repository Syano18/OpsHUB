/**
 * Helper to ensure leave credits are accurately accrued and kept up to date.
 * Handles catch-up automatically if a scheduled cron execution was missed on serverless hosting (e.g. Vercel).
 */
export async function syncLeaveAccrual(tursoClient) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // Permanent, Contractual, Casual, and Regular staff earn leave credits.
  // COSW and Job Order (JO) do not earn leave credits under CSC rules.
  const targetEmployeesCondition = `
    LOWER(user_email) IN (
      SELECT LOWER(Email) FROM User_Permissions 
      WHERE (
        IFNULL(emp_stat, '') = '' 
        OR UPPER(emp_stat) NOT IN ('COSW', 'JOB ORDER', 'JO', 'CONTRACT OF SERVICE')
      )
      AND (Status IS NULL OR LOWER(Status) != 'inactive')
      AND IFNULL(is_regional, 0) != 1
      AND IFNULL(Role, '') != 'Super Admin'
    )
  `;

  const results = [];

  // 1. Fetch distinct last_accrual_month values among target employees
  const distinctMonthsRs = await tursoClient.execute(`
    SELECT DISTINCT last_accrual_month 
    FROM Leave_Credits 
    WHERE ${targetEmployeesCondition}
  `);

  for (const row of distinctMonthsRs.rows) {
    const lastMonth = row.last_accrual_month;

    // If never initialized, set to current month
    if (!lastMonth) {
      await tursoClient.execute({
        sql: `UPDATE Leave_Credits 
              SET last_accrual_month = ? 
              WHERE (last_accrual_month IS NULL OR last_accrual_month = '') 
                AND ${targetEmployeesCondition}`,
        args: [currentMonthStr]
      });
      continue;
    }

    if (lastMonth === currentMonthStr) {
      continue; // Already accrued for current month
    }

    // Calculate elapsed months: (2026-11) - (2026-08) = 3
    const [lastY, lastM] = String(lastMonth).split('-').map(Number);
    if (!lastY || !lastM) continue;

    const diff = (currentYear - lastY) * 12 + (currentMonth - lastM);
    if (diff > 0) {
      const addedCredits = Number((diff * 1.25).toFixed(4));
      await tursoClient.execute({
        sql: `UPDATE Leave_Credits 
              SET vl_balance = vl_balance + ?, 
                  sl_balance = sl_balance + ?, 
                  last_accrual_month = ? 
              WHERE last_accrual_month = ? 
                AND ${targetEmployeesCondition}`,
        args: [addedCredits, addedCredits, currentMonthStr, lastMonth]
      });
      results.push(`Accrued ${diff} month(s) (+${addedCredits} VL/SL) for employees previously at ${lastMonth}.`);
    }
  }

  // 2. Handle annual reset of FL, SPL, WL, USE quotas in January
  if (currentMonth === 1) {
    const resetRs = await tursoClient.execute({
      sql: `UPDATE Leave_Credits 
            SET fl_balance = 5, spl_balance = 3, wl_balance = 5, use_balance = 6, last_reset_year = ? 
            WHERE (last_reset_year IS NULL OR last_reset_year < ?) 
              AND ${targetEmployeesCondition}`,
      args: [currentYear, currentYear]
    });
    if (resetRs.rowsAffected > 0) {
      results.push(`Reset annual quotas (FL, SPL, WL, USE) for year ${currentYear}.`);
    }
  } else {
    // Ensure last_reset_year is tagged if currently null
    await tursoClient.execute({
      sql: `UPDATE Leave_Credits 
            SET last_reset_year = ? 
            WHERE last_reset_year IS NULL 
              AND ${targetEmployeesCondition}`,
      args: [currentYear]
    });
  }

  return { currentMonthStr, results };
}

