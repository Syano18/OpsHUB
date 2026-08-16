import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserButton, useAuth } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { useTheme } from './contexts/ThemeContext';

export default function CustomUserButton() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleThemeToggle = () => {
    document.body.classList.add('disable-transitions');
    setTheme(theme === 'light' ? 'dark' : 'light');
    setTimeout(() => {
      document.body.classList.remove('disable-transitions');
    }, 50);
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    signOut();
  };

  return (
    <>
      <UserButton 
      afterSignOutUrl="/" 
      userProfileMode="navigation" 
      userProfileUrl="/profile"
      appearance={{
        baseTheme: theme === 'dark' ? dark : undefined,
        elements: {
          userButtonPopoverActionButton__signOut: { display: "none" },
          userButtonPopoverActionButtonIcon__signOut: { display: "none" },
          userButtonPopoverFooter: { display: "none" }
        }
      }}
    >
      <UserButton.MenuItems>
        <UserButton.Action 
          label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'} 
          labelIcon={
            theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )
          } 
          onClick={handleThemeToggle} 
        />
        <UserButton.Action 
          label="Sign Out" 
          labelIcon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-red-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          } 
          onClick={handleLogoutClick} 
        />
      </UserButton.MenuItems>
    </UserButton>

    {/* Logout Confirmation Modal */}
    {showLogoutModal && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-500 dark:text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Ready to leave?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Are you sure you want to log out of your account?
            </p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
            <button
              onClick={() => setShowLogoutModal(false)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-400 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmLogout}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
