import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUser, useClerk, useAuth } from '@clerk/clerk-react';
import Sidebar from './Sidebar';

export default function Layout() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) {
        setIsChecking(false);
        return;
      }
      try {
        const res = await fetch('/api/check-user-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress })
        });
        const data = await res.json();
        if (data.success && data.status && data.status.toLowerCase() === 'inactive') {
          await signOut();
          window.location.href = "/?error=Your+account+is+inactive.+Please+contact+your+administrator.";
          return;
        }
      } catch(e) {
        console.error("Error checking user status:", e);
      } finally {
        setIsChecking(false);
      }
    };
    checkStatus();
  }, [user, signOut]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-400 font-medium animate-pulse">Verifying account access...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-slate-50 overflow-hidden relative">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
        <Outlet context={{ setIsSidebarOpen }} />
      </main>
    </div>
  );
}
