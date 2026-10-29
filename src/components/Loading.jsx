import React from 'react';

const Loading = ({ type = "table", text = "Loading..." }) => {
  if (type === "table") {
    return (
      <div className="w-full flex flex-col gap-0 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden animate-pulse bg-white dark:bg-slate-900">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/5"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-12"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
            <div className="flex gap-2 ml-auto">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "logbook") {
    return (
      <div className="flex flex-col gap-3 w-full animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm flex flex-col gap-3"
          >
            {/* Top bar: Reference Badge, Timestamp, Action */}
            <div className="flex justify-between items-start gap-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-28 bg-teal-100/70 dark:bg-teal-950/60 rounded-full"></div>
                <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-6 w-6 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
              </div>
            </div>

            {/* Particulars (Title / Subject) */}
            <div className="flex flex-col gap-1.5 my-1">
              <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-800 rounded"></div>
            </div>

            {/* Metadata Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
              {Array.from({ length: 4 }).map((_, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-1.5">
                  <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded"></div>
                </div>
              ))}
            </div>

            {/* Remarks / Encoded by Footer */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2">
              <div className="h-3.5 w-48 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-3.5 w-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "stack" || type === "stacked") {
    return (
      <div className="flex flex-col gap-4 w-full animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4 shadow-sm"
          >
            {/* Header: Status pill + actions */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
                <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800/60 rounded-md hidden sm:block"></div>
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-6 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                <div className="h-6 w-6 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
              </div>
            </div>

            {/* Title & Date */}
            <div className="flex flex-col gap-2">
              <div className="h-6 w-3/5 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
              <div className="h-4 w-1/3 bg-slate-100 dark:bg-slate-800/70 rounded"></div>
            </div>

            {/* Description lines */}
            <div className="flex flex-col gap-2 my-1">
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800/60 rounded"></div>
              <div className="h-4 w-4/5 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
            </div>

            {/* Meta row: Assigned To & Created By */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-6 w-28 bg-slate-100 dark:bg-slate-800 rounded-md"></div>
              </div>
              <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded"></div>
            </div>

            {/* Bottom action row: Status update bar */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
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
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 h-48 flex flex-col gap-4">
            <div className="flex gap-4 items-center">
              <div className="h-12 w-12 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "calendar") {
    return (
      <div className="w-full h-full min-h-[32rem] grid grid-cols-7 grid-rows-5 gap-px bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-800 animate-pulse rounded-b-2xl overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-2">
            <div className="h-4 w-6 bg-slate-200 dark:bg-slate-700 rounded-full mb-2"></div>
            <div className="h-16 bg-slate-100/50 dark:bg-slate-800/50 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "profile") {
    return (
      <div className="w-full h-full max-w-5xl mx-auto flex flex-col md:flex-row gap-6 p-4 md:p-8 animate-pulse">
        <div className="w-full md:w-80 flex flex-col gap-6 shrink-0">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <div className="w-32 h-32 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-8 w-full bg-slate-200 dark:bg-slate-700 rounded-lg mt-4"></div>
          </div>
        </div>
        <div className="flex-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-6">
          <div className="h-8 w-1/4 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Fallback to spinner
  return (
    <div className="flex flex-col items-center justify-start pt-16 w-full h-full min-h-[16rem] gap-4">
      <div className="relative flex items-center justify-center w-12 h-12">
        <div className="absolute w-full h-full border-4 border-slate-200/50 dark:border-slate-700/50 rounded-full"></div>
        <div className="absolute w-full h-full border-4 border-teal-500 dark:border-teal-400 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">{text}</p>
    </div>
  );
};

export default Loading;
