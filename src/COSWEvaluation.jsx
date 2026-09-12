import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';
import Loading from './components/Loading';

const RATING_CRITERIA = [
  { key: 'timeliness', label: 'Timeliness', description: 'Measures the ability to complete and submit assigned work outputs on time without compromising set deadlines.' },
  { key: 'quality', label: 'Quality', description: 'Measures the accuracy, completeness, and reliability of work outputs relative to the expected standards.' },
  { key: 'quantity', label: 'Quantity', description: 'Measures the volume of work accomplished against the target number of outputs within the contract period.' }
];

const SCORE_DESCRIPTIONS = {
  5: { label: 'Outstanding', desc: 'Performance represents an extraordinary level of achievement and commitment in terms of quantity, quality, and time. Demonstrated exceptional job mastery.' },
  4: { label: 'Very Satisfactory', desc: 'Performance exceeded expectations. All goals, objectives and targets were achieved above the established standards.' },
  3: { label: 'Satisfactory', desc: 'Performance met expectations in terms of quality of work, efficiency, and timeliness.' },
  2: { label: 'Unsatisfactory', desc: 'Performance failed to meet expectations, and/or one or more of the most critical goals were not met.' },
  1: { label: 'Poor', desc: 'Performance was consistently below expectations and/or reasonable progress towards critical goals was not achieved.' }
};

export default function COSWEvaluation() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  
  const [employments, setEmployments] = useState([]);
  const [focalPersons, setFocalPersons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'completed'
  const [surveyFilter, setSurveyFilter] = useState('all');

  // Rating Modal
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isRatingConfirmOpen, setIsRatingConfirmOpen] = useState(false);
  const [ratingRecord, setRatingRecord] = useState(null);
  
  const [ratingCriteria, setRatingCriteria] = useState({ timeliness: '', quality: '', quantity: '' });
  const [ratingRemarks, setRatingRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const token = await getToken();
      if (!token) return;

      const email = user?.primaryEmailAddress?.emailAddress;
      if (!email) return;
      
      const roleRes = await fetch(`/api/activities?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const roleData = await roleRes.json();
      setUserRole(roleData.user?.Role);

      if (!['Super Admin', 'Admin', 'Focal Person'].includes(roleData.user?.Role)) {
        setError('Access Denied');
        setIsLoading(false);
        return;
      }

      const empRes = await fetch(`/api/employments?action=getEmployments&email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const empData = await empRes.json();
      setEmployments(empData.employments || []);

      const fpRes = await fetch(`/api/employments?action=getFocalPersons&email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const fpData = await fpRes.json();
      setFocalPersons(fpData.focalPersons || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const openRatingModal = (entry) => {
    setRatingRecord(entry);
    setRatingCriteria({ timeliness: '', quality: '', quantity: '' });
    setRatingRemarks(entry.remarks || '');
    setIsRatingModalOpen(true);
  };

  const computedAverage = useMemo(() => {
    const scores = Object.values(ratingCriteria).filter(Boolean).map(Number);
    if (scores.length < RATING_CRITERIA.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [ratingCriteria]);

  const computedRating = useMemo(() => {
    if (!computedAverage) return null;
    if (computedAverage >= 4.5) return 'Outstanding';
    if (computedAverage >= 3.5) return 'Very Satisfactory';
    if (computedAverage >= 2.5) return 'Satisfactory';
    if (computedAverage >= 1.5) return 'Unsatisfactory';
    return 'Poor';
  }, [computedAverage]);

  const computedRatingColor = useMemo(() => {
    if (!computedRating) return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700';
    if (computedRating === 'Outstanding') return 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/50';
    if (computedRating === 'Very Satisfactory') return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50';
    if (computedRating === 'Satisfactory') return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50';
    if (computedRating === 'Unsatisfactory') return 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50';
    return 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50';
  }, [computedRating]);

  const handleRatingSubmit = (e) => {
    e.preventDefault();
    if (!computedRating) return;
    setIsRatingConfirmOpen(true);
  };

  const handleRatingConfirm = async () => {
    try {
      setIsSubmitting(true);
      const token = await getToken();
      const email = user?.primaryEmailAddress?.emailAddress;
      if (!email) return;
      
      const payload = {
        action: 'updateEmployment',
        data: { 
          ...ratingRecord,
          rating: `${computedAverage.toFixed(2)} — ${computedRating}`,
          remarks: ratingRemarks
        }
      };

      const res = await fetch(`/api/employments?email=${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setIsRatingConfirmOpen(false);
        setIsRatingModalOpen(false);
        fetchData();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.error || 'Failed to save rating.'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save rating.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unique Surveys list for filter
  const uniqueSurveys = useMemo(() => {
    const list = employments.map(e => e.survey_name).filter(Boolean);
    return Array.from(new Set(list));
  }, [employments]);

  // Filtered Employments
  const filteredEmployments = useMemo(() => {
    return employments.filter(emp => {
      const matchesSearch = !searchQuery || 
        (emp.employee_name && emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.position && emp.position.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.survey_name && emp.survey_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.focal_person_email && emp.focal_person_email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'completed' && !!emp.rating) ||
        (statusFilter === 'pending' && !emp.rating);

      const matchesSurvey = surveyFilter === 'all' || emp.survey_name === surveyFilter;

      return matchesSearch && matchesStatus && matchesSurvey;
    });
  }, [employments, searchQuery, statusFilter, surveyFilter]);

  // Statistics
  const totalCount = employments.length;
  const completedCount = employments.filter(e => !!e.rating).length;
  const pendingCount = totalCount - completedCount;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (error === 'Access Denied') {
    return (
      <div className="flex h-full items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-rose-200 dark:border-rose-900/50 max-w-md">
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/60 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-800/40">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You do not have permission to view COSW performance evaluations. Only Administrators and assigned Focal Persons have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      
      {/* Header */}
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-xs sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="lg:hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                COSW Evaluation
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Performance evaluation and ratings for Contract of Service Workers
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
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-4 flex flex-col gap-4 min-h-0 w-full">
        
        {/* Top Overview KPI Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 shrink-0">
          
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Total COSWs</span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">{totalCount}</span>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Evaluated / Rated</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 font-mono">{completedCount}</span>
                <span className="text-xs font-bold text-slate-400 font-mono">({completionPercentage}%)</span>
              </div>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Pending Evaluation</span>
              <span className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400 font-mono">{pendingCount}</span>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Focal Persons</span>
              <span className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">{focalPersons.length}</span>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
          </div>

        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          
          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Records ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Pending</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-white font-extrabold">{pendingCount}</span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'completed'
                  ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Rated ({completedCount})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Survey Filter */}
            {uniqueSurveys.length > 0 && (
              <select
                value={surveyFilter}
                onChange={e => setSurveyFilter(e.target.value)}
                className="w-full sm:w-48 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 dark:text-slate-100 font-semibold"
              >
                <option value="all">All Surveys</option>
                {uniqueSurveys.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {/* Search Box */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search employee or position..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 dark:text-slate-100"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {isLoading ? (
            <div className="w-full pb-6">
              <Loading type="grid" />
            </div>
          ) : filteredEmployments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">No Evaluation Records</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                {searchQuery || statusFilter !== 'all' || surveyFilter !== 'all'
                  ? 'No COSW records match your active search and filter criteria.'
                  : 'There are currently no active COSW employment records registered for evaluation.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-2">
              {filteredEmployments.map((emp) => {
                const focalPerson = focalPersons.find(f => f.email === emp.focal_person_email);
                const focalName = focalPerson?.name || emp.focal_person_email || 'Unassigned';
                const isRated = !!emp.rating;

                return (
                  <div
                    key={emp.id}
                    className="group relative flex flex-col justify-between rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-xl hover:border-purple-300 dark:hover:border-purple-800/60 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                  >
                    {/* Top Accent Line */}
                    <div className={`h-1.5 w-full ${
                      isRated 
                        ? 'bg-gradient-to-r from-teal-400 to-emerald-500' 
                        : 'bg-gradient-to-r from-amber-400 to-orange-500'
                    }`} />

                    <div className="p-5 sm:p-6 flex flex-col flex-1 gap-4">
                      
                      {/* Card Header: Employee Avatar & Position */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
                            {(emp.employee_name || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                              {emp.employee_name}
                            </h3>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block truncate">
                              {emp.position || 'COSW Staff'}
                            </span>
                          </div>
                        </div>

                        {/* Status Chip */}
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${
                          isRated
                            ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                        }`}>
                          {isRated ? 'Evaluated' : 'Pending'}
                        </span>
                      </div>

                      {/* Survey Tag */}
                      {emp.survey_name && (
                        <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                          <svg className="w-4 h-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title={emp.survey_name}>
                            {emp.survey_name}
                          </span>
                        </div>
                      )}

                      {/* Contract Period & Focal Person */}
                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Contract Timeline</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono text-[11px] mt-0.5">
                            {emp.contract_start_date || '—'} to {emp.contract_end_date || '—'}
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Focal Person</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate mt-0.5" title={focalName}>
                            {focalName}
                          </span>
                        </div>
                      </div>

                      {/* Rating Score Card */}
                      <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">Performance Score</span>
                          {isRated ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-base font-black text-teal-600 dark:text-teal-400 font-mono">
                                ⭐ {emp.rating}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 italic">
                              Pending Evaluation
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => openRatingModal(emp)}
                          disabled={isRated}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                            isRated
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                          <span>{isRated ? 'Score Recorded' : 'Rate Performance'}</span>
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Rating Modal */}
      {isRatingModalOpen && ratingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
          <div className="flex flex-col w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 my-auto overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Performance Rating Form</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Evaluating <span className="font-bold text-slate-800 dark:text-slate-200">{ratingRecord.employee_name}</span> &bull; {ratingRecord.position}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsRatingModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRatingSubmit} className="flex-1 flex flex-col">
              <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 p-6 gap-6">
                
                {/* Left Column: Criteria & Remarks */}
                <div className="flex-1 space-y-4">
                  {RATING_CRITERIA.map(criterion => (
                    <div key={criterion.key} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{criterion.label}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{criterion.description}</p>
                        </div>

                        <div className="w-full sm:w-48 shrink-0">
                          <select
                            required
                            value={ratingCriteria[criterion.key]}
                            onChange={e => setRatingCriteria(prev => ({ ...prev, [criterion.key]: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">Select Score (1-5)...</option>
                            {[5, 4, 3, 2, 1].map(score => (
                              <option key={score} value={score}>{score} — {SCORE_DESCRIPTIONS[score].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {ratingCriteria[criterion.key] && (
                        <div className="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/40 text-xs text-purple-900 dark:text-purple-300">
                          <strong>{ratingCriteria[criterion.key]} Stars ({SCORE_DESCRIPTIONS[parseInt(ratingCriteria[criterion.key])].label}):</strong> {SCORE_DESCRIPTIONS[parseInt(ratingCriteria[criterion.key])].desc}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Overall Average Indicator */}
                  <div className={`rounded-2xl border p-4 flex items-center justify-between ${computedRatingColor}`}>
                    <span className="text-xs sm:text-sm font-bold">Overall Performance Rating:</span>
                    <span className="text-base sm:text-lg font-black font-mono">
                      {computedRating ? `${computedAverage.toFixed(2)} — ${computedRating}` : 'Awaiting Scores'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      Commendations & Justification Remarks (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={ratingRemarks}
                      onChange={e => setRatingRemarks(e.target.value)}
                      placeholder="Write feedback, key achievements, or justification for this rating..."
                      className="w-full p-3 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>
                </div>

                {/* Right Column: Score Legend Card */}
                <div className="shrink-0 lg:w-[360px] space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Rating Legend & Scale
                  </h4>

                  {[5, 4, 3, 2, 1].map(score => {
                    let colorClass = '';
                    let badgeClass = '';
                    if (score === 5) {
                      colorClass = 'border-teal-200 dark:border-teal-800/50 bg-teal-50/50 dark:bg-teal-950/30';
                      badgeClass = 'bg-teal-500 text-white';
                    } else if (score === 4) {
                      colorClass = 'border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/30';
                      badgeClass = 'bg-blue-500 text-white';
                    } else if (score === 3) {
                      colorClass = 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/30';
                      badgeClass = 'bg-amber-500 text-white';
                    } else if (score === 2) {
                      colorClass = 'border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-950/30';
                      badgeClass = 'bg-orange-500 text-white';
                    } else {
                      colorClass = 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/30';
                      badgeClass = 'bg-red-500 text-white';
                    }

                    return (
                      <div key={score} className={`p-3 rounded-2xl border ${colorClass} transition-all`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${badgeClass}`}>
                            {score}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {SCORE_DESCRIPTIONS[score].label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {SCORE_DESCRIPTIONS[score].desc}
                        </p>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsRatingModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!computedRating}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-md shadow-purple-500/20 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  Submit Performance Rating
                </button>
              </div>
            </form>

            {/* Confirmation Dialog Overlay */}
            {isRatingConfirmOpen && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center border border-amber-200 dark:border-amber-800/40 shadow-sm">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">Confirm Rating Submission</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    You are recording a final score for {ratingRecord.employee_name}:
                  </p>
                  <div className={`py-2 px-4 rounded-xl font-bold font-mono text-sm mb-4 border ${computedRatingColor}`}>
                    {computedAverage?.toFixed(2)} &mdash; {computedRating}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-5">
                    This evaluation will be locked and an email notification will be transmitted to the PACD.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRatingConfirmOpen(false)}
                      disabled={isSubmitting}
                      className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={handleRatingConfirm}
                      disabled={isSubmitting}
                      className="flex-1 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-md shadow-purple-500/20 hover:shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                      {isSubmitting ? 'Saving...' : 'Yes, Confirm'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
