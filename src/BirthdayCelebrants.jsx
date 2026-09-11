import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getZodiacSign(month, day) {
  if ((month === 1 && day <= 19) || (month === 12 && day >= 22)) return { name: 'Capricorn', symbol: '♑', color: 'from-amber-500 to-stone-600' };
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return { name: 'Aquarius', symbol: '♒', color: 'from-cyan-500 to-blue-600' };
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return { name: 'Pisces', symbol: '♓', color: 'from-teal-400 to-cyan-600' };
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return { name: 'Aries', symbol: '♈', color: 'from-rose-500 to-red-600' };
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return { name: 'Taurus', symbol: '♉', color: 'from-emerald-500 to-green-600' };
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return { name: 'Gemini', symbol: '♊', color: 'from-amber-400 to-yellow-600' };
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return { name: 'Cancer', symbol: '♋', color: 'from-indigo-400 to-blue-600' };
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return { name: 'Leo', symbol: '♌', color: 'from-orange-400 to-amber-600' };
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return { name: 'Virgo', symbol: '♍', color: 'from-teal-500 to-emerald-600' };
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return { name: 'Libra', symbol: '♎', color: 'from-pink-400 to-rose-600' };
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return { name: 'Scorpio', symbol: '♏', color: 'from-purple-500 to-indigo-700' };
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return { name: 'Sagittarius', symbol: '♐', color: 'from-blue-500 to-violet-600' };
  return { name: 'Unknown', symbol: '✨', color: 'from-slate-400 to-slate-600' };
}

function computeBirthdayDetails(birthdateStr) {
  if (!birthdateStr) return null;
  const parts = birthdateStr.split('-');
  if (parts.length < 2) return null;

  const bYear = parts.length === 3 ? parseInt(parts[0], 10) : null;
  const bMonth = parseInt(parts[parts.length - 2], 10);
  const bDay = parseInt(parts[parts.length - 1], 10);

  if (isNaN(bMonth) || isNaN(bDay)) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  const isToday = bMonth === todayMonth && bDay === todayDay;

  // Next birthday date
  let nextBirthdayYear = currentYear;
  if (bMonth < todayMonth || (bMonth === todayMonth && bDay < todayDay)) {
    nextBirthdayYear = currentYear + 1;
  }

  const nextBirthdayDate = new Date(nextBirthdayYear, bMonth - 1, bDay);
  const todayZero = new Date(currentYear, todayMonth - 1, todayDay);
  const diffTime = nextBirthdayDate.getTime() - todayZero.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const turningAge = bYear ? nextBirthdayYear - bYear : null;
  const zodiac = getZodiacSign(bMonth, bDay);

  let statusText = '';
  let statusBadgeClass = '';

  if (isToday) {
    statusText = 'Today! 🎉';
    statusBadgeClass = 'bg-rose-500 text-white font-black animate-pulse shadow-md shadow-rose-500/30';
  } else if (diffDays === 1) {
    statusText = 'Tomorrow';
    statusBadgeClass = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold';
  } else if (diffDays <= 7) {
    statusText = `In ${diffDays} days`;
    statusBadgeClass = 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold';
  } else if (diffDays <= 30) {
    statusText = `In ${diffDays} days`;
    statusBadgeClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold';
  } else {
    statusText = `${MONTH_NAMES[bMonth - 1]} ${bDay}`;
    statusBadgeClass = 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60';
  }

  return {
    month: bMonth,
    day: bDay,
    year: bYear,
    isToday,
    diffDays,
    turningAge,
    zodiac,
    statusText,
    statusBadgeClass,
    formattedDate: `${MONTH_NAMES[bMonth - 1]} ${bDay}${bYear ? ', ' + bYear : ''}`
  };
}

export default function BirthdayCelebrants() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState(null);

  // Month Selector (0 = All, 13 = Upcoming 30 Days, 1-12 = Jan-Dec)
  const currentMonth = new Date().getMonth() + 1;
  const [selectedFilter, setSelectedFilter] = useState(currentMonth.toString());

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [editBirthdate, setEditBirthdate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchBirthdays = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    const email = user.primaryEmailAddress.emailAddress;
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetch(`/api/birthdays?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load birthday celebrants.');
      }
      setEmployees(data.employees || []);
      if (data.currentUser?.Role) {
        setUserRole(data.currentUser.Role);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load birthday celebrants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchBirthdays();
  }, [user]);

  const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';

  // Process employees with birthday metadata
  const processedEmployees = useMemo(() => {
    return employees.map(emp => {
      const f = emp.First_Name || '';
      const m = emp.Middle_Name ? emp.Middle_Name.charAt(0) + '. ' : '';
      const l = emp.Last_Name || '';
      const s = emp.Suffix ? ' ' + emp.Suffix : '';
      const fullName = `${f} ${m}${l}${s}`.trim();
      const bDetails = computeBirthdayDetails(emp.birthdate);

      return {
        ...emp,
        fullName,
        bDetails
      };
    });
  }, [employees]);

  // Today's Celebrants
  const todayCelebrants = useMemo(() => {
    return processedEmployees.filter(e => e.bDetails?.isToday);
  }, [processedEmployees]);

  // Filtered Celebrants based on month/tab & search query
  const filteredCelebrants = useMemo(() => {
    return processedEmployees.filter(emp => {
      const matchesSearch =
        !searchQuery ||
        emp.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.Position && emp.Position.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.Email && emp.Email.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'missing') return !emp.bDetails;
      if (selectedFilter === 'upcoming') {
        return emp.bDetails && emp.bDetails.diffDays <= 30;
      }

      const monthNum = parseInt(selectedFilter, 10);
      if (!isNaN(monthNum)) {
        return emp.bDetails && emp.bDetails.month === monthNum;
      }

      return true;
    }).sort((a, b) => {
      if (!a.bDetails && !b.bDetails) return a.fullName.localeCompare(b.fullName);
      if (!a.bDetails) return 1;
      if (!b.bDetails) return -1;
      if (selectedFilter === 'upcoming' || selectedFilter === 'all') {
        return a.bDetails.diffDays - b.bDetails.diffDays;
      }
      return a.bDetails.day - b.bDetails.day;
    });
  }, [processedEmployees, selectedFilter, searchQuery]);

  // Month counts for tabs
  const monthCounts = useMemo(() => {
    const counts = {};
    for (let m = 1; m <= 12; m++) counts[m] = 0;
    let upcomingCount = 0;
    let missingCount = 0;

    processedEmployees.forEach(e => {
      if (e.bDetails) {
        counts[e.bDetails.month] = (counts[e.bDetails.month] || 0) + 1;
        if (e.bDetails.diffDays <= 30) upcomingCount++;
      } else {
        missingCount++;
      }
    });

    return { counts, upcomingCount, missingCount };
  }, [processedEmployees]);

  const handleOpenEdit = (emp) => {
    setEditingTarget(emp);
    setEditBirthdate(emp.birthdate || '');
    setIsEditModalOpen(true);
  };

  const handleSaveBirthdate = async (e) => {
    e.preventDefault();
    if (!editingTarget) return;
    setIsSaving(true);
    try {
      const email = user.primaryEmailAddress.emailAddress;
      const token = await getToken();
      const res = await fetch('/api/birthdays', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email,
          targetEmail: editingTarget.Email,
          birthdate: editBirthdate
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update birthdate');
      }

      setAlertConfig({ message: `Birthdate for ${editingTarget.fullName} saved!`, type: 'success' });
      setIsEditModalOpen(false);
      setEditingTarget(null);
      fetchBirthdays();
    } catch (err) {
      console.error(err);
      setAlertConfig({ message: err.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V6a2 2 0 10-2 2h2zm0 13a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Birthday Celebrants
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Celebrate, track, and send greetings to provincial office celebrants
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {user?.firstName ? `Hello, ${user.firstName} 👋` : 'Welcome back!'}
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
          <NotificationBell />
          <CustomUserButton />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-4 flex flex-col gap-4 min-h-0 w-full custom-scrollbar">

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Spotlight Card: Today's Birthday Celebrants */}
        {todayCelebrants.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 p-6 text-white shadow-xl shadow-rose-500/20">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute left-1/3 -top-10 w-40 h-40 bg-yellow-300/20 rounded-full blur-xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shadow-inner shrink-0 animate-bounce">
                  🎂
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-xs font-black tracking-wider uppercase mb-1">
                    <span>🎉 Celebrating Today!</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                    Happy Birthday, {todayCelebrants.map(c => c.fullName).join(' & ')}!
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    Wishing you joy, great health, and continued success on your special day!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls & Filters */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search celebrant by name or position..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500/50 shadow-sm placeholder:text-slate-400"
              />
            </div>

            {/* Quick Filter Pill Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
              <button
                onClick={() => setSelectedFilter('upcoming')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  selectedFilter === 'upcoming'
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent shadow-md shadow-pink-500/20'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>⏳ Upcoming 30 Days</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedFilter === 'upcoming' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  {monthCounts.upcomingCount}
                </span>
              </button>

              <button
                onClick={() => setSelectedFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                  selectedFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                All Celebrants
              </button>

              {monthCounts.missingCount > 0 && (
                <button
                  onClick={() => setSelectedFilter('missing')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                    selectedFilter === 'missing'
                      ? 'bg-amber-500 text-white border-transparent'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  Missing Birthdate ({monthCounts.missingCount})
                </button>
              )}
            </div>
          </div>

          {/* 12 Months Horizontal Switcher Carousel */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 custom-scrollbar">
            {MONTH_NAMES.map((monthName, idx) => {
              const monthNum = (idx + 1).toString();
              const isSelected = selectedFilter === monthNum;
              const isCurrent = idx + 1 === currentMonth;
              const count = monthCounts.counts[idx + 1] || 0;

              return (
                <button
                  key={monthName}
                  onClick={() => setSelectedFilter(monthNum)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-pink-500 shadow-md shadow-pink-500/20'
                      : isCurrent
                      ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/80 hover:bg-pink-100'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{monthName.substring(0, 3)}</span>
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Celebrant Cards Grid */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <Loading text="Loading celebrants..." />
          ) : filteredCelebrants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredCelebrants.map(emp => {
                const b = emp.bDetails;
                const canEditThis = isAdmin;

                return (
                  <div
                    key={emp.id || emp.Email}
                    className={`relative rounded-3xl p-4 sm:p-5 border transition-all flex flex-col justify-between gap-3.5 group hover:shadow-lg ${
                      b?.isToday
                        ? 'bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-amber-500/10 border-rose-300 dark:border-rose-800 shadow-md'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-pink-300 dark:hover:border-pink-800 shadow-xs'
                    }`}
                  >
                    {/* Top Row: Avatar & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-sm shadow-md shrink-0 ${
                          b?.isToday
                            ? 'bg-gradient-to-tr from-rose-500 to-pink-500 text-white shadow-rose-500/30 ring-2 ring-rose-400'
                            : 'bg-gradient-to-tr from-pink-500 to-rose-400 text-white shadow-pink-500/20'
                        }`}>
                          {emp.First_Name ? emp.First_Name.charAt(0) : 'U'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight truncate">
                            {emp.fullName}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {emp.Position || 'Staff'}
                          </p>
                        </div>
                      </div>

                      {canEditThis && (
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0"
                          title="Set / Edit Birthdate"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Middle: Birthday & Zodiac Details */}
                    {b ? (
                      <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/60 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">🎂</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {b.formattedDate}
                            </span>
                          </div>

                          {/* Zodiac Pill */}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-700/60 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            <span>{b.zodiac.symbol}</span>
                            <span>{b.zodiac.name}</span>
                          </div>
                        </div>

                        {/* Countdown Badge */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Timeline</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${b.statusBadgeClass}`}>
                            {b.statusText}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl p-3 border border-amber-200/60 dark:border-amber-900/40 text-center flex flex-col items-center justify-center gap-1">
                        <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                          Birthdate not set yet
                        </span>
                        {canEditThis && (
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="text-[11px] font-bold text-pink-600 dark:text-pink-400 hover:underline"
                          >
                            + Add Birthday
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/30">
              <span className="text-4xl mb-2">🎈</span>
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No celebrants found</p>
              <p className="text-xs text-slate-400 mt-0.5">Try choosing a different month or clearing your search term.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Birthday Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 relative">
            <button
              onClick={() => { setIsEditModalOpen(false); setEditingTarget(null); }}
              className="p-2 absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/20">
                🎂
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Set Date of Birth
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {editingTarget?.fullName}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveBirthdate} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Birthdate <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  type="date"
                  value={editBirthdate}
                  onChange={e => setEditBirthdate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm font-medium transition-all shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setEditingTarget(null); }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold text-xs sm:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  {isSaving ? 'Saving...' : 'Save Birthdate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alert Notification */}
      {alertConfig && (
        <Alert
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertConfig(null)}
        />
      )}
    </div>
  );
}
