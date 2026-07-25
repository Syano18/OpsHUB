import React, { useEffect } from 'react';

export default function Alert({ message, type = 'error', onClose, duration = 3000 }) {
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

  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          bg: 'bg-emerald-500',
          icon: (
            <svg className="size-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )
        };
      case 'info':
        return {
          border: 'border-blue-200',
          text: 'text-blue-700',
          bg: 'bg-blue-500',
          icon: (
            <svg className="size-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'error':
      default:
        return {
          border: 'border-red-200',
          text: 'text-red-600',
          bg: 'bg-red-500',
          icon: (
             <svg xmlns="http://www.w3.org/2000/svg" className="size-5 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
             </svg>
          )
        };
    }
  };

  const style = getStyle();

  return (
    <div className={`fixed bottom-6 right-6 z-[100] w-full max-w-sm overflow-hidden rounded-lg bg-white border ${style.border} shadow-xl`} style={{ animation: 'slide-in 0.3s ease-out forwards' }}>
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
         {style.icon}
         <span className={`${style.text} text-sm font-medium`}>{message}</span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 ${style.bg}`} style={{ animation: `shrink-progress ${duration}ms linear forwards` }} />
    </div>
  );
}
