import React, { useEffect } from 'react';

export default function Alert({ message, onClose, duration = 3000 }) {
  // Auto-dismiss alert after specified duration
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm overflow-hidden rounded-lg bg-white border border-red-200 shadow-xl" style={{ animation: 'slide-in 0.3s ease-out forwards' }}>
      <style>{`
         @keyframes shrink-progress {
            from { width: 100%; }
            to { width: 0%; }
         }
         @keyframes slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
         }
      `}</style>
      <div className="px-4 py-3 flex items-center gap-3">
         <svg xmlns="http://www.w3.org/2000/svg" className="size-5 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
         </svg>
         <span className="text-red-600 text-sm font-medium">{message}</span>
      </div>
      <div className="absolute bottom-0 left-0 h-1 bg-red-500" style={{ animation: `shrink-progress ${duration}ms linear forwards` }} />
    </div>
  );
}
