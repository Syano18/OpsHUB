import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

const CustomSelect = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0] || { label: 'Select' };

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 py-2 px-4 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none text-sm font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors gap-3 select-none min-w-[160px] shadow-sm"
      >
        <span className="truncate">{selectedOption.label}</span>
        <svg className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map(opt => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                opt.value === value 
                  ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-white font-bold' 
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <svg className="w-4 h-4 shrink-0 text-slate-800 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [selectedEmployee, setSelectedEmployee] = useState('');

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
        setError("Failed to load records from database.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [user]);

  const formatDateString = (dateString) => {
    if (!dateString) return '';
    try {
      const dateStr = String(dateString);
      if (dateStr.length === 8 && !dateStr.includes('-')) {
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      return dateStr;
    } catch {
      return dateString;
    }
  };

  const handleRowClick = (record, dayDateStr) => {
    // If it's an empty record or rest day, allow clicking to add a remark anyway by creating a mock record object for saving
    const r = record || { id: `mock-${dayDateStr}`, date: dayDateStr, display_name: user?.firstName + ' ' + user?.lastName };
    setSelectedRecord(r);
    setEditRemarks(r.remarks || '');
  };

  const handleSaveRemarks = async () => {
    if (!selectedRecord) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      
      // If it's a mock record, we might need an endpoint that handles creating an empty row just for the remark, 
      // assuming /api/dtr PUT handles it or we only update existing ones for now.
      if (String(selectedRecord.id).startsWith('mock-')) {
         setAlertConfig({ message: "Cannot add remarks to empty records without a punch.", type: 'warning' });
         setIsSaving(false);
         setSelectedRecord(null);
         return;
      }

      const res = await fetch('/api/dtr', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: selectedRecord.id, remarks: editRemarks })
      });
      
      if (!res.ok) throw new Error("Failed to save remarks");
      
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

  // Process data for the selected month
  const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';
  const uniqueEmployees = [...new Set(attendance.map(row => row.display_name).filter(Boolean))].sort();
  const filteredAttendance = attendance.filter(row => row.display_name === selectedEmployee);

  const activeYear = filteredAttendance.length > 0 ? parseInt(formatDateString(filteredAttendance[0].date).substring(0, 4)) : new Date().getFullYear();
  const daysInMonth = new Date(activeYear, selectedMonth, 0).getDate();

  const calculateDuration = (inTime, outTime) => {
    if (!inTime || !outTime) return 0;
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    let duration = (outH * 60 + outM) - (inH * 60 + inM);
    if (duration < 0) duration += 24 * 60;
    return duration;
  };

  const formatDuration = (minutes) => {
    if (!minutes || minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m < 10 ? '0' + m : m}m`;
  };

  const days = [];
  let totalMinutes = 0;
  let daysPresentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let punchErrorCount = 0;

  for (let i = 1; i <= daysInMonth; i++) {
    const mmStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
    const ddStr = i < 10 ? `0${i}` : `${i}`;
    const dateStr = `${activeYear}-${mmStr}-${ddStr}`;
    const dateStrAlt = `${activeYear}${mmStr}${ddStr}`;
    
    const dateObj = new Date(activeYear, selectedMonth - 1, i);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const isFuture = dateObj > new Date();

    const record = filteredAttendance.find(r => {
      const d = String(r.date);
      return d === dateStr || d === dateStrAlt;
    });

    let status = '';
      let statusColor = '';
      let rowColorClass = '';
      let rowBorderClass = '';
      let renderedMinutes = 0;
      let isLate = false;

      if (record) {
        renderedMinutes = calculateDuration(record.time_in_am, record.time_out_am) + calculateDuration(record.time_in_pm, record.time_out_pm);
        totalMinutes += renderedMinutes;
        if (renderedMinutes > 0) daysPresentCount++;

        if (record.time_in_am) {
          if (record.time_in_am > "08:30") {
            isLate = true;
          } else if (record.time_in_am > "08:00" && renderedMinutes < 480) {
            isLate = true;
          }
        }

        if (isLate) {
          lateCount++;
        }

        if (record.error_message) {
          status = 'Missing punch';
          statusColor = 'text-pink-700 dark:text-pink-400';
          rowColorClass = 'bg-pink-50/50 dark:bg-pink-900/10';
          rowBorderClass = 'border-l-4 border-pink-400 dark:border-pink-600';
          punchErrorCount++;
        } else if (!record.time_in_am && !record.time_out_am && !record.time_in_pm && !record.time_out_pm) {
           if (isWeekend) {
              status = 'Rest day';
              statusColor = 'text-slate-400 dark:text-slate-500';
              rowColorClass = 'bg-slate-50 dark:bg-slate-900/50';
           } else {
              status = 'No Record';
              statusColor = 'text-red-600 dark:text-red-400';
              absentCount++;
           }
        } else {
          if (isLate) {
            status = 'Late';
            statusColor = 'text-amber-600 dark:text-amber-500';
            rowBorderClass = 'border-l-4 border-amber-400 dark:border-amber-500';
          } else {
            status = 'On time';
            statusColor = 'text-teal-600 dark:text-teal-400';
            rowBorderClass = 'border-l-4 border-teal-500 dark:border-teal-500';
          }
        }
      } else {
        if (isWeekend) {
          status = 'Rest day';
          statusColor = 'text-slate-400 dark:text-slate-500';
          rowColorClass = 'bg-slate-50 dark:bg-slate-900/50';
        } else if (!isFuture) {
          status = 'No Record';
          statusColor = 'text-red-600 dark:text-red-400';
          absentCount++;
        } else {
          status = '';
        }
      }

    days.push({
      dateObj,
      dayNumber: i,
      dayName: dateObj.toLocaleString('en-US', { weekday: 'short' }),
      monthName: dateObj.toLocaleString('en-US', { month: 'short' }),
      dateString: dateStr,
      isWeekend,
      record,
      renderedMinutes,
      status,
      statusColor,
      rowColorClass,
      rowBorderClass
    });
  }

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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* App Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Daily Time Record
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Monitor attendance, biometric logs, and monthly timesheets
              </p>
            </div>
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
      <div className="flex-1 overflow-y-auto p-2 pb-12 w-full">
        <div className="w-full flex flex-col gap-4">

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <div><span className="font-bold">Error:</span> {error}</div>
            </div>
          )}

          {loading ? (
             <Loading type="table" />
          ) : (
            <>
              {/* Profile & Filter Row */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-serif font-black text-slate-900 dark:text-white tracking-tight">
                    {selectedEmployee || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
                  </h1>
                </div>
                
                <div className="flex flex-shrink-0 gap-3">
                  {isAdmin && (
                    <CustomSelect
                      value={selectedEmployee}
                      onChange={(val) => setSelectedEmployee(val)}
                      options={uniqueEmployees.map(emp => ({ value: emp, label: emp }))}
                    />
                  )}
                  <CustomSelect
                    value={selectedMonth}
                    onChange={(val) => setSelectedMonth(Number(val))}
                    options={months}
                  />
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Total hours</span>
                  <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{formatDuration(totalMinutes)}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Days present</span>
                  <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{daysPresentCount}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Late</span>
                  <span className="text-xl md:text-2xl font-black text-amber-600 dark:text-amber-500">{lateCount}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">No Record</span>
                  <span className="text-xl md:text-2xl font-black text-red-600 dark:text-red-500">{absentCount}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center col-span-2 md:col-span-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Punch errors</span>
                  <span className="text-xl md:text-2xl font-black text-pink-700 dark:text-pink-500">{punchErrorCount}</span>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hidden md:block">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-700">
                        <th className="px-5 py-3.5 font-black w-28">Date</th>
                        <th className="px-4 py-3.5 font-black">In AM</th>
                        <th className="px-4 py-3.5 font-black">Out AM</th>
                        <th className="px-4 py-3.5 font-black">In PM</th>
                        <th className="px-4 py-3.5 font-black">Out PM</th>
                        <th className="px-4 py-3.5 font-black">Rendered</th>
                        <th className="px-4 py-3.5 font-black">Status</th>
                        <th className="px-4 py-3.5 font-black">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="text-base font-medium">
                      {days.map((dayObj, i) => {
                        const { record, status, statusColor, rowColorClass, rowBorderClass, renderedMinutes } = dayObj;
                        
                        const valOrMissingClass = (val) => val ? 'text-slate-900 dark:text-slate-100 font-black' : 'text-slate-400 dark:text-slate-500 font-bold';
                        const displayTime = (val) => val || '—';
                        
                        let inAmCls = valOrMissingClass(record?.time_in_am);
                        let outAmCls = valOrMissingClass(record?.time_out_am);
                        let inPmCls = valOrMissingClass(record?.time_in_pm);
                        let outPmCls = valOrMissingClass(record?.time_out_pm);

                        // If missing punch in a pink row, color the emdash pink-ish
                        if (status === 'Missing punch') {
                           if (!record?.time_in_am) inAmCls = 'text-pink-500/70 font-bold';
                           if (!record?.time_out_am) outAmCls = 'text-pink-500/70 font-bold';
                           if (!record?.time_in_pm) inPmCls = 'text-pink-500/70 font-bold';
                           if (!record?.time_out_pm) outPmCls = 'text-pink-500/70 font-bold';
                        }

                        return (
                          <tr 
                            key={`tr-${dayObj.dayNumber}`}
                            className={`border-b border-slate-100 dark:border-slate-800 last:border-none transition-colors group cursor-pointer ${rowColorClass} hover:bg-slate-50 dark:hover:bg-slate-800/60`}
                            onClick={() => handleRowClick(record, dayObj.dateString)}
                          >
                            <td className={`px-5 py-4 relative ${rowBorderClass || 'border-l-4 border-transparent'}`}>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{dayObj.monthName}</span>
                                <span className="text-slate-500 dark:text-slate-400">{dayObj.dayNumber} {dayObj.dayName}</span>
                              </div>
                            </td>
                            <td className={`px-4 py-4 ${inAmCls}`}>{displayTime(record?.time_in_am)}</td>
                            <td className={`px-4 py-4 ${outAmCls}`}>{displayTime(record?.time_out_am)}</td>
                            <td className={`px-4 py-4 ${inPmCls}`}>{displayTime(record?.time_in_pm)}</td>
                            <td className={`px-4 py-4 ${outPmCls}`}>{displayTime(record?.time_out_pm)}</td>
                            <td className="px-4 py-4 font-black text-slate-800 dark:text-slate-200">
                              {renderedMinutes > 0 ? formatDuration(renderedMinutes) : '—'}
                            </td>
                            <td className="px-4 py-4">
                              {status && (
                                <div className="flex items-center gap-1.5">
                                  {status !== 'Rest day' && status !== 'No Record' && (
                                    <span className={`w-1.5 h-1.5 rounded-full ${status === 'On time' ? 'bg-teal-500' : status === 'Late' ? 'bg-amber-500' : status === 'Missing punch' ? 'bg-pink-600' : 'bg-slate-300'}`}></span>
                                  )}
                                  <span className={statusColor}>{status}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-slate-500 dark:text-slate-400 max-w-[200px] truncate text-sm">
                              {record?.remarks ? (
                                <span>{record.remarks}</span>
                              ) : status === 'Missing punch' ? (
                                <span className="text-pink-600/70 dark:text-pink-400/70 hover:text-pink-800 transition-colors">Explain missing punch...</span>
                              ) : status === 'Rest day' ? (
                                <span className="hover:text-slate-700 transition-colors">Add a remark...</span>
                              ) : (
                                <span className="hover:text-slate-700 transition-colors">Add a remark...</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile View */}
              <div className="md:hidden flex flex-col gap-3">
                {days.map((dayObj, i) => {
                  const { record, status, statusColor, rowColorClass, rowBorderClass, renderedMinutes } = dayObj;
                  
                  const valOrMissingClass = (val) => val ? 'text-slate-900 dark:text-slate-100 font-black' : 'text-slate-400 dark:text-slate-500 font-bold';
                  const displayTime = (val) => val || '—';
                  
                  let inAmCls = valOrMissingClass(record?.time_in_am);
                  let outAmCls = valOrMissingClass(record?.time_out_am);
                  let inPmCls = valOrMissingClass(record?.time_in_pm);
                  let outPmCls = valOrMissingClass(record?.time_out_pm);

                  if (status === 'Missing punch') {
                     if (!record?.time_in_am) inAmCls = 'text-pink-500/70 font-bold';
                     if (!record?.time_out_am) outAmCls = 'text-pink-500/70 font-bold';
                     if (!record?.time_in_pm) inPmCls = 'text-pink-500/70 font-bold';
                     if (!record?.time_out_pm) outPmCls = 'text-pink-500/70 font-bold';
                  }

                  return (
                    <div 
                      key={`mob-${dayObj.dayNumber}`}
                      className={`relative p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors cursor-pointer bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60`}
                      onClick={() => handleRowClick(record, dayObj.dateString)}
                    >
                      <div className={`absolute top-0 left-0 bottom-0 w-1.5 rounded-l-2xl ${rowBorderClass ? rowBorderClass.replace('border-l-4 border-', 'bg-') : 'bg-transparent'}`}></div>
                      
                      <div className="flex justify-between items-start mb-4 pl-3">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 dark:text-white text-lg leading-tight">{dayObj.monthName} {dayObj.dayNumber}</span>
                          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{dayObj.dayName}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          {status && (
                             <div className="flex items-center gap-1.5">
                               {status !== 'Rest day' && status !== 'No Record' && (
                                 <span className={`w-1.5 h-1.5 rounded-full ${status === 'On time' ? 'bg-teal-500' : status === 'Late' ? 'bg-amber-500' : status === 'Missing punch' ? 'bg-pink-600' : 'bg-slate-300'}`}></span>
                               )}
                               <span className={`text-sm font-bold ${statusColor}`}>{status}</span>
                             </div>
                           )}
                           <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                             Rendered: <span className="font-bold text-slate-800 dark:text-slate-200">{renderedMinutes > 0 ? formatDuration(renderedMinutes) : '—'}</span>
                           </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 pl-3 mb-3 text-center bg-slate-50/50 dark:bg-slate-800/20 p-2 rounded-xl">
                        <div className="flex flex-col">
                           <span className="text-[9px] uppercase font-black text-slate-400 mb-1">In AM</span>
                           <span className={`text-sm ${inAmCls}`}>{displayTime(record?.time_in_am)}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[9px] uppercase font-black text-slate-400 mb-1">Out AM</span>
                           <span className={`text-sm ${outAmCls}`}>{displayTime(record?.time_out_am)}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[9px] uppercase font-black text-slate-400 mb-1">In PM</span>
                           <span className={`text-sm ${inPmCls}`}>{displayTime(record?.time_in_pm)}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[9px] uppercase font-black text-slate-400 mb-1">Out PM</span>
                           <span className={`text-sm ${outPmCls}`}>{displayTime(record?.time_out_pm)}</span>
                        </div>
                      </div>

                      <div className="pl-3 mt-2">
                         <div className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                            {record?.remarks ? (
                              <span>{record.remarks}</span>
                            ) : status === 'Missing punch' ? (
                              <span className="text-pink-600/70 dark:text-pink-400/70 italic">Explain missing punch...</span>
                            ) : (
                              <span className="italic opacity-60">Add a remark...</span>
                            )}
                         </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Record Details / Remarks Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800"
          >
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex flex-col">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                  Record Details
                </h3>
                <span className="text-sm font-medium text-teal-600 dark:text-teal-400 mt-1">{formatDateString(selectedRecord.date)}</span>
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

            <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-3xl">
              <button
                onClick={() => setSelectedRecord(null)}
                disabled={isSaving}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50 shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRemarks}
                disabled={isSaving}
                className="group flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
