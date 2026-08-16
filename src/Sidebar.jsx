import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { NavLink } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (user?.primaryEmailAddress?.emailAddress) {
        try {
          const token = await getToken();
          const res = await fetch(`/api/activities?email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          setUserRole(data.user?.Role);
        } catch(e) {
          console.error(e);
        }
      }
    };
    fetchRole();
  }, [user, getToken]);

  const navItems = [
    { name: 'Office Activities', shortName: 'Activities', icon: '💼', path: '/office-activities' },
    { name: 'Digital Logbook', shortName: 'Logbook', icon: '📖', path: '/digital-logbook' },
    { name: 'Daily Time Record', shortName: 'DTR', icon: '⏱️', path: '/daily-time-record' },
    { name: 'Leave Credits', shortName: 'Leave', icon: '🏖️', path: '/leave-credits' },
    { name: 'Personal Calendar', shortName: 'Calendar', icon: '📅', path: '/personal-calendar' },
  ];

  if (['Super Admin', 'Admin', 'Focal Person'].includes(userRole)) {
    navItems.push({ name: 'COSW Evaluation', shortName: 'Evaluation', icon: '📋', path: '/cosw-evaluation' });
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col z-10 w-64 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen border-r border-slate-200 dark:border-slate-800 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Logo Section */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center">
          <a href="#" className="flex flex-col items-center">
            <img src="/logo-icon.png" alt="logo" className="w-16 md:w-20 hue-rotate-[-35deg] dark:brightness-110 dark:[filter:drop-shadow(1px_1px_0_#fff)_drop-shadow(-1px_-1px_0_#fff)_drop-shadow(1px_-1px_0_#fff)_drop-shadow(-1px_1px_0_#fff)]" />
            <div className="text-center mt-3">
              <h1 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-white tracking-tight leading-none">Operations Hub</h1>
              <p className="text-xs md:text-sm font-bold text-teal-600 dark:text-teal-400 mt-1">(OpsHUB)</p>
            </div>
          </a>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 mt-4 space-y-2 overflow-y-auto">
          {navItems.map((item, index) => (
            <NavLink
              key={index}
              to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm transition-all group cursor-pointer ${
              isActive 
                ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800' 
                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-400'
            }`}
          >
            <span className="text-xl group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="font-medium text-sm">{item.name}</span>
          </NavLink>
        ))}
        </nav>

        {/* Footer */}
        <div className="px-4 mb-4">
          <footer className="pt-2 flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[10px] font-medium">
             <a 
               href="https://www.facebook.com/chanotot" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="hover:text-teal-600 dark:hover:text-teal-400 hover:underline transition-colors"
             >
               TechCraft by Chano
             </a>
             <span className="opacity-80">                {__APP_VERSION__}</span>
          </footer>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center shadow-[0_-4px_24px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around w-full pb-[env(safe-area-inset-bottom)]">
          {navItems.map((item, index) => (
            <NavLink
              key={index}
              to={item.path}
              className={({ isActive }) => `flex flex-col items-center justify-center p-1 sm:p-2 min-w-0 flex-1 ${
                isActive 
                  ? 'text-teal-600 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-900/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/50'
              }`}
            >
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-[10px] sm:text-xs text-center leading-tight truncate w-full px-0.5">{item.shortName || item.name}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
