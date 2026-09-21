import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import { CSC_FORM_48_TEMPLATE_BASE64 } from './csc_form_48_template_base64';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

const CustomSelect = ({ value, onChange, options, placeholder = 'Select', icon }) => {
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

  const selectedOption = options.find(o => o.value === value) || { label: placeholder, value: '' };

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 focus:outline-none text-xs sm:text-sm font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/90 transition-all gap-2.5 select-none shadow-sm hover:border-teal-500/50"
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          <span className="truncate">{selectedOption.label}</span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-50 mt-1.5 right-0 w-full min-w-[200px] max-h-64 overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700/80 py-1.5 custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
          {options.map(opt => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`px-3.5 py-2.5 text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-between ${
                opt.value === value 
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold' 
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && (
                <svg className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
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
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, PRESENT, LATE, MISSING, REST, ABSENT

  const QUICK_REMARKS = [
    "Official Business (OB)",
    "Travel Order / Field Work",
    "Forgot PM Swipe Out",
    "Forgot AM Swipe In",
    "Biometrics Offline",
    "Special Privilege Leave",
    "Approved Vacation Leave",
    "Approved Sick Leave",
    "Official Holiday"
  ];

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
    const r = record || { id: `mock-${dayDateStr}`, date: dayDateStr, display_name: selectedEmployee || `${user?.firstName} ${user?.lastName}` };
    setSelectedRecord(r);
    setEditRemarks(r.remarks || '');
  };

  const handleSaveRemarks = async () => {
    if (!selectedRecord) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      
      if (String(selectedRecord.id).startsWith('mock-')) {
         setAlertConfig({ message: "Remarks can only be added to days with existing biometric records.", type: 'warning' });
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
  const uniqueEmployees = useMemo(() => {
    return [...new Set(attendance.map(row => row.display_name).filter(Boolean))].sort();
  }, [attendance]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter(row => row.display_name === selectedEmployee);
  }, [attendance, selectedEmployee]);

  const activeYear = useMemo(() => {
    if (filteredAttendance.length > 0) {
      const year = parseInt(formatDateString(filteredAttendance[0].date).substring(0, 4));
      if (!isNaN(year)) return year;
    }
    return new Date().getFullYear();
  }, [filteredAttendance]);

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
  let onTimeCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let punchErrorCount = 0;
  let workingDaysCount = 0;

  for (let i = 1; i <= daysInMonth; i++) {
    const mmStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
    const ddStr = i < 10 ? `0${i}` : `${i}`;
    const dateStr = `${activeYear}-${mmStr}-${ddStr}`;
    const dateStrAlt = `${activeYear}${mmStr}${ddStr}`;
    
    const dateObj = new Date(activeYear, selectedMonth - 1, i);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const isFuture = dateObj > new Date();

    if (!isWeekend) workingDaysCount++;

    const record = filteredAttendance.find(r => {
      const d = String(r.date);
      return d === dateStr || d === dateStrAlt;
    });

    let status = '';
    let statusCategory = 'REST'; // ALL, PRESENT, LATE, MISSING, REST, ABSENT
    let statusColor = '';
    let statusBadgeClass = '';
    let rowBorderClass = '';
    let renderedMinutes = 0;
    let isLate = false;

    if (record) {
      renderedMinutes = calculateDuration(record.time_in_am, record.time_out_am) + calculateDuration(record.time_in_pm, record.time_out_pm);
      totalMinutes += renderedMinutes;
      if (renderedMinutes > 0) daysPresentCount++;

      const hasAnyPunch = !!(record.time_in_am || record.time_out_am || record.time_in_pm || record.time_out_pm);
      const isCompletePunches = !!(record.time_in_am && record.time_out_am && record.time_in_pm && record.time_out_pm);

      if (record.time_in_am) {
        if (record.time_in_am > "08:30") {
          isLate = true;
        } else if (record.time_in_am > "08:00" && renderedMinutes < 480) {
          isLate = true;
        }
      }

      if (!hasAnyPunch) {
        if (isWeekend) {
          status = 'Rest day';
          statusCategory = 'REST';
          statusColor = 'text-slate-400 dark:text-slate-500';
          statusBadgeClass = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
        } else {
          status = 'No Record';
          statusCategory = 'ABSENT';
          statusColor = 'text-red-600 dark:text-red-400';
          statusBadgeClass = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60';
          absentCount++;
        }
      } else if (!isCompletePunches || (record.error_message && !isCompletePunches)) {
        status = 'Missing punch';
        statusCategory = 'MISSING';
        statusColor = 'text-rose-700 dark:text-rose-400';
        statusBadgeClass = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/80';
        rowBorderClass = 'border-l-4 border-rose-500';
        punchErrorCount++;
      } else {
        if (isLate) {
          status = 'Late';
          statusCategory = 'LATE';
          statusColor = 'text-amber-600 dark:text-amber-400';
          statusBadgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80';
          rowBorderClass = 'border-l-4 border-amber-500';
          lateCount++;
        } else {
          status = 'On time';
          statusCategory = 'PRESENT';
          statusColor = 'text-teal-600 dark:text-teal-400';
          statusBadgeClass = 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/80';
          rowBorderClass = 'border-l-4 border-teal-500';
          onTimeCount++;
        }
      }
    } else {
      if (isWeekend) {
        status = 'Rest day';
        statusCategory = 'REST';
        statusColor = 'text-slate-400 dark:text-slate-500';
        statusBadgeClass = 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800';
      } else if (!isFuture) {
        status = 'No Record';
        statusCategory = 'ABSENT';
        statusColor = 'text-red-600 dark:text-red-400';
        statusBadgeClass = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60';
        absentCount++;
      } else {
        status = '';
        statusCategory = 'ALL';
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
      statusCategory,
      statusColor,
      statusBadgeClass,
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

  const currentMonthLabel = months.find(m => m.value === selectedMonth)?.label || 'Month';

  const handlePrevMonth = () => {
    setSelectedMonth(prev => prev === 1 ? 12 : prev - 1);
  };

  const handleNextMonth = () => {
    setSelectedMonth(prev => prev === 12 ? 1 : prev + 1);
  };

  // Filtered rows for table & mobile view
  const visibleDays = useMemo(() => {
    if (statusFilter === 'ALL') return days;
    if (statusFilter === 'PRESENT') return days.filter(d => d.statusCategory === 'PRESENT');
    if (statusFilter === 'LATE') return days.filter(d => d.statusCategory === 'LATE');
    if (statusFilter === 'MISSING') return days.filter(d => d.statusCategory === 'MISSING');
    if (statusFilter === 'REST') return days.filter(d => d.statusCategory === 'REST');
    if (statusFilter === 'ABSENT') return days.filter(d => d.statusCategory === 'ABSENT');
    return days;
  }, [days, statusFilter]);

  const onTimePercentage = daysPresentCount > 0 ? Math.round((onTimeCount / daysPresentCount) * 100) : 0;
  const targetWorkingHours = workingDaysCount * 8;
  const currentRenderedHours = Math.floor(totalMinutes / 60);

  const handleExportExcel = async () => {
    try {
      const employeeName = selectedEmployee || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Employee';
      const monthYear = `${currentMonthLabel} ${activeYear}`;

      // Calculate total undertime across working days
      let totalUndertimeMinsSum = 0;
      days.forEach((d) => {
        if (!d.isWeekend && d.renderedMinutes > 0 && d.renderedMinutes < 480) {
          totalUndertimeMinsSum += (480 - d.renderedMinutes);
        }
      });
      const totalUtH = Math.floor(totalUndertimeMinsSum / 60);
      const totalUtM = totalUndertimeMinsSum % 60;

      // Load official CSC Form 48 template directly with JSZip to preserve all styles, merges, wrapping, and borders
      const zip = await JSZip.loadAsync(CSC_FORM_48_TEMPLATE_BASE64, { base64: true });
      let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');

      // Helper to strip seconds from time strings (e.g. 07:43:30 -> 07:43)
      const formatTimeNoSeconds = (timeStr) => {
        if (!timeStr) return '';
        const str = String(timeStr).trim();
        const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (match) {
          return `${match[1].padStart(2, '0')}:${match[2]}`;
        }
        return str;
      };

      const escapeXml = (unsafe) => {
        return String(unsafe || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      // 1. Update Employee Name in Row 4 (A4 & I4)
      sheetXml = sheetXml.replace(/<c r="A4"[^>]*>.*?<\/c>/, `<c r="A4" s="10" t="inlineStr"><is><t>${escapeXml(employeeName.toUpperCase())}</t></is></c>`);
      sheetXml = sheetXml.replace(/<c r="I4"[^>]*>.*?<\/c>/, `<c r="I4" s="10" t="inlineStr"><is><t>${escapeXml(employeeName.toUpperCase())}</t></is></c>`);

      // 2. Update Month & Year in Row 6 (A6 & I6)
      const monthText = `For the month of: ${monthYear}`;
      sheetXml = sheetXml.replace(/<c r="A6"[^>]*>.*?<\/c>/, `<c r="A6" s="24" t="inlineStr"><is><t>${escapeXml(monthText)}</t></is></c>`);
      sheetXml = sheetXml.replace(/<c r="I6"[^>]*>.*?<\/c>/, `<c r="I6" s="24" t="inlineStr"><is><t>${escapeXml(monthText)}</t></is></c>`);

      // 3. Fix Left Side "Regular days:" (D7:E7) and "Saturdays:" (D8:E8) merge & alignment
      sheetXml = sheetXml.replace(
        /<c r="D7" s="19" t="s"><v>1<\/v><\/c><c r="E7" s="1" t="s"><v>7<\/v><\/c>/,
        '<c r="D7" s="22" t="s"><v>7</v></c><c r="E7" s="22"/>'
      );
      sheetXml = sheetXml.replace(
        /<c r="D8" s="19" t="s"><v>1<\/v><\/c><c r="E8" s="1" t="s"><v>9<\/v><\/c>/,
        '<c r="D8" s="23" t="s"><v>9</v></c><c r="E8" s="23"/>'
      );
      if (!sheetXml.includes('ref="D7:E7"')) {
        sheetXml = sheetXml.replace(
          '<mergeCell ref="L7:M7"/>',
          '<mergeCell ref="D7:E7"/><mergeCell ref="L7:M7"/>'
        );
      }
      if (!sheetXml.includes('ref="D8:E8"')) {
        sheetXml = sheetXml.replace(
          '<mergeCell ref="L8:M8"/>',
          '<mergeCell ref="D8:E8"/><mergeCell ref="L8:M8"/>'
        );
      }
      sheetXml = sheetXml.replace(/<mergeCells count="(\d+)">/, (match, count) => {
        return `<mergeCells count="${parseInt(count) + 2}">`;
      });

      // 3. Update Days 1 to 31 in Rows 11 to 41
      for (let day = 1; day <= 31; day++) {
        const rowNum = 10 + day;
        const d = days.find(x => x.dayNumber === day);

        const amIn = formatTimeNoSeconds(d?.record?.time_in_am);
        const amOut = formatTimeNoSeconds(d?.record?.time_out_am);
        const pmIn = formatTimeNoSeconds(d?.record?.time_in_pm);
        const pmOut = formatTimeNoSeconds(d?.record?.time_out_pm);

        let utH = '';
        let utM = '';
        if (d && !d.isWeekend && d.renderedMinutes > 0 && d.renderedMinutes < 480) {
          const diff = 480 - d.renderedMinutes;
          utH = Math.floor(diff / 60) || '';
          utM = diff % 60 || '';
        }

        const makeTimeCell = (ref, val) => {
          if (!val) return `<c r="${ref}" s="4" t="s"><v>1</v></c>`;
          return `<c r="${ref}" s="4" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
        };

        const makeUtCell = (ref, val) => {
          if (!val && val !== 0) return `<c r="${ref}" s="5" t="s"><v>1</v></c>`;
          return `<c r="${ref}" s="5"><v>${Number(val)}</v></c>`;
        };

        const rowContent = `<c r="A${rowNum}" s="3"><v>${day}</v></c>` +
          makeTimeCell(`B${rowNum}`, amIn) +
          makeTimeCell(`C${rowNum}`, amOut) +
          makeTimeCell(`D${rowNum}`, pmIn) +
          makeTimeCell(`E${rowNum}`, pmOut) +
          makeUtCell(`F${rowNum}`, utH) +
          makeUtCell(`G${rowNum}`, utM) +
          `<c r="H${rowNum}" t="s"><v>1</v></c>` +
          `<c r="I${rowNum}" s="3"><v>${day}</v></c>` +
          makeTimeCell(`J${rowNum}`, amIn) +
          makeTimeCell(`K${rowNum}`, amOut) +
          makeTimeCell(`L${rowNum}`, pmIn) +
          makeTimeCell(`M${rowNum}`, pmOut) +
          makeUtCell(`N${rowNum}`, utH) +
          makeUtCell(`O${rowNum}`, utM);

        const rowRegex = new RegExp(`<row r="${rowNum}"[^>]*>.*?</row>`);
        sheetXml = sheetXml.replace(rowRegex, `<row r="${rowNum}" spans="1:15" x14ac:dyDescent="0.25">${rowContent}</row>`);
      }

      // 4. Update Undertime Total Row 42
      const f42 = totalUtH > 0 ? `<c r="F42" s="6"><v>${Number(totalUtH)}</v></c>` : `<c r="F42" s="6" t="s"><v>1</v></c>`;
      const g42 = totalUtM > 0 ? `<c r="G42" s="6"><v>${Number(totalUtM)}</v></c>` : `<c r="G42" s="6" t="s"><v>1</v></c>`;
      const n42 = totalUtH > 0 ? `<c r="N42" s="6"><v>${Number(totalUtH)}</v></c>` : `<c r="N42" s="6" t="s"><v>1</v></c>`;
      const o42 = totalUtM > 0 ? `<c r="O42" s="6"><v>${Number(totalUtM)}</v></c>` : `<c r="O42" s="6" t="s"><v>1</v></c>`;

      const row42Content = `<c r="A42" s="14" t="s"><v>42</v></c><c r="B42" s="14" t="s"><v>1</v></c><c r="C42" s="14" t="s"><v>1</v></c><c r="D42" s="14" t="s"><v>1</v></c><c r="E42" s="14" t="s"><v>1</v></c>${f42}${g42}<c r="H42" t="s"><v>1</v></c><c r="I42" s="14" t="s"><v>42</v></c><c r="J42" s="14" t="s"><v>1</v></c><c r="K42" s="14" t="s"><v>1</v></c><c r="L42" s="14" t="s"><v>1</v></c><c r="M42" s="14" t="s"><v>1</v></c>${n42}${o42}`;
      sheetXml = sheetXml.replace(/<row r="42"[^>]*>.*?<\/row>/, `<row r="42" spans="1:15" x14ac:dyDescent="0.25">${row42Content}</row>`);

      // 5. Update Employee Signature in Row 48
      sheetXml = sheetXml.replace(/<c r="A48"[^>]*>.*?<\/c>/, `<c r="A48" s="17" t="inlineStr"><is><t>${escapeXml(employeeName.toUpperCase())}</t></is></c>`);
      sheetXml = sheetXml.replace(/<c r="I48"[^>]*>.*?<\/c>/, `<c r="I48" s="17" t="inlineStr"><is><t>${escapeXml(employeeName.toUpperCase())}</t></is></c>`);

      zip.file('xl/worksheets/sheet1.xml', sheetXml);

      const finalBlob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const cleanEmpName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `CSC_Form_48_${cleanEmpName}_${currentMonthLabel}_${activeYear}.xlsx`;

      const downloadUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Error exporting CSC Form 48 to Excel:", err);
      setError("Failed to export CSC Form 48 to Excel.");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 font-sans">
      
      {/* App Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20 print:hidden">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Open Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Daily Time Record
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Biometric logs, attendance analytics & CSC Form 48
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {user?.firstName ? `Hello, ${user.firstName} 👋` : 'Welcome back!'}
          </div>
          <NotificationBell />
          <CustomUserButton />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-2 pb-36 md:pb-2 pt-2 sm:pt-3 min-h-0 overflow-y-auto md:overflow-hidden custom-scrollbar">
        <div className="w-full h-auto md:h-full flex flex-col gap-2 min-h-0">

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 shadow-sm shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div><span className="font-bold">Notice:</span> {error}</div>
            </div>
          )}

              {/* Top Control Bar & KPI Summary Deck */}
              <div className="shrink-0 flex flex-col gap-2">
                
                {/* Profile & Filter Bar */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  
                  {/* Employee Focus */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-sm shrink-0 text-sm">
                      {(selectedEmployee || user?.firstName || 'U').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate max-w-[200px] sm:max-w-none">
                          {selectedEmployee || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
                        </h1>
                        {isAdmin && (
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <span>Attendance</span>
                        <span>•</span>
                        <span className="font-semibold text-teal-600 dark:text-teal-400">{currentMonthLabel} {activeYear}</span>
                      </p>
                    </div>
                  </div>

                  {/* Month & Employee Switchers & Export Button */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end flex-wrap sm:flex-nowrap">
                    {isAdmin && (
                      <div className="flex-1 sm:flex-initial min-w-[130px]">
                        <CustomSelect
                          value={selectedEmployee}
                          onChange={(val) => setSelectedEmployee(val)}
                          options={uniqueEmployees.map(emp => ({ value: emp, label: emp }))}
                          placeholder="Staff"
                          icon={
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          }
                        />
                      </div>
                    )}

                    {/* Month Switcher with Prev / Next */}
                    <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm shrink-0">
                      <button
                        onClick={handlePrevMonth}
                        className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                        title="Previous Month"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      
                      <div className="min-w-[110px] sm:min-w-[125px]">
                        <CustomSelect
                          value={selectedMonth}
                          onChange={(val) => setSelectedMonth(Number(val))}
                          options={months}
                          placeholder="Month"
                        />
                      </div>

                      <button
                        onClick={handleNextMonth}
                        className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                        title="Next Month"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>

                    {/* Export CSC Form 48 to Excel */}
                    <button
                      onClick={handleExportExcel}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl transition-all shadow-sm shrink-0 active:scale-95 cursor-pointer"
                      title="Export CSC Form 48 to Excel"
                    >
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      <span className="hidden sm:inline">Export Form 48</span>
                      <span className="sm:hidden">Form 48</span>
                    </button>
                  </div>
                </div>

                {/* KPI Analytics Cards - Swipeable Carousel on Mobile, Grid on Desktop */}
                <div className="flex md:grid md:grid-cols-5 gap-2.5 overflow-x-auto no-scrollbar py-0.5 snap-x shrink-0">
                  
                  {/* Total Rendered Hours */}
                  <div className="min-w-[135px] sm:min-w-[150px] md:min-w-0 snap-start shrink-0 md:shrink bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-teal-500/40 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Hours</span>
                      <div className="w-5 h-5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                        {loading ? '—' : formatDuration(totalMinutes)}
                      </div>
                      <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        Target: ~{targetWorkingHours}h {!loading && totalMinutes > 0 && <span className="text-teal-600 dark:text-teal-400 font-semibold">({Math.round((currentRenderedHours / (targetWorkingHours || 1)) * 100)}%)</span>}
                      </div>
                    </div>
                  </div>

                  {/* Days Present */}
                  <div className="min-w-[135px] sm:min-w-[150px] md:min-w-0 snap-start shrink-0 md:shrink bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-emerald-500/40 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Days Present</span>
                      <div className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0118 0Z" /></svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {loading ? '—' : daysPresentCount} <span className="text-xs font-semibold text-slate-400">/ {workingDaysCount}</span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        On-time: <span className="font-bold text-slate-700 dark:text-slate-300">{loading ? '—' : `${onTimePercentage}%`}</span>
                      </div>
                    </div>
                  </div>

                  {/* Late Count */}
                  <div className="min-w-[135px] sm:min-w-[150px] md:min-w-0 snap-start shrink-0 md:shrink bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-amber-500/40 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Late Days</span>
                      <div className="w-5 h-5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0118 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 tracking-tight">
                        {loading ? '—' : lateCount}
                      </div>
                      <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        {lateCount === 0 ? 'Punctual 🎉' : 'Past 08:30 AM'}
                      </div>
                    </div>
                  </div>

                  {/* Punch Errors / Missing */}
                  <div className="min-w-[135px] sm:min-w-[150px] md:min-w-0 snap-start shrink-0 md:shrink bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-rose-500/40 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Missing Swipes</span>
                      <div className="w-5 h-5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 tracking-tight">
                        {loading ? '—' : punchErrorCount}
                      </div>
                      <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        {punchErrorCount === 0 ? 'No errors' : 'Need remarks'}
                      </div>
                    </div>
                  </div>

                  {/* Absent / No Record */}
                  <div className="min-w-[135px] sm:min-w-[150px] md:min-w-0 snap-start shrink-0 md:shrink bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-slate-400 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No Record</span>
                      <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight">
                        {loading ? '—' : absentCount}
                      </div>
                      <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        Unrecorded
                      </div>
                    </div>
                  </div>

                </div>

                {/* Status Quick Filter Pills */}
                <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setStatusFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                        statusFilter === 'ALL'
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      All ({days.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('PRESENT')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                        statusFilter === 'PRESENT'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                      <span>On Time ({onTimeCount})</span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('LATE')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                        statusFilter === 'LATE'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Late ({lateCount})</span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('MISSING')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                        statusFilter === 'MISSING'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      <span>Missing ({punchErrorCount})</span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('ABSENT')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                        statusFilter === 'ABSENT'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span>No Record ({absentCount})</span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('REST')}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                        statusFilter === 'REST'
                          ? 'bg-slate-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>Rest</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Desktop & Mobile Timesheet Container */}
              <div className="flex-1 min-h-0 md:overflow-y-auto custom-scrollbar bg-transparent md:bg-white md:dark:bg-slate-900 md:rounded-2xl md:border md:border-slate-200/80 md:dark:border-slate-800 md:shadow-sm relative">
                
                {loading ? (
                  <div className="p-3 sm:p-4">
                    <Loading type="table" />
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full">
                  <table className="w-full text-left border-collapse min-w-[860px]">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                      <tr className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                        <th className="px-5 py-3.5 w-36">Day / Date</th>
                        <th className="px-4 py-3.5 text-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium block text-[10px]">Morning</span>
                          In AM
                        </th>
                        <th className="px-4 py-3.5 text-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium block text-[10px]">Morning</span>
                          Out AM
                        </th>
                        <th className="px-4 py-3.5 text-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium block text-[10px]">Afternoon</span>
                          In PM
                        </th>
                        <th className="px-4 py-3.5 text-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium block text-[10px]">Afternoon</span>
                          Out PM
                        </th>
                        <th className="px-4 py-3.5 text-center">Hours Rendered</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Remarks / Explanation</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs sm:text-sm font-medium divide-y divide-slate-100 dark:divide-slate-800/60">
                      {visibleDays.map((dayObj) => {
                        const { record, status, statusBadgeClass, rowBorderClass, renderedMinutes, isWeekend } = dayObj;
                        
                        const displayTime = (val) => {
                          if (!val) return '—';
                          return val;
                        };

                        const isRowMissing = status === 'Missing punch';
                        
                        return (
                          <tr 
                            key={`tr-${dayObj.dayNumber}`}
                            onClick={() => handleRowClick(record, dayObj.dateString)}
                            className={`transition-colors group cursor-pointer hover:bg-teal-50/40 dark:hover:bg-teal-950/20 ${
                              isWeekend ? 'bg-slate-50/50 dark:bg-slate-900/40 opacity-75' : ''
                            }`}
                          >
                            {/* Date Badge */}
                            <td className={`px-5 py-2.5 relative ${rowBorderClass || 'border-l-4 border-transparent'}`}>
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 text-xs sm:text-sm ${
                                  isWeekend 
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' 
                                    : 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/50'
                                }`}>
                                  <span>{dayObj.dayNumber}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-tight">
                                    {dayObj.dayName}
                                  </span>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    {dayObj.monthName} {dayObj.dayNumber}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* In AM */}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold ${
                                record?.time_in_am 
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60' 
                                  : isRowMissing 
                                  ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30 border border-dashed border-rose-300 dark:border-rose-800' 
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}>
                                {displayTime(record?.time_in_am)}
                              </span>
                            </td>

                            {/* Out AM */}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold ${
                                record?.time_out_am 
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60' 
                                  : isRowMissing 
                                  ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30 border border-dashed border-rose-300 dark:border-rose-800' 
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}>
                                {displayTime(record?.time_out_am)}
                              </span>
                            </td>

                            {/* In PM */}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold ${
                                record?.time_in_pm 
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60' 
                                  : isRowMissing 
                                  ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30 border border-dashed border-rose-300 dark:border-rose-800' 
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}>
                                {displayTime(record?.time_in_pm)}
                              </span>
                            </td>

                            {/* Out PM */}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold ${
                                record?.time_out_pm 
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60' 
                                  : isRowMissing 
                                  ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30 border border-dashed border-rose-300 dark:border-rose-800' 
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}>
                                {displayTime(record?.time_out_pm)}
                              </span>
                            </td>

                            {/* Rendered Hours */}
                            <td className="px-4 py-2.5 text-center">
                              {renderedMinutes > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs sm:text-sm">
                                    {formatDuration(renderedMinutes)}
                                  </span>
                                  <div className="w-14 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                                    <div 
                                      className={`h-full rounded-full ${renderedMinutes >= 480 ? 'bg-teal-500' : 'bg-amber-400'}`}
                                      style={{ width: `${Math.min(100, (renderedMinutes / 480) * 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-2.5">
                              {status && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadgeClass}`}>
                                  {status === 'On time' && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>}
                                  {status === 'Late' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
                                  {status === 'Missing punch' && <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>}
                                  <span>{status}</span>
                                </span>
                              )}
                            </td>

                            {/* Remarks */}
                            <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300 max-w-[220px]">
                              {record?.remarks ? (
                                <div className="flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                  <span className="truncate font-medium text-xs sm:text-sm">{record.remarks}</span>
                                </div>
                              ) : isRowMissing ? (
                                <span className="text-rose-500/90 hover:text-rose-600 dark:hover:text-rose-400 font-medium text-xs sm:text-sm flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                  <span>Add missing punch explanation...</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs sm:text-sm flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                  <span>Add remark</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards - Clean, full cards on mobile */}
                <div className="md:hidden flex flex-col gap-2.5">
                  {visibleDays.map((dayObj) => {
                    const { record, status, statusBadgeClass, rowBorderClass, renderedMinutes, isWeekend } = dayObj;
                    const displayTime = (val) => val || '—';
                    const isRowMissing = status === 'Missing punch';

                    return (
                      <div 
                        key={`mob-${dayObj.dayNumber}`}
                        onClick={() => handleRowClick(record, dayObj.dateString)}
                        className={`relative p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-all active:scale-[0.99] cursor-pointer bg-white dark:bg-slate-900 hover:border-teal-500/40 ${
                          isWeekend ? 'opacity-80' : ''
                        }`}
                      >
                        <div className={`absolute top-0 left-0 bottom-0 w-1.5 rounded-l-2xl ${rowBorderClass ? rowBorderClass.replace('border-l-4 border-', 'bg-') : 'bg-transparent'}`}></div>
                        
                        {/* Card Header */}
                        <div className="flex justify-between items-start mb-2 pl-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm ${
                              isWeekend 
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' 
                                : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/50'
                            }`}>
                              <span>{dayObj.dayNumber}</span>
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white text-sm block leading-tight">
                                {dayObj.monthName} {dayObj.dayNumber}, {dayObj.dayName}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Rendered: <strong className="text-slate-800 dark:text-slate-200">{renderedMinutes > 0 ? formatDuration(renderedMinutes) : '—'}</strong>
                              </span>
                            </div>
                          </div>

                          {status && (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadgeClass}`}>
                              {status}
                            </span>
                          )}
                        </div>

                        {/* 2x2 Punch Time Grid */}
                        <div className="grid grid-cols-2 gap-2 pl-2 mb-2">
                          {/* Morning */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                            <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 block mb-0.5">Morning</span>
                            <div className="flex items-center justify-between text-xs sm:text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                              <div><span className="text-[10px] text-slate-400 block font-sans font-normal">IN</span>{displayTime(record?.time_in_am)}</div>
                              <span className="text-slate-300 dark:text-slate-600 font-normal">→</span>
                              <div><span className="text-[10px] text-slate-400 block font-sans font-normal">OUT</span>{displayTime(record?.time_out_am)}</div>
                            </div>
                          </div>

                          {/* Afternoon */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                            <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 block mb-0.5">Afternoon</span>
                            <div className="flex items-center justify-between text-xs sm:text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                              <div><span className="text-[10px] text-slate-400 block font-sans font-normal">IN</span>{displayTime(record?.time_in_pm)}</div>
                              <span className="text-slate-300 dark:text-slate-600 font-normal">→</span>
                              <div><span className="text-[10px] text-slate-400 block font-sans font-normal">OUT</span>{displayTime(record?.time_out_pm)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Remarks Row */}
                        <div className="pl-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-xs sm:text-sm">
                          {record?.remarks ? (
                            <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300 font-medium truncate text-xs sm:text-sm">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                              <span className="truncate">{record.remarks}</span>
                            </div>
                          ) : isRowMissing ? (
                            <span className="text-rose-500 font-semibold italic text-xs sm:text-sm flex items-center gap-1">
                              <span>Tap to add explanation...</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs sm:text-sm">Tap to add remark...</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                </>
              )}

            </div>
          </div>
        </div>

      {/* Record Details & Remarks Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all border border-slate-200 dark:border-slate-800">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20 font-bold">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    Attendance Record
                  </h3>
                  <span className="text-xs sm:text-sm font-semibold text-teal-600 dark:text-teal-400">
                    {formatDateString(selectedRecord.date)} • {selectedRecord.display_name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              
              {/* Punch Logs Timeline Snapshot */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">AM Session</span>
                  <div className="flex items-center justify-between text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                    <span>{selectedRecord.time_in_am || '—'}</span>
                    <span className="text-slate-400">→</span>
                    <span>{selectedRecord.time_out_am || '—'}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">PM Session</span>
                  <div className="flex items-center justify-between text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                    <span>{selectedRecord.time_in_pm || '—'}</span>
                    <span className="text-slate-400">→</span>
                    <span>{selectedRecord.time_out_pm || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Punch Error Alert */}
              {selectedRecord.error_message && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start gap-3">
                  <div className="bg-rose-100 dark:bg-rose-900/50 p-2 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-rose-800 dark:text-rose-300 text-xs sm:text-sm">Biometric Punch Issue</h4>
                    <p className="text-rose-600 dark:text-rose-400 text-xs sm:text-sm mt-0.5 leading-relaxed">
                      {selectedRecord.error_message}
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Preset Tags */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                  Quick Preset Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REMARKS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditRemarks(prev => prev ? `${prev}; ${preset}` : preset)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 border border-slate-200/60 dark:border-slate-700 transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remarks Textarea */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Official Explanation / Remarks
                </label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={3}
                  placeholder="Enter explanation for missing swipes, pass slips, official business details..."
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium resize-y min-h-[90px] shadow-sm placeholder:text-slate-400"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex justify-end gap-3">
              <button
                onClick={() => setSelectedRecord(null)}
                disabled={isSaving}
                className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRemarks}
                disabled={isSaving}
                className="px-6 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Remarks</span>
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

      {/* Printable Civil Service Form No. 48 Styles (Active during window.print()) */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, .print\\:hidden, button {
            display: none !important;
          }
          .custom-scrollbar {
            overflow: visible !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            color: #000 !important;
            font-size: 10pt !important;
          }
        }
      `}</style>
    </div>
  );
}
