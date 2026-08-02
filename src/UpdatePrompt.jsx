import React, { useState, useEffect } from 'react';

export default function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only run the check in production
    if (import.meta.env.DEV) return;
    
    let currentVersion = null;

    const checkVersion = async () => {
      try {
        // Fetch the version.json file with a cache-busting query string
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        
        if (currentVersion === null) {
          currentVersion = data.version;
        } else if (currentVersion !== data.version) {
          setShowPrompt(true);
        }
      } catch (err) {
        console.error('Failed to check version:', err);
      }
    };

    // Check version immediately, then every 1 minute
    checkVersion();
    const interval = setInterval(checkVersion, 60 * 1000);
    
    // Also check when the user focuses the window
    const onFocus = () => checkVersion();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm flex flex-col gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex gap-4 items-start">
        <div className="text-teal-500 bg-teal-50 dark:bg-teal-900/30 p-2 rounded-full mt-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </div>
        <div>
          <h3 className="text-slate-800 dark:text-slate-100 font-bold text-sm">Update Available</h3>
          <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
            A new version of OpsHUB has been deployed. Please reload to fetch the latest changes.
          </p>
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-1">
        <button 
          onClick={() => setShowPrompt(false)}
          className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          Dismiss
        </button>
        <button 
          onClick={() => window.location.reload(true)}
          className="px-4 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          Reload Now
        </button>
      </div>
    </div>
  );
}
