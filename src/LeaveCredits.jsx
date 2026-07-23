import React, { useState, useEffect } from 'react';
import { UserButton, useUser } from '@clerk/clerk-react';
import { turso } from './db';
import CscForm6Printable from './components/CscForm6Printable';

// Helper to calculate sync
async function syncLeaveCredits(email) {
  const rs = await turso.execute({
    sql: "SELECT * FROM Leave_Credits WHERE user_email = ?",
    args: [email]
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (rs.rows.length === 0) {
    // Insert new
    await turso.execute({
      sql: `INSERT INTO Leave_Credits (
              user_email, vl_balance, sl_balance, fl_balance, wl_balance, use_balance, spl_balance,
              last_reset_year, last_accrual_month
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [email, 0, 0, 5, 5, 6, 3, currentYear, currentMonth]
    });
    return {
      vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
    };
  }

  const row = rs.rows[0];
  let vl_balance = Number(row.vl_balance);
  let sl_balance = Number(row.sl_balance);
  let fl_balance = Number(row.fl_balance);
  let wl_balance = Number(row.wl_balance);
  let use_balance = Number(row.use_balance);
  let spl_balance = Number(row.spl_balance);
  let last_reset_year = Number(row.last_reset_year);
  let last_accrual_month = String(row.last_accrual_month);

  let needsUpdate = false;

  // Yearly reset
  if (currentYear > last_reset_year) {
    fl_balance = 5;
    wl_balance = 5;
    use_balance = 6;
    spl_balance = 3;
    last_reset_year = currentYear;
    needsUpdate = true;
  }

  // Monthly accrual
  if (last_accrual_month < currentMonth) {
    const [lastYearStr, lastMonthStr] = last_accrual_month.split('-');
    const lastYear = parseInt(lastYearStr, 10);
    const lastM = parseInt(lastMonthStr, 10);

    const yearDiff = currentYear - lastYear;
    const monthDiff = (now.getMonth() + 1) - lastM;
    const totalMonths = (yearDiff * 12) + monthDiff;

    if (totalMonths > 0) {
      vl_balance += (totalMonths * 1.25);
      sl_balance += (totalMonths * 1.25);
      last_accrual_month = currentMonth;
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    await turso.execute({
      sql: `UPDATE Leave_Credits 
            SET vl_balance = ?, sl_balance = ?, fl_balance = ?, wl_balance = ?, use_balance = ?, spl_balance = ?,
                last_reset_year = ?, last_accrual_month = ?
            WHERE user_email = ?`,
      args: [vl_balance, sl_balance, fl_balance, wl_balance, use_balance, spl_balance, last_reset_year, last_accrual_month, email]
    });
  }

  return { vl_balance, sl_balance, fl_balance, wl_balance, use_balance, spl_balance };
}

export default function LeaveCredits() {
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userBalances, setUserBalances] = useState({
    vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
  });
  const [allUsers, setAllUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugError, setDebugError] = useState("");
  const [showFileLeave, setShowFileLeave] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [empStat, setEmpStat] = useState("");
  const [userPosition, setUserPosition] = useState("");
  const [userSalary, setUserSalary] = useState("");
  const [userNameParts, setUserNameParts] = useState({ firstName: '', middleName: '', lastName: '' });
  const [fileLeaveType, setFileLeaveType] = useState("");
  const [leaveDetailType, setLeaveDetailType] = useState("");
  const [leaveDetailSpecify, setLeaveDetailSpecify] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const fetchInitialData = async () => {
    if (!user) return;
    const email = user.primaryEmailAddress.emailAddress;
    try {
      // 1. Create table if not exists
      await turso.execute(`
        CREATE TABLE IF NOT EXISTS Leave_Credits (
          user_email TEXT PRIMARY KEY,
          vl_balance REAL DEFAULT 0,
          sl_balance REAL DEFAULT 0,
          fl_balance REAL DEFAULT 5,
          wl_balance REAL DEFAULT 5,
          use_balance REAL DEFAULT 6,
          spl_balance REAL DEFAULT 3,
          last_reset_year INTEGER,
          last_accrual_month TEXT 
        )
      `);

      // 2. Check if admin and get emp_stat, position, salary, name parts
      let currentIsAdmin = false;
      const userRs = await turso.execute({
        sql: "SELECT Role, emp_stat, Position, Salary, First_Name, Middle_Name, Last_Name, Suffix FROM User_Permissions WHERE Email = ?",
        args: [email]
      });
      if (userRs.rows.length > 0) {
        const row = userRs.rows[0];
        const role = row.Role;
        const fetchedEmpStat = row.emp_stat;
        setEmpStat(fetchedEmpStat);
        setUserPosition(row.Position || "");
        setUserSalary(row.Salary || "");

        const lastNameWithSuffix = row.Suffix ? `${row.Last_Name || ''} ${row.Suffix}`.trim() : (row.Last_Name || '');
        setUserNameParts({
          firstName: row.First_Name || '',
          middleName: row.Middle_Name || '',
          lastName: lastNameWithSuffix
        });

        currentIsAdmin = role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin';
      }
      setIsAdmin(currentIsAdmin);

      // 3. Sync personal leave credits
      const balances = await syncLeaveCredits(email);
      setUserBalances(balances);

      // 4. Fetch all users if admin
      if (currentIsAdmin) {
        fetchAllUsersCredits();
      }

    } catch (err) {
      console.error("Error fetching data:", err);
      setDebugError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllUsersCredits = async () => {
    try {
      const usersRs = await turso.execute("SELECT First_Name, Middle_Name, Last_Name, Email, Role, emp_stat, Status FROM User_Permissions WHERE IFNULL(Status, '') != 'Inactive'");
      const creditsRs = await turso.execute("SELECT * FROM Leave_Credits");

      const creditsMap = {};
      for (const row of creditsRs.rows) {
        creditsMap[row.user_email] = {
          vl_balance: Number(row.vl_balance),
          sl_balance: Number(row.sl_balance),
          fl_balance: Number(row.fl_balance),
          wl_balance: Number(row.wl_balance),
          use_balance: Number(row.use_balance),
          spl_balance: Number(row.spl_balance),
        };
      }

      const merged = usersRs.rows.map(u => {
        const name = `${u.First_Name || ''} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name || ''}`.trim();
        return {
          Name: name || u.Email,
          Email: u.Email,
          Role: u.Role,
          emp_stat: u.emp_stat,
          credits: creditsMap[u.Email] || {
            vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
          }
        };
      });
      setAllUsers(merged);
    } catch (err) {
      console.error("Error fetching all users:", err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [user]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);

    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Check if exists
      const rs = await turso.execute({
        sql: "SELECT * FROM Leave_Credits WHERE user_email = ?",
        args: [editingUser.Email]
      });

      if (rs.rows.length === 0) {
        await turso.execute({
          sql: `INSERT INTO Leave_Credits (
                  user_email, vl_balance, sl_balance, fl_balance, wl_balance, use_balance, spl_balance,
                  last_reset_year, last_accrual_month
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [editingUser.Email, data.vl, data.sl, data.fl, data.wl, data.use, data.spl, currentYear, currentMonth]
        });
      } else {
        await turso.execute({
          sql: `UPDATE Leave_Credits 
                SET vl_balance = ?, sl_balance = ?, fl_balance = ?, wl_balance = ?, use_balance = ?, spl_balance = ?,
                    last_reset_year = ?, last_accrual_month = ?
                WHERE user_email = ?`,
          args: [data.vl, data.sl, data.fl, data.wl, data.use, data.spl, currentYear, currentMonth, editingUser.Email]
        });
      }

      // If editing self, update self balances
      if (editingUser.Email === user.primaryEmailAddress.emailAddress) {
        setUserBalances({
          vl_balance: Number(data.vl),
          sl_balance: Number(data.sl),
          fl_balance: Number(data.fl),
          wl_balance: Number(data.wl),
          use_balance: Number(data.use),
          spl_balance: Number(data.spl)
        });
      }

      setEditingUser(null);
      fetchAllUsersCredits();
    } catch (err) {
      console.error("Error saving edits:", err);
    }
  };


  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          Leave Credits
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={() => setShowFileLeave(true)}
            className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl shadow-sm hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            File Leave
          </button>
        </div>

        {debugError && (
          <div className="mb-8 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg whitespace-pre-wrap">
            <strong>Error:</strong> {debugError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">

          {/* Vacation Leave */}
          {empStat !== 'COSW' && (
            <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
              </div>
              <div className="p-8 relative z-10">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-amber-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Vacation Leave</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">Rest & Recreation</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.vl_balance).toFixed(2)}</span>
                  <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500"></div>
            </div>
          )}

          {/* Forced Leave */}
          {empStat !== 'COSW' && (
            <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div className="p-8 relative z-10">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-rose-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Forced Leave</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">Mandatory Time Off</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.fl_balance).toFixed(2)}</span>
                  <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-rose-400 to-red-600"></div>
            </div>
          )}

          {/* Sick Leave */}
          {empStat !== 'COSW' && (
            <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div className="p-8 relative z-10">
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-teal-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Sick Leave</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">Medical & Recovery</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.sl_balance).toFixed(2)}</span>
                  <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 to-emerald-500"></div>
            </div>
          )}

          {/* Special Privilege Leave */}
          {empStat !== 'COSW' && (
            <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              </div>
              <div className="p-8 relative z-10">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Special Privilege Leave</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">Personal Milestones</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.spl_balance).toFixed(2)}</span>
                  <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-400 to-blue-600"></div>
            </div>
          )}

          {/* Wellness Leave */}
          <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg className="w-24 h-24 text-fuchsia-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="p-8 relative z-10">
              <div className="w-12 h-12 bg-fuchsia-50 text-fuchsia-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-fuchsia-100">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Wellness Leave</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">Mental & Physical Health</p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.wl_balance).toFixed(2)}</span>
                <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-gradient-to-r from-fuchsia-400 to-pink-600"></div>
          </div>

          {/* USE Leave */}
          {empStat !== 'COSW' && (
            <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div className="p-8 relative z-10">
                <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-sky-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">USE Leave</h3>
                <p className="text-sm text-slate-500 font-medium mb-6">Union of Statistical Employees</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-slate-800 tracking-tighter">{Number(userBalances.use_balance).toFixed(2)}</span>
                  <span className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Days</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-sky-400 to-cyan-500"></div>
            </div>
          )}

        </div>

        {/* Admin Management Table */}
        {isAdmin && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-4">Leave Balances Management</h2>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-semibold">Employee</th>
                    <th className="px-6 py-4 font-semibold">VL</th>
                    <th className="px-6 py-4 font-semibold">SL</th>
                    <th className="px-6 py-4 font-semibold">FL</th>
                    <th className="px-6 py-4 font-semibold">WL</th>
                    <th className="px-6 py-4 font-semibold">USE</th>
                    <th className="px-6 py-4 font-semibold">SPL</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allUsers.map((u, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{u.Name}</div>
                        <div className="text-sm text-slate-500">{u.Email}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{u.emp_stat === 'COSW' ? '-' : u.credits.vl_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-700">{u.emp_stat === 'COSW' ? '-' : u.credits.sl_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-700">{u.emp_stat === 'COSW' ? '-' : u.credits.fl_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-700">{u.credits.wl_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-700">{u.emp_stat === 'COSW' ? '-' : u.credits.use_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-700">{u.emp_stat === 'COSW' ? '-' : u.credits.spl_balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="text-sm text-indigo-600 font-medium hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          Edit Balances
                        </button>
                      </td>
                    </tr>
                  ))}
                  {allUsers.length === 0 && (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-slate-500">No employees found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* File Leave Modal */}
      {showFileLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">File a Leave</h3>
              <button onClick={() => setShowFileLeave(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); alert("Database schema not built yet!"); setShowFileLeave(false); }} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type</label>
                  <select
                    required
                    value={fileLeaveType}
                    onChange={(e) => {
                      setFileLeaveType(e.target.value);
                      setLeaveDetailType("");
                      setLeaveDetailSpecify("");
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  >
                    <option value="">Select a leave type</option>
                    {empStat !== 'COSW' && (
                      <>
                        <option value="Vacation Leave">Vacation Leave</option>
                        <option value="Sick Leave">Sick Leave</option>
                        <option value="Forced Leave">Forced Leave</option>
                        <option value="Special Privilege Leave">Special Privilege Leave</option>
                        <option value="USE Leave">USE Leave</option>
                      </>
                    )}
                    <option value="Wellness Leave">Wellness Leave</option>
                  </select>
                </div>

                {/* 6.B DETAILS OF LEAVE */}
                {(fileLeaveType === "Vacation Leave" || fileLeaveType === "Special Privilege Leave") && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-800 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 mb-3 italic">In case of Vacation/Special Privilege Leave:</p>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Within the Philippines" checked={leaveDetailType === 'Within the Philippines'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300" required />
                        <span className="text-sm font-medium text-slate-700">Within the Philippines</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Abroad (Specify)" checked={leaveDetailType === 'Abroad (Specify)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300" required />
                        <span className="text-sm font-medium text-slate-700">Abroad (Specify)</span>
                      </label>
                    </div>
                    {(leaveDetailType === 'Within the Philippines' || leaveDetailType === 'Abroad (Specify)') && (
                      <div className="mt-3">
                        <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify location..." className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm" />
                      </div>
                    )}
                  </div>
                )}

                {fileLeaveType === "Sick Leave" && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-800 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 mb-3 italic">In case of Sick Leave:</p>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="In Hospital (Specify Illness)" checked={leaveDetailType === 'In Hospital (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300" required />
                        <span className="text-sm font-medium text-slate-700">In Hospital (Specify Illness)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Out Patient (Specify Illness)" checked={leaveDetailType === 'Out Patient (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300" required />
                        <span className="text-sm font-medium text-slate-700">Out Patient (Specify Illness)</span>
                      </label>
                    </div>
                    {(leaveDetailType === 'In Hospital (Specify Illness)' || leaveDetailType === 'Out Patient (Specify Illness)') && (
                      <div className="mt-3">
                        <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify illness..." className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm" />
                      </div>
                    )}
                  </div>
                )}

                {fileLeaveType === "USE Leave" && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-800 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 mb-3 italic">In case of USE Leave:</p>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Where Day-off will be spent:</label>
                      <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify location..." className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows="3" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none" placeholder="Please state your reason for leave..."></textarea>
                </div>
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <button type="button" onClick={() => setShowPrintPreview(true)} className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm">
                  Preview Form 6
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowFileLeave(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    Submit Leave
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-[100] bg-gray-100 overflow-y-auto print:absolute print:inset-0 print:overflow-visible print:h-auto print:bg-white">
          <div className="sticky top-0 bg-white shadow-sm px-6 py-4 flex justify-between items-center print:hidden border-b z-10">
            <h2 className="text-xl font-bold">Print Preview: CSC Form No. 6</h2>
            <div className="flex gap-4">
              <button
                onClick={() => setShowPrintPreview(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Close Preview
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Print Form
              </button>
            </div>
          </div>
          <div className="py-8 print:py-0">
            <CscForm6Printable
              formData={{
                officeDepartment: 'PSA-RSSO CAR, Kalinga',
                nameParts: {
                  firstName: userNameParts.firstName || user?.firstName || '',
                  lastName: userNameParts.lastName || user?.lastName || '',
                  middleName: userNameParts.middleName || ''
                },
                dateFiled: new Date().toLocaleDateString(),
                position: userPosition,
                salary: userSalary,
                fileLeaveType,
                leaveDetailType,
                leaveDetailSpecify,
                startDate,
                endDate,
                reason,
                requestedDays: (startDate && endDate) ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1) : '',
              }}
              userBalances={userBalances}
            />
          </div>
        </div>
      )}

      {/* Edit Balances Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Edit Leave Balances</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="p-6">
                <div className="mb-6 pb-6 border-b border-slate-100">
                  <p className="font-medium text-slate-800">{editingUser.Name}</p>
                  <p className="text-sm text-slate-500">{editingUser.Email}</p>
                  <div className="mt-2 bg-blue-50 text-blue-800 text-xs px-3 py-2 rounded-lg flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>Saving overrides will reset their accrual cycle to start fresh from today.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vacation Leave (VL)</label>
                    <input type="number" step="0.01" name="vl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.vl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sick Leave (SL)</label>
                    <input type="number" step="0.01" name="sl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.sl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Forced Leave (FL)</label>
                    <input type="number" step="0.01" name="fl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.fl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Wellness Leave (WL)</label>
                    <input type="number" step="0.01" name="wl" defaultValue={editingUser.credits.wl_balance} required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">USE Leave</label>
                    <input type="number" step="0.01" name="use" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.use_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Special Privilege (SPL)</label>
                    <input type="number" step="0.01" name="spl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.spl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
