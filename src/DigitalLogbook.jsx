import React, { useState, useEffect, useMemo } from 'react';
import { UserButton, useUser } from '@clerk/clerk-react';
import { turso } from './db';

export default function DigitalLogbook() {
  const { user } = useUser();
  const [entries, setEntries] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [addresseesList, setAddresseesList] = useState([]);
  const [transmittalModesList, setTransmittalModesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    if (!turso) {
      setError("Turso database is not connected. Please check your credentials.");
      setLoading(false);
      return;
    }

    try {
      const [logbookResult, sectionsResult, addresseesResult, transmittalResult] = await Promise.all([
        turso.execute({
          sql: "SELECT * FROM Digital_Logbook ORDER BY REFERENCE_NUMBER DESC",
          args: []
        }),
        turso.execute({
          sql: "SELECT * FROM Sections ORDER BY name ASC",
          args: []
        }),
        turso.execute({
          sql: "SELECT * FROM Addressees ORDER BY name ASC",
          args: []
        }),
        turso.execute({
          sql: "SELECT * FROM TransmittalModes ORDER BY name ASC",
          args: []
        })
      ]);
      setEntries(logbookResult.rows);
      setSectionsList(sectionsResult.rows);
      setAddresseesList(addresseesResult.rows);
      setTransmittalModesList(transmittalResult.rows);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to fetch logbook entries: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  useEffect(() => {
    const fetchTransmitter = async () => {
      if (!turso || !user || !user.primaryEmailAddress?.emailAddress) {
        if (user) setTransmitterName(user.fullName || "Unknown");
        return;
      }
      try {
        const userResult = await turso.execute({
          sql: `SELECT First_Name, Middle_Name, Last_Name, Suffix, Role FROM User_Permissions WHERE LOWER(Email) = LOWER(?)`,
          args: [user.primaryEmailAddress.emailAddress]
        });
        if (userResult.rows.length > 0) {
          const row = userResult.rows[0];
          const fn = row.First_Name || "";
          const mn = row.Middle_Name ? ` ${row.Middle_Name.charAt(0).toUpperCase()}.` : "";
          const ln = row.Last_Name ? ` ${row.Last_Name}` : "";
          const sx = row.Suffix ? ` ${row.Suffix}` : "";
          setTransmitterName(`${fn}${mn}${ln}${sx}`.trim());
          setUserRole(row.Role);
        } else {
          setTransmitterName(user.fullName || "Unknown");
          setUserRole(null);
        }
      } catch (err) {
        console.error("Failed to fetch transmitter name:", err);
        setTransmitterName(user.fullName || "Unknown");
      }
    };
    fetchTransmitter();
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setIsReviewing(false);
    setSavedReference(null);
    setEditingId(null);
    setReferenceOverride(null);
    setTimestampOverride(null);
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
      alert("No records found for the selected filter.");
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
      ].map(field => `"${String(field).replace(/"/g, '""')}"`);
      csvRows.push(row.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
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
    if (!turso || !user) return;
    setIsSubmitting(true);

    try {
      const encodedBy = user.primaryEmailAddress?.emailAddress || user.fullName || user.id;
      let generatedRef = "";

      if (editingId) {
        await turso.execute({
          sql: `UPDATE Digital_Logbook SET 
                  PARTICULARS = ?, ADDRESSE = ?, TRANSMITTER = ?, 
                  SECTION = ?, MODE_OF_TRANSMITTAL = ?, REMARKS = ?, ENCODED_BY = ?
                WHERE id = ?`,
          args: [
            formData.particulars,
            formData.addresse,
            transmitterName,
            formData.section,
            formData.modeOfTransmittal,
            formData.remarks,
            encodedBy,
            editingId
          ]
        });

        const refResult = await turso.execute({
          sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE id = ?`,
          args: [editingId]
        });
        generatedRef = refResult.rows[0].REFERENCE_NUMBER;
      } else if (referenceOverride) {
        if (timestampOverride) {
          await turso.execute({
            sql: `INSERT INTO Digital_Logbook (
                    REFERENCE_NUMBER, Timestamp, PARTICULARS, ADDRESSE, 
                    TRANSMITTER, SECTION, MODE_OF_TRANSMITTAL, 
                    REMARKS, ENCODED_BY
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              referenceOverride,
              timestampOverride,
              formData.particulars,
              formData.addresse,
              transmitterName,
              formData.section,
              formData.modeOfTransmittal,
              formData.remarks,
              encodedBy
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
              referenceOverride,
              formData.particulars,
              formData.addresse,
              transmitterName,
              formData.section,
              formData.modeOfTransmittal,
              formData.remarks,
              encodedBy
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
            formData.particulars,
            formData.addresse,
            transmitterName,
            formData.section,
            formData.modeOfTransmittal,
            formData.remarks,
            encodedBy
          ]
        });

        const refResult = await turso.execute({
          sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE id = ?`,
          args: [Number(insertResult.lastInsertRowid)]
        });
        generatedRef = refResult.rows[0].REFERENCE_NUMBER;
      }

      if (formData.section && formData.section.trim() !== '') {
        await turso.execute({
          sql: `INSERT OR IGNORE INTO Sections (name) VALUES (?)`,
          args: [formData.section.trim()]
        });
      }

      if (formData.addresse && formData.addresse.trim() !== '') {
        await turso.execute({
          sql: `INSERT OR IGNORE INTO Addressees (name) VALUES (?)`,
          args: [formData.addresse.trim()]
        });
      }

      if (formData.modeOfTransmittal && formData.modeOfTransmittal.trim() !== '') {
        await turso.execute({
          sql: `INSERT OR IGNORE INTO TransmittalModes (name) VALUES (?)`,
          args: [formData.modeOfTransmittal.trim()]
        });
      }

      // Clear form on success
      setFormData({
        particulars: '',
        addresse: '',
        section: '',
        modeOfTransmittal: '',
        remarks: ''
      });
      setIsReviewing(false);
      setSavedReference(generatedRef);
      fetchEntries(); // Refresh the list
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
    setShowForm(true);
  };

  const handleInsertEntry = async (entry) => {
    setActiveMenuId(null);
    setEditingId(null); // Ensure we are inserting, not editing

    // Find next alphabet character for this reference number
    const baseRef = entry.REFERENCE_NUMBER.replace(/[A-Z]$/, '');

    try {
      const res = await turso.execute({
        sql: `SELECT REFERENCE_NUMBER FROM Digital_Logbook WHERE REFERENCE_NUMBER LIKE ?`,
        args: [`${baseRef}%`]
      });

      const existing = res.rows.map(r => r.REFERENCE_NUMBER);
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
      <div key={entry.id} className="relative p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col gap-3 hover:bg-teal-50/50 hover:border-teal-300 hover:shadow-md transition-all duration-200 cursor-pointer"
        onClick={() => setActiveMenuId(activeMenuId === entry.id ? null : entry.id)}
      >
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 mb-2">
              Reference Number: {entry.REFERENCE_NUMBER}
            </span>
            <h3 className="font-semibold text-slate-900">{entry.PARTICULARS}</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {entry.Timestamp}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === entry.id ? null : entry.id); }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </button>
          </div>
        </div>

        {activeMenuId === entry.id && (
          <div className="absolute right-4 top-14 mt-2 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              {entry.ENCODED_BY === (user?.primaryEmailAddress?.emailAddress || user?.fullName || user?.id) && (
                <button
                  onClick={() => handleEditEntry(entry)}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                  <svg className="size-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit Record
                </button>
              )}
              {['PACD', 'Admin', 'Super Admin'].includes(userRole) && (
                <button
                  onClick={() => handleInsertEntry(entry)}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                  <svg className="size-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Insert Record
                </button>
              )}                        </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm mt-2">
          {entry.ADDRESSE && <div><span className="text-slate-500 block text-xs uppercase tracking-wider mb-0.5">To</span> <span className="font-medium text-slate-700">{entry.ADDRESSE}</span></div>}
          {entry.TRANSMITTER && <div><span className="text-slate-500 block text-xs uppercase tracking-wider mb-0.5">From</span> <span className="font-medium text-slate-700">{entry.TRANSMITTER}</span></div>}
          {entry.SECTION && <div><span className="text-slate-500 block text-xs uppercase tracking-wider mb-0.5">Section</span> <span className="font-medium text-slate-700">{entry.SECTION}</span></div>}
          {entry.MODE_OF_TRANSMITTAL && <div><span className="text-slate-500 block text-xs uppercase tracking-wider mb-0.5">Mode</span> <span className="font-medium text-slate-700">{entry.MODE_OF_TRANSMITTAL}</span></div>}
        </div>

        {(entry.REMARKS || entry.ENCODED_BY) && (
          <div className="mt-2 pt-3 border-t border-slate-200 flex justify-between items-end gap-4 text-xs">
            <div className="text-slate-600 flex-1">
              {entry.REMARKS && <><span className="font-medium text-slate-500">Remarks:</span> {entry.REMARKS}</>}
            </div>
            <div className="text-slate-400 text-right shrink-0">
              Encoded by: <span className="font-medium">{entry.ENCODED_BY}</span>
            </div>
          </div>
        )}
      </div>
    ));
  }, [entries, searchQuery, displayYear, activeMenuId, userRole, user]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          Digital Logbook
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div className="p-2 w-full flex-1 flex flex-col gap-8 min-h-0">

        {/* Modal Overlay for Form */}
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-slate-50 rounded-xl shadow-2xl border border-slate-200 p-6 w-full max-w-2xl my-8 relative">

              <button
                onClick={handleCloseForm}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>

              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="text-2xl">{isReviewing ? '🔍' : '✍️'}</span> {isReviewing ? 'Review Entry' : referenceOverride ? `Insert as ${referenceOverride}` : editingId ? 'Edit Entry' : 'New Entry'}
              </h2>

              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm">
                  <div className="font-semibold mb-1">Error</div>
                  <div>{error}</div>
                </div>
              )}

              {savedReference ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Entry Saved!</h3>
                  <p className="text-slate-600 mb-6">Your logbook entry was successfully saved.</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 w-full max-w-sm mb-8">
                    <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Reference Number</div>
                    <div className="text-3xl font-mono font-bold text-teal-700">{savedReference}</div>
                  </div>
                  <button
                    onClick={handleCloseForm}
                    className="px-8 py-3 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition-colors w-full max-w-sm"
                  >
                    Done
                  </button>
                </div>
              ) : isReviewing ? (
                <div className="flex flex-col gap-4">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Receipt Details</h3>
                    <div className="space-y-3">
                      {referenceOverride && (
                        <div>
                          <span className="block text-xs text-slate-400">Reference Number</span>
                          <span className="font-medium text-slate-900">{referenceOverride}</span>
                        </div>
                      )}
                      <div>
                        <span className="block text-xs text-slate-400">Section</span>
                        <span className="font-medium text-slate-900">{formData.section || <span className="italic text-slate-400">None</span>}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400">Addressee</span>
                        <span className="font-medium text-slate-900">{formData.addresse || <span className="italic text-slate-400">None</span>}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400">Transmitter</span>
                        <span className="font-medium text-slate-900">{transmitterName}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400">Mode of Transmittal</span>
                        <span className="font-medium text-slate-900">{formData.modeOfTransmittal || <span className="italic text-slate-400">None</span>}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400">Particulars</span>
                        <span className="font-medium text-slate-900 whitespace-pre-wrap">{formData.particulars}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400">Remarks</span>
                        <span className="font-medium text-slate-900 whitespace-pre-wrap">{formData.remarks || <span className="italic text-slate-400">None</span>}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsReviewing(false)}
                      className="px-6 py-2.5 text-slate-600 font-medium rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSave}
                      disabled={!turso || isSubmitting}
                      className="px-6 py-2.5 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? 'Saving...' : 'Confirm & Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
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
                            className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>

                        {isDropdownOpen && (
                          <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                            <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                              {sectionsList.filter(sec => sec.name.toLowerCase().includes((formData.section || "").toLowerCase())).map((sec) => (
                                <li
                                  key={sec.id}
                                  onClick={() => { handleInputChange({ target: { name: 'section', value: sec.name } }); setIsDropdownOpen(false); }}
                                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
                                >
                                  {sec.name}
                                </li>
                              ))}

                              {!sectionsList.some(sec => sec.name.toLowerCase() === (formData.section || "").trim().toLowerCase()) && (formData.section || "").trim() !== "" && (
                                <li
                                  onMouseDown={(e) => { e.preventDefault(); setIsDropdownOpen(false); }}
                                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50 text-teal-600 font-semibold border-t border-slate-100 mt-1"
                                >
                                  + Create "{(formData.section || "").trim()}"
                                </li>
                              )}

                              {(formData.section || "").trim() === "" && (
                                <li
                                  onMouseDown={(e) => e.preventDefault()}
                                  className="select-none relative py-2 pl-3 pr-9 text-slate-500 italic text-sm border-t border-slate-100 mt-1 cursor-default"
                                >
                                  Type to add a new section...
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Addressee</label>
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
                            className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <button type="button" onClick={() => setIsAddresseeDropdownOpen(!isAddresseeDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isAddresseeDropdownOpen ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>

                        {isAddresseeDropdownOpen && (
                          <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                            <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                              {addresseesList.filter(add => add.name.toLowerCase().includes((formData.addresse || "").toLowerCase())).map((add) => (
                                <li
                                  key={add.id}
                                  onClick={() => { handleInputChange({ target: { name: 'addresse', value: add.name } }); setIsAddresseeDropdownOpen(false); }}
                                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
                                >
                                  {add.name}
                                </li>
                              ))}

                              {!addresseesList.some(add => add.name.toLowerCase() === (formData.addresse || "").trim().toLowerCase()) && (formData.addresse || "").trim() !== "" && (
                                <li
                                  onMouseDown={(e) => { e.preventDefault(); setIsAddresseeDropdownOpen(false); }}
                                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50 text-teal-600 font-semibold border-t border-slate-100 mt-1"
                                >
                                  + Create "{(formData.addresse || "").trim()}"
                                </li>
                              )}

                              {(formData.addresse || "").trim() === "" && (
                                <li
                                  onMouseDown={(e) => e.preventDefault()}
                                  className="select-none relative py-2 pl-3 pr-9 text-slate-500 italic text-sm border-t border-slate-100 mt-1 cursor-default"
                                >
                                  Type to add a new addressee...
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mode of Transmittal</label>
                    <div className={`relative ${isTransmittalDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
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
                          placeholder="Type or select mode..."
                          className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <button type="button" onClick={() => setIsTransmittalDropdownOpen(!isTransmittalDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isTransmittalDropdownOpen ? 'rotate-180' : ''}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>

                      {isTransmittalDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                          <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                            {transmittalModesList.filter(mod => mod.name.toLowerCase().includes((formData.modeOfTransmittal || "").toLowerCase())).map((mod) => (
                              <li
                                key={mod.id}
                                onClick={() => { handleInputChange({ target: { name: 'modeOfTransmittal', value: mod.name } }); setIsTransmittalDropdownOpen(false); }}
                                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
                              >
                                {mod.name}
                              </li>
                            ))}

                            {!transmittalModesList.some(mod => mod.name.toLowerCase() === (formData.modeOfTransmittal || "").trim().toLowerCase()) && (formData.modeOfTransmittal || "").trim() !== "" && (
                              <li
                                onMouseDown={(e) => { e.preventDefault(); setIsTransmittalDropdownOpen(false); }}
                                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50 text-teal-600 font-semibold border-t border-slate-100 mt-1"
                              >
                                + Create "{(formData.modeOfTransmittal || "").trim()}"
                              </li>
                            )}

                            {(formData.modeOfTransmittal || "").trim() === "" && (
                              <li
                                onMouseDown={(e) => e.preventDefault()}
                                className="select-none relative py-2 pl-3 pr-9 text-slate-500 italic text-sm border-t border-slate-100 mt-1 cursor-default"
                              >
                                Type to add a new mode...
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Particulars</label>
                    <textarea required name="particulars" value={formData.particulars} onChange={handleInputChange} rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 resize-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                    <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 resize-none" />
                  </div>

                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleCloseForm}
                      className="px-6 py-2.5 text-slate-600 font-medium rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition-colors"
                    >
                      Review Entry
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Entries List (Full Width) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col min-h-0">

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search logs..."
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
                  />
                </div>

                <div className={`relative ${isDisplayYearDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsDisplayYearDropdownOpen(false);
                  }
                }}>
                  <div className="relative cursor-pointer" onClick={() => setIsDisplayYearDropdownOpen(!isDisplayYearDropdownOpen)}>
                    <input
                      type="text"
                      readOnly
                      value={displayYear === 'All' ? 'All Years' : displayYear}
                      className="w-32 px-3 py-2 pr-8 border border-slate-300 bg-white text-slate-900 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    />
                    <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 transition-transform duration-200 ${isDisplayYearDropdownOpen ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {isDisplayYearDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                      <ul className="max-h-60 overflow-auto py-1 text-sm text-slate-700">
                        <li
                          onClick={() => { setDisplayYear('All'); setIsDisplayYearDropdownOpen(false); }}
                          className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
                        >
                          All Years
                        </li>
                        {availableYears.map((y) => (
                          <li
                            key={y}
                            onClick={() => { setDisplayYear(y); setIsDisplayYearDropdownOpen(false); }}
                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
                          >
                            {y}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export
                </button>
                {['PACD', 'Admin', 'Super Admin'].includes(userRole) && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    New Entry
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {loading ? (
                <div className="flex justify-center items-center h-32 text-slate-400">Loading records...</div>
              ) : entries.length > 0 ? (
                renderedEntries
              ) : (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                  <p>No records found.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-xl font-bold text-slate-900 mb-4">Export Logbook</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Filter Type</label>
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
                      className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    />
                    <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isExportFilterDropdownOpen ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {isExportFilterDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                      <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                        {['All', 'Year', 'Month'].map((type) => (
                          <li
                            key={type}
                            onClick={() => { setExportFilterType(type); setIsExportFilterDropdownOpen(false); }}
                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
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
                        className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                      />
                      <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isExportYearDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                    {isExportYearDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                        <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                          {availableYears.map((y) => (
                            <li
                              key={y}
                              onClick={() => { setExportYear(y); setIsExportYearDropdownOpen(false); }}
                              className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
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
                        className="w-full px-3 py-2 pr-10 border border-slate-300 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                      />
                      <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 focus:outline-none pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isExportMonthDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                    {isExportMonthDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
                        <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700">
                          {[
                            { val: "01", label: "January" }, { val: "02", label: "February" }, { val: "03", label: "March" },
                            { val: "04", label: "April" }, { val: "05", label: "May" }, { val: "06", label: "June" },
                            { val: "07", label: "July" }, { val: "08", label: "August" }, { val: "09", label: "September" },
                            { val: "10", label: "October" }, { val: "11", label: "November" }, { val: "12", label: "December" }
                          ].map((m) => (
                            <li
                              key={m.val}
                              onClick={() => { setExportMonth(m.val); setIsExportMonthDropdownOpen(false); }}
                              className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-50"
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

              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleExportCSV} className="px-4 py-2 bg-teal-600 text-white font-medium hover:bg-teal-700 rounded-lg transition-colors flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
