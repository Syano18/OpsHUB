import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

const TimeBlock = ({ label, time }) => (
  <div className="flex flex-col bg-slate-50/50 dark:bg-slate-900/30 md:bg-transparent md:dark:bg-transparent p-3 md:p-0 rounded-xl md:rounded-none border border-slate-100 dark:border-slate-800/50 md:border-none items-center md:items-start justify-center transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/50 md:hover:bg-transparent">
    <span className="text-[10px] md:text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1 md:mb-1.5">{label}</span>
    <span className={`font-semibold ${time ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'} text-sm md:text-base`}>{time || '--:--'}</span>
  </div>
);

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

  const getBadgeColor = (name) => {
    if (!name) return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    const colors = [
      "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
      "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
      "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20",
      "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
      "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
      "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20",
      "bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20",
      "bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-500/20",
      "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20",
      "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/20",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const renderStatus = (row) => {
    if (row.error_message) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
          Punch Error
        </span>
      );
    } else if (row.time_in_am && row.time_out_am && row.time_in_pm && row.time_out_pm) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>
          Complete
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>
          Incomplete
        </span>
      );
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-400 dark:to-emerald-400 flex items-center gap-2">
              Daily Time Record
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {user?.firstName ? `Hello, ${user.firstName} 👋` : 'Welcome back!'}
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
          <NotificationBell />
          <CustomUserButton />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 w-full">
        <div className="w-full h-full flex flex-col gap-6">

          {error && (
            <div className="p-4 bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-2xl text-sm shadow-sm flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <div><span className="font-bold">Error:</span> {error}</div>
            </div>
          )}

          {loading ? (
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-800/60 p-8 pt-16 flex-1 flex items-start justify-center">
              <Loading type="table" />
            </div>
          ) : (
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-800/60 overflow-hidden flex-1 flex flex-col">
              {/* Filter Section */}
              <div className="px-6 py-5 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white/50 dark:bg-slate-900/50 gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/50 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <div className="relative">
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="appearance-none bg-transparent text-slate-700 dark:text-slate-200 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-0 text-sm font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {months.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/50 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                      <div className="relative">
                        <select
                          value={selectedEmployee}
                          onChange={(e) => setSelectedEmployee(e.target.value)}
                          className="appearance-none bg-transparent text-slate-700 dark:text-slate-200 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-0 text-sm font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <option value="All">All Employees</option>
                          {uniqueEmployees.map(emp => (
                            <option key={emp} value={emp}>{emp}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Summary / Stats (Optional) */}
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                  {filteredAttendance.length} {filteredAttendance.length === 1 ? 'Record' : 'Records'} Found
                </div>
              </div>

              {/* Records List */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30 dark:bg-slate-900/30">
                {filteredAttendance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-70">
                    <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-lg font-bold text-slate-500 dark:text-slate-400">No records found</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Try changing your filter settings.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Desktop Header Row (Hidden on mobile) */}
                    <div className="hidden md:flex px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-[-8px]">
                      <div className="w-[30%]">Date & Employee</div>
                      <div className="w-[50%] flex justify-between px-4">
                        <span className="w-1/4 text-center">AM In</span>
                        <span className="w-1/4 text-center">AM Out</span>
                        <span className="w-1/4 text-center">PM In</span>
                        <span className="w-1/4 text-center">PM Out</span>
                      </div>
                      <div className="w-[20%] text-right">Status</div>
                    </div>

                    {filteredAttendance.map((row, idx) => (
                      <div 
                        key={`card-${row.id || 'no-id'}-${idx}`}
                        onClick={() => handleRowClick(row)}
                        className="group flex flex-col md:flex-row md:items-center gap-4 md:gap-0 bg-white dark:bg-slate-800/80 rounded-2xl p-5 md:px-6 md:py-4 shadow-sm border border-slate-200/60 dark:border-slate-700/50 hover:shadow-md hover:border-teal-300 dark:hover:border-teal-600/60 transition-all cursor-pointer relative overflow-hidden [content-visibility:auto]"
                      >
                        {/* Interactive hover gradient */}
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/0 via-teal-500/0 to-teal-500/5 dark:from-teal-400/0 dark:via-teal-400/0 dark:to-teal-400/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                        {/* Date & Name */}
                        <div className="flex justify-between items-start md:items-center md:w-[30%] relative z-10">
                          <div className="flex flex-col">
                            <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-lg group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{formatDate(row.date)}</span>
                            {isAdmin && <span className={`mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md border w-fit ${getBadgeColor(row.display_name)}`}>{row.display_name}</span>}
                          </div>
                          {/* Status Mobile Only */}
                          <div className="md:hidden">
                            {renderStatus(row)}
                          </div>
                        </div>

                        {/* Time Blocks */}
                        <div className="grid grid-cols-2 md:flex md:w-[50%] gap-3 md:gap-0 md:px-4 relative z-10">
                          <div className="md:w-1/4 md:flex md:justify-center"><TimeBlock label="AM In" time={row.time_in_am} /></div>
                          <div className="md:w-1/4 md:flex md:justify-center"><TimeBlock label="AM Out" time={row.time_out_am} /></div>
                          <div className="md:w-1/4 md:flex md:justify-center"><TimeBlock label="PM In" time={row.time_in_pm} /></div>
                          <div className="md:w-1/4 md:flex md:justify-center"><TimeBlock label="PM Out" time={row.time_out_pm} /></div>
                        </div>

                        {/* Status & Remarks Desktop */}
                        <div className="hidden md:flex flex-col items-end md:w-[20%] gap-2 relative z-10">
                          {renderStatus(row)}
                          {(row.remarks) ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-800 max-w-full">
                              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                              <span className="truncate" title={row.remarks}>{row.remarks}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-teal-600/0 dark:text-teal-400/0 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              + Add remarks
                            </span>
                          )}
                        </div>

                        {/* Remarks Mobile Only */}
                        <div className="md:hidden mt-1 pt-4 border-t border-slate-100 dark:border-slate-700/50 relative z-10">
                          {(row.remarks) ? (
                            <div className="text-sm bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
                              <span className="font-bold text-slate-600 dark:text-slate-400 block mb-1 text-[11px] uppercase tracking-wider">Remarks</span>
                              <span className="text-slate-700 dark:text-slate-300 leading-relaxed">{row.remarks}</span>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400 dark:text-slate-500 italic flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              Tap to add remarks
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Record Details / Remarks Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div 
            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 w-full max-w-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="px-6 py-5 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
              <div className="flex flex-col">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                  Record Details
                  {isAdmin && <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-500/20">{selectedRecord.display_name}</span>}
                </h3>
                <span className="text-sm font-medium text-teal-600 dark:text-teal-400 mt-1">{formatDate(selectedRecord.date)}</span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-xl transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 md:p-8">
              {/* Punch Error Alert */}
              {selectedRecord.error_message && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-xl shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-600 dark:text-red-400">
                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="pt-0.5">
                      <h4 className="font-bold text-red-800 dark:text-red-400 text-sm mb-1">Punch Error Detected</h4>
                      <p className="text-red-600 dark:text-red-300/80 text-sm leading-relaxed">
                        {selectedRecord.error_message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Remarks Form */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Remarks / Note</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Add your explanation, reason for missing logs, or any other notes here..."
                  className="w-full min-h-[140px] p-4 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all resize-none bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="px-6 py-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-3xl">
              <button
                onClick={() => setSelectedRecord(null)}
                disabled={isSaving}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRemarks}
                disabled={isSaving}
                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
