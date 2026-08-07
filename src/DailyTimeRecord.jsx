import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { UserButton, useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import ThemeToggleIcon from './ThemeToggleIcon';
import NotificationBell from './NotificationBell';
export default function DailyTimeRecord() {
    const { setIsSidebarOpen } = useOutletContext();
const { user } = useUser();
  const { getToken } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editRemarks, setEditRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter State
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedEmployee, setSelectedEmployee] = useState('All');

  useEffect(() => {
    const fetchRecords = async () => {
      if (!user?.firstName || !user?.lastName || !user?.primaryEmailAddress?.emailAddress) {
        setError("Your user profile is missing essential details (name/email). Cannot extract records.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const token = await getToken();
        const res = await fetch(`/api/dtr?email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}&firstName=${encodeURIComponent(user.firstName)}&lastName=${encodeURIComponent(user.lastName)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Failed to fetch DTR data");
        const data = await res.json();
        
        if (data.role) setUserRole(data.role);
        if (data.currentUserDisplayName) setSelectedEmployee(data.currentUserDisplayName);
        
        setAttendance(data.attendance || []);
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
      const token = await getToken();
      const res = await fetch('/api/dtr', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: selectedRecord.id, remarks: editRemarks })
      });
      
      if (!res.ok) throw new Error("Failed to save remarks");
      
      // Update local state to reflect changes instantly
      setAttendance(prev => prev.map(row =>
        row.id === selectedRecord.id ? { ...row, remarks: editRemarks } : row
      ));

      setSelectedRecord(null);
      setAlertConfig({ message: 'Remarks saved successfully!', type: 'success' });
    } catch (err) {
      console.error("Error updating remarks:", err);
      setAlertConfig({ message: "Failed to save remarks. Please try again.", type: 'error' });
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
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          Daily Time Record
        </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <ThemeToggleIcon />
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
          <NotificationBell />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="w-full h-full flex flex-col gap-8">

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
              <span className="font-semibold">Database Error:</span> {error}
            </div>
          )}

          {loading ? (
            <Loading type="table" />
          ) : (
            <>
              {/* Attendance Table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex-1 flex flex-col">
                <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 dark:bg-slate-900/50 gap-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filter by Month:</label>
                      <div className="relative">
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="appearance-none bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-medium transition-colors cursor-pointer"
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
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Employee:</label>
                        <div className="relative">
                          <select
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="appearance-none bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-medium transition-colors cursor-pointer"
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
                    <thead className="bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 shadow-sm z-10">
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
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {filteredAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No attendance records found for this month.</td>
                        </tr>
                      ) : (
                        filteredAttendance.map((row, idx) => (
                          <tr
                            key={`${row.id || 'no-id'}-${idx}`}
                            onClick={() => handleRowClick(row)}
                            className="hover:bg-teal-50/40 dark:hover:bg-teal-900/20 hover:cursor-pointer transition-colors group"
                          >
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">{formatDate(row.date)}</td>
                            {isAdmin && (
                              <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">
                                {row.display_name}
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-400 text-center">{row.time_in_am || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-400 text-center">{row.time_out_am || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-400 text-center">{row.time_in_pm || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-400 text-center">{row.time_out_pm || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {row.error_message ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                                  </svg>
                                  Punch Error
                                </span>
                              ) : row.time_in_am && row.time_out_am && row.time_in_pm && row.time_out_pm ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                                  </svg>
                                  Complete
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                                  </svg>
                                  Incomplete
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-xs truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                              {row.remarks || <span className="text-slate-300 dark:text-slate-600 italic">Click to add remarks</span>}
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border dark:border-slate-800 w-full max-w-lg overflow-hidden transform transition-all">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Record Details
                {isAdmin && <span className="text-sm font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full ml-2">{selectedRecord.display_name}</span>}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{formatDate(selectedRecord.date)}</span>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
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
                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30">
                  <div className="flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-500 mt-0.5 shrink-0">
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-bold text-red-800 dark:text-red-400 text-sm mb-1">Punch Error Detected</h4>
                      <p className="text-red-600 dark:text-red-300 text-sm leading-relaxed">
                        {selectedRecord.error_message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Remarks Form */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Remarks</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Add your remarks or explanation here..."
                  className="w-full min-h-[120px] p-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow resize-none bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
              <button
                onClick={() => setSelectedRecord(null)}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
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

      {/* Alert Notification */}
      {alertConfig && (
        <Alert
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertConfig(null)}
        />
      )}
    </div>
  );
}
