import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';

function normalizeStr(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isUserAssigned(act, allEmployees, userEmail, userDisplayName, userFullName) {
  if (!act || !act.assigned_to) return false;
  let assignedArray = [];
  try {
    assignedArray = JSON.parse(act.assigned_to);
  } catch (e) {
    return false;
  }
  if (!Array.isArray(assignedArray)) return false;
  if (assignedArray.includes('All')) return true;

  const normCurrentName = normalizeStr(userDisplayName);
  const lowerUserEmail = (userEmail || '').toLowerCase();
  const lowerFullName = (userFullName || '').toLowerCase();
  const normFullName = normalizeStr(userFullName);

  return assignedArray.some(assigned => {
    const a = (assigned || '').trim();
    if (a.toLowerCase() === lowerUserEmail) return true;
    if (userDisplayName && a.toLowerCase() === userDisplayName.toLowerCase()) return true;
    if (lowerFullName && a.toLowerCase() === lowerFullName) return true;
    const normA = normalizeStr(a);
    if (normA && normCurrentName && (normA === normCurrentName || normCurrentName.includes(normA) || normA.includes(normCurrentName))) {
      return true;
    }
    if (normA && normFullName && (normA === normFullName || normFullName.includes(normA) || normA.includes(normFullName))) {
      return true;
    }
    const matchedEmp = (allEmployees || []).find(e =>
      e.name.toLowerCase() === a.toLowerCase() ||
      normalizeStr(e.name) === normA
    );
    if (matchedEmp && matchedEmp.email && matchedEmp.email.toLowerCase() === lowerUserEmail) {
      return true;
    }
    return false;
  });
}

function isActReadByUser(actId, reads, userEmail, userDisplayName, userFullName) {
  if (!reads || !Array.isArray(reads)) return false;
  const lowerUserEmail = (userEmail || '').toLowerCase();
  const normCurrentName = normalizeStr(userDisplayName);
  const normFullName = normalizeStr(userFullName);

  return reads.some(r => {
    if (r.activity_id !== actId) return false;
    if (r.user_email && r.user_email.toLowerCase() === lowerUserEmail) return true;
    if (r.user_name && userDisplayName && r.user_name.toLowerCase() === userDisplayName.toLowerCase()) return true;
    if (r.user_name && userFullName && r.user_name.toLowerCase() === userFullName.toLowerCase()) return true;
    if (r.user_name && normCurrentName && normalizeStr(r.user_name) === normCurrentName) return true;
    if (r.user_name && normFullName && normalizeStr(r.user_name) === normFullName) return true;
    return false;
  });
}

export default function NotificationBell() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) return;
      try {
        const token = await getToken();
        const email = user.primaryEmailAddress.emailAddress;
        
        let newNotifications = [];
        let role = '';
        let currentUserDisplayName = '';
        
        // Fetch Activities with cache-busting
        const resAct = await fetch(`/api/activities?email=${encodeURIComponent(email)}&t=${Date.now()}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          cache: 'no-store'
        });
        
        if (resAct.ok) {
          const data = await resAct.json();
          const todayDate = new Date();
          const tzOffset = todayDate.getTimezoneOffset() * 60000;
          const todayYMD = new Date(todayDate.getTime() - tzOffset).toISOString().split('T')[0];
          
          if (data.user) {
            role = data.user.Role;
            const u = data.user;
            if (u.First_Name && u.Last_Name) {
              currentUserDisplayName = `${u.First_Name} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '. ' : ''}${u.Last_Name}`.trim();
            }
          }

          // Unacknowledged Activities assigned to current user
          const unackActs = (data.activities || []).filter(act => {
            if (act.status === 'Completed' || act.status === 'Canceled') return false;
            const e = act.end_date || act.start_date;
            if (e && e < todayYMD) return false;
            return isUserAssigned(act, data.allEmployees, email, currentUserDisplayName, user?.fullName) &&
                   !isActReadByUser(act.id, data.reads, email, currentUserDisplayName, user?.fullName);
          });

          const unackNotifs = unackActs.map(act => ({
            id: `unack_act_${act.id}`,
            activityId: act.id,
            isUnackActivity: true,
            title: `Assigned: ${act.title}`,
            message: `You were assigned to this activity. Tap to review and acknowledge.`,
            link: '/office-activities?openUnack=true'
          }));

          newNotifications = [...newNotifications, ...unackNotifs];

          // For Past Pending status update (Admin / Creator)
          const pendingFinished = (data.activities || []).filter(act => {
            const e = act.end_date || act.start_date;
            const isPendingFinished = e < todayYMD && act.status === 'Pending';
            const canSee = role === 'Super Admin' || role === 'Admin' || act.created_by === currentUserDisplayName;
            return isPendingFinished && canSee;
          }).map(act => ({
            id: `act_${act.id}`,
            title: act.title,
            message: `This activity is finished but still marked as Pending. Please update its status.`,
            link: '/office-activities'
          }));
          
          newNotifications = [...newNotifications, ...pendingFinished];

          if (data.todayBirthdays && data.todayBirthdays.length > 0) {
            const bdayNotifs = data.todayBirthdays.map((b, idx) => ({
              id: `bday_${idx}_${todayYMD}`,
              title: `🎂 Today is ${b.firstName || b.name}'s Birthday!`,
              message: `Celebrate with ${b.name} (${b.position}) today!`,
              link: '/birthday-celebrants'
            }));
            newNotifications = [...bdayNotifs, ...newNotifications];
          }
        }

        // Fetch pending leaves if Admin/Super Admin
        if (role === 'Super Admin' || role === 'Admin') {
          const resLeave = await fetch(`/api/leave?action=getPendingLeaves&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
          });
          if (resLeave.ok) {
            const leaveData = await resLeave.json();
            const pendingLeaves = (leaveData.pendingLeaves || []).map(l => ({
              id: `leave_${l.id}`,
              title: `${l.First_Name} ${l.Last_Name} - ${l.leave_type}`,
              message: l.start_date
                ? `${l.days_applied ? `${l.days_applied} ${Number(l.days_applied) === 1 ? 'day' : 'days'} ` : ''}(${l.start_date}) is pending approval.`
                : `A new leave request is pending approval.`,
              link: '/leave-credits'
            }));
            newNotifications = [...newNotifications, ...pendingLeaves];
          }
        }

        // Fetch pending evaluations
        if (role === 'Super Admin' || role === 'Admin' || role === 'Focal Person') {
          const resEval = await fetch(`/api/employments?action=getPendingEvaluations&email=${encodeURIComponent(email)}&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
          });
          if (resEval.ok) {
            const evalData = await resEval.json();
            const pendingEvals = (evalData.pendingEvaluations || []).map(emp => ({
              id: `eval_${emp.id}`,
              title: `Pending COSW Evaluation`,
              message: `Please evaluate performance for ${emp.employee_name} (${emp.survey_name}).`,
              link: '/cosw-evaluation'
            }));
            newNotifications = [...newNotifications, ...pendingEvals];
          }
        }
        setNotifications(newNotifications);
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };
    fetchActivities();
    
    window.addEventListener('refresh_notifications', fetchActivities);
    // Set up polling to fetch notifications every 5 minutes (300000 ms)
    const intervalId = setInterval(fetchActivities, 300000);
    
    return () => {
      window.removeEventListener('refresh_notifications', fetchActivities);
      clearInterval(intervalId);
    };
  }, [user, getToken]);

  const handleMarkAsReadFromBell = async (e, activityId) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setMarkingId(activityId);
      const token = await getToken();
      const email = user.primaryEmailAddress.emailAddress;
      const userName = user?.fullName || '';

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'markAsRead',
          activityId,
          email,
          userName
        })
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== `unack_act_${activityId}`));
        window.dispatchEvent(new Event('refresh_notifications'));
      }
    } catch (err) {
      console.error('Error marking as read from bell:', err);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-gradient-to-tr from-teal-400 to-teal-600 hover:from-teal-500 hover:to-teal-700 text-white shadow-md hover:shadow-lg rounded-full transition-all focus:outline-none hover:scale-105 active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative flex items-center justify-center rounded-full h-5 w-5 bg-red-500 border-2 border-white dark:border-slate-900 text-[10px] font-bold text-white leading-none shadow-sm">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Notifications</h3>
                {notifications.some(n => n.isUnackActivity) && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                )}
              </div>
              <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-full">{notifications.length} new</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  </div>
                  <span>No new notifications</span>
                </div>
              ) : (
                notifications.map(n => (
                  <div 
                    key={n.id}
                    className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      n.isUnackActivity ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ${
                        n.isUnackActivity
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                          : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                      }`}>
                        {n.isUnackActivity ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link 
                          to={n.link}
                          onClick={() => {
                            setIsOpen(false);
                            if (n.isUnackActivity) {
                              window.dispatchEvent(new Event('open_unack_activities'));
                            }
                          }}
                          className="block group"
                        >
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {n.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {n.message}
                          </p>
                        </Link>

                        {n.isUnackActivity && (
                          <div className="mt-2.5 flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={markingId === n.activityId}
                              onClick={(e) => handleMarkAsReadFromBell(e, n.activityId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors disabled:opacity-50"
                            >
                              {markingId === n.activityId ? (
                                <>
                                  <svg className="animate-spin w-3 h-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                  <span>Marking...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                  <span>Mark as Read</span>
                                </>
                              )}
                            </button>
                            <Link
                              to={n.link}
                              onClick={() => {
                                setIsOpen(false);
                                window.dispatchEvent(new Event('open_unack_activities'));
                              }}
                              className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-semibold"
                            >
                              Review & Acknowledge →
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
