import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';

export default function NotificationBell() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) return;
      try {
        const token = await getToken();
        const email = user.primaryEmailAddress.emailAddress;
        
        let newNotifications = [];
        let role = '';
        let currentUserDisplayName = '';
        
        // Fetch Activities
        const resAct = await fetch(`/api/activities?email=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
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
        }

        // Fetch pending leaves if Admin/Super Admin
        if (role === 'Super Admin' || role === 'Admin') {
          const resLeave = await fetch(`/api/leave?action=getPendingLeaves`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resLeave.ok) {
            const leaveData = await resLeave.json();
            const pendingLeaves = (leaveData.pendingLeaves || []).map(l => ({
              id: `leave_${l.id}`,
              title: `${l.First_Name} ${l.Last_Name} - ${l.leave_type}`,
              message: `A new leave request is pending approval.`,
              link: '/leave-credits'
            }));
            newNotifications = [...newNotifications, ...pendingLeaves];
          }
        }

        // Fetch pending evaluations
        if (role === 'Super Admin' || role === 'Admin' || role === 'Focal Person') {
          const resEval = await fetch(`/api/employments?action=getPendingEvaluations&email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
    
    // Set up polling to fetch notifications every 5 minutes (300000 ms)
    const intervalId = setInterval(fetchActivities, 300000);
    
    return () => clearInterval(intervalId);
  }, [user, getToken]);

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
          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Notifications</h3>
              <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{notifications.length} new</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                  No new notifications
                </div>
              ) : (
                notifications.map(n => (
                  <Link 
                    key={n.id}
                    to={n.link}
                    onClick={() => setIsOpen(false)}
                    className="block p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 w-8 h-8 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1 leading-tight">{n.title}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
