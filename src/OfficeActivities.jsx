import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';
export default function OfficeActivities() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [activities, setActivities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  // Modal and Form States
  const [currentTab, setCurrentTab] = useState('active');
  const [archiveFilter, setArchiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [activityToDelete, setActivityToDelete] = useState(null);
  const [activityToCancel, setActivityToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showNoAttachmentWarning, setShowNoAttachmentWarning] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    assigned_to: ['All'],
    status: 'Pending',
    attachment: null
  });
  const [attachmentError, setAttachmentError] = useState('');

  useEffect(() => {
    const initAndFetch = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) return;
      const email = user.primaryEmailAddress.emailAddress;
      try {
        setLoading(true);
        const token = await getToken();
        const res = await fetch(`/api/activities?email=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch activities data");
        const data = await res.json();

        if (data.user) {
          const u = data.user;
          const role = u.Role;
          setUserRole(role);
          const currentIsAdmin = role === 'Admin' || role === 'Super Admin';
          setIsAdmin(currentIsAdmin);
          if (u.First_Name && u.Last_Name) {
            setCurrentUserDisplayName(`${u.First_Name} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name}`.trim());
          }
        }

        setEmployees(data.employees || []);
        setActivities(data.activities || []);
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
      const email = user.primaryEmailAddress.emailAddress;
      const token = await getToken();

      let res;
      if (editingActivityId) {
        res = await fetch('/api/activities', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'updateActivity', id: editingActivityId, formData })
        });
      } else {
        res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ email, formData })
        });
      }

      const data = await res.json();
      if (data.success) {
        setActivities(data.activities || []);

        if (!editingActivityId) {
          if (data.failedEmails && data.failedEmails > 0) {
            setAlertConfig({ message: `Activity saved, but failed to send ${data.failedEmails} email notifications.`, type: 'info' });
          } else {
            setAlertConfig({ message: 'Activity saved successfully!', type: 'success' });
          }
        } else {
          setAlertConfig({ message: 'Activity updated successfully!', type: 'success' });
        }
      } else {
        throw new Error(data.error || "API Error");
      }
      handleCloseModal();
    } catch (err) {
      console.error("Error saving activity:", err);
      setAlertConfig({ message: "Failed to save activity.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProceedToReview = (e) => {
    e.preventDefault();
    if (!formData.description || formData.description.trim() === '') {
      setAlertConfig({ message: "Description is required.", type: 'info' });
      return;
    }
    if (formData.assigned_to.length === 0) {
      setAlertConfig({ message: "Please assign at least one person.", type: 'info' });
      return;
    }
    if (!formData.attachment && !editingActivityId) {
      setShowNoAttachmentWarning(true);
    } else {
      setModalStep(2);
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setModalStep(1);
    setAssigneeSearchTerm('');
    setEmailProgress({ current: 0, total: 0 });
    setEditingActivityId(null);
    setFormData({
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      assigned_to: ['All'],
      status: 'Pending',
      attachment: null
    });
    setAttachmentError('');
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const token = await getToken();
      await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'updateStatus', id, status: newStatus })
      });
      setActivities(prev => prev.map(act => act.id === id ? { ...act, status: newStatus } : act));
    } catch (err) {
      console.error("Error updating status:", err);
      setAlertConfig({ message: "Failed to update status.", type: 'error' });
    }
  };

  const executeDeleteActivity = async () => {
    if (!activityToDelete) return;
    try {
      const token = await getToken();
      await fetch(`/api/activities?id=${activityToDelete.id}&title=${encodeURIComponent(activityToDelete.title)}&start_date=${encodeURIComponent(activityToDelete.start_date)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setActivities(prev => prev.filter(act => act.id !== activityToDelete.id));
      setActivityToDelete(null);
      setAlertConfig({ message: 'Activity deleted successfully!', type: 'success' });
    } catch (err) {
      console.error("Error deleting activity:", err);
      setAlertConfig({ message: "Failed to delete activity.", type: 'error' });
    }
  };

  const handleDeleteActivity = (act) => {
    setActivityToDelete(act);
  };

  const confirmCancelActivity = async () => {
    if (!activityToCancel) return;
    if (!cancelReason.trim()) {
      setAlertConfig({ message: 'Please provide a reason for cancellation.', type: 'info' });
      return;
    }
    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'cancelActivity',
          id: activityToCancel.id,
          reason: cancelReason,
          title: activityToCancel.title,
          start_date: activityToCancel.start_date,
          assigned_to: activityToCancel.assigned_to
        })
      });
      const data = await res.json();
      if (data.success) {
        setActivities(data.activities || []);
        setAlertConfig({ message: 'Activity canceled successfully!', type: 'success' });
        setActivityToCancel(null);
      } else {
        throw new Error(data.error || "API Error");
      }
    } catch (err) {
      console.error("Error canceling activity:", err);
      setAlertConfig({ message: "Failed to cancel activity.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
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
      status: act.status,
      attachment: null
    });
    setAttachmentError('');
    setEditingActivityId(act.id);
    setModalStep(1);
    setIsAddModalOpen(true);
  };

  const toggleAssignee = (emp) => {
    setFormData(prev => {
      let updated = [...prev.assigned_to];
      if (emp === 'All') {
        if (updated.includes('All')) {
          updated = []; // Toggle off All
        } else {
          updated = ['All']; // Toggle on All
        }
      } else {
        updated = updated.filter(a => a !== 'All'); // Remove 'All' if a specific person is selected
        if (updated.includes(emp)) {
          updated = updated.filter(a => a !== emp);
        } else {
          updated.push(emp);
        }
      }
      return { ...prev, assigned_to: updated };
    });
  };

  const handleFileChange = (e) => {
    setAttachmentError('');
    const file = e.target.files?.[0];
    if (!file) {
      setFormData(prev => ({ ...prev, attachment: null }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAttachmentError('File size exceeds 5MB limit.');
      setFormData(prev => ({ ...prev, attachment: null }));
      e.target.value = null;
      return;
    }

    const allowedExts = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setAttachmentError('Invalid file type. Allowed: PDF, DOCX, XLSX, PNG, JPG.');
      setFormData(prev => ({ ...prev, attachment: null }));
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({
        ...prev,
        attachment: {
          name: file.name,
          size: file.size,
          type: file.type,
          base64: event.target.result
        }
      }));
    };
    reader.onerror = () => {
      setAttachmentError('Failed to read file.');
      setFormData(prev => ({ ...prev, attachment: null }));
    };
    reader.readAsDataURL(file);
  };

  const getInitials = (name) => {
    if (!name || name === 'All') return 'ALL';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarBg = (name) => {
    if (name === 'All') return 'bg-teal-600 text-white';
    const palettes = [
      'bg-emerald-600 text-white',
      'bg-blue-600 text-white',
      'bg-indigo-600 text-white',
      'bg-violet-600 text-white',
      'bg-rose-600 text-white',
      'bg-amber-600 text-white',
      'bg-cyan-600 text-white',
      'bg-teal-700 text-white',
    ];
    let sum = 0;
    for (let i = 0; i < (name || '').length; i++) {
      sum += name.charCodeAt(i);
    }
    return palettes[sum % palettes.length];
  };

  const getDurationText = (start, end) => {
    if (!start) return '';
    if (!end || start === end) return '1-day event';
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (isNaN(d1) || isNaN(d2)) return '';
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} days`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Canceled': return 'bg-red-100 text-red-700 border-red-200';
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
  const pastPending = [];
  const finished = [];

  const todayDate = new Date();
  const tzOffset = todayDate.getTimezoneOffset() * 60000;
  const todayYMD = new Date(todayDate.getTime() - tzOffset).toISOString().split('T')[0];

  filteredActivities.forEach(act => {
    const s = act.start_date;
    const e = act.end_date || act.start_date;

    if (act.status === 'Completed' || act.status === 'Canceled') {
      finished.push(act);
    } else if (e < todayYMD) {
      pastPending.push(act);
    } else if (s > todayYMD) {
      upcoming.push(act);
    } else {
      ongoing.push(act);
    }
  });

  const filteredArchived = finished.filter(act => {
    if (archiveFilter === 'all') return true;
    if (archiveFilter === 'Completed') return act.status === 'Completed';
    if (archiveFilter === 'Canceled') return act.status === 'Canceled';
    return true;
  });

  const renderActivityCard = (act) => {
    let assignedArray = [];
    try { assignedArray = JSON.parse(act.assigned_to); } catch (e) { }
    const isAll = assignedArray.includes('All');

    const isCreator = act.created_by === currentUserDisplayName || act.created_by === user?.primaryEmailAddress?.emailAddress || act.created_by === user?.fullName;

    const s = act.start_date;
    const e = act.end_date || act.start_date;
    let displayStatus = act.status;

    if (act.status !== 'Completed' && act.status !== 'Canceled') {
      if (todayYMD >= s && todayYMD <= e) {
        displayStatus = 'In Progress';
      } else if (todayYMD > e) {
        displayStatus = 'Pending';
      }
    }

    const canEdit = displayStatus !== 'Completed' && displayStatus !== 'Canceled' && isCreator;
    const canDelete = isCreator || isAdmin;
    const canUpdateStatus = isAdmin || isCreator;

    return (
      <div key={act.id} className="w-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(displayStatus)}`}>
              {displayStatus}
            </span>
            {(canEdit || canDelete) && (
              <div className="flex gap-2">
                {canEdit && (
                  <button onClick={() => handleEditActivity(act)} title="Edit Activity" className="text-blue-400 hover:text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDeleteActivity(act)} title="Delete Activity" className="text-red-400 hover:text-red-600 p-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            )}
          </div>

          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 break-words">{act.title}</h4>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {act.start_date === act.end_date || !act.end_date
              ? formatDate(act.start_date)
              : `${formatDate(act.start_date)} - ${formatDate(act.end_date)}`}
          </div>

          {act.description && (
            <p className={`text-sm text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed ${act.status === 'Canceled' && act.cancel_reason ? 'mb-3' : 'mb-6'}`}>{act.description}</p>
          )}

          {act.status === 'Canceled' && act.cancel_reason && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1 block">Cancellation Reason</span>
              <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{act.cancel_reason}</p>
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col min-w-0 group/assigned relative cursor-pointer sm:cursor-auto" tabIndex="0" onClick={() => { }}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Assigned To</span>
              <span
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md inline-block max-w-[200px] truncate sm:cursor-help"
                title={isAll ? "Everyone" : assignedArray.join(', ')}
              >
                {isAll ? "Everyone" : assignedArray.join(', ')}
              </span>
              {/* Mobile Tooltip on tap */}
              <div className="absolute left-0 bottom-full mb-2 hidden group-focus/assigned:block sm:!hidden w-[85vw] max-w-[250px] p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl z-20 whitespace-normal break-words pointer-events-none">
                <span className="font-bold text-slate-400 block mb-1 uppercase tracking-wider text-[10px]">Assigned To:</span>
                {isAll ? "Everyone" : assignedArray.join(', ')}
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end shrink-0 max-w-full sm:max-w-[200px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Created By</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate w-full sm:text-right">{act.created_by}</span>
            </div>
          </div>
        </div>

        {/* Status Actions */}
        {canUpdateStatus && (
          <div className="bg-slate-50/80 dark:bg-slate-800/80 px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 justify-end">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2">Update Status:</span>
            <div className="relative group/status">
              <div className="flex items-center gap-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-1.5 pl-3 pr-2 rounded-lg shadow-sm cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${displayStatus === 'Completed' ? 'bg-emerald-500' : displayStatus === 'Canceled' ? 'bg-red-500' : displayStatus === 'In Progress' ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                  {displayStatus}
                </div>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>

              <div className="absolute right-0 bottom-full pb-2 hidden group-hover/status:flex flex-col w-36 z-30">
                <div className="flex flex-col w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] overflow-hidden pb-1">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 mb-1">Set Status</div>
                  {['Pending', 'In Progress', 'Completed', 'Canceled'].map(st => (
                    <button
                      key={st}
                      onClick={() => {
                        if (st === 'Canceled') {
                          setActivityToCancel(act);
                          setCancelReason('');
                        } else {
                          handleUpdateStatus(act.id, st);
                        }
                      }}
                      className={`text-left w-full px-3 py-2 text-xs font-bold transition-all border-l-2 ${displayStatus === st ? 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white border-teal-500' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full shadow-sm ${st === 'Completed' ? 'bg-emerald-500' : st === 'Canceled' ? 'bg-red-500' : st === 'In Progress' ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                        {st}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Office Activities
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Schedule, track, and assign office events and activities
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-2 pb-2 pt-4 min-h-0">
        <div className="w-full h-full flex flex-col gap-6 min-h-0">

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium shrink-0">
              {error}
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  placeholder="Search activities or assignees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCurrentTab('active')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${currentTab === 'active'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Active</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${currentTab === 'active' ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {ongoing.length + upcoming.length + pastPending.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('archive')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${currentTab === 'archive'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <span>Archive</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${currentTab === 'archive' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {finished.length}
                  </span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all whitespace-nowrap shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Activity
            </button>
          </div>

          {/* Activities Content Area */}
          {loading ? (
            <Loading type="grid" />
          ) : currentTab === 'active' ? (
            <div className="flex-1 overflow-y-auto pr-1 pb-10 flex flex-col gap-6">
              {/* For Status Update Container (Past Pending Activities) */}
              {pastPending.length > 0 && (
                <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200/80 dark:border-amber-800/60">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                          For Status Update
                        </h3>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                          Concluded activities awaiting status update to Completed or Canceled.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      {pastPending.length} {pastPending.length === 1 ? 'Activity' : 'Activities'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pastPending.map(renderActivityCard)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Today Container */}
                <div className="bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                      </span>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        Today
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
                      {ongoing.length} {ongoing.length === 1 ? 'Activity' : 'Activities'}
                    </span>
                  </div>

                  {ongoing.length === 0 ? (
                    <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No activities today</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">There are no ongoing office activities scheduled for today.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {ongoing.map(renderActivityCard)}
                    </div>
                  )}
                </div>

                {/* Incoming / Upcoming Container */}
                <div className="bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        Incoming Activities
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                      {upcoming.length} {upcoming.length === 1 ? 'Activity' : 'Activities'}
                    </span>
                  </div>

                  {upcoming.length === 0 ? (
                    <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No incoming activities</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">No upcoming activities have been scheduled yet.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {upcoming.map(renderActivityCard)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Archive Tab View */
            <div className="flex-1 overflow-y-auto pr-1 pb-10 flex flex-col gap-5">
              {/* Filter sub-header */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Archive
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Completed and canceled office activities.
                  </p>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'All Archive', count: finished.length },
                    { id: 'Completed', label: 'Completed', count: finished.filter(a => a.status === 'Completed').length },
                    { id: 'Canceled', label: 'Canceled', count: finished.filter(a => a.status === 'Canceled').length },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setArchiveFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${archiveFilter === tab.id
                        ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${archiveFilter === tab.id
                        ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-800 font-bold'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Archive List */}
              {filteredArchived.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">No Archived Activities</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">No activities found in the archive matching this filter.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredArchived.map(renderActivityCard)}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Add / Edit Activity Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 transform transition-all">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                    {editingActivityId ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                      {editingActivityId ? 'Edit Office Activity' : 'Assign New Activity'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {editingActivityId ? 'Update schedule and assigned staff members' : 'Schedule an activity and dispatch notifications to staff'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Progress Stepper Bar */}
              <div className="flex items-center gap-2 pt-1">
                <div className={`flex-1 flex items-center gap-2 pb-1.5 border-b-2 transition-all ${modalStep === 1 ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-400 font-medium'}`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${modalStep === 1 ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>1</span>
                  <span className="text-xs">Activity Details</span>
                </div>
                <div className={`flex-1 flex items-center gap-2 pb-1.5 border-b-2 transition-all ${modalStep === 2 ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-400 font-medium'}`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${modalStep === 2 ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>2</span>
                  <span className="text-xs">Review & Confirm</span>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {modalStep === 1 ? (
                <form id="add-activity-form" onSubmit={handleProceedToReview} className="flex flex-col gap-6">
                  
                  {/* Activity Title */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      <span>Activity Title <span className="text-rose-500">*</span></span>
                    </label>
                    <div className="relative">
                      <textarea
                        required
                        rows="2"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 text-slate-900 dark:text-slate-100 text-sm font-medium transition-all shadow-sm placeholder:text-slate-400 resize-y min-h-[58px]"
                        placeholder="e.g., Annual Strategic Planning & Team Building"
                      />
                    </div>
                  </div>

                  {/* Date Pickers with Duration Badge */}
                  <div className="bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Activity Schedule <span className="text-rose-500">*</span>
                      </span>
                      {formData.start_date && (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          {getDurationText(formData.start_date, formData.end_date)}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Start Date</label>
                        <input
                          required
                          type="date"
                          value={formData.start_date}
                          onChange={e => {
                            const newStart = e.target.value;
                            setFormData(prev => ({
                              ...prev,
                              start_date: newStart,
                              end_date: prev.end_date && prev.end_date < newStart ? newStart : prev.end_date || newStart
                            }));
                          }}
                          className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 text-slate-900 dark:text-slate-100 text-sm font-medium transition-all shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">End Date</label>
                        <input
                          required
                          type="date"
                          min={formData.start_date}
                          value={formData.end_date}
                          onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                          className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 text-slate-900 dark:text-slate-100 text-sm font-medium transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Assignees Selection Area */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Assign Attendees <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleAssignee('All')}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                          formData.assigned_to.includes('All')
                            ? 'bg-teal-500 text-white border-teal-600 shadow-sm shadow-teal-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${formData.assigned_to.includes('All') ? 'bg-white' : 'bg-slate-400'}`}></span>
                        <span>Assign to Everyone ({employees.length})</span>
                      </button>
                    </div>

                    {/* Search & Quick Action Toolbar */}
                    {!formData.assigned_to.includes('All') && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="relative flex-1">
                          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          <input
                            type="text"
                            placeholder="Search employee name..."
                            value={assigneeSearchTerm}
                            onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs text-slate-800 dark:text-slate-200"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, assigned_to: [...employees] }))}
                          className="px-2.5 py-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, assigned_to: [] }))}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* Employee Checklist Grid */}
                    <div className={`bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 max-h-52 overflow-y-auto custom-scrollbar transition-opacity ${
                      formData.assigned_to.includes('All') ? 'opacity-50 pointer-events-none' : ''
                    }`}>
                      {formData.assigned_to.includes('All') ? (
                        <div className="py-6 text-center text-xs font-bold text-teal-600 dark:text-teal-400 flex flex-col items-center gap-1">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          <span>All {employees.length} employees will be assigned</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).map(emp => {
                            const isChecked = formData.assigned_to.includes(emp);
                            return (
                              <label
                                key={emp}
                                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all border ${
                                  isChecked
                                    ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-400/80 dark:border-teal-700 shadow-sm'
                                    : 'bg-white dark:bg-slate-800/80 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs shadow-sm ${getAvatarBg(emp)}`}>
                                  {getInitials(emp)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-semibold truncate ${isChecked ? 'text-teal-900 dark:text-teal-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {emp}
                                  </p>
                                </div>
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  isChecked ? 'bg-teal-500 border-teal-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}>
                                  {isChecked && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  )}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleAssignee(emp)}
                                  className="sr-only"
                                />
                              </label>
                            );
                          })}
                          {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).length === 0 && (
                            <div className="col-span-2 py-4 text-center text-xs text-slate-400 italic">
                              No employees matching "{assigneeSearchTerm}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!formData.assigned_to.includes('All') && formData.assigned_to.length > 0 && (
                      <p className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 mt-1.5">
                        ✓ {formData.assigned_to.length} {formData.assigned_to.length === 1 ? 'person' : 'people'} selected
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Activity Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows="3"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 text-slate-900 dark:text-slate-100 text-sm font-medium resize-none shadow-sm placeholder:text-slate-400"
                      placeholder="Provide specific guidelines, agenda, objectives, venue, or attire requirements..."
                    />
                  </div>

                  {/* Attachment Dropzone */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Supporting Attachment <span className="text-slate-400 font-normal lowercase">(optional)</span>
                    </label>

                    {!formData.attachment ? (
                      <label className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-500/60 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex items-center justify-center mb-2 transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Click to upload or drag & drop file
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          PDF, DOCX, XLSX, PNG, JPG (Max 5MB)
                        </p>
                        <input
                          type="file"
                          onChange={handleFileChange}
                          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                          className="sr-only"
                        />
                      </label>
                    ) : (
                      <div className="bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-teal-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-teal-500/20">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {formData.attachment.name}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              {formatFileSize(formData.attachment.size)} • Ready to send
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, attachment: null }))}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors"
                          title="Remove attachment"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    )}
                    {attachmentError && <p className="text-rose-500 text-xs mt-1.5 font-bold">{attachmentError}</p>}
                  </div>

                  <input type="hidden" value={formData.status} />
                </form>
              ) : (
                /* Step 2: Review & Summary Screen */
                <div className="flex flex-col gap-4 animate-fadeIn">
                  
                  {/* Summary Banner Card */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-md flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-teal-400/20 text-teal-300 border border-teal-400/30">
                        {editingActivityId ? 'Activity Update' : 'New Activity'}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">
                        {getDurationText(formData.start_date, formData.end_date)}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-white break-words mt-1">
                      {formData.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {formData.start_date === formData.end_date || !formData.end_date
                        ? formatDate(formData.start_date)
                        : `${formatDate(formData.start_date)} - ${formatDate(formData.end_date)}`}
                    </div>
                  </div>

                  {/* Assigned Attendees Summary */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Assigned Attendees
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600">
                        {formData.assigned_to.includes('All') ? `Everyone (${employees.length})` : `${formData.assigned_to.length} selected`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                      {formData.assigned_to.map(emp => (
                        <div
                          key={emp}
                          className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-sm"
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${getAvatarBg(emp)}`}>
                            {getInitials(emp)}
                          </span>
                          <span>{emp === 'All' ? 'Everyone' : emp}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description Preview */}
                  {formData.description && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                        Description & Instructions
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Attachment Preview */}
                  {formData.attachment && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-500 text-white flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {formData.attachment.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatFileSize(formData.attachment.size)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Dispatch Notice Alert */}
                  <div className="p-3.5 bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 rounded-xl flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
                      Instant email notifications and personal calendar entries will automatically be dispatched to all assigned personnel upon confirmation.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              {modalStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-5 py-2.5 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="add-activity-form"
                    disabled={formData.assigned_to.length === 0}
                    className="flex items-center gap-2 px-6 py-2.5 font-bold text-xs text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-md hover:shadow-teal-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    <span>Review Details</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-5 py-2.5 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                    <span>Back to Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveActivity}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 font-bold text-xs text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-md hover:shadow-teal-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {isSaving ? (
                      <>
                        <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>{emailProgress.total > 0 ? `Sending (${emailProgress.current}/${emailProgress.total})...` : 'Saving Activity...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        <span>{editingActivityId ? 'Save Changes' : 'Confirm & Assign'}</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* No Attachment Warning Modal */}
      {showNoAttachmentWarning && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">No Attachment</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">You are proceeding without any supporting documents.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-3 shrink-0">
              <button onClick={() => setShowNoAttachmentWarning(false)} className="flex-1 py-2.5 font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 bg-red-50 dark:bg-red-900/20 rounded-xl transition-colors">Back to Edit</button>
              <button onClick={() => { setShowNoAttachmentWarning(false); setModalStep(2); }} className="flex-1 py-2.5 font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-sm transition-colors">Okay, Proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {activityToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Delete Activity?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Are you sure you want to delete <span className="font-bold text-slate-700 dark:text-slate-200">"{activityToDelete.title}"</span>?</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-3 shrink-0">
              <button onClick={() => setActivityToDelete(null)} className="flex-1 py-2.5 font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 bg-red-50 dark:bg-red-900/20 rounded-xl transition-colors">Cancel</button>
              <button onClick={executeDeleteActivity} className="flex-1 py-2.5 font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Activity Modal */}
      {activityToCancel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Cancel Activity?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Please provide a reason for canceling <span className="font-bold text-slate-700 dark:text-slate-200">"{activityToCancel.title}"</span>.</p>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Cancellation reason..."
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm text-slate-800 dark:text-slate-100 font-medium resize-none"
                rows="3"
                required
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-3 shrink-0">
              <button onClick={() => setActivityToCancel(null)} disabled={isSaving} className="flex-1 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">Back</button>
              <button onClick={confirmCancelActivity} disabled={isSaving || !cancelReason.trim()} className="flex-1 py-2.5 font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors disabled:opacity-50">
                {isSaving ? 'Canceling...' : 'Confirm'}
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
