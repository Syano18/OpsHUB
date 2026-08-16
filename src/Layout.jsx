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
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_status', email: user.primaryEmailAddress.emailAddress })
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

  useEffect(() => {
    const setupWebPush = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.register('/sw.js');
        const token = await getToken();

        // Convert base64 VAPID public key to Uint8Array
        const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        const urlBase64ToUint8Array = (base64String) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });

        await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'subscribe',
            email: user.primaryEmailAddress.emailAddress,
            subscription: subscription
          })
        });
      } catch (err) {
        console.error("Failed to setup web push:", err);
      }
    };

    setupWebPush();
  }, [user, getToken]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-400 dark:text-slate-500 font-medium animate-pulse">Verifying account access...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-slate-50 dark:bg-slate-950 overflow-hidden relative text-slate-900 dark:text-slate-100 flex-col md:flex-row">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative pb-[4.5rem] md:pb-0">
        <Outlet context={{ setIsSidebarOpen }} />
      </main>
    </div>
  );
}
