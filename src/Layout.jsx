import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { turso } from './db';
import Sidebar from './Sidebar';

export default function Layout() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isChecking, setIsChecking] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) {
        setIsChecking(false);
        return;
      }
      try {
        const res = await turso.execute({
          sql: "SELECT Status FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
          args: [user.primaryEmailAddress.emailAddress]
        });
        if (res.rows.length > 0) {
          const status = res.rows[0].Status;
          if (status && status.toLowerCase() === 'inactive') {
            await signOut();
            window.location.href = "/?error=Your+account+is+inactive.+Please+contact+your+administrator.";
            return;
          }
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
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <main className="flex-1 flex flex-col overflow-y-auto relative">
        <Outlet context={{ setIsSidebarOpen }} />
      </main>
    </div>
  );
}
