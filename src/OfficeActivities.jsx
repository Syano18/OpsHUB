import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { turso } from './db';

export default function OfficeActivities() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const [activities, setActivities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal and Form States
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [activityToDelete, setActivityToDelete] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    assigned_to: ['All'],
    status: 'Pending'
  });

  useEffect(() => {
    const initAndFetch = async () => {
      if (!turso) {
        setError("Database connection not initialized.");
        setLoading(false);
        return;
      }
      if (!user?.primaryEmailAddress?.emailAddress) return;

      const email = user.primaryEmailAddress.emailAddress;

      try {
        setLoading(true);

        // 1. Fetch User Role & Name
        let role = null;
        let displayName = '';
        let currentIsAdmin = false;

        const roleRes = await turso.execute({
          sql: "SELECT Role, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE Email = ?",
          args: [email]
        });

        if (roleRes.rows.length > 0) {
          const u = roleRes.rows[0];
          role = u.Role;
          setUserRole(role);
          currentIsAdmin = role === 'Admin' || role === 'Super Admin';
          setIsAdmin(currentIsAdmin);

          if (u.First_Name && u.Last_Name) {
            displayName = `${u.First_Name} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name}`.trim();
            setCurrentUserDisplayName(displayName);
          }
        }

        // 2. Create Tables
        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Office_Activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            assigned_to TEXT NOT NULL,
            created_by TEXT NOT NULL,
            status TEXT DEFAULT 'Pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Personal_Calendar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            title TEXT NOT NULL,
            event_type TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Attempt migrations if table already existed with old schema
        try { await turso.execute("ALTER TABLE Office_Activities RENAME COLUMN activity_date TO start_date"); } catch (e) { }
        try { await turso.execute("ALTER TABLE Office_Activities ADD COLUMN end_date TEXT DEFAULT ''"); } catch (e) { }

        // 3. Fetch Employees for Dropdown (if Admin)
        if (currentIsAdmin) {
          const empRes = await turso.execute("SELECT First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE LOWER(Status) != 'inactive' OR Status IS NULL ORDER BY First_Name ASC");
          const uniqueEmps = new Set();
          empRes.rows.forEach(row => {
            if (row.First_Name && row.Last_Name) {
              const name = `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '. ' : ''}${row.Last_Name}`.trim();
              uniqueEmps.add(name);
            }
          });
          setEmployees(Array.from(uniqueEmps));
        }

        // 4. Fetch Activities
        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");

        setActivities(actRes.rows);

      } catch (err) {
        console.error("Error setting up Office Activities:", err);
        setError("Failed to load Office Activities.");
      } finally {
        setLoading(false);
      }
    };

    initAndFetch();
  }, [user]);

  const handleSaveActivity = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Store assigned_to as JSON string array
      const assignedJson = JSON.stringify(formData.assigned_to);
      const email = user.primaryEmailAddress.emailAddress;

      if (editingActivityId) {
        await turso.execute({
          sql: "UPDATE Office_Activities SET title = ?, description = ?, start_date = ?, end_date = ?, assigned_to = ?, status = ? WHERE id = ?",
          args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, formData.status, editingActivityId]
        });

        // Refetch
        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
        setActivities(actRes.rows);
      } else {
        await turso.execute({
          sql: `INSERT INTO Office_Activities (title, description, start_date, end_date, assigned_to, created_by, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [formData.title, formData.description, formData.start_date, formData.end_date, assignedJson, currentUserDisplayName || email, formData.status]
        });

        // Refetch
        const actRes = await turso.execute("SELECT * FROM Office_Activities ORDER BY start_date DESC, created_at DESC");
        setActivities(actRes.rows);

        // --- EMAIL NOTIFICATION LOGIC ---
        try {
          const assignedNames = formData.assigned_to;
          let emails = [];

          if (assignedNames.includes('All')) {
            const allRes = await turso.execute("SELECT Email FROM User_Permissions WHERE LOWER(Status) != 'inactive' OR Status IS NULL");
            emails = allRes.rows.map(r => r.Email).filter(Boolean);
          } else {
            const allRes = await turso.execute("SELECT Email, First_Name, Middle_Name, Last_Name FROM User_Permissions WHERE LOWER(Status) != 'inactive' OR Status IS NULL");
            emails = allRes.rows.filter(r => {
              const fullName = `${r.First_Name} ${r.Middle_Name ? r.Middle_Name.charAt(0) + '. ' : ''}${r.Last_Name}`.trim();
              return assignedNames.includes(fullName);
            }).map(r => r.Email).filter(Boolean);
          }

          if (emails.length > 0) {
            // --- ADD TO PERSONAL CALENDARS ---
            for (const assigneeEmail of emails) {
              try {
                await turso.execute({
                  sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [
                    assigneeEmail,
                    formData.title,
                    'Office Activity',
                    formData.start_date,
                    formData.end_date || formData.start_date,
                    formData.description
                  ]
                });
              } catch (calErr) {
                console.error("Failed to add to personal calendar for", assigneeEmail, calErr);
              }
            }
            // ---------------------------------

            setEmailProgress({ current: 0, total: emails.length });
            let sentCount = 0;
            let failedCount = 0;

            for (const email of emails) {
              try {
                const emailRes = await fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: email, // Sending to single email per iteration to track progress
                    subject: `New Activity Assigned: ${formData.title}`,
                    text: `You have been assigned to a new activity: ${formData.title}\nDates: ${formData.start_date} to ${formData.end_date || formData.start_date}\n\nDescription: ${formData.description}\n\n---\nPlease do not reply to this message. This is an automated notification from OpsHUB.`,
                    html: `
                      <div style="font-family: sans-serif; padding: 20px;">
                        <h2 style="color: #0f766e;">New Activity Assigned</h2>
                        <p><strong>Title:</strong> ${formData.title}</p>
                        <p><strong>Dates:</strong> ${formData.start_date} to ${formData.end_date || formData.start_date}</p>
                        <p><strong>Description:</strong></p>
                        <p style="white-space: pre-wrap;">${formData.description || 'No description provided.'}</p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;"><strong>Please do not reply to this email.</strong></p>
                        <p style="font-size: 12px; color: #64748b;">This is an automated notification from OpsHUB.</p>
                      </div>
                    `
                  })
                });
                const emailData = await emailRes.json();
                if (emailData.success) {
                  sentCount++;
                } else {
                  failedCount++;
                }
              } catch (err) {
                console.error("Failed to send email notification to:", email, err);
                failedCount++;
              }
              // Update progress state after each attempt
              setEmailProgress({ current: sentCount + failedCount, total: emails.length });
            }

            if (failedCount > 0) {
              alert(`Activity saved, but failed to send ${failedCount} out of ${emails.length} email notifications.`);
            }
          }
        } catch (emailErr) {
          console.error("Error triggering email notification:", emailErr);
        }
        // ---------------------------------
      }

      handleCloseModal();
    } catch (err) {
      console.error("Error saving activity:", err);
      alert("Failed to save activity.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProceedToReview = (e) => {
    e.preventDefault();
    if (formData.assigned_to.length === 0) {
      alert("Please assign at least one person.");
      return;
    }
    setModalStep(2);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setModalStep(1);
    setEmailProgress({ current: 0, total: 0 });
    setEditingActivityId(null);
    setFormData({
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      assigned_to: ['All'],
      status: 'Pending'
    });
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await turso.execute({
        sql: "UPDATE Office_Activities SET status = ? WHERE id = ?",
        args: [newStatus, id]
      });
      setActivities(prev => prev.map(act => act.id === id ? { ...act, status: newStatus } : act));
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status.");
    }
  };

  const executeDeleteActivity = async () => {
    if (!activityToDelete) return;
    try {
      await turso.execute({
        sql: "DELETE FROM Office_Activities WHERE id = ?",
        args: [activityToDelete.id]
      });
      setActivities(prev => prev.filter(act => act.id !== activityToDelete.id));
      setActivityToDelete(null);
    } catch (err) {
      console.error("Error deleting activity:", err);
      alert("Failed to delete activity.");
    }
  };

  const handleDeleteActivity = (act) => {
    setActivityToDelete(act);
  };

  const handleEditActivity = (act) => {
    let assigned = [];
    try {
      assigned = JSON.parse(act.assigned_to);
    } catch {
      assigned = ['All'];
    }
    setFormData({
      title: act.title,
      description: act.description || '',
      start_date: act.start_date,
      end_date: act.end_date || '',
      assigned_to: assigned,
      status: act.status
    });
    setEditingActivityId(act.id);
    setModalStep(1);
    setIsAddModalOpen(true);
  };

  const toggleAssignee = (emp) => {
    setFormData(prev => {
      let updated = [...prev.assigned_to];
      if (emp === 'All') {
        updated = ['All'];
      } else {
        updated = updated.filter(a => a !== 'All'); // Remove 'All' if a specific person is selected
        if (updated.includes(emp)) {
          updated = updated.filter(a => a !== emp);
        } else {
          updated.push(emp);
        }
        if (updated.length === 0) updated = ['All']; // fallback
      }
      return { ...prev, assigned_to: updated };
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200'; // Pending
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredActivities = activities.filter(act => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const titleMatch = act.title?.toLowerCase().includes(term);
    const descMatch = act.description?.toLowerCase().includes(term);
    const assignedMatch = act.assigned_to?.toLowerCase().includes(term);
    return titleMatch || descMatch || assignedMatch;
  });

  const ongoing = [];
  const upcoming = [];
  const finished = [];

  const todayDate = new Date();
  const tzOffset = todayDate.getTimezoneOffset() * 60000;
  const todayYMD = new Date(todayDate.getTime() - tzOffset).toISOString().split('T')[0];

  filteredActivities.forEach(act => {
    const s = act.start_date;
    const e = act.end_date || act.start_date;

    if (act.status === 'Completed' || e < todayYMD) {
      finished.push(act);
    } else if (s > todayYMD) {
      upcoming.push(act);
    } else {
      ongoing.push(act);
    }
  });

  const renderActivityCard = (act) => {
    let assignedArray = [];
    try { assignedArray = JSON.parse(act.assigned_to); } catch (e) { }
    const isAll = assignedArray.includes('All');

    return (
      <div key={act.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(act.status)}`}>
              {act.status}
            </span>
            {isAdmin && (
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEditActivity(act)} className="text-blue-400 hover:text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleDeleteActivity(act)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            )}
          </div>

          <h4 className="text-lg font-bold text-slate-800 mb-1">{act.title}</h4>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {act.start_date === act.end_date || !act.end_date
              ? formatDate(act.start_date)
              : `${formatDate(act.start_date)} - ${formatDate(act.end_date)}`}
          </div>

          {act.description && (
            <p className="text-sm text-slate-600 mb-6 line-clamp-3 leading-relaxed">{act.description}</p>
          )}

          <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Assigned To</span>
              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md inline-block max-w-[200px] truncate">
                {isAll ? "Everyone" : assignedArray.join(', ')}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Created By</span>
              <span className="text-xs font-medium text-slate-500">{act.created_by}</span>
            </div>
          </div>
        </div>

        {/* Status Actions for Admins */}
        {isAdmin && (
          <div className="bg-slate-50/80 px-6 py-3 border-t border-slate-100 flex items-center gap-2 justify-end">
            <span className="text-xs font-semibold text-slate-500 mr-2">Update Status:</span>
            <select
              value={act.status}
              onChange={(e) => handleUpdateStatus(act.id, e.target.value)}
              className="text-xs font-bold bg-white border border-slate-200 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none"
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Office Activities
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-2 pb-2 pt-4 min-h-0">
        <div className="w-full h-full flex flex-col gap-6 min-h-0">

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium shrink-0">
              {error}
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            <div className="relative flex-1 w-full max-w-md">
              <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search activities or assignees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              />
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center gap-2 shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                New Activity
              </button>
            )}
          </div>

          {/* Activities Grid */}
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400">Loading activities...</div>
          ) : filteredActivities.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">🎉</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">No Activities Found</h3>
              <p className="text-slate-500 max-w-sm">No office activities match your search.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-10 overflow-y-auto pr-2 pb-10">
              {ongoing.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-teal-700 flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
                    Today
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-6">
                    {ongoing.map(renderActivityCard)}
                  </div>
                </div>
              )}

              {upcoming.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-amber-600 flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    Upcoming
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-6">
                    {upcoming.map(renderActivityCard)}
                  </div>
                </div>
              )}

              {finished.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-500 flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                    Finished
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-6">
                    {finished.map(renderActivityCard)}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Add Activity Modal (Admin Only) */}
      {isAddModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800">Assign New Activity</h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {modalStep === 1 ? (
                <form id="add-activity-form" onSubmit={handleProceedToReview} className="flex flex-col gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Activity Title <span className="text-red-500">*</span></label>
                    <input required type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium" placeholder="E.g., Tree Planting Activity" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                      <input required type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">End Date <span className="text-red-500">*</span></label>
                      <input required type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Assign To <span className="text-red-500">*</span></label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto flex flex-col gap-2 shadow-inner">
                      <label className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm">
                        <input
                          type="checkbox"
                          checked={formData.assigned_to.includes('All')}
                          onChange={() => toggleAssignee('All')}
                          className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-sm font-bold text-slate-800">Assign to Everyone</span>
                      </label>
                      <div className="h-px bg-slate-200 my-1"></div>
                      {employees.map(emp => (
                        <label key={emp} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm">
                          <input
                            type="checkbox"
                            checked={formData.assigned_to.includes(emp)}
                            onChange={() => toggleAssignee(emp)}
                            className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                          />
                          <span className="text-sm font-medium text-slate-700">{emp}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                    <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows="3" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium resize-none" placeholder="Provide instructions or details..." />
                  </div>

                  <input type="hidden" value={formData.status} />
                </form>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Activity Title</h4>
                    <p className="text-slate-800 font-bold text-lg">{formData.title}</p>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Start Date</h4>
                      <p className="text-slate-800 font-semibold">{formatDate(formData.start_date)}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">End Date</h4>
                      <p className="text-slate-800 font-semibold">{formatDate(formData.end_date) || formatDate(formData.start_date)}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Assigned To</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.assigned_to.map(emp => (
                        <span key={emp} className="bg-white border border-slate-200 px-3 py-1.5 rounded-md text-xs font-bold text-slate-700 shadow-sm">
                          {emp === 'All' ? 'Everyone' : emp}
                        </span>
                      ))}
                    </div>
                  </div>
                  {formData.description && (
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Description</h4>
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{formData.description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              {modalStep === 1 ? (
                <>
                  <button type="button" onClick={handleCloseModal} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Cancel</button>
                  <button type="submit" form="add-activity-form" disabled={formData.assigned_to.length === 0} className="flex-1 py-2.5 font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors disabled:opacity-50">
                    Review Details
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setModalStep(1)} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Back to Edit</button>
                  <button type="button" onClick={handleSaveActivity} disabled={isSaving} className="flex-1 py-2.5 font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors disabled:opacity-50">
                    {isSaving
                      ? (emailProgress.total > 0 ? `Sending emails (${emailProgress.current}/${emailProgress.total})...` : 'Assigning...')
                      : 'Confirm & Assign'}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {activityToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Activity?</h3>
              <p className="text-slate-500 text-sm mb-1">Are you sure you want to delete <span className="font-bold text-slate-700">"{activityToDelete.title}"</span>?</p>
              <p className="text-slate-500 text-sm">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setActivityToDelete(null)} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button onClick={executeDeleteActivity} className="flex-1 py-2.5 font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
