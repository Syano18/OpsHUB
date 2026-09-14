import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

function cleanAddresseeName(val) {
  if (!val) return '';
  return val
    .replace(/<[^>]+>/g, '')
    .replace(/\([^)]*@[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTooGenericAddressee(val) {
  if (!val) return false;
  const normalized = val.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const genericList = [
    'co',
    'centraloffice',
    'psaco',
    'rsso',
    'rssocar',
    'carrsso',
    'psarsso',
    'psarssocar',
    'car'
  ];
  return genericList.includes(normalized);
}

export default function DigitalLogbook() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [entries, setEntries] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [recentAddressees, setRecentAddressees] = useState(() => {
    try {
      const stored = localStorage.getItem('recent_addressees');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.from(new Set(parsed.map(a => cleanAddresseeName(a)).filter(a => a && !a.includes('@') && !isTooGenericAddressee(a))));
    } catch (e) {
      return [];
    }
  });
  const [transmittalModesList, setTransmittalModesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertConfig, setAlertConfig] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddresseeDropdownOpen, setIsAddresseeDropdownOpen] = useState(false);
  const [isTransmittalDropdownOpen, setIsTransmittalDropdownOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [transmitterName, setTransmitterName] = useState("");
  const [savedReference, setSavedReference] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [referenceOverride, setReferenceOverride] = useState(null);
  const [timestampOverride, setTimestampOverride] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const canInsertRecord = userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'PACD';

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFilterType, setExportFilterType] = useState('All');
  const [exportYear, setExportYear] = useState(new Date().getFullYear().toString());
  const [exportMonth, setExportMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [isExportFilterDropdownOpen, setIsExportFilterDropdownOpen] = useState(false);
  const [isExportYearDropdownOpen, setIsExportYearDropdownOpen] = useState(false);
  const [isExportMonthDropdownOpen, setIsExportMonthDropdownOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear().toString());
  const [isDisplayYearDropdownOpen, setIsDisplayYearDropdownOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    particulars: '',
    addresse: '',
    section: '',
    modeOfTransmittal: '',
    remarks: ''
  });

  const fetchEntries = async () => {
    try {
      const token = await getToken();
      const emailQuery = user?.primaryEmailAddress?.emailAddress ? `&email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}` : '';
      const res = await fetch(`/api/logbook?action=fetch${emailQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch logbook entries");

      const data = await res.json();

      setEntries(data.entries || []);
      setSectionsList(data.sectionsList || []);
      setTransmittalModesList(data.transmittalModesList || []);

      if (data.transmitterName) setTransmitterName(data.transmitterName);
      if (data.userRole) setUserRole(data.userRole);

      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to fetch logbook entries: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchEntries();
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'addresse') {
      const cleaned = cleanAddresseeName(value);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
      if (error && !cleaned.includes('@')) setError("");
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setIsReviewing(false);
    setSavedReference(null);
    setEditingId(null);
    setReferenceOverride(null);
    setTimestampOverride(null);
    setCopiedRef(false);
    setError("");
    setFormData({
      particulars: '',
      addresse: '',
      section: '',
      modeOfTransmittal: '',
      remarks: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedAddressee = cleanAddresseeName(formData.addresse);

    // Validate that addressee does not contain email addresses
    if (cleanedAddressee && (cleanedAddressee.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedAddressee))) {
      setError("The Addressee field only accepts recipient Name(s) (e.g., 'Teodoro Orteza'). Email addresses are not accepted.");
      return;
    }

    // Restrict standalone generic offices like CO or RSSO CAR alone
    if (cleanedAddressee && isTooGenericAddressee(cleanedAddressee)) {
      setError("Addressee cannot be just '" + cleanedAddressee + "' alone. Please specify a specific person name, section, or division (e.g., 'CO - ITDS', 'RSSO CAR - SOCD', or 'Teodoro Orteza - CO').");
      return;
    }

    setFormData(prev => ({ ...prev, addresse: cleanedAddressee }));
    setError("");
    setIsReviewing(true);
  };

  const availableYears = useMemo(() => {
    const years = new Set(entries.map(e => {
      if (e.Timestamp) {
        return e.Timestamp.substring(0, 4);
      }
      return new Date().getFullYear().toString();
    }));
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const handleExportCSV = () => {
    let filteredForExport = entries;
    if (exportFilterType === 'Year') {
      filteredForExport = entries.filter(e => e.Timestamp && e.Timestamp.startsWith(exportYear));
    } else if (exportFilterType === 'Month') {
      const prefix = `${exportYear}-${exportMonth}`;
      filteredForExport = entries.filter(e => e.Timestamp && e.Timestamp.startsWith(prefix));
    }

    if (filteredForExport.length === 0) {
      setAlertConfig({ message: "No records found for the selected filter.", type: 'info' });
      return;
    }

    const headers = ["Reference Number", "Timestamp", "Particulars", "Addressee", "Transmitter", "Section", "Mode of Transmittal", "Remarks", "Encoded By"];
    const csvRows = [headers.join(',')];

    for (const entry of filteredForExport) {
      const row = [
        entry.REFERENCE_NUMBER || '',
        entry.Timestamp || '',
        entry.PARTICULARS || '',
        entry.ADDRESSE || '',
        entry.TRANSMITTER || '',
        entry.SECTION || '',
        entry.MODE_OF_TRANSMITTAL || '',
        entry.REMARKS || '',
        entry.ENCODED_BY || ''
      ].map(val => `"${(val || '').toString().replace(/"/g, '""')}"`);
      csvRows.push(row.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `OpsHUB_Logbook_${exportFilterType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  const handleConfirmSave = async () => {
    setIsSubmitting(true);
    setError("");

    try {
      const token = await getToken();
      const userEncodedBy = user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id || '';
      const payload = { 
        ...formData,
        transmitterName: transmitterName || '',
        encodedBy: userEncodedBy
      };
      let res;

      if (editingId) {
        payload.id = editingId;
        res = await fetch('/api/logbook', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      } else {
        payload.referenceOverride = referenceOverride;
        payload.timestampOverride = timestampOverride;
        res = await fetch('/api/logbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save logbook entry");
      }
      const data = await res.json();
      const generatedRef = data.generatedRef;

      if (payload.addresse && payload.addresse.trim() !== '') {
        const newAddressee = payload.addresse.trim();
        setRecentAddressees(prev => {
          const updatedList = [newAddressee, ...prev.filter(a => a.toLowerCase() !== newAddressee.toLowerCase())].slice(0, 10);
          localStorage.setItem('recent_addressees', JSON.stringify(updatedList));
          return updatedList;
        });
      }

      setFormData({
        particulars: '',
        addresse: '',
        section: '',
        modeOfTransmittal: '',
        remarks: ''
      });
      setIsReviewing(false);
      setSavedReference(generatedRef);
      fetchEntries();
    } catch (err) {
      console.error(err);
      setError("Failed to add entry: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditEntry = (entry) => {
    setActiveMenuId(null);
    setEditingId(entry.id);
    setFormData({
      particulars: entry.PARTICULARS || '',
      addresse: entry.ADDRESSE || '',
      section: entry.SECTION || '',
      modeOfTransmittal: entry.MODE_OF_TRANSMITTAL || '',
      remarks: entry.REMARKS || ''
    });
    if (entry.TRANSMITTER) setTransmitterName(entry.TRANSMITTER);
    setShowForm(true);
  };

  const handleInsertEntry = async (entry) => {
    setActiveMenuId(null);
    setEditingId(null);

    const baseRef = entry.REFERENCE_NUMBER.replace(/[A-Z]$/, '');

    try {
      const token = await getToken();
      const res = await fetch(`/api/logbook?action=checkRef&baseRef=${encodeURIComponent(baseRef)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const existing = data.references || [];
      const suffixes = existing
        .map(ref => ref.replace(baseRef, ''))
        .filter(s => s.length === 1 && s >= 'A' && s <= 'Z')
        .sort();

      let nextChar = 'A';
      if (suffixes.length > 0) {
        const maxChar = suffixes[suffixes.length - 1];
        nextChar = String.fromCharCode(maxChar.charCodeAt(0) + 1);
      }

      setReferenceOverride(`${baseRef}${nextChar}`);
    } catch (e) {
      console.error(e);
      setReferenceOverride(`${baseRef}A`);
    }

    if (entry.Timestamp) {
      const parts = entry.Timestamp.split(/[- :]/);
      if (parts.length === 5) {
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
        dateObj.setMinutes(dateObj.getMinutes() + 1);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        setTimestampOverride(`${yyyy}-${mm}-${dd} ${hh}:${min}`);
      }
    }

    setFormData({
      particulars: '',
      addresse: '',
      section: '',
      modeOfTransmittal: '',
      remarks: ''
    });
    setShowForm(true);
  };

  const renderedEntries = useMemo(() => {
    let filtered = entries;

    if (displayYear !== 'All') {
      filtered = filtered.filter(entry => entry.Timestamp && entry.Timestamp.startsWith(displayYear));
    }

    filtered = filtered.filter(entry =>
      entry.PARTICULARS?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.REFERENCE_NUMBER?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.ADDRESSE?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.TRANSMITTER?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.SECTION?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.map((entry) => (
      <div
        key={entry.id}
        className="group relative p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm hover:shadow-md hover:border-teal-400/60 dark:hover:border-teal-700/60 transition-all flex flex-col gap-3 [content-visibility:auto]"
        onClick={() => {
          if (canInsertRecord || entry.ENCODED_BY === (user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id)) {
            setActiveMenuId(activeMenuId === entry.id ? null : entry.id);
          }
        }}
      >
        {/* Top bar: Reference Badge, Timestamp, Action Menu */}
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 shadow-sm">
              <svg className="w-3 h-3 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
              {entry.REFERENCE_NUMBER}
            </span>
            {entry.SECTION && (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                {entry.SECTION}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50">
              {entry.Timestamp}
            </span>

            {(canInsertRecord || entry.ENCODED_BY === (user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id)) && (
              <button
                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === entry.id ? null : entry.id); }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Options"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Particulars (Main Title / Subject) */}
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-snug break-words">
            {entry.PARTICULARS}
          </h3>
        </div>

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">To (Addressee)</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">{entry.ADDRESSE || <span className="text-slate-400 font-normal italic">None</span>}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">From (Transmitter)</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">{entry.TRANSMITTER || <span className="text-slate-400 font-normal italic">None</span>}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">Section</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">{entry.SECTION || <span className="text-slate-400 font-normal italic">None</span>}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">Transmittal Mode</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">{entry.MODE_OF_TRANSMITTAL || <span className="text-slate-400 font-normal italic">None</span>}</span>
          </div>
        </div>

        {/* Remarks & Footer */}
        {(entry.REMARKS || entry.ENCODED_BY) && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
            <div className="text-slate-600 dark:text-slate-400 flex-1 break-words">
              {entry.REMARKS && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-700 dark:text-slate-300">Remarks:</strong> {entry.REMARKS}
                </p>
              )}
            </div>
            {entry.ENCODED_BY && (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                Encoded by: <span className="font-semibold text-slate-600 dark:text-slate-300">{entry.ENCODED_BY}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions Dropdown */}
        {activeMenuId === entry.id && (canInsertRecord || entry.ENCODED_BY === (user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id)) && (
          <div
            className="absolute right-4 top-12 mt-1 w-44 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-1.5 flex flex-col gap-1">
              {entry.ENCODED_BY === (user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id) && (
                <button
                  onClick={() => handleEditEntry(entry)}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit Record
                </button>
              )}
              {canInsertRecord && (
                <button
                  onClick={() => handleInsertEntry(entry)}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Insert Record
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    ));
  }, [entries, searchQuery, displayYear, activeMenuId, userRole, user, canInsertRecord]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100">
      {/* Page Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Digital Logbook
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Record, track, and manage incoming and outgoing transmittals
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
      <div className="flex-1 flex flex-col px-2 pb-2 pt-4 min-h-0">
        <div className="w-full h-full flex flex-col gap-4 min-h-0">

          {/* Modal Overlay for Form (New / Edit / Insert) */}
          {showForm && (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 transform transition-all">

                {/* Modal Header */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col gap-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                        {savedReference ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : isReviewing ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        ) : editingId ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                          {savedReference
                            ? 'Logbook Entry Saved!'
                            : isReviewing
                              ? 'Review Transmittal Entry'
                              : referenceOverride
                                ? `Insert Record (${referenceOverride})`
                                : editingId
                                  ? 'Edit Logbook Entry'
                                  : 'New Logbook Entry'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {savedReference
                            ? 'Receipt reference generated successfully'
                            : isReviewing
                              ? 'Please verify the details below before saving'
                              : 'Record transmittal details and generate reference number'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCloseForm}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Stepper indicator if in edit/review flow */}
                  {!savedReference && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className={`flex-1 flex items-center gap-2 pb-1.5 border-b-2 transition-all ${!isReviewing ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-400 font-medium'}`}>
                        <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${!isReviewing ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>1</span>
                        <span className="text-xs">Transmittal Details</span>
                      </div>
                      <div className={`flex-1 flex items-center gap-2 pb-1.5 border-b-2 transition-all ${isReviewing ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-400 font-medium'}`}>
                        <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${isReviewing ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>2</span>
                        <span className="text-xs">Review & Confirm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">

                  {error && (
                    <div className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 text-xs flex items-start gap-2.5">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <div>
                        <span className="font-bold">Error:</span> {error}
                      </div>
                    </div>
                  )}

                  {/* State 1: Entry Saved Confirmation */}
                  {savedReference ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="w-16 h-16 bg-gradient-to-tr from-teal-500 to-emerald-400 text-white rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-teal-500/25 animate-scaleUp">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Entry Saved Successfully</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                        Your transmittal has been recorded with the following reference number:
                      </p>

                      <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm mb-6 shadow-inner flex flex-col items-center">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Official Reference No.</span>
                        <div className="text-2xl sm:text-3xl font-mono font-black text-teal-600 dark:text-teal-400 tracking-wider">
                          {savedReference}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(savedReference);
                            setCopiedRef(true);
                            setTimeout(() => setCopiedRef(false), 2000);
                          }}
                          className="mt-3 px-3 py-1 bg-white dark:bg-slate-700 hover:bg-teal-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                        >
                          {copiedRef ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              <span className="text-teal-600 dark:text-teal-400 font-bold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              <span>Copy Reference</span>
                            </>
                          )}
                        </button>
                      </div>

                      <button
                        onClick={handleCloseForm}
                        className="px-8 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md hover:shadow-lg w-full max-w-sm"
                      >
                        Done
                      </button>
                    </div>
                  ) : isReviewing ? (
                    /* State 2: Review & Confirm */
                    <div className="flex flex-col gap-5">
                      <div className="bg-slate-50/80 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700/60">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Summary of Entry
                          </span>
                          {referenceOverride && (
                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                              Ref: {referenceOverride}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Section</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{formData.section || <span className="italic text-slate-400">None</span>}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Addressee (To)</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{formData.addresse || <span className="italic text-slate-400">None</span>}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Transmitter (From)</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{transmitterName}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Mode of Transmittal</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{formData.modeOfTransmittal || <span className="italic text-slate-400">None</span>}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 flex flex-col gap-1.5">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Particulars</span>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                            {formData.particulars}
                          </p>
                        </div>

                        {formData.remarks && (
                          <div className="flex flex-col gap-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Remarks</span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                              {formData.remarks}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsReviewing(false)}
                          className="px-5 py-2.5 text-slate-700 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors text-xs sm:text-sm"
                        >
                          Back to Edit
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmSave}
                          disabled={isSubmitting}
                          className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                          {isSubmitting ? 'Saving...' : 'Confirm & Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* State 3: Entry Form Input */
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                      {/* Transmitter Info Banner */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-teal-500 text-white flex items-center justify-center font-bold text-xs">
                            {transmitterName ? transmitterName.charAt(0) : 'U'}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 block">Transmitter</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{transmitterName || 'Current User'}</span>
                          </div>
                        </div>
                        {referenceOverride && (
                          <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            Target Ref: {referenceOverride}
                          </span>
                        )}
                      </div>

                      {/* Section & Addressee row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Section Picker */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                            Section
                          </label>
                          <div className={`relative ${isDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                              setIsDropdownOpen(false);
                            }
                          }}>
                            <div className="relative">
                              <input
                                type="text"
                                name="section"
                                value={formData.section}
                                onChange={(e) => { handleInputChange(e); setIsDropdownOpen(true); }}
                                onFocus={() => setIsDropdownOpen(true)}
                                placeholder="Type or select a section..."
                                className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-medium transition-all shadow-sm placeholder:text-slate-400"
                              />
                              <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>
                            </div>

                            {isDropdownOpen && (
                              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                                <ul className="max-h-56 overflow-auto py-1.5 text-xs text-slate-700 dark:text-slate-200 custom-scrollbar">
                                  {sectionsList.filter(sec => sec.name.toLowerCase().includes((formData.section || "").toLowerCase())).map((sec) => (
                                    <li
                                      key={sec.id}
                                      onClick={() => { handleInputChange({ target: { name: 'section', value: sec.name } }); setIsDropdownOpen(false); }}
                                      className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700/80 hover:text-teal-700 dark:hover:text-teal-300 font-medium transition-colors"
                                    >
                                      {sec.name}
                                    </li>
                                  ))}

                                  {!sectionsList.some(sec => sec.name.toLowerCase() === (formData.section || "").trim().toLowerCase()) && (formData.section || "").trim() !== "" && (
                                    <li
                                      onMouseDown={(e) => { e.preventDefault(); setIsDropdownOpen(false); }}
                                      className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 font-bold border-t border-slate-100 dark:border-slate-700 mt-1"
                                    >
                                      + Create "{(formData.section || "").trim()}"
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Addressee Picker */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                            Addressee (To)
                          </label>
                          <div className={`relative ${isAddresseeDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                              setIsAddresseeDropdownOpen(false);
                            }
                          }}>
                            <div className="relative">
                              <input
                                type="text"
                                name="addresse"
                                value={formData.addresse}
                                onChange={(e) => { handleInputChange(e); setIsAddresseeDropdownOpen(true); }}
                                onFocus={() => setIsAddresseeDropdownOpen(true)}
                                placeholder="Type or select an addressee..."
                                className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-medium transition-all shadow-sm placeholder:text-slate-400"
                              />
                              <button type="button" onClick={() => setIsAddresseeDropdownOpen(!isAddresseeDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isAddresseeDropdownOpen ? 'rotate-180' : ''}`}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                              Specify specific person, section, or division (e.g. "CO - ITDS", "RSSO CAR - SOCD", or "Jefelyn Katimban"). Standalone "CO" or "RSSO CAR" alone is not permitted.
                            </p>

                            {isAddresseeDropdownOpen && (
                              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                                <ul className="max-h-56 overflow-auto py-1.5 text-xs text-slate-700 dark:text-slate-200 custom-scrollbar">
                                  {recentAddressees.filter(add => add.toLowerCase().includes((formData.addresse || "").toLowerCase())).map((add, idx) => (
                                    <li
                                      key={idx}
                                      onClick={() => { handleInputChange({ target: { name: 'addresse', value: add } }); setIsAddresseeDropdownOpen(false); }}
                                      className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700/80 flex items-center justify-between transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="font-medium">{add}</span>
                                      </div>
                                    </li>
                                  ))}

                                  {(formData.addresse || "").trim() !== "" && !recentAddressees.some(add => add.toLowerCase() === (formData.addresse || "").trim().toLowerCase()) && (
                                    <li
                                      onMouseDown={(e) => { e.preventDefault(); setIsAddresseeDropdownOpen(false); }}
                                      className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 font-bold border-t border-slate-100 dark:border-slate-700 mt-1"
                                    >
                                      + Use "{(formData.addresse || "").trim()}"
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mode of Transmittal */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                          Mode of Transmittal
                        </label>
                        <div className={`relative ${isTransmittalDropdownOpen ? 'z-40' : ''}`} tabIndex={0} onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget)) {
                            setIsTransmittalDropdownOpen(false);
                          }
                        }}>
                          <div className="relative">
                            <input
                              type="text"
                              name="modeOfTransmittal"
                              value={formData.modeOfTransmittal}
                              onChange={(e) => { handleInputChange(e); setIsTransmittalDropdownOpen(true); }}
                              onFocus={() => setIsTransmittalDropdownOpen(true)}
                              placeholder="Type or select mode (e.g. Courier, Hand Carry, Email)..."
                              className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-medium transition-all shadow-sm placeholder:text-slate-400"
                            />
                            <button type="button" onClick={() => setIsTransmittalDropdownOpen(!isTransmittalDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isTransmittalDropdownOpen ? 'rotate-180' : ''}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                          </div>

                          {isTransmittalDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                              <ul className="max-h-56 overflow-auto py-1.5 text-xs text-slate-700 dark:text-slate-200 custom-scrollbar">
                                {transmittalModesList.filter(mod => mod.name.toLowerCase().includes((formData.modeOfTransmittal || "").toLowerCase())).map((mod) => (
                                  <li
                                    key={mod.id}
                                    onClick={() => { handleInputChange({ target: { name: 'modeOfTransmittal', value: mod.name } }); setIsTransmittalDropdownOpen(false); }}
                                    className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700/80 hover:text-teal-700 font-medium transition-colors"
                                  >
                                    {mod.name}
                                  </li>
                                ))}

                                {!transmittalModesList.some(mod => mod.name.toLowerCase() === (formData.modeOfTransmittal || "").trim().toLowerCase()) && (formData.modeOfTransmittal || "").trim() !== "" && (
                                  <li
                                    onMouseDown={(e) => { e.preventDefault(); setIsTransmittalDropdownOpen(false); }}
                                    className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 font-bold border-t border-slate-100 dark:border-slate-700 mt-1"
                                  >
                                    + Create "{(formData.modeOfTransmittal || "").trim()}"
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Particulars (Auto-wrapping multiline textarea) */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                          Particulars (Subject / Document Details) <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          required
                          name="particulars"
                          value={formData.particulars}
                          onChange={handleInputChange}
                          rows={3}
                          placeholder="Enter document subject, purpose, control numbers, or full transmittal particulars..."
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 resize-y min-h-[85px] text-xs sm:text-sm font-medium transition-all shadow-sm placeholder:text-slate-400"
                        />
                      </div>

                      {/* Remarks (Auto-wrapping multiline textarea) */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                          Remarks <span className="text-slate-400 font-normal lowercase">(optional)</span>
                        </label>
                        <textarea
                          name="remarks"
                          value={formData.remarks}
                          onChange={handleInputChange}
                          rows={2}
                          placeholder="Optional remarks, routing notes, special instructions, or tracking tags..."
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 resize-y min-h-[60px] text-xs sm:text-sm font-medium transition-all shadow-sm placeholder:text-slate-400"
                        />
                      </div>

                      {/* Form Action Buttons */}
                      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={handleCloseForm}
                          className="px-5 py-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors text-xs sm:text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
                        >
                          <span>Review Entry</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Header & Search Controls */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              {/* Search Input & Year Filter */}
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search logs by ref, title, to, from..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/50 shadow-sm placeholder:text-slate-400"
                  />
                </div>

                {/* Year Selector */}
                <div className={`relative ${isDisplayYearDropdownOpen ? 'z-30' : ''}`} tabIndex={0} onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsDisplayYearDropdownOpen(false);
                  }
                }}>
                  <div className="relative cursor-pointer" onClick={() => setIsDisplayYearDropdownOpen(!isDisplayYearDropdownOpen)}>
                    <input
                      type="text"
                      readOnly
                      value={displayYear === 'All' ? 'All Years' : `${displayYear} Logs`}
                      className="w-28 sm:w-32 px-3 py-2 pr-8 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 cursor-pointer shadow-sm"
                    />
                    <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 transition-transform duration-200 ${isDisplayYearDropdownOpen ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>

                  {isDisplayYearDropdownOpen && (
                    <div className="absolute z-30 mt-1 w-36 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                      <ul className="max-h-56 overflow-auto py-1.5 text-xs text-slate-700 dark:text-slate-200 custom-scrollbar">
                        <li
                          onClick={() => { setDisplayYear('All'); setIsDisplayYearDropdownOpen(false); }}
                          className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 font-semibold text-teal-600 dark:text-teal-400"
                        >
                          All Years
                        </li>
                        {availableYears.map((y) => (
                          <li
                            key={y}
                            onClick={() => { setDisplayYear(y); setIsDisplayYearDropdownOpen(false); }}
                            className="cursor-pointer select-none py-2 px-3.5 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                          >
                            {y}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: Export & New Entry */}
              <div className="flex items-center gap-2.5 self-end sm:self-auto">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="group flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:shadow-sm transition-all whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span>Export</span>
                </button>

                <button
                  onClick={() => setShowForm(true)}
                  className="group flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>New Entry</span>
                </button>
              </div>
            </div>
          </div>

          {/* Entries List Container */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
            {loading ? (
              <Loading text="Loading logbook records..." />
            ) : entries.length > 0 ? (
              renderedEntries
            ) : (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/30">
                <svg className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">No logbook entries found</p>
                <p className="text-xs text-slate-400 mt-0.5">Click "New Entry" above to create your first transmittal record.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Logbook Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex justify-center items-center z-[100] p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 relative">
            <button onClick={() => setShowExportModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export Logbook Records
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Filter Type</label>
                <div className={`relative ${isExportFilterDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsExportFilterDropdownOpen(false);
                  }
                }}>
                  <div className="relative cursor-pointer" onClick={() => setIsExportFilterDropdownOpen(!isExportFilterDropdownOpen)}>
                    <input
                      type="text"
                      readOnly
                      value={exportFilterType === 'All' ? 'All Records' : exportFilterType === 'Year' ? 'By Year' : 'By Month'}
                      className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-semibold cursor-pointer"
                    />
                    <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isExportFilterDropdownOpen ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {isExportFilterDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                      <ul className="max-h-56 overflow-auto py-1 text-xs text-slate-700 dark:text-slate-200">
                        {['All', 'Year', 'Month'].map((type) => (
                          <li
                            key={type}
                            onClick={() => { setExportFilterType(type); setIsExportFilterDropdownOpen(false); }}
                            className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 font-medium"
                          >
                            {type === 'All' ? 'All Records' : type === 'Year' ? 'By Year' : 'By Month'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {exportFilterType !== 'All' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Year</label>
                  <div className={`relative ${isExportYearDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsExportYearDropdownOpen(false);
                    }
                  }}>
                    <div className="relative cursor-pointer" onClick={() => setIsExportYearDropdownOpen(!isExportYearDropdownOpen)}>
                      <input
                        type="text"
                        readOnly
                        value={exportYear}
                        className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-semibold cursor-pointer"
                      />
                      <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isExportYearDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                    {isExportYearDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                        <ul className="max-h-56 overflow-auto py-1 text-xs text-slate-700 dark:text-slate-200">
                          {availableYears.map((y) => (
                            <li
                              key={y}
                              onClick={() => { setExportYear(y); setIsExportYearDropdownOpen(false); }}
                              className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 font-medium"
                            >
                              {y}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {exportFilterType === 'Month' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Month</label>
                  <div className={`relative ${isExportMonthDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsExportMonthDropdownOpen(false);
                    }
                  }}>
                    <div className="relative cursor-pointer" onClick={() => setIsExportMonthDropdownOpen(!isExportMonthDropdownOpen)}>
                      <input
                        type="text"
                        readOnly
                        value={{
                          "01": "January", "02": "February", "03": "March", "04": "April",
                          "05": "May", "06": "June", "07": "July", "08": "August",
                          "09": "September", "10": "October", "11": "November", "12": "December"
                        }[exportMonth] || ""}
                        className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs sm:text-sm font-semibold cursor-pointer"
                      />
                      <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isExportMonthDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                    {isExportMonthDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scaleUp">
                        <ul className="max-h-56 overflow-auto py-1 text-xs text-slate-700 dark:text-slate-200">
                          {[
                            { val: "01", label: "January" }, { val: "02", label: "February" }, { val: "03", label: "March" },
                            { val: "04", label: "April" }, { val: "05", label: "May" }, { val: "06", label: "June" },
                            { val: "07", label: "July" }, { val: "08", label: "August" }, { val: "09", label: "September" },
                            { val: "10", label: "October" }, { val: "11", label: "November" }, { val: "12", label: "December" }
                          ].map((m) => (
                            <li
                              key={m.val}
                              onClick={() => { setExportMonth(m.val); setIsExportMonthDropdownOpen(false); }}
                              className="cursor-pointer select-none py-2 px-3.5 hover:bg-teal-50 dark:hover:bg-slate-700 font-medium"
                            >
                              {m.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-xs sm:text-sm">Cancel</button>
                <button onClick={handleExportCSV} className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-400 transition-all shadow-md hover:shadow-lg flex items-center gap-2 text-xs sm:text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span>Download CSV</span>
                </button>
              </div>
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
