import React from 'react';
import { useAuth } from '@clerk/clerk-react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  const { signOut } = useAuth();
  const navItems = [
    { name: 'Office Activities', icon: '💼', path: '/office-activities' },
    { name: 'Digital Logbook', icon: '📖', path: '/digital-logbook' },
    { name: 'Daily Time Record', icon: '⏱️', path: '/daily-time-record' },
    { name: 'Leave Credits', icon: '🏖️', path: '/leave-credits' },
    { name: 'Personal Calendar', icon: '📅', path: '/personal-calendar' },
    { name: 'Profile', icon: '👤', path: '/profile' },
  ];

  return (
    <aside className="w-64 bg-white text-slate-900 flex flex-col min-h-screen border-r border-slate-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-100 flex justify-center">
        <a href="#">
          <img src="/logo.png" alt="logo" className="w-40 hue-rotate-[-35deg]" />
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 mt-8 space-y-2">
        {navItems.map((item, index) => (
          <NavLink
            key={index}
            to={item.path}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm transition-all duration-200 group cursor-pointer ${
              isActive 
                ? 'bg-teal-50 text-teal-700 border-teal-200' 
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700'
            }`}
          >
            <span className="text-xl group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="font-medium text-sm">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout Button */}
      <div className="px-4 mb-4">
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group cursor-pointer"
        >
          <span className="group-hover:scale-110 transition-transform flex items-center justify-center text-slate-400 group-hover:text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </span>
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
}
