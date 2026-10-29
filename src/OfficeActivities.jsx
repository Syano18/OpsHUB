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
  const [allEmployees, setAllEmployees] = useState([]);
  const [reads, setReads] = useState([]);
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
  const [isUnackModalOpen, setIsUnackModalOpen] = useState(false);
  const [hasAutoPrompted, setHasAutoPrompted] = useState(false);
  const [markingReadId, setMarkingReadId] = useState(null);
  const [receiptsModalAct, setReceiptsModalAct] = useState(null);
  const [receiptsSearchTerm, setReceiptsSearchTerm] = useState('');
  const [receiptsTabFilter, setReceiptsTabFilter] = useState('all');
  const [modalStep, setModalStep] = useState(1);
  const [activityToDelete, setActivityToDelete] = useState(null);
  const [activityToCancel, setActivityToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showNoAttachmentWarning, setShowNoAttachmentWarning] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [assignMode, setAssignMode] = useState('include'); // 'include' | 'exclude'
  const [excludedList, setExcludedList] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    assigned_to: [],
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
        setAllEmployees(data.allEmployees || []);
        setActivities(data.activities || []);
        setReads(data.reads || []);
      } catch (err) {
        console.error("Error setting up Office Activities:", err);
        setError("Failed to load Office Activities.");
      } finally {
        setLoading(false);
      }
    };

    initAndFetch();
  }, [user]);

  const normalizeStr = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const isUserAssigned = (act) => {
    if (!act || !act.assigned_to) return false;
    let assignedArray = [];
    try {
      assignedArray = JSON.parse(act.assigned_to);
    } catch (e) {
      return false;
    }
    if (!Array.isArray(assignedArray)) return false;
    if (assignedArray.includes('All')) return true;

    const userEmail = (user?.primaryEmailAddress?.emailAddress || '').toLowerCase();
    const currentName = currentUserDisplayName || user?.fullName || '';
    const normCurrentName = normalizeStr(currentName);

    return assignedArray.some(assigned => {
      const a = (assigned || '').trim();
      if (a.toLowerCase() === userEmail) return true;
      if (currentName && a.toLowerCase() === currentName.toLowerCase()) return true;
      const normA = normalizeStr(a);
      if (normA && normCurrentName && (normA === normCurrentName || normCurrentName.includes(normA) || normA.includes(normCurrentName))) {
        return true;
      }
      const matchedEmp = allEmployees.find(e =>
        e.name.toLowerCase() === a.toLowerCase() ||
        normalizeStr(e.name) === normA
      );
      if (matchedEmp && matchedEmp.email && matchedEmp.email.toLowerCase() === userEmail) {
        return true;
      }
      return false;
    });
  };

  const getUserReadRecord = (actId) => {
    if (!reads || !Array.isArray(reads)) return null;
    const userEmail = (user?.primaryEmailAddress?.emailAddress || '').toLowerCase();
    const currentName = currentUserDisplayName || user?.fullName || '';
    const normCurrentName = normalizeStr(currentName);

    return reads.find(r => {
      if (r.activity_id !== actId) return false;
      if (r.user_email && r.user_email.toLowerCase() === userEmail) return true;
      if (r.user_name && currentName && r.user_name.toLowerCase() === currentName.toLowerCase()) return true;
      if (r.user_name && normCurrentName && normalizeStr(r.user_name) === normCurrentName) return true;
      return false;
    });
  };

  const handleMarkAsRead = async (activityId) => {
    try {
      setMarkingReadId(activityId);
      const token = await getToken();
      const userEmail = user?.primaryEmailAddress?.emailAddress;
      const userName = currentUserDisplayName || user?.fullName || '';

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'markAsRead',
          activityId,
          email: userEmail,
          userName
        })
      });
      const data = await res.json();
      if (data.success) {
        setReads(data.reads || []);
        window.dispatchEvent(new Event('refresh_notifications'));
        setAlertConfig({ message: 'Activity marked as read / acknowledged!', type: 'success' });
      } else {
        throw new Error(data.error || 'Failed to mark as read');
      }
    } catch (err) {
      console.error('Error marking activity as read:', err);
      setAlertConfig({ message: 'Failed to mark activity as read.', type: 'error' });
    } finally {
      setMarkingReadId(null);
    }
  };

  const handleMarkAsReadBatch = async (activityIds) => {
    if (!activityIds || activityIds.length === 0) return;
    try {
      setMarkingReadId('batch');
      const token = await getToken();
      const userEmail = user?.primaryEmailAddress?.emailAddress;
      const userName = currentUserDisplayName || user?.fullName || '';

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'markAsReadBatch',
          activityIds,
          email: userEmail,
          userName
        })
      });
      const data = await res.json();
      if (data.success) {
        setReads(data.reads || []);
        window.dispatchEvent(new Event('refresh_notifications'));
        setAlertConfig({ message: 'All activities acknowledged successfully!', type: 'success' });
        setIsUnackModalOpen(false);
      } else {
        throw new Error(data.error || 'Failed to acknowledge activities');
      }
    } catch (err) {
      console.error('Error acknowledging activities:', err);
      setAlertConfig({ message: 'Failed to acknowledge activities.', type: 'error' });
    } finally {
      setMarkingReadId(null);
    }
  };

  const formatReadTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      let val = String(dateStr).trim();
      // If it's a bare UTC timestamp like "2026-10-29 04:00:00" without timezone offset,
      // append Z so JavaScript parses it in UTC and converts to Philippine Time (UTC+8)
      if (!val.includes('T') && !val.includes('Z') && !val.includes('+')) {
        val = val.replace(' ', 'T') + 'Z';
      } else if (val.includes('T') && !val.endsWith('Z') && !val.includes('+')) {
        val = val + 'Z';
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateStr;
    }
  };

  const getActAssignees = (act) => {
    if (!act || !act.assigned_to) return [];
    let assignedArray = [];
    try { assignedArray = JSON.parse(act.assigned_to); } catch (e) { assignedArray = []; }
    if (assignedArray.includes('All')) {
      return allEmployees.map(emp => ({
        name: emp.name,
        email: emp.email,
        position: emp.position
      }));
    }
    return assignedArray.map(name => {
      const emp = allEmployees.find(e =>
        e.name.toLowerCase() === name.toLowerCase() ||
        normalizeStr(e.name) === normalizeStr(name)
      );
      return {
        name,
        email: emp?.email || '',
        position: emp?.position || 'Staff'
      };
    });
  };

  const getActReceiptSummary = (act) => {
    const assignees = getActAssignees(act);
    const total = assignees.length;
    if (total === 0) return { total: 0, read: 0, percent: 0, list: [] };

    const actReads = (reads || []).filter(r => r.activity_id === act.id);
    const list = assignees.map(assignee => {
      const read = actReads.find(r => {
        if (assignee.email && r.user_email && r.user_email.toLowerCase() === assignee.email.toLowerCase()) return true;
        if (assignee.name && r.user_name && normalizeStr(assignee.name) === normalizeStr(r.user_name)) return true;
        return false;
      });
      return {
        ...assignee,
        read: !!read,
        read_at: read?.read_at || null
      };
    });

    const readCount = list.filter(a => a.read).length;
    const percent = total > 0 ? Math.round((readCount / total) * 100) : 0;
    return { total, read: readCount, percent, list };
  };

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
    if (assignMode === 'exclude') {
      const remaining = excludedList.length === 0 ? ['All'] : employees.filter(emp => !excludedList.includes(emp));
      if (remaining.length === 0) {
        setAlertConfig({ message: "You have excluded all employees. Please include at least one attendee.", type: 'info' });
        return;
      }
      setFormData(prev => ({ ...prev, assigned_to: remaining }));
    } else {
      if (formData.assigned_to.length === 0) {
        setAlertConfig({ message: "Please assign at least one person.", type: 'info' });
        return;
      }
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
    setAssignMode('include');
    setExcludedList([]);
    setFormData({
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      assigned_to: [],
      status: 'Pending',
      attachment: null
    });
    setAttachmentError('');
  };

  const handleUpdateStatus = async (id, newStatus) => {
    const act = activities.find(a => a.id === id);
    if (act) {
      const summary = getActReceiptSummary(act);
      if (summary.total > 0 && summary.read < summary.total) {
        setAlertConfig({
          message: `Status cannot be updated until all assignees acknowledge this activity (${summary.read}/${summary.total} acknowledged).`,
          type: 'info'
        });
        return;
      }
    }
    try {
      const token = await getToken();
      const res = await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'updateStatus', id, status: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update status.");
      }
      setActivities(prev => prev.map(act => act.id === id ? { ...act, status: newStatus } : act));
      setAlertConfig({ message: `Status updated to ${newStatus} successfully!`, type: 'success' });
    } catch (err) {
      console.error("Error updating status:", err);
      setAlertConfig({ message: err.message || "Failed to update status.", type: 'error' });
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
    if (assigned.includes('All')) {
      setAssignMode('include');
      setExcludedList([]);
    } else if (employees.length > 0 && assigned.length >= employees.length - 10 && assigned.length < employees.length) {
      const missing = employees.filter(e => !assigned.includes(e));
      setExcludedList(missing);
      setAssignMode('exclude');
    } else {
      setAssignMode('include');
      setExcludedList([]);
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
          updated = [];
        } else {
          updated = ['All'];
        }
      } else {
        if (updated.includes('All')) {
          updated = employees.filter(a => a !== emp);
        } else {
          updated = updated.filter(a => a !== 'All');
          if (updated.includes(emp)) {
            updated = updated.filter(a => a !== emp);
          } else {
            updated.push(emp);
          }
        }
      }
      return { ...prev, assigned_to: updated };
    });
  };

  const toggleExclude = (emp) => {
    setExcludedList(prev => {
      const next = prev.includes(emp) ? prev.filter(e => e !== emp) : [...prev, emp];
      const remaining = next.length === 0 ? ['All'] : employees.filter(e => !next.includes(e));
      setFormData(f => ({ ...f, assigned_to: remaining }));
      return next;
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

  const unacknowledgedActivities = activities.filter(act => {
    if (act.status === 'Completed' || act.status === 'Canceled') return false;
    const e = act.end_date || act.start_date;
    if (e && e < todayYMD) return false;
    return isUserAssigned(act) && !getUserReadRecord(act.id);
  });

  useEffect(() => {
    if (!loading && !hasAutoPrompted && unacknowledgedActivities.length > 0) {
      setIsUnackModalOpen(true);
      setHasAutoPrompted(true);
    }
  }, [loading, hasAutoPrompted, unacknowledgedActivities.length]);

  useEffect(() => {
    const checkParam = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openUnack') === 'true') {
        setIsUnackModalOpen(true);
      }
    };
    checkParam();

    const handleOpenUnack = () => setIsUnackModalOpen(true);
    window.addEventListener('open_unack_activities', handleOpenUnack);
    return () => window.removeEventListener('open_unack_activities', handleOpenUnack);
  }, []);

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

    const isCreator = (act.created_by && (
      act.created_by.toLowerCase() === (currentUserDisplayName || '').toLowerCase() ||
      act.created_by.toLowerCase() === (user?.primaryEmailAddress?.emailAddress || '').toLowerCase() ||
      act.created_by.toLowerCase() === (user?.fullName || '').toLowerCase()
    ));

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
    const assignedToUser = isUserAssigned(act);
    const userRead = getUserReadRecord(act.id);
    const receiptCounts = getActReceiptSummary(act);
    const isAllAcknowledged = receiptCounts.total === 0 || receiptCounts.read >= receiptCounts.total;

    return (
      <div
        key={act.id}
        onClick={() => {
          if (isAdmin) {
            setReceiptsModalAct(act);
            setReceiptsSearchTerm('');
            setReceiptsTabFilter('all');
          }
        }}
        className={`w-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col group transition-all ${
          isAdmin
            ? 'cursor-pointer hover:shadow-xl hover:border-teal-400 dark:hover:border-teal-600 ring-0 hover:ring-2 hover:ring-teal-500/20'
            : 'hover:shadow-md'
        }`}
      >
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(displayStatus)}`}>
                {displayStatus}
              </span>
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors bg-slate-100/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700/80">
                  <svg className="w-3.5 h-3.5 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <span>Click card to see receipts</span>
                </span>
              )}
            </div>
            {(canEdit || canDelete) && (
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditActivity(act);
                    }}
                    title="Edit Activity"
                    className="text-blue-400 hover:text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteActivity(act);
                    }}
                    title="Delete Activity"
                    className="text-red-400 hover:text-red-600 p-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                  >
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
            <div className="flex flex-col min-w-0 group/assigned relative cursor-pointer sm:cursor-auto" tabIndex="0" onClick={(e) => { e.stopPropagation(); }}>
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

          {/* Read Receipt & Acknowledgment Action Strip */}
          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            {assignedToUser ? (
              userRead ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-semibold">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Acknowledged {formatReadTime(userRead.read_at)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead(act.id);
                  }}
                  disabled={markingReadId === act.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm hover:shadow transition-all disabled:opacity-50"
                  title="Mark this activity as read / acknowledged"
                >
                  {markingReadId === act.id ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <span>Marking...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>Mark as Read</span>
                    </>
                  )}
                </button>
              )
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Not assigned to you</span>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReceiptsModalAct(act);
                  setReceiptsSearchTerm('');
                  setReceiptsTabFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors border border-slate-200/80 dark:border-slate-700/80 ml-auto"
                title="View who has read/acknowledged this activity"
              >
                <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <span>Receipts ({receiptCounts.read}/{receiptCounts.total})</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Actions */}
        {canUpdateStatus && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-50/80 dark:bg-slate-800/80 px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
          >
            {!isAllAcknowledged ? (
              <div
                className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium"
                title={`${receiptCounts.read} of ${receiptCounts.total} assignees have acknowledged`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="truncate">Awaiting acknowledgment ({receiptCounts.read}/{receiptCounts.total})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>All assignees acknowledged</span>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Update Status:</span>

              {!isAllAcknowledged ? (
                <button
                  type="button"
                  onClick={() => {
                    setAlertConfig({
                      message: `Status cannot be updated until all assignees acknowledge this activity. Currently ${receiptCounts.read} of ${receiptCounts.total} acknowledged.`,
                      type: 'info'
                    });
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 py-1.5 px-3 rounded-lg shadow-sm cursor-not-allowed transition-colors hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-600 dark:hover:text-amber-400"
                  title="Status locked: Awaiting acknowledgment from all assignees"
                >
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m7-7V7a5 5 0 00-10 0v3m-2 0h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z" />
                  </svg>
                  <span>{displayStatus}</span>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">
                    Locked
                  </span>
                </button>
              ) : (
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
              )}
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
              <div className="flex items-center bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => setCurrentTab('active')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentTab === 'active'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                  </span>
                  <span>Active</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${currentTab === 'active' ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {ongoing.length + pastPending.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('incoming')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentTab === 'incoming'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Incoming Activities</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${currentTab === 'incoming' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {upcoming.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('archive')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${currentTab === 'archive'
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
            <Loading type="stack" />
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
                          Concluded activities awaiting status update to Completed or Canceled. All assignees must acknowledge before status can be updated.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      {pastPending.length} {pastPending.length === 1 ? 'Activity' : 'Activities'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {pastPending.map(renderActivityCard)}
                  </div>
                </div>
              )}

              {/* Today's Active Activities Container */}
              <div className="bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        Today's Active Activities
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Activities actively ongoing today.
                      </p>
                    </div>
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
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No active activities today</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">There are no ongoing office activities scheduled for today.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {ongoing.map(renderActivityCard)}
                  </div>
                )}
              </div>
            </div>
          ) : currentTab === 'incoming' ? (
            <div className="flex-1 overflow-y-auto pr-1 pb-10 flex flex-col gap-6">
              {/* Incoming / Upcoming Activities Container */}
              <div className="bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        Incoming Activities
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Activities and events scheduled for upcoming dates.
                      </p>
                    </div>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Assign Attendees <span className="text-rose-500">*</span>
                      </label>
                      
                      {/* Segmented Include / Exclude Mode Switcher */}
                      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            if (assignMode !== 'include') {
                              setAssignMode('include');
                              if (excludedList.length === 0) {
                                setFormData(prev => ({ ...prev, assigned_to: ['All'] }));
                              } else {
                                const remaining = employees.filter(e => !excludedList.includes(e));
                                setFormData(prev => ({ ...prev, assigned_to: remaining }));
                              }
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            assignMode === 'include'
                              ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          <span>Include</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (assignMode !== 'exclude') {
                              setAssignMode('exclude');
                              if (formData.assigned_to.includes('All')) {
                                setExcludedList([]);
                              } else {
                                const excluded = employees.filter(e => !formData.assigned_to.includes(e));
                                setExcludedList(excluded);
                              }
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            assignMode === 'exclude'
                              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                          </svg>
                          <span>Exclude</span>
                        </button>
                      </div>
                    </div>

                    {assignMode === 'include' ? (
                      /* INCLUDE MODE UI */
                      <div className="flex flex-col gap-2">
                        {/* Search & Quick Action Toolbar */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                              type="text"
                              placeholder="Search employee name to include..."
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

                        {/* Employee Checklist Grid */}
                        <div className="bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 max-h-52 overflow-y-auto custom-scrollbar">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).map(emp => {
                              const isChecked = formData.assigned_to.includes('All') || formData.assigned_to.includes(emp);
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
                        </div>

                      </div>
                    ) : (
                      /* EXCLUDE MODE UI */
                      <div className="flex flex-col gap-2">
                        <div className="p-2.5 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/50 rounded-xl flex items-center justify-between gap-2">
                          <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                            All employees will be assigned by default. Check any names below to <strong>exclude</strong> them.
                          </p>
                          {excludedList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setExcludedList([]);
                                setFormData(prev => ({ ...prev, assigned_to: ['All'] }));
                              }}
                              className="px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:text-rose-800 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-lg shadow-sm whitespace-nowrap shrink-0"
                            >
                              Exclude None
                            </button>
                          )}
                        </div>

                        {/* Search Toolbar */}
                        <div className="relative">
                          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          <input
                            type="text"
                            placeholder="Search employee name to exclude..."
                            value={assigneeSearchTerm}
                            onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 text-xs text-slate-800 dark:text-slate-200"
                          />
                        </div>

                        {/* Employee Checklist Grid for Exclude */}
                        <div className="bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 max-h-52 overflow-y-auto custom-scrollbar">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).map(emp => {
                              const isExcluded = excludedList.includes(emp);
                              return (
                                <label
                                  key={emp}
                                  className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all border ${
                                    isExcluded
                                      ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 shadow-sm'
                                      : 'bg-white dark:bg-slate-800/80 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                  }`}
                                >
                                  <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs shadow-sm ${isExcluded ? 'bg-rose-500 text-white' : getAvatarBg(emp)}`}>
                                    {getInitials(emp)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-semibold truncate ${isExcluded ? 'text-rose-700 dark:text-rose-300 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                                      {emp}
                                    </p>
                                  </div>
                                  {isExcluded ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                      Excluded
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                      Attending
                                    </span>
                                  )}
                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                    isExcluded ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                  }`}>
                                    {isExcluded && (
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    )}
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={isExcluded}
                                    onChange={() => toggleExclude(emp)}
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
                        </div>

                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {excludedList.length === 0 ? (
                            <span className="text-teal-600 dark:text-teal-400">✓ All {employees.length} employees included (0 excluded)</span>
                          ) : (
                            <span>
                              <strong className="text-rose-600 dark:text-rose-400">{excludedList.length}</strong> excluded • <strong className="text-teal-600 dark:text-teal-400">{Math.max(0, employees.length - excludedList.length)}</strong> will be assigned
                            </span>
                          )}
                        </p>
                      </div>
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
                  <div className="bg-gradient-to-br from-teal-50/80 to-slate-50 dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-5 rounded-2xl border border-teal-100 dark:border-slate-700/60 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-teal-100 dark:bg-teal-400/20 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-400/30">
                        {editingActivityId ? 'Activity Update' : 'New Activity'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                        {getDurationText(formData.start_date, formData.end_date)}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white break-words mt-1">
                      {formData.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
                        {formData.assigned_to.includes('All')
                          ? `Everyone (${employees.length})`
                          : `${formData.assigned_to.length} of ${employees.length} assigned`}
                      </span>
                    </div>

                    {assignMode === 'exclude' && excludedList.length > 0 && (
                      <div className="mb-3 p-2.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>
                          <span>Excluded Personnel ({excludedList.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {excludedList.map(emp => (
                            <span key={emp} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300 shadow-sm">
                              {emp}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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

      {/* Unacknowledged Activities Popup Modal */}
      {isUnackModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 transform transition-all">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-transparent to-orange-500/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                      Unacknowledged Activities
                    </h3>
                    <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {unacknowledgedActivities.length} Pending
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Activities assigned to you that require your acknowledgment. Mark them as read below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUnackModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              {unacknowledgedActivities.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">All Caught Up!</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    You have acknowledged all active activities assigned to you.
                  </p>
                </div>
              ) : (
                unacknowledgedActivities.map(act => (
                  <div
                    key={act.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-amber-300 dark:hover:border-amber-700/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(act.status)}`}>
                          {act.status}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {act.start_date === act.end_date || !act.end_date
                            ? formatDate(act.start_date)
                            : `${formatDate(act.start_date)} - ${formatDate(act.end_date)}`}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1 break-words">
                        {act.title}
                      </h4>
                      {act.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed mb-2">
                          {act.description}
                        </p>
                      )}
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        Assigned by <span className="font-semibold text-slate-600 dark:text-slate-300">{act.created_by}</span>
                      </div>
                    </div>

                    <div className="shrink-0 sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(act.id)}
                        disabled={markingReadId === act.id}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-teal-500/20 transition-all disabled:opacity-50"
                      >
                        {markingReadId === act.id ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span>Marking...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <span>Mark as Read</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsUnackModalOpen(false)}
                className="px-5 py-2.5 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Close / Review Later
              </button>

              {unacknowledgedActivities.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleMarkAsReadBatch(unacknowledgedActivities.map(a => a.id))}
                  disabled={markingReadId === 'batch'}
                  className="inline-flex items-center gap-2 px-6 py-2.5 font-bold text-xs text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-md hover:shadow-teal-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50"
                >
                  {markingReadId === 'batch' ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <span>Acknowledging All...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <span>Acknowledge All ({unacknowledgedActivities.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Read Receipts Modal for Admin & Creator */}
      {receiptsModalAct && (() => {
        const summary = getActReceiptSummary(receiptsModalAct);
        const filteredList = summary.list.filter(item => {
          if (receiptsTabFilter === 'read' && !item.read) return false;
          if (receiptsTabFilter === 'pending' && item.read) return false;
          if (receiptsSearchTerm) {
            const term = receiptsSearchTerm.toLowerCase();
            const nameMatch = (item.name || '').toLowerCase().includes(term);
            const posMatch = (item.position || '').toLowerCase().includes(term);
            const emailMatch = (item.email || '').toLowerCase().includes(term);
            return nameMatch || posMatch || emailMatch;
          }
          return true;
        });

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 transform transition-all">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        Acknowledgment Tracking: {receiptsModalAct.title}
                      </h3>
                      <span className="shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                        Admin View
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Trace which assignees have acknowledged this activity and who have not.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptsModalAct(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Stats Bar */}
              <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Acknowledgment Status: <strong className="text-emerald-600 dark:text-emerald-400">{summary.read}</strong> Acknowledged • <strong className="text-amber-600 dark:text-amber-400">{summary.total - summary.read}</strong> Did Not Acknowledge
                  </span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">{summary.percent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500 rounded-full"
                    style={{ width: `${summary.percent}%` }}
                  />
                </div>

                {/* Filter and Search */}
                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setReceiptsTabFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${receiptsTabFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                      All ({summary.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptsTabFilter('read')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${receiptsTabFilter === 'read' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Acknowledged ({summary.read})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptsTabFilter('pending')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${receiptsTabFilter === 'pending' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      <span>Did Not Acknowledge ({summary.total - summary.read})</span>
                    </button>
                  </div>

                  <div className="relative flex-1 sm:max-w-xs">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      type="text"
                      placeholder="Filter assignee..."
                      value={receiptsSearchTerm}
                      onChange={e => setReceiptsSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Assignees Roster List */}
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-2.5">
                {filteredList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No assignees match your search or filter.
                  </div>
                ) : (
                  filteredList.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarBg(item.name)}`}>
                          {getInitials(item.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.position || 'Staff'} {item.email ? `• ${item.email}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {item.read ? (
                          <div className="flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                              <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              Acknowledged
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {formatReadTime(item.read_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Did Not Acknowledge
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setReceiptsModalAct(null)}
                  className="px-5 py-2 font-bold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors shadow-sm"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        );
      })()}

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
