import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { turso } from './db';

export default function DailyTimeRecord() {
    const { setIsSidebarOpen } = useOutletContext();
const { user } = useUser();
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editRemarks, setEditRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter State
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedEmployee, setSelectedEmployee] = useState('All');

  useEffect(() => {
    const fetchRecords = async () => {
      if (!turso) {
        setError("Database connection not initialized.");
        setLoading(false);
        return;
      }

      if (!user?.firstName || !user?.lastName) {
        setError("Your user profile is missing a first or last name. Cannot extract records.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch User Role
        let role = null;
        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) {
          const roleRes = await turso.execute({
            sql: "SELECT Role, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE Email = ?",
            args: [email]
          });
          if (roleRes.rows.length > 0) {
            const u = roleRes.rows[0];
            role = u.Role;
            setUserRole(role);
            if (u.First_Name && u.Last_Name) {
              const currentUserDisplayName = `${u.First_Name} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name}`.trim();
              setSelectedEmployee(currentUserDisplayName);
            }
          }
        }

        const isAdmin = role === 'Admin' || role === 'Super Admin';

        // 2. Fetch Records based on Role
        const firstInitial = user.firstName.charAt(0);
        const lastName = user.lastName;
        const searchPattern = `${firstInitial}.%${lastName}`;

        let querySql = `
          SELECT 
            a.id, 
            a.employee_id, 
            a.full_name,
            a.date, 
            a.time_in_am, 
            a.time_out_am, 
            a.time_in_pm, 
            a.time_out_pm, 
            a.remarks,
            p.error_message,
            u.First_Name,
            u.Last_Name,
            u.Middle_Name
          FROM attendance a
          LEFT JOIN punch_errors p 
            ON a.employee_id = p.employee_id AND a.date = p.scan_date
          LEFT JOIN User_Permissions u
            ON REPLACE(a.full_name, ' ', '') = SUBSTR(u.First_Name, 1, 1) || '.' || REPLACE(u.Last_Name, ' ', '')
        `;
        let queryArgs = [];

        if (!isAdmin) {
          querySql += ` WHERE a.employee_id LIKE ? OR a.full_name LIKE ? `;
          queryArgs.push(searchPattern, searchPattern);
        }

        querySql += ` ORDER BY a.date DESC LIMIT 2000 `;

        const attendanceRes = await turso.execute({
          sql: querySql,
          args: queryArgs
        });

        // Map rows to include a calculated display_name
        const mappedRows = attendanceRes.rows.map(row => {
          let displayName = row.full_name || row.employee_id;
          if (row.First_Name && row.Last_Name) {
            displayName = `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name}`.trim();
          }
          return { ...row, display_name: displayName };
        });

        setAttendance(mappedRows);

      } catch (err) {
        console.error("Error fetching DTR records:", err);
        setError("Failed to load records from database. The tables may not exist yet.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [user]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const dateStr = String(dateString);
      if (dateStr.length === 8 && !dateStr.includes('-')) {
        const yyyy = dateStr.substring(0, 4);
        const mm = dateStr.substring(4, 6);
        const dd = dateStr.substring(6, 8);
        return `${yyyy}-${mm}-${dd}`;
      }
      return dateStr;
    } catch {
      return dateString;
    }
  };

  const handleRowClick = (record) => {
    setSelectedRecord(record);
    setEditRemarks(record.remarks || '');
  };

  const handleSaveRemarks = async () => {
    if (!selectedRecord) return;
    setIsSaving(true);
    try {
      await turso.execute({
        sql: "UPDATE attendance SET remarks = ?, updated_at = strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch') WHERE id = ?",
        args: [editRemarks, selectedRecord.id]
      });

      // Update local state to reflect changes instantly
      setAttendance(prev => prev.map(row =>
        row.id === selectedRecord.id ? { ...row, remarks: editRemarks } : row
      ));

      setSelectedRecord(null);
    } catch (err) {
      console.error("Error updating remarks:", err);
      alert("Failed to save remarks. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filter attendance by selected month and employee
  const filteredAttendance = attendance.filter(row => {
    const dateStr = String(row.date || '');
    let month = -1;
    if (dateStr.length === 8 && !dateStr.includes('-')) {
      month = parseInt(dateStr.substring(4, 6), 10);
    } else if (dateStr.includes('-')) {
      month = parseInt(dateStr.split('-')[1], 10);
    }
    const matchesMonth = month === selectedMonth;
    const matchesEmployee = selectedEmployee === 'All' || row.display_name === selectedEmployee;

    return matchesMonth && matchesEmployee;
  });

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';
  const uniqueEmployees = [...new Set(attendance.map(row => row.display_name).filter(Boolean))].sort();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          Daily Time Record
        </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <UserButton 
            afterSignOutUrl="/" 
            userProfileMode="navigation" 
            userProfileUrl="/profile"
            appearance={{
              elements: {
                userButtonPopoverActionButton__signOut: { display: "none" },
                userButtonPopoverActionButtonIcon__signOut: { display: "none" },
                userButtonPopoverFooter: { display: "none" }
              }
            }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="w-full h-full flex flex-col gap-8">

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              <span className="font-semibold">Database Error:</span> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">
              Loading records...
            </div>
          ) : (
            <>
              {/* Attendance Table */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 gap-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-semibold text-slate-700">Filter by Month:</label>
                      <div className="relative">
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="appearance-none bg-white border border-slate-300 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-medium transition-colors cursor-pointer"
                        >
                          {months.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-slate-700">Employee:</label>
                        <div className="relative">
                          <select
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="appearance-none bg-white border border-slate-300 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-medium transition-colors cursor-pointer"
                          >
                            <option value="All">All Employees</option>
                            {uniqueEmployees.map(emp => (
                              <option key={emp} value={emp}>{emp}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-500 font-medium border-b border-slate-200 whitespace-nowrap sticky top-0 shadow-sm z-10">
                      <tr>
                        <th className="px-6 py-4">Date</th>
                        {isAdmin && <th className="px-6 py-4">Name</th>}
                        <th className="px-6 py-4 text-center">Time In (AM)</th>
                        <th className="px-6 py-4 text-center">Time Out (AM)</th>
                        <th className="px-6 py-4 text-center">Time In (PM)</th>
                        <th className="px-6 py-4 text-center">Time Out (PM)</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-400">No attendance records found for this month.</td>
                        </tr>
                      ) : (
                        filteredAttendance.map((row, idx) => (
                          <tr
                            key={row.id || idx}
                            onClick={() => handleRowClick(row)}
                            className="hover:bg-teal-50/40 hover:cursor-pointer transition-colors group"
                          >
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">{formatDate(row.date)}</td>
                            {isAdmin && (
                              <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-800">
                                {row.display_name}
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-center">{row.time_in_am || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-center">{row.time_out_am || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-center">{row.time_in_pm || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-center">{row.time_out_pm || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {row.error_message ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                                  </svg>
                                  Punch Error
                                </span>
                              ) : row.time_in_am && row.time_out_am && row.time_in_pm && row.time_out_pm ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                                  </svg>
                                  Complete
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                                  </svg>
                                  Incomplete
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-500 max-w-xs truncate group-hover:text-teal-700 transition-colors">
                              {row.remarks || <span className="text-slate-300 italic">Click to add remarks</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Record Details / Remarks Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Record Details
                {isAdmin && <span className="text-sm font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-2">{selectedRecord.display_name}</span>}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-500">{formatDate(selectedRecord.date)}</span>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Punch Error Alert */}
              {selectedRecord.error_message && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-600 mt-0.5 shrink-0">
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-bold text-red-800 text-sm mb-1">Punch Error Detected</h4>
                      <p className="text-red-600 text-sm leading-relaxed">
                        {selectedRecord.error_message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Remarks Form */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Remarks</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Add your remarks or explanation here..."
                  className="w-full min-h-[120px] p-3 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow resize-none bg-slate-50"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedRecord(null)}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRemarks}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Remarks'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
