import React, { useState, useEffect } from 'react';
import { UserButton, useUser } from '@clerk/clerk-react';
import { turso } from './db';

export default function PersonalCalendar() {
  const { user } = useUser();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [selectedDayYmd, setSelectedDayYmd] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    event_type: '',
    start_date: '',
    end_date: '',
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  // Initialize DB and fetch
  useEffect(() => {
    const initAndFetch = async () => {
      if (!turso) {
        setError("Database connection not initialized.");
        setLoading(false);
        return;
      }

      if (!user?.primaryEmailAddress?.emailAddress) {
        setLoading(false);
        return;
      }

      const email = user.primaryEmailAddress.emailAddress;

      try {
        setLoading(true);
        // Create table if it doesn't exist
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

        // Fetch events for this user
        const res = await turso.execute({
          sql: "SELECT * FROM Personal_Calendar WHERE user_email = ? ORDER BY start_date ASC",
          args: [email]
        });

        setEvents(res.rows);
      } catch (err) {
        console.error("Calendar DB Error:", err);
        setError("Failed to initialize or fetch calendar data.");
      } finally {
        setLoading(false);
      }
    };

    initAndFetch();
  }, [user]);

  // Calendar Math
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Helper to format JS Date to YYYY-MM-DD
  const formatYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Check if a date string YYYY-MM-DD falls within an event's date range
  const isDateInEvent = (ymd, event) => {
    return ymd >= event.start_date && ymd <= event.end_date;
  };

  const eventTypeColors = {
    'Training': 'bg-blue-100 text-blue-700 border-blue-200',
    'Seminar': 'bg-purple-100 text-purple-700 border-purple-200',
    'Meeting': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Leave': 'bg-amber-100 text-amber-700 border-amber-200',
    'Other': 'bg-slate-100 text-slate-700 border-slate-200'
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const email = user.primaryEmailAddress.emailAddress;
      if (editingEventId) {
        await turso.execute({
          sql: `UPDATE Personal_Calendar 
                SET title = ?, event_type = ?, start_date = ?, end_date = ?, description = ?
                WHERE id = ? AND user_email = ?`,
          args: [formData.title, formData.event_type, formData.start_date, formData.end_date, formData.description, editingEventId, email]
        });
      } else {
        await turso.execute({
          sql: `INSERT INTO Personal_Calendar (user_email, title, event_type, start_date, end_date, description) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [email, formData.title, formData.event_type, formData.start_date, formData.end_date, formData.description]
        });
      }

      // Refetch
      const res = await turso.execute({
        sql: "SELECT * FROM Personal_Calendar WHERE user_email = ? ORDER BY start_date ASC",
        args: [email]
      });
      setEvents(res.rows);

      setIsAddModalOpen(false);
      setEditingEventId(null);
      setFormData({ title: '', event_type: '', start_date: '', end_date: '', description: '' });
    } catch (err) {
      console.error("Error saving event:", err);
      alert("Failed to save event.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditEvent = () => {
    setFormData({
      title: selectedEvent.title,
      event_type: selectedEvent.event_type,
      start_date: selectedEvent.start_date,
      end_date: selectedEvent.end_date,
      description: selectedEvent.description || ''
    });
    setEditingEventId(selectedEvent.id);
    setSelectedEvent(null);
    setIsAddModalOpen(true);
  };

  const executeDeleteEvent = async () => {
    if (!eventToDelete) return;

    try {
      await turso.execute({
        sql: "DELETE FROM Personal_Calendar WHERE id = ?",
        args: [eventToDelete.id]
      });
      setEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
      setEventToDelete(null);
      setSelectedEvent(null);
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Failed to delete event.");
    }
  };

  // Build Grid Days
  const gridDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    gridDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    gridDays.push(new Date(year, month, i));
  }

  // Today check
  const todayYMD = formatYMD(new Date());

  const handleCellClick = (ymd) => {
    setEditingEventId(null);
    setFormData({
      title: '',
      event_type: '',
      start_date: ymd,
      end_date: ymd,
      description: ''
    });
    setIsAddModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          Personal Calendar
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 sm:p-2 min-h-0">
        <div className="w-full h-full flex flex-col gap-6 min-h-0">

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium shrink-0">
              {error}
            </div>
          )}

          {/* Calendar Controls */}
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 w-fit">
              <button onClick={handlePrevMonth} className="p-1 text-slate-400 hover:text-teal-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
              </button>
              <h3 className="text-base font-bold text-slate-800 w-32 text-center">
                {monthNames[month]} {year}
              </h3>
              <button onClick={handleNextMonth} className="p-1 text-slate-400 hover:text-teal-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
            {/* Days of Week */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                <div key={day} className={`py-3 text-center text-xs font-bold uppercase tracking-wider ${idx === 0 || idx === 6 ? 'text-rose-500 bg-rose-50/30' : 'text-slate-500'}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Cells */}
            <div className="flex-1 grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100/50 overflow-y-auto" style={{ gridAutoRows: 'minmax(120px, 1fr)' }}>
              {loading ? (
                <div className="col-span-7 h-64 flex items-center justify-center text-slate-400">Loading calendar...</div>
              ) : (
                gridDays.map((dateObj, idx) => {
                  if (!dateObj) {
                    const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                    return <div key={`empty-${idx}`} className={isWeekend ? "bg-slate-100/80" : "bg-slate-50/50"}></div>;
                  }

                  const ymd = formatYMD(dateObj);
                  const isToday = ymd === todayYMD;
                  const dayEvents = events.filter(e => isDateInEvent(ymd, e));
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  return (
                    <div
                      key={ymd}
                      onClick={() => setSelectedDayYmd(ymd)}
                      className={`${isWeekend ? 'bg-slate-50' : 'bg-white'} p-2 flex flex-col overflow-hidden hover:bg-slate-100 transition-colors group cursor-pointer`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-700'}`}>
                          {dateObj.getDate()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(ymd);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-teal-100 hover:text-teal-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="Add Event"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                        </button>
                      </div>

                      {/* Events for this day */}
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-1 scrollbar-thin">
                        {dayEvents.map(event => {
                          const isStart = event.start_date === ymd;
                          const colorClasses = eventTypeColors[event.event_type] || eventTypeColors['Other'];

                          return (
                            <div
                              key={`${event.id}-${ymd}`}
                              className={`text-xs px-2 py-1 rounded border shadow-sm transition-opacity truncate font-medium ${colorClasses} ${!isStart ? 'border-l-4 rounded-l-none' : ''}`}
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDayYmd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">
                Events for {new Date(selectedDayYmd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button onClick={() => setSelectedDayYmd(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {events.filter(e => isDateInEvent(selectedDayYmd, e)).length > 0 ? (
                <div className="space-y-3">
                  {events.filter(e => isDateInEvent(selectedDayYmd, e)).map(event => (
                    <div key={event.id} onClick={() => { setSelectedDayYmd(null); setSelectedEvent(event); }} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition-shadow ${eventTypeColors[event.event_type] || eventTypeColors['Other']}`}>
                      <div className="font-bold mb-1 truncate">{event.title}</div>
                      <div className="text-xs font-medium opacity-80">{event.event_type}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p>No events scheduled for this day.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => { setSelectedDayYmd(null); handleCellClick(selectedDayYmd); }} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                Add Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">{editingEventId ? "Edit Event" : "Add New Event"}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setEditingEventId(null); }} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Event Title <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium" placeholder="E.g., Leadership Seminar" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Event Type <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.event_type} onChange={e => setFormData({ ...formData, event_type: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium" placeholder="E.g., Meeting, Holiday, Workshop" />
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows="3" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium resize-none" placeholder="Add location or additional details..." />
              </div>

              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => { setIsAddModalOpen(false); setEditingEventId(null); }} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-2.5 font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Event Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${eventTypeColors[selectedEvent.event_type] || eventTypeColors['Other']} border-b-0`}>
              <h3 className="text-lg font-bold truncate pr-4">{selectedEvent.title}</h3>
              <button onClick={() => setSelectedEvent(null)} className="hover:opacity-70 transition-opacity p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 block">Event Type</span>
                <span className="font-semibold text-slate-800">{selectedEvent.event_type}</span>
              </div>

              <div className="mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 block">Date</span>
                <span className="font-semibold text-slate-800">
                  {selectedEvent.start_date === selectedEvent.end_date
                    ? selectedEvent.start_date
                    : `${selectedEvent.start_date} to ${selectedEvent.end_date}`}
                </span>
              </div>

              {selectedEvent.description && (
                <div className="mb-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 block">Details</span>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedEvent.description}</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={handleEditEvent}
                  className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit Event
                </button>
                <button
                  onClick={() => setEventToDelete(selectedEvent)}
                  className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col transform transition-all">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Event?</h3>
              <p className="text-slate-500 text-sm mb-1">Are you sure you want to delete <span className="font-bold text-slate-700">"{eventToDelete.title}"</span>?</p>
              <p className="text-slate-500 text-sm">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setEventToDelete(null)} className="flex-1 py-2.5 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button onClick={executeDeleteEvent} className="flex-1 py-2.5 font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
