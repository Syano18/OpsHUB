import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { UserButton, useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [activityToDelete, setActivityToDelete] = useState(null);
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
    const file = e.target.files[0];
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

    const isCreator = act.created_by === currentUserDisplayName || act.created_by === user?.primaryEmailAddress?.emailAddress || act.created_by === user?.fullName;
    const canEditOrDelete = act.status !== 'Completed' && isCreator;
    const canUpdateStatus = (isAdmin || isCreator) && act.status !== 'Completed';

    return (
      <div key={act.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(act.status)}`}>
              {act.status}
            </span>
            {canEditOrDelete && (
              <div className="flex gap-2">
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
              <span 
                className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md inline-block max-w-[200px] truncate cursor-help"
                title={isAll ? "Everyone" : assignedArray.join(', ')}
              >
                {isAll ? "Everyone" : assignedArray.join(', ')}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Created By</span>
              <span className="text-xs font-medium text-slate-500">{act.created_by}</span>
            </div>
          </div>
        </div>

        {/* Status Actions */}
        {canUpdateStatus && (
          <div className="bg-slate-50/80 px-6 py-3 border-t border-slate-100 flex items-center gap-2 justify-end">
            <span className="text-xs font-semibold text-slate-500 mr-2">Update Status:</span>
            <div className="relative group/status">
              <div className="flex items-center gap-2 text-xs font-bold bg-white border border-slate-200 text-slate-700 py-1.5 pl-3 pr-2 rounded-lg shadow-sm cursor-pointer hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${act.status === 'Completed' ? 'bg-emerald-500' : act.status === 'In Progress' ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                  {act.status}
                </div>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>
              
              <div className="absolute right-0 bottom-full mb-2 hidden group-hover/status:flex flex-col w-36 bg-white border border-slate-200 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] overflow-hidden z-30 pb-1">
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 border-b border-slate-100 mb-1">Set Status</div>
                {['Pending', 'In Progress', 'Completed'].map(st => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(act.id, st)}
                    className={`text-left w-full px-3 py-2 text-xs font-bold transition-all border-l-2 ${act.status === st ? 'bg-slate-50/80 text-slate-900 border-teal-500' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full shadow-sm ${st === 'Completed' ? 'bg-emerald-500' : st === 'In Progress' ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                      {st}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center gap-2 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              New Activity
            </button>
          </div>

          {/* Activities Grid */}
          {loading ? (
            <Loading type="grid" />
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

      {/* Add Activity Modal */}
      {isAddModalOpen && (
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
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">Assign To <span className="text-red-500">*</span></label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <span className="text-xs font-bold text-slate-500 group-hover:text-teal-700 transition-colors">Assign to Everyone</span>
                        <div className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${formData.assigned_to.includes('All') ? 'bg-teal-500' : 'bg-slate-200'}`}>
                          <input type="checkbox" checked={formData.assigned_to.includes('All')} onChange={() => toggleAssignee('All')} className="sr-only" />
                          <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} style={{ transform: formData.assigned_to.includes('All') ? 'translateX(18px)' : 'translateX(4px)' }} />
                        </div>
                      </label>
                    </div>
                    <div className="mb-2 relative">
                      <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        placeholder="Search employees..."
                        value={assigneeSearchTerm}
                        onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm disabled:opacity-50"
                        disabled={formData.assigned_to.includes('All')}
                      />
                    </div>
                    <div className={`bg-slate-50/50 border border-slate-200 rounded-xl p-3 max-h-56 overflow-y-auto flex flex-col gap-1.5 shadow-inner transition-opacity ${formData.assigned_to.includes('All') ? 'opacity-50 pointer-events-none' : ''}`}>
                      {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).map(emp => {
                        const isChecked = formData.assigned_to.includes(emp);
                        return (
                          <label key={emp} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${isChecked ? 'bg-white border-teal-500 shadow-sm ring-1 ring-teal-500' : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}>
                            <div className={`flex shrink-0 items-center justify-center w-5 h-5 rounded border ${isChecked ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-300'}`}>
                              {isChecked && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAssignee(emp)}
                              className="hidden"
                            />
                            <span className={`text-sm font-medium ${isChecked ? 'text-teal-900' : 'text-slate-700'}`}>{emp}</span>
                          </label>
                        );
                      })}
                      {employees.filter(emp => emp.toLowerCase().includes(assigneeSearchTerm.toLowerCase())).length === 0 && (
                        <div className="text-sm text-slate-500 text-center py-4 italic bg-slate-100/50 rounded-lg border border-dashed border-slate-200">No employees found matching "{assigneeSearchTerm}".</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Description <span className="text-red-500">*</span></label>
                    <textarea required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows="3" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium resize-none" placeholder="Provide instructions or details..." />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Attachment <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <div className="flex items-center">
                      <input 
                        type="file" 
                        onChange={handleFileChange}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 file:transition-colors file:cursor-pointer cursor-pointer border border-slate-200 rounded-xl bg-slate-50 p-1" 
                        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                      />
                    </div>
                    {attachmentError && <p className="text-red-500 text-xs mt-2 font-bold">{attachmentError}</p>}
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
                  {formData.attachment && (
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attachment</h4>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <p className="text-slate-800 text-sm font-bold truncate">{formData.attachment.name}</p>
                      </div>
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

      {/* No Attachment Warning Modal */}
      {showNoAttachmentWarning && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">No Attachment</h3>
              <p className="text-slate-500 text-sm mb-1">You are proceeding without any supporting documents.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setShowNoAttachmentWarning(false)} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Back to Edit</button>
              <button onClick={() => { setShowNoAttachmentWarning(false); setModalStep(2); }} className="flex-1 py-2.5 font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-sm transition-colors">Okay, Proceed</button>
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
