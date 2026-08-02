import React from 'react';
import { useAuth } from '@clerk/clerk-react';
import { NavLink } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navItems = [
    { name: 'Office Activities', icon: '💼', path: '/office-activities' },
    { name: 'Digital Logbook', icon: '📖', path: '/digital-logbook' },
    { name: 'Daily Time Record', icon: '⏱️', path: '/daily-time-record' },
    { name: 'Leave Credits', icon: '🏖️', path: '/leave-credits' },
    { name: 'Personal Calendar', icon: '📅', path: '/personal-calendar' },
    { name: 'Profile', icon: '👤', path: '/profile' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col min-h-screen border-r border-slate-200 dark:border-slate-800 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
        transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:z-10
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
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
              onClick={() => setIsOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm transition-all duration-200 group cursor-pointer ${
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

      {/* Theme Toggle & Logout */}
      <div className="px-4 mb-4 space-y-2">
        <div className="hidden md:flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
            {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </span>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
              theme === 'dark' ? 'bg-teal-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 group cursor-pointer"
        >
          <span className="group-hover:scale-110 transition-transform flex items-center justify-center text-slate-400 group-hover:text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </span>
          <span className="font-medium text-sm">Logout</span>
        </button>

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
    </>
  );
}
