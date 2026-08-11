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
  5: { label: 'Outstanding', desc: 'Performance represents an extraordinary level of achievement and commitment in terms of quantity, quality, and time. Employees at this performance level should have demonstrated exceptional job mastery in all major areas of responsibility.' },
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

      const email = user.primaryEmailAddress.emailAddress;
      
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
    if (computedRating === 'Outstanding') return 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/30';
    if (computedRating === 'Very Satisfactory') return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30';
    if (computedRating === 'Satisfactory') return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30';
    if (computedRating === 'Unsatisfactory') return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/30';
    return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30';
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
      const email = user.primaryEmailAddress.emailAddress;
      
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
        alert('Rating submitted successfully! An email notification has been sent to the PACD.');
        setIsRatingConfirmOpen(false);
        setIsRatingModalOpen(false);
        fetchData();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save rating.');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (error === 'Access Denied') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-red-200 dark:border-red-900">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Access Denied</h2>
          <p className="text-slate-600 dark:text-slate-400">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between pl-4 pr-2 md:pl-8 md:pr-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="hidden p-2 -ml-2 mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            COSW Evaluation
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'}
          </div>
          <CustomUserButton />
          <NotificationBell />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-2">
        <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loading text="Loading COSW Evaluation..." />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-6 py-4 w-[15%] min-w-[180px]">Employee Name</th>
                    <th className="px-6 py-4 w-[15%] min-w-[150px]">Position</th>
                    <th className="px-6 py-4 w-[25%] min-w-[200px]">Survey Name</th>
                    <th className="px-6 py-4 w-[15%] min-w-[180px]">Contract Period</th>
                    <th className="px-6 py-4 w-[15%] min-w-[150px]">Focal Person</th>
                    <th className="px-6 py-4 w-[10%] min-w-[100px]">Rating</th>
                    <th className="px-6 py-4 w-[5%] min-w-[100px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {employments.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 italic">
                        No evaluations found.
                      </td>
                    </tr>
                  ) : (
                    employments.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{emp.employee_name}</td>
                        <td className="px-6 py-4">{emp.position}</td>
                        <td className="px-6 py-4">{emp.survey_name}</td>
                        <td className="px-6 py-4 text-xs whitespace-nowrap">
                          {emp.contract_start_date} <span className="text-slate-400 mx-1">to</span> {emp.contract_end_date}
                        </td>
                        <td className="px-6 py-4">{focalPersons.find(f => f.email === emp.focal_person_email)?.name || emp.focal_person_email || '-'}</td>
                        <td className="px-6 py-4">
                          {emp.rating ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                              {emp.rating}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => openRatingModal(emp)} 
                            disabled={!!emp.rating}
                            className={`p-2 rounded-full transition-colors ${
                              emp.rating 
                                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                : 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            }`}
                            title={emp.rating ? "Rating already provided" : "Rate Performance"}
                          >
                            <svg className="w-5 h-5 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isRatingModalOpen && ratingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="flex flex-col w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl my-8">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-800 rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Performance Rating</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {ratingRecord.employee_name} &mdash; {ratingRecord.position}
              </p>
            </div>

            <form onSubmit={handleRatingSubmit} className="flex-1">
              <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                {/* Left column */}
                <div className="flex-1 px-6 py-5 space-y-4">

                  {RATING_CRITERIA.map(criterion => (
                    <div key={criterion.key} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800 dark:text-white">{criterion.label}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{criterion.description}</p>
                        </div>
                        <div className="w-full sm:w-48 shrink-0">
                          <select
                            required
                            value={ratingCriteria[criterion.key]}
                            onChange={e => setRatingCriteria(prev => ({ ...prev, [criterion.key]: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="">Select score...</option>
                            {[5, 4, 3, 2, 1].map(score => (
                              <option key={score} value={score}>{score} - {SCORE_DESCRIPTIONS[score].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {ratingCriteria[criterion.key] && (
                        <p className="text-xs italic text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/40 rounded-md px-3 py-2 mt-2">
                          {SCORE_DESCRIPTIONS[parseInt(ratingCriteria[criterion.key])].desc}
                        </p>
                      )}
                    </div>
                  ))}

                  <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${computedRatingColor}`}>
                    <span className="text-sm font-semibold">Overall Performance Rating:</span>
                    <span className="text-base font-bold">
                      {computedRating ? `${computedAverage.toFixed(2)} — ${computedRating}` : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Commendations / Remarks</label>
                    <textarea
                      rows={3}
                      value={ratingRemarks}
                      onChange={e => setRatingRemarks(e.target.value)}
                      placeholder="Optional but recommended to help justify the rating."
                      className="w-full p-3 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>
                </div>

                {/* Right column */}
                <div className="shrink-0 px-6 py-5 lg:w-[400px]">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Score Card</p>
                  <div className="space-y-3">
                    {[5,4,3,2,1].map(score => {
                      let colorClass = '';
                      let textClass = '';
                      if (score === 5) {
                        colorClass = 'border-teal-300 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-800';
                        textClass = 'text-teal-700 dark:text-teal-400';
                      } else if (score === 4) {
                        colorClass = 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800';
                        textClass = 'text-blue-700 dark:text-blue-400';
                      } else if (score === 3) {
                        colorClass = 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800';
                        textClass = 'text-amber-700 dark:text-amber-400';
                      } else if (score === 2) {
                        colorClass = 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800';
                        textClass = 'text-orange-700 dark:text-orange-400';
                      } else {
                        colorClass = 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800';
                        textClass = 'text-red-700 dark:text-red-400';
                      }
                      
                      return (
                        <div key={score} className={`rounded-lg border p-3 ${colorClass}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-lg font-black ${textClass}`}>{score}</span>
                            <span className="text-sm font-bold text-slate-800 dark:text-white">{SCORE_DESCRIPTIONS[score].label}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug">{SCORE_DESCRIPTIONS[score].desc}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 rounded-b-xl">
                <button type="button" onClick={() => setIsRatingModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={!computedRating} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  Submit Rating
                </button>
              </div>
            </form>

            {isRatingConfirmOpen && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm rounded-xl">
                <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 mx-4 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-center text-lg font-bold text-slate-900 dark:text-white mb-2">Confirm Submission</h3>
                  <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-2">
                    You are about to submit a rating of
                  </p>
                  <p className={`text-center text-base font-bold mb-4 ${computedRatingColor} rounded-lg px-3 py-2 border`}>
                    {computedAverage?.toFixed(2)} &mdash; {computedRating}
                  </p>
                  <p className="text-xs text-center text-red-600 dark:text-red-400 font-semibold mb-6 px-4">
                    This rating will be permanently saved. Are you sure?
                  </p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setIsRatingConfirmOpen(false)} disabled={isSubmitting} className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors">
                      Go Back
                    </button>
                    <button type="button" onClick={handleRatingConfirm} disabled={isSubmitting} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {isSubmitting ? 'Sending...' : 'Yes, Submit'}
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
