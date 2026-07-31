import React from 'react';

const Loading = ({ type = "table", text = "Loading..." }) => {
  if (type === "table") {
    return (
      <div className="w-full flex flex-col gap-0 border border-slate-100 rounded-lg overflow-hidden animate-pulse bg-white">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-slate-100 last:border-0">
            <div className="h-4 bg-slate-200 rounded w-1/5"></div>
            <div className="h-4 bg-slate-200 rounded w-12"></div>
            <div className="h-4 bg-slate-200 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 rounded w-24"></div>
            <div className="flex gap-2 ml-auto">
              <div className="h-8 w-8 bg-slate-200 rounded-md"></div>
              <div className="h-8 w-8 bg-slate-200 rounded-md"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "grid") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-6 w-full animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 h-48 flex flex-col gap-4">
            <div className="flex gap-4 items-center">
              <div className="h-12 w-12 bg-slate-200 rounded-full"></div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-3/4 bg-slate-200 rounded"></div>
                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <div className="h-8 w-20 bg-slate-200 rounded-full"></div>
              <div className="h-8 w-20 bg-slate-200 rounded-full"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback to spinner
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[16rem] gap-4">
      <div className="relative flex items-center justify-center w-12 h-12">
        <div className="absolute w-full h-full border-4 border-slate-200/50 rounded-full"></div>
        <div className="absolute w-full h-full border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-slate-500 font-medium animate-pulse">{text}</p>
    </div>
  );
};

export default Loading;
