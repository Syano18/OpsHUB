import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';
import Loading from './components/Loading';

export default function PersonalCalendar() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  // View mode and filters
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'agenda'
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [selectedDayYmd, setSelectedDayYmd] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    event_type: 'Meeting',
    start_date: '',
    end_date: '',
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch calendar events
  const fetchCalendar = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) {
      setLoading(false);
      return;
    }
    const email = user.primaryEmailAddress.emailAddress;
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/calendar?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch calendar data");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error("Calendar DB Error:", err);
      setError("Failed to initialize or fetch calendar data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [user]);

  // Calendar Math
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleJumpToToday = () => {
    setCurrentDate(new Date());
  };

  // Helper to format JS Date to YYYY-MM-DD
  const formatYMD = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Helper to format date nicely
  const formatDateFriendly = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  };

  // Check if a date string YYYY-MM-DD falls within an event's date range
  const isDateInEvent = (ymd, event) => {
    if (!event.start_date) return false;
    const start = event.start_date;
    const end = event.end_date || event.start_date;
    return ymd >= start && ymd <= end;
  };

  const eventTypesConfig = {
    'Meeting': {
      label: 'Meeting',
      icon: '👥',
      badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50',
      dot: 'bg-emerald-500',
      gradient: 'from-emerald-500 to-teal-600'
    },
    'Training': {
      label: 'Training',
      icon: '🎓',
      badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
      pill: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50',
      dot: 'bg-blue-500',
      gradient: 'from-blue-500 to-cyan-600'
    },
    'Seminar': {
      label: 'Seminar',
      icon: '🎤',
      badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30',
      pill: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50',
      dot: 'bg-purple-500',
      gradient: 'from-purple-500 to-pink-600'
    },
    'Leave': {
      label: 'Leave',
      icon: '🌴',
      badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
      pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50',
      dot: 'bg-amber-500',
      gradient: 'from-amber-500 to-orange-600'
    },
    'Office Activity': {
      label: 'Office Activity',
      icon: '🏢',
      badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30',
      pill: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50',
      dot: 'bg-teal-500',
      gradient: 'from-teal-500 to-emerald-600'
    },
    'Other': {
      label: 'Other',
      icon: '📌',
      badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
      pill: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50',
      dot: 'bg-indigo-500',
      gradient: 'from-indigo-500 to-violet-600'
    }
  };

  const getEventConfig = (type) => {
    return eventTypesConfig[type] || eventTypesConfig['Other'];
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const email = user.primaryEmailAddress.emailAddress;
      const token = await getToken();
      
      const payload = {
        email,
        title: formData.title,
        event_type: formData.event_type || 'Other',
        start_date: formData.start_date,
        end_date: formData.end_date || formData.start_date,
        description: formData.description
      };
      
      if (editingEventId) {
        payload.id = editingEventId;
        const res = await fetch('/api/calendar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to update event");
      } else {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to create event");
      }

      await fetchCalendar();
      setIsAddModalOpen(false);
      setEditingEventId(null);
      setFormData({ title: '', event_type: 'Meeting', start_date: '', end_date: '', description: '' });
      setAlertConfig({ message: editingEventId ? 'Event updated successfully!' : 'Event created successfully!', type: 'success' });
    } catch (err) {
      console.error("Error saving event:", err);
      setAlertConfig({ message: "Failed to save event.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAddModal = (dateStr = null) => {
    const defaultDate = dateStr || formatYMD(new Date());
    setEditingEventId(null);
    setFormData({
      title: '',
      event_type: 'Meeting',
      start_date: defaultDate,
      end_date: defaultDate,
      description: ''
    });
    setIsAddModalOpen(true);
  };

  const handleEditEvent = (evt = null) => {
    const target = evt || selectedEvent;
    if (!target) return;
    setFormData({
      title: target.title,
      event_type: target.event_type || 'Other',
      start_date: target.start_date,
      end_date: target.end_date || target.start_date,
      description: target.description || ''
    });
    setEditingEventId(target.id);
    setSelectedEvent(null);
    setSelectedDayYmd(null);
    setIsAddModalOpen(true);
  };

  const executeDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/calendar?id=${eventToDelete.id}&email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      setEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
      setEventToDelete(null);
      setSelectedEvent(null);
      setAlertConfig({ message: 'Event deleted successfully!', type: 'success' });
    } catch (err) {
      console.error("Error deleting event:", err);
      setAlertConfig({ message: err.message || "Failed to delete event.", type: 'error' });
    }
  };

  // Grid Days computation
  const gridDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [year, month, daysInMonth, firstDayIndex]);

  const todayYMD = formatYMD(new Date());

  // Filter events based on type and search query
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesType = selectedTypeFilter === 'All' || event.event_type === selectedTypeFilter;
      const matchesSearch = !searchQuery || 
        event.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        event.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [events, selectedTypeFilter, searchQuery]);

  // Current month events for stats
  const currentMonthEvents = useMemo(() => {
    const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return events.filter(e => {
      const start = e.start_date;
      const end = e.end_date || e.start_date;
      return (start <= endOfMonth && end >= startOfMonth);
    });
  }, [events, year, month, daysInMonth]);

  // Upcoming events for agenda view
  const upcomingEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
  }, [filteredEvents]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Personal Calendar
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Manage your personal schedules, meetings, trainings, and leaves
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
      <div className="flex-1 flex flex-col p-2 sm:p-4 min-h-0 overflow-hidden">
        <div className="w-full h-full flex flex-col gap-3 min-h-0">

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium shrink-0 flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
          )}

          {/* Top Control Bar */}
          <div className="shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Date Navigation */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-inner border border-slate-200/60 dark:border-slate-700/60">
                <button 
                  onClick={handlePrevMonth} 
                  title="Previous Month"
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <div className="px-3 min-w-[140px] text-center font-bold text-slate-800 dark:text-white text-sm sm:text-base">
                  {monthNames[month]} {year}
                </div>
                <button 
                  onClick={handleNextMonth} 
                  title="Next Month"
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
                </button>
              </div>

              <button
                onClick={handleJumpToToday}
                className="px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/40 border border-teal-200 dark:border-teal-800/80 rounded-xl transition-all shadow-sm"
              >
                Today
              </button>

              {/* View Switcher Pills */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                  <span>Month</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('agenda')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'agenda'
                      ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  <span>Agenda</span>
                </button>
              </div>
            </div>

            {/* Right: Search & Add Button */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
              </div>

              <button
                onClick={() => handleOpenAddModal()}
                className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:shadow-teal-500/25 hover:-translate-y-0.5 transition-all whitespace-nowrap shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>New Event</span>
              </button>
            </div>
          </div>

          {/* View Container */}
          {loading ? (
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center">
              <Loading type="calendar" />
            </div>
          ) : viewMode === 'grid' ? (
            /* Month Calendar Grid - Full Window */
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
              {/* Day Name Headers */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                  <div 
                    key={day} 
                    className={`py-2 sm:py-2.5 text-center text-xs font-bold uppercase tracking-wider ${
                      idx === 0 || idx === 6 
                        ? 'text-rose-500 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20' 
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells - Auto-stretch to fill remaining height */}
              <div 
                className="flex-1 grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-100/40 dark:bg-slate-950/40 min-h-0 overflow-y-auto"
                style={{ gridTemplateRows: `repeat(${Math.ceil(gridDays.length / 7)}, minmax(0, 1fr))` }}
              >
                {gridDays.map((dateObj, idx) => {
                  if (!dateObj) {
                    const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                    return (
                      <div 
                        key={`empty-${idx}`} 
                        className={`h-full min-h-[85px] p-2 ${
                          isWeekend ? "bg-slate-50/70 dark:bg-slate-900/40" : "bg-slate-50/30 dark:bg-slate-950/20"
                        }`}
                      ></div>
                    );
                  }

                  const ymd = formatYMD(dateObj);
                  const isToday = ymd === todayYMD;
                  const dayEvents = filteredEvents.filter(e => isDateInEvent(ymd, e));
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  return (
                    <div
                      key={ymd}
                      onClick={() => setSelectedDayYmd(ymd)}
                      className={`h-full min-h-[85px] p-2 flex flex-col justify-start overflow-hidden transition-all group cursor-pointer border-t border-slate-100 dark:border-slate-800/60 ${
                        isToday 
                          ? 'bg-teal-50/40 dark:bg-teal-950/20 ring-1 ring-teal-500/40' 
                          : isWeekend 
                            ? 'bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-100/80 dark:hover:bg-slate-800/60' 
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Cell Header */}
                      <div className="flex items-center justify-between mb-1 shrink-0">
                        <span 
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                            isToday 
                              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md shadow-teal-500/30 scale-105' 
                              : isWeekend
                                ? 'text-rose-500 dark:text-rose-400 group-hover:text-slate-800 dark:group-hover:text-white'
                                : 'text-slate-700 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400'
                          }`}
                        >
                          {dateObj.getDate()}
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAddModal(ymd);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 hover:bg-teal-500 hover:text-white transition-colors"
                            title="Add event on this date"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          </button>
                        </div>
                      </div>

                      {/* Event Chips List */}
                      <div className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-none pr-0.5">
                        {dayEvents.slice(0, 3).map(event => {
                          const conf = getEventConfig(event.event_type);
                          const isStart = event.start_date === ymd;

                          return (
                            <div
                              key={`${event.id}-${ymd}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                              }}
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium truncate flex items-center gap-1.5 transition-all hover:scale-[1.01] shadow-xs cursor-pointer shrink-0 ${conf.pill} ${
                                !isStart ? 'border-l-2' : ''
                              }`}
                              title={`${event.title} (${event.event_type})`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} />
                              <span className="truncate">{event.title}</span>
                            </div>
                          );
                        })}

                        {dayEvents.length > 3 && (
                          <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 px-1 hover:underline shrink-0">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Agenda List View - Full Window */
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col gap-3 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span>Upcoming Schedule</span>
                  <span className="text-xs font-normal text-slate-500">({upcomingEvents.length} events)</span>
                </h3>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 text-2xl">
                    📅
                  </div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">No Events Found</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                    {searchQuery ? "No events match your current search criteria." : "No upcoming events scheduled. Click 'New Event' to add one."}
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
                  {upcomingEvents.map(event => {
                    const conf = getEventConfig(event.event_type);
                    const isSystemEvent = event.event_type === 'Office Activity' || event.event_type === 'Leave';

                    return (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group shrink-0"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${conf.gradient} flex items-center justify-center text-white text-base shrink-0 shadow-sm`}>
                            {conf.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h4 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                                {event.title}
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${conf.pill}`}>
                                {event.event_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span>
                                {event.start_date === event.end_date || !event.end_date
                                  ? formatDateFriendly(event.start_date)
                                  : `${formatDateFriendly(event.start_date)} - ${formatDateFriendly(event.end_date)}`}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {!isSystemEvent && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEvent(event);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                title="Edit Event"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEventToDelete(event);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                title="Delete Event"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                          <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDayYmd && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-base border border-teal-500/20">
                  📅
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">
                    {formatDateFriendly(selectedDayYmd)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedDayYmd === todayYMD ? "Today's Schedule" : "Scheduled events for this date"}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedDayYmd(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-3">
              {events.filter(e => isDateInEvent(selectedDayYmd, e)).length > 0 ? (
                events.filter(e => isDateInEvent(selectedDayYmd, e)).map(event => {
                  const conf = getEventConfig(event.event_type);
                  return (
                    <div 
                      key={event.id} 
                      onClick={() => { 
                        setSelectedDayYmd(null); 
                        setSelectedEvent(event); 
                      }} 
                      className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${conf.pill}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="font-bold text-sm text-slate-800 dark:text-white truncate flex items-center gap-2">
                          <span>{conf.icon}</span>
                          <span>{event.title}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/60 dark:bg-slate-900/60">
                          {event.event_type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span>{formatDateFriendly(event.start_date)} - {formatDateFriendly(event.end_date || event.start_date)}</span>
                      </div>
                      {event.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-xl mb-2">
                    ✨
                  </div>
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No events scheduled</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Your schedule is free for this day.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
              <button 
                onClick={() => setSelectedDayYmd(null)} 
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => { 
                  const targetYmd = selectedDayYmd;
                  setSelectedDayYmd(null); 
                  handleOpenAddModal(targetYmd); 
                }} 
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold hover:from-teal-400 hover:to-emerald-400 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                <span>Add Event</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Event Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                  {editingEventId ? "✏️" : "✨"}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">
                  {editingEventId ? "Edit Event" : "Create New Event"}
                </h3>
              </div>
              <button onClick={() => { setIsAddModalOpen(false); setEditingEventId(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-6 flex flex-col gap-4">
              {/* Event Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Event Title <span className="text-red-500">*</span>
                </label>
                <input 
                  required 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({ ...formData, title: e.target.value })} 
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium text-slate-800 dark:text-slate-100" 
                  placeholder="E.g., Quarterly Performance Review" 
                />
              </div>

              {/* Event Type Selectable Pills */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Event Category <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {['Meeting', 'Training', 'Seminar', 'Leave', 'Other'].map(type => {
                    const conf = getEventConfig(type);
                    const isSelected = formData.event_type === type;
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setFormData({ ...formData, event_type: type })}
                        className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-700 dark:text-teal-300 shadow-sm scale-105'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-base">{conf.icon}</span>
                        <span>{type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input 
                    required 
                    type="date" 
                    value={formData.start_date} 
                    onChange={e => {
                      const newStart = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        start_date: newStart,
                        end_date: prev.end_date < newStart ? newStart : prev.end_date
                      }));
                    }} 
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium text-slate-800 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input 
                    required 
                    type="date" 
                    min={formData.start_date}
                    value={formData.end_date} 
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })} 
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium text-slate-800 dark:text-slate-100" 
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Description / Notes <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                  rows="3" 
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium text-slate-800 dark:text-slate-100 resize-none" 
                  placeholder="Location, agenda, video link, or additional details..." 
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => { setIsAddModalOpen(false); setEditingEventId(null); }} 
                  className="flex-1 py-2.5 font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className="flex-1 py-2.5 font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl shadow-md hover:shadow-teal-500/25 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : (editingEventId ? 'Update Event' : 'Save Event')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Event Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header Banner */}
            {(() => {
              const conf = getEventConfig(selectedEvent.event_type);
              const isSystemEvent = selectedEvent.event_type === 'Office Activity' || selectedEvent.event_type === 'Leave';

              return (
                <>
                  <div className={`px-6 py-5 bg-gradient-to-r ${conf.gradient} text-white flex items-center justify-between`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl">{conf.icon}</span>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-full inline-block mb-1">
                          {selectedEvent.event_type}
                        </span>
                        <h3 className="text-base sm:text-lg font-bold truncate pr-2">
                          {selectedEvent.title}
                        </h3>
                      </div>
                    </div>
                    <button onClick={() => setSelectedEvent(null)} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="p-6 flex flex-col gap-4">
                    {/* Date Block */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Schedule</span>
                        <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {selectedEvent.start_date === selectedEvent.end_date || !selectedEvent.end_date
                            ? formatDateFriendly(selectedEvent.start_date)
                            : `${formatDateFriendly(selectedEvent.start_date)} - ${formatDateFriendly(selectedEvent.end_date)}`}
                        </span>
                      </div>
                    </div>

                    {/* Details Block */}
                    {selectedEvent.description ? (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Details / Notes</span>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 whitespace-pre-wrap leading-relaxed">
                          {selectedEvent.description}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No additional description provided.</p>
                    )}

                    {/* Actions */}
                    {!isSystemEvent ? (
                      <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                        <button
                          onClick={() => setEventToDelete(selectedEvent)}
                          className="px-3.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          <span>Delete</span>
                        </button>
                        <button
                          onClick={() => handleEditEvent(selectedEvent)}
                          className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          <span>Edit Event</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-center">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">System Managed Event</p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                          Synced from the {selectedEvent.event_type} module.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-950/40 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-1.5">Delete Event?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Are you sure you want to delete <span className="font-bold text-slate-700 dark:text-slate-300">"{eventToDelete.title}"</span>?
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
              <button onClick={() => setEventToDelete(null)} className="flex-1 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={executeDeleteEvent} className="flex-1 py-2 font-bold text-xs text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-md shadow-red-500/20 transition-all">
                Delete
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
