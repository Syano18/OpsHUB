import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { NavLink } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  
  const [userRole, setUserRole] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = (e) => {
      const target = e.target;
      if (!target || target.scrollTop === undefined) return;
      if (target.scrollHeight <= target.clientHeight) return;

      const currentScrollY = target.scrollTop;
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentScrollY > lastScrollY.current + 10) {
            setIsNavVisible(false);
            setIsMobileMenuOpen(false);
          } else if (currentScrollY < lastScrollY.current - 10 || currentScrollY <= 0) {
            setIsNavVisible(true);
          }
          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

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
    { 
      name: 'Office Activities', 
      shortName: 'Activities', 
      path: '/office-activities',
      gradient: 'from-teal-500 to-emerald-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    },
    { 
      name: 'Digital Logbook', 
      shortName: 'Logbook', 
      path: '/digital-logbook',
      gradient: 'from-blue-500 to-indigo-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      )
    },
    { 
      name: 'Daily Time Record', 
      shortName: 'DTR', 
      path: '/daily-time-record',
      gradient: 'from-cyan-500 to-blue-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    { 
      name: 'Leave Credits', 
      shortName: 'Leave', 
      path: '/leave-credits',
      gradient: 'from-amber-500 to-orange-500',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      name: 'Personal Calendar', 
      shortName: 'Calendar', 
      path: '/personal-calendar',
      gradient: 'from-teal-500 to-emerald-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
  ];

  if (['Super Admin', 'Admin', 'Focal Person'].includes(userRole)) {
    navItems.push({ 
      name: 'COSW Evaluation', 
      shortName: 'Evaluation', 
      path: '/cosw-evaluation',
      gradient: 'from-purple-500 to-indigo-600',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    });
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
        <nav className="flex-1 px-3 mt-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item, index) => (
            <NavLink
              key={index}
              to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all group cursor-pointer ${
                isActive 
                  ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200/80 dark:border-teal-800/80 shadow-xs font-semibold' 
                  : 'bg-transparent text-slate-600 dark:text-slate-400 border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isActive 
                      ? `bg-gradient-to-tr ${item.gradient} text-white shadow-xs shadow-teal-500/20` 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 group-hover:bg-teal-50 dark:group-hover:bg-teal-950/40'
                  }`}>
                    {item.icon}
                  </div>
                  <span className="text-sm tracking-tight">{item.name}</span>
                </>
              )}
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
      <nav className={`md:hidden fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none transition-transform duration-300 ease-in-out ${isNavVisible ? 'translate-y-0' : 'translate-y-24'}`}>
        <div className="flex justify-between items-center w-full max-w-sm px-2 py-1.5 bg-[#242526]/80 backdrop-blur-xl border border-white/5 text-white shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-[2rem] pointer-events-auto relative">
          {navItems.slice(0, 3).map((item, index) => (
            <NavLink
              key={index}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => `flex items-center justify-center h-12 px-4 rounded-full transition-all duration-200 ${
                isActive 
                  ? 'bg-white/10' 
                  : 'hover:bg-white/5'
              }`}
            >
              {({ isActive }) => (
                <span className={`flex items-center justify-center transition-all duration-200 ${isActive ? 'text-teal-400 scale-110 drop-shadow-md' : 'text-white/70'}`}>
                  {item.icon}
                </span>
              )}
            </NavLink>
          ))}
          
          {/* Hamburger Menu */}
          <button 
             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             className={`flex items-center justify-center h-12 px-4 rounded-full transition-all duration-200 ${isMobileMenuOpen ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
          >
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex items-center justify-center">
               <line x1="4" y1="12" x2="20" y2="12"></line>
               <line x1="4" y1="6" x2="20" y2="6"></line>
               <line x1="4" y1="18" x2="20" y2="18"></line>
             </svg>
          </button>

          {/* Extra Items Popup */}
          {isMobileMenuOpen && (
            <div className="absolute bottom-[4.2rem] right-0 bg-[#242526] shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-2xl p-2 flex flex-col gap-1 min-w-[200px] pointer-events-auto border border-white/5 origin-bottom-right animate-in fade-in zoom-in-95 duration-200">
               {navItems.slice(3).map((item, index) => (
                 <NavLink
                   key={index}
                   to={item.path}
                   onClick={() => setIsMobileMenuOpen(false)}
                   className={({ isActive }) => `flex items-center gap-3 p-2.5 rounded-xl transition-all ${isActive ? 'bg-white/10 text-teal-400' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                 >
                   <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                   <span className="text-sm font-medium">{item.name}</span>
                 </NavLink>
               ))}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
