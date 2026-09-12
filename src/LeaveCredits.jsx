import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';
import Alert from './Alert';
import { pdf } from '@react-pdf/renderer';
import CscForm6Pdf from './components/CscForm6Pdf';
import UseLeavePdf from './components/UseLeavePdf';
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format, addDays, subDays, isSameDay } from "date-fns";
import * as XLSX from 'xlsx';

// Helper to format inclusive dates
const formatInclusiveDates = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return '';
  const sorted = [...dates].sort((a, b) => a - b);

  const groupsByYear = [];
  sorted.forEach(d => {
    const y = d.getFullYear();
    const m = format(d, "MMM");
    const day = d.getDate();

    let yearGroup = groupsByYear.find(g => g.year === y);
    if (!yearGroup) {
      yearGroup = { year: y, months: [] };
      groupsByYear.push(yearGroup);
    }

    let monthGroup = yearGroup.months.find(mg => mg.month === m);
    if (!monthGroup) {
      monthGroup = { month: m, days: [] };
      yearGroup.months.push(monthGroup);
    }

    if (!monthGroup.days.includes(day)) {
      monthGroup.days.push(day);
    }
  });

  const yearStrings = groupsByYear.map(yg => {
    const monthStrings = yg.months.map(mg => `${mg.month} ${mg.days.join(', ')}`);
    return `${monthStrings.join(', ')}, ${yg.year}`;
  });

  return yearStrings.join('; ');
};

export default function LeaveCredits() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  
  // User & Balances State
  const [isAdmin, setIsAdmin] = useState(false);
  const [userBalances, setUserBalances] = useState({
    vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
  });

  // Admin states
  const [allUsers, setAllUsers] = useState([]);
  const [allFiledLeaves, setAllFiledLeaves] = useState([]);
  const [isAllFiledLeavesLoading, setIsAllFiledLeavesLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugError, setDebugError] = useState("");

  // Modals & History
  const [showFileLeave, setShowFileLeave] = useState(false);
  const [selectedHistoryType, setSelectedHistoryType] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Upload & Progress States
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openProgress, setOpenProgress] = useState(0);
  const [uploadingRecordId, setUploadingRecordId] = useState(null);
  const [pendingUploadId, setPendingUploadId] = useState(null);
  const [pendingUploadDoc, setPendingUploadDoc] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [transmittingRecordId, setTransmittingRecordId] = useState(null);
  const [transmitProgress, setTransmitProgress] = useState(0);

  // Admin Processing States
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [approvingApplication, setApprovingApplication] = useState(null);
  const [isUploadingFinal, setIsUploadingFinal] = useState(false);
  const [finalUploadProgress, setFinalUploadProgress] = useState(0);
  const [isDisapproving, setIsDisapproving] = useState(false);
  const [disapprovalReason, setDisapprovalReason] = useState("");
  const [viewingReason, setViewingReason] = useState(null);
  const [isProcessingDisapproval, setIsProcessingDisapproval] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  const [appFilterStatus, setAppFilterStatus] = useState("all");
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [balanceSearchQuery, setBalanceSearchQuery] = useState("");
  const [balanceFilterEmpStat, setBalanceFilterEmpStat] = useState("all");

  // PDF Generation State
  const printRef = useRef(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState(null);
  const [generatedRecordId, setGeneratedRecordId] = useState(null);
  const [empStat, setEmpStat] = useState("");
  const [userPosition, setUserPosition] = useState("");
  const [userSalary, setUserSalary] = useState("");
  const [userSalaryGrade, setUserSalaryGrade] = useState("");
  const [alertConfig, setAlertConfig] = useState(null);
  const [userNameParts, setUserNameParts] = useState({ firstName: '', middleName: '', lastName: '' });

  // Form Filing State
  const [fileLeaveType, setFileLeaveType] = useState("");
  const [leaveDetailType, setLeaveDetailType] = useState("");
  const [leaveDetailSpecify, setLeaveDetailSpecify] = useState("");
  const [inclusiveDates, setInclusiveDates] = useState([]);
  const [requestedDays, setRequestedDays] = useState("");
  const [reason, setReason] = useState("");
  const [isLeaveTypeDropdownOpen, setIsLeaveTypeDropdownOpen] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [signatories, setSignatories] = useState({
    hr: { name: '', position: 'HR Designate' },
    supervisor: { name: '', position: 'Supervising Statistical Specialist' },
    chief: { name: '', position: 'Chief Statistical Specialist' }
  });

  const [activeAdminTab, setActiveAdminTab] = useState('cards');

  const leaveOptions = empStat === 'COSW'
    ? ['Wellness Leave']
    : (userPosition && userPosition.toLowerCase().includes('chief statistical'))
      ? ['Vacation Leave', 'Sick Leave', 'Forced Leave', 'Special Privilege Leave', 'Wellness Leave']
      : ['Vacation Leave', 'Sick Leave', 'Forced Leave', 'Special Privilege Leave', 'USE Leave', 'Wellness Leave'];

  const getSelectedLeaveBalance = (type = fileLeaveType) => {
    if (!type) return null;
    switch (type) {
      case 'Vacation Leave': return userBalances.vl_balance;
      case 'Sick Leave': return userBalances.sl_balance;
      case 'Forced Leave': return userBalances.fl_balance;
      case 'Special Privilege Leave': return userBalances.spl_balance;
      case 'USE Leave': return userBalances.use_balance;
      case 'Wellness Leave': return userBalances.wl_balance;
      default: return null;
    }
  };

  const selectedBalance = getSelectedLeaveBalance();
  const isBalanceZero = selectedBalance !== null && selectedBalance <= 0;

  const handleCloseFileLeave = () => {
    setShowFileLeave(false);
    setFileLeaveType("");
    setLeaveDetailType("");
    setLeaveDetailSpecify("");
    setInclusiveDates([]);
    setRequestedDays("");
    setReason("");
    setIsLeaveTypeDropdownOpen(false);
    setFormErrors({});
  };

  const handleCardClick = async (leaveType) => {
    setSelectedHistoryType(leaveType);
    setIsHistoryLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/leave?action=getHistory&email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}&type=${encodeURIComponent(leaveType)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setHistoryData(data.history || []);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleUploadSigned = async (e, recordId) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingRecordId(recordId);
    setUploadProgress(10);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target.result;

      const interval = setInterval(() => {
        setUploadProgress(prev => (prev < 90 ? prev + 15 : prev));
      }, 300);

      try {
        const token = await getToken();
        await fetch('/api/leave', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'uploadDocument', id: recordId, base64Str })
        });

        clearInterval(interval);
        setUploadProgress(100);

        setTimeout(() => {
          setHistoryData(prev => prev.map(row =>
            row.id === recordId ? { ...row, signed_document: base64Str, has_document: 1 } : row
          ));
          setUploadProgress(0);
          setUploadingRecordId(null);
          setAlertConfig({ message: 'Signed document uploaded successfully!', type: 'success' });
          if (pendingUploadId === recordId) {
            setPendingUploadDoc(base64Str);
          }
        }, 500);

      } catch (err) {
        clearInterval(interval);
        setUploadProgress(0);
        setUploadingRecordId(null);
        console.error("Error uploading document:", err);
        setAlertConfig({ message: `Error uploading document: ${err.message || String(err)}`, type: 'error' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteLeave = async (row) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/leave?action=deleteRestore&id=${row.id}&email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}&daysApplied=${row.days_applied}&leaveType=${encodeURIComponent(row.leave_type)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.credits) {
        const r = data.credits;
        setUserBalances({
          vl_balance: Number(r.vl_balance),
          sl_balance: Number(r.sl_balance),
          fl_balance: Number(r.fl_balance),
          wl_balance: Number(r.wl_balance),
          use_balance: Number(r.use_balance),
          spl_balance: Number(r.spl_balance),
        });
      }

      setHistoryData(prev => prev.filter(h => h.id !== row.id));
      setAlertConfig({ message: 'Leave record deleted and balance restored.', type: 'success' });
    } catch (err) {
      console.error('Error deleting leave:', err);
      setAlertConfig({ message: `Error deleting record: ${err.message}`, type: 'error' });
    }
  };

  const handleTransmitLeave = async (row) => {
    if (row.status === 'Transmitted') return;
    setTransmittingRecordId(row.id);
    setTransmitProgress(15);
    try {
      const token = await getToken();
      setTransmitProgress(35);
      await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'transmitLeave', id: row.id })
      });
      setTransmitProgress(55);
      
      setHistoryData(prev => prev.map(h => h.id === row.id ? { ...h, status: 'Transmitted' } : h));

      try {
        await fetch('/api/leave', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ action: 'notifyTransmit', leaveId: row.id })
        });
      } catch (emailErr) {
        console.error("Failed to trigger transmit API:", emailErr);
      }
      setTransmitProgress(100);
      await new Promise(resolve => setTimeout(resolve, 400));

      setAlertConfig({ message: 'Leave marked as transmitted to HR!', type: 'success' });

      if (pendingUploadId === row.id) {
        setPendingUploadId(null);
        setPendingUploadDoc(null);
      }
    } catch (err) {
      console.error('Error transmitting leave:', err);
      setAlertConfig({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setTransmittingRecordId(null);
      setTransmitProgress(0);
    }
  };

  const handleViewFinalDocument = async (row) => {
    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.write('<div style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;"><div style="width: 48px; height: 48px; border: 4px solid #f3f3f3; border-top: 4px solid #10b981; border-radius: 50%; animation: spin 1s linear infinite;"></div><h3 style="margin-top: 16px; color: #1e293b;">Loading Final Document...</h3><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div>');
    }
    try {
      const token = await getToken();
      const res = await fetch(`/api/leave?action=getDocument&id=${row.id}&docType=final`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.document) {
        if (data.document.startsWith('http')) {
          if (popup) popup.location.href = data.document;
          else window.open(data.document, '_blank');
        } else {
          const byteString = atob(data.document.split(',')[1]);
          const mimeType = data.document.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: mimeType });
          const objUrl = URL.createObjectURL(blob);
          if (popup) popup.location.href = objUrl;
          else window.open(objUrl, '_blank');
        }
      } else {
        if (popup) popup.close();
        setAlertConfig({ message: 'No final document found.', type: 'error' });
      }
    } catch (err) {
      if (popup) popup.close();
      setAlertConfig({ message: 'Failed to fetch final document.', type: 'error' });
    }
  };

  const handleUploadFinalDocument = async (e, row) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setAlertConfig({ message: 'Only PDF files are allowed.', type: 'error' });
      return;
    }

    setIsUploadingFinal(true);
    setFinalUploadProgress(10);

    const interval = setInterval(() => {
      setFinalUploadProgress(prev => (prev < 90 ? prev + 15 : prev));
    }, 300);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Str = reader.result;
        const token = await getToken();
        await fetch('/api/leave', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'uploadFinalDocument', id: row.id, base64Str })
        });

        clearInterval(interval);
        setFinalUploadProgress(100);

        setTimeout(() => {
          setAllFiledLeaves(prev => prev.map(leave =>
            leave.id === row.id ? { ...leave, has_final_document: 1 } : leave
          ));
          setSelectedApplication(prev => prev ? { ...prev, has_final_document: 1 } : null);
          setIsUploadingFinal(false);
          setFinalUploadProgress(0);
          setAlertConfig({ message: 'Final HR document uploaded successfully!', type: 'success' });
        }, 500);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      clearInterval(interval);
      setIsUploadingFinal(false);
      setFinalUploadProgress(0);
      setAlertConfig({ message: `Upload error: ${err.message}`, type: 'error' });
    }
  };

  const handleViewDocument = async (row) => {
    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.write('<div style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;"><div style="width: 48px; height: 48px; border: 4px solid #e2e8f0; border-top: 4px solid #0d9488; border-radius: 50%; animation: spin 1s linear infinite;"></div><h3 style="margin-top: 16px; color: #334155; font-size: 16px;">Opening Document...</h3><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div>');
    }

    setOpeningDocId(row.id);
    setOpenProgress(10);
    const interval = setInterval(() => {
      setOpenProgress(prev => (prev < 90 ? prev + 15 : prev));
    }, 150);

    try {
      const token = await getToken();
      const res = await fetch(`/api/leave?action=getDocument&id=${row.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      clearInterval(interval);
      setOpenProgress(100);

      if (data.document) {
        if (data.type === 'url' || data.document.startsWith('http')) {
          if (popup) {
            popup.location.href = data.document;
          } else {
            window.open(data.document, '_blank');
          }
        } else {
          const base64 = data.document;
          const byteString = atob(base64.split(',')[1] || base64);
          const mimeType = base64.includes(',') ? base64.split(',')[0].split(':')[1].split(';')[0] : 'application/pdf';
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: mimeType });
          const objUrl = URL.createObjectURL(blob);
          if (popup) {
            popup.location.href = objUrl;
          } else {
            window.open(objUrl, '_blank');
          }
        }
      } else {
        if (popup) popup.close();
        setAlertConfig({ message: 'Document not found.', type: 'error' });
      }

      setTimeout(() => {
        setOpeningDocId(null);
        setOpenProgress(0);
      }, 300);

    } catch (err) {
      clearInterval(interval);
      if (popup) popup.close();
      setOpenProgress(0);
      setOpeningDocId(null);
      console.error("Error opening document:", err);
      setAlertConfig({ message: 'Failed to open document.', type: 'error' });
    }
  };

  const handleUpdateLeaveStatus = async (row, newStatus, reason = '') => {
    if (newStatus === 'Disapproved') {
      setIsProcessingDisapproval(true);
    } else if (newStatus === 'Approved') {
      setIsProcessingApproval(true);
    }

    try {
      const token = await getToken();
      const payload = { action: 'updateStatus', id: row.id, status: newStatus };
      if (reason) payload.disapproval_reason = reason;

      const res = await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setAlertConfig({ message: `Leave ${newStatus.toLowerCase()} successfully!`, type: 'success' });
        fetchAllFiledLeaves();
        fetchAllUsersCredits();
      } else {
        const errorData = await res.json();
        setAlertConfig({ message: `Error: ${errorData.error || 'Failed to update status'}`, type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setAlertConfig({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      if (newStatus === 'Disapproved') {
        setIsProcessingDisapproval(false);
      } else if (newStatus === 'Approved') {
        setIsProcessingApproval(false);
      }
    }
  };

  const handleFileLeave = async (e) => {
    e.preventDefault();

    if (!userPosition || !userSalary || !userSalaryGrade) {
      setAlertConfig({
        message: 'You cannot file a leave because your employee information is incomplete. Please ensure your Position, Salary, and Salary Grade are updated in your Profile.',
        type: 'error'
      });
      return;
    }

    const errors = {};
    if (!fileLeaveType) errors.leaveType = true;
    if (!inclusiveDates || inclusiveDates.length === 0) errors.inclusiveDates = true;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setAlertConfig({ message: 'Please fill in all required highlighted fields.', type: 'error' });
      return;
    }
    const parsedDays = parseFloat(requestedDays) || 0;

    if (fileLeaveType === 'Forced Leave') {
      if (parsedDays > (userBalances.fl_balance || 0)) {
        setAlertConfig({ 
          message: `Requested days (${parsedDays}) exceed your remaining Forced Leave quota (${(userBalances.fl_balance || 0).toFixed(2)} days available).`, 
          type: 'error' 
        });
        return;
      }
      if (parsedDays > (userBalances.vl_balance || 0)) {
        setAlertConfig({ 
          message: `Insufficient Vacation Leave credits (${(userBalances.vl_balance || 0).toFixed(2)} days available). Per CSC rules, Forced Leave is deducted from your Vacation Leave balance.`, 
          type: 'error' 
        });
        return;
      }
    }

    if (!printRef.current) return;

    setIsGeneratingPdf(true);
    setAlertConfig({ message: 'Generating Leave PDF Form...', type: 'success' });

    try {
      const formattedDates = Array.isArray(inclusiveDates)
        ? formatInclusiveDates(inclusiveDates)
        : inclusiveDates;
      const token = await getToken();
      const fetchRes = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'fileLeave',
          email: user.primaryEmailAddress.emailAddress,
          leaveType: fileLeaveType,
          startDate: formattedDates,
          daysApplied: parsedDays,
          reason: reason
        })
      });
      const resData = await fetchRes.json();
      if (!fetchRes.ok) {
        throw new Error(resData.error || 'Failed to file leave');
      }
      const newRecordId = resData.id;

      let pdfBlobUrl = "";
      const pdfData = {
        officeDepartment: 'PSA-RSSO CAR, Kalinga',
        nameParts: {
          firstName: userNameParts.firstName || user?.firstName || '',
          lastName: userNameParts.lastName || user?.lastName || '',
          middleName: userNameParts.middleName || ''
        },
        dateFiled: new Date().toLocaleDateString(),
        asOfDate: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        position: userPosition ? (userPosition.replace(/\s*[-\/]?\s*HR Designate\s*/gi, '').trim() || userPosition) : '',
        salary: userSalary,
        salaryGrade: userSalaryGrade,
        fileLeaveType,
        leaveDetailType,
        leaveDetailSpecify,
        inclusiveDates: Array.isArray(inclusiveDates) ? formatInclusiveDates(inclusiveDates) : inclusiveDates,
        requestedDays,
      };

      const pdfDocElement = fileLeaveType === 'USE Leave' 
        ? <UseLeavePdf formData={pdfData} signatories={signatories} />
        : <CscForm6Pdf formData={pdfData} userBalances={userBalances} signatories={signatories} />;

      const pdfBlob = await pdf(pdfDocElement).toBlob();
      pdfBlobUrl = URL.createObjectURL(pdfBlob);
      
      const isCSS = userPosition && userPosition.toLowerCase().includes('chief statistical');

      if (isCSS) {
        const a = document.createElement('a');
        a.href = pdfBlobUrl;
        a.download = `${fileLeaveType.replace(/\s+/g, '_')}_Form.pdf`;
        a.click();
        setPendingUploadId(newRecordId);
        setAlertConfig({ message: 'Form generated and downloaded. Please upload the signed document.', type: 'success' });
      } else {
        setGeneratedPdfUrl(pdfBlobUrl);
        setGeneratedRecordId(newRecordId);
        setAlertConfig({ message: 'Form generated successfully! You can now download, sign, and transmit.', type: 'success' });
      }
      handleCloseFileLeave();

      fetchInitialData();
    } catch (error) {
      console.error('Error generating PDF', error);
      setAlertConfig({ message: `Error generating PDF: ${error.message || String(error)}`, type: 'error' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePreviewPdf = async () => {
    const errors = {};
    if (!fileLeaveType) errors.leaveType = true;
    if (!inclusiveDates || inclusiveDates.length === 0) errors.inclusiveDates = true;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setAlertConfig({ message: 'Please select a leave type and dates to preview.', type: 'error' });
      return;
    }
    setFormErrors({});

    setIsGeneratingPdf(true);
    setAlertConfig({ message: 'Generating Preview in new tab...', type: 'success' });

    try {
      let pdfBlobUrl = "";
      const pdfData = {
        officeDepartment: 'PSA-RSSO CAR, Kalinga',
        nameParts: {
          firstName: userNameParts.firstName || user?.firstName || '',
          lastName: userNameParts.lastName || user?.lastName || '',
          middleName: userNameParts.middleName || ''
        },
        dateFiled: new Date().toLocaleDateString(),
        asOfDate: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        position: userPosition ? (userPosition.replace(/\s*[-\/]?\s*HR Designate\s*/gi, '').trim() || userPosition) : '',
        salary: userSalary,
        salaryGrade: userSalaryGrade,
        fileLeaveType,
        leaveDetailType,
        leaveDetailSpecify,
        inclusiveDates: Array.isArray(inclusiveDates) ? formatInclusiveDates(inclusiveDates) : inclusiveDates,
        requestedDays,
      };

      const pdfDocElement = fileLeaveType === 'USE Leave' 
        ? <UseLeavePdf formData={pdfData} signatories={signatories} />
        : <CscForm6Pdf formData={pdfData} userBalances={userBalances} signatories={signatories} />;

      const pdfBlob = await pdf(pdfDocElement).toBlob();
      pdfBlobUrl = URL.createObjectURL(pdfBlob);
      
      window.open(pdfBlobUrl, '_blank');
      setAlertConfig(null);
    } catch (error) {
      console.error('Error generating preview', error);
      setAlertConfig({ message: `Error generating preview: ${error.message || String(error)}`, type: 'error' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const fetchInitialData = async () => {
    if (!user) return;
    const email = user.primaryEmailAddress.emailAddress;
    try {
      const token = await getToken();

      const creditsRes = await fetch(`/api/leave?action=getCredits&email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const creditsData = await creditsRes.json();

      if (creditsData.user) {
        const row = creditsData.user;
        const role = row.Role;
        setEmpStat(row.emp_stat || "");
        setUserPosition(row.Position || "");
        setUserSalary(row.Salary || "");
        setUserSalaryGrade(row.Salary_Grade || "");
        const lastNameWithSuffix = row.Suffix ? `${row.Last_Name || ''} ${row.Suffix}`.trim() : (row.Last_Name || '');
        setUserNameParts({
          firstName: row.First_Name || '',
          middleName: row.Middle_Name || '',
          lastName: lastNameWithSuffix
        });
        const currentIsAdmin = role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin';
        setIsAdmin(currentIsAdmin);
        if (currentIsAdmin) {
          fetchAllUsersCredits();
          fetchAllFiledLeaves();
        }
      }

      if (creditsData.credits) {
        setUserBalances({
          vl_balance: Number(creditsData.credits.vl_balance),
          sl_balance: Number(creditsData.credits.sl_balance),
          fl_balance: Number(creditsData.credits.fl_balance),
          wl_balance: Number(creditsData.credits.wl_balance),
          use_balance: Number(creditsData.credits.use_balance),
          spl_balance: Number(creditsData.credits.spl_balance),
        });
      }

      const sigRes = await fetch('/api/leave?action=getSignatories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const sigData = await sigRes.json();

      const formatSigName = (r) => {
        const mi = r.Middle_Name ? ` ${r.Middle_Name.charAt(0)}.` : '';
        const suf = r.Suffix ? ` ${r.Suffix}` : '';
        return `${r.First_Name || ''}${mi} ${r.Last_Name || ''}${suf}`.trim().toUpperCase();
      };

      let hrSig = { name: '', position: 'HR Designate' };
      let supSig = { name: '', position: 'Supervising Statistical Specialist' };
      let chiefSig = { name: '', position: 'Chief Statistical Specialist' };

      let regionalHrSig = null;
      let regionalDirectorSig = null;

      (sigData.signatories || []).forEach(r => {
        const pos = r.Position || '';
        if (r.is_regional === 1) {
          if (pos.toLowerCase().includes('director') || pos.toLowerCase().includes('rd')) {
            regionalDirectorSig = { name: formatSigName(r), position: pos };
          } else {
            regionalHrSig = { name: formatSigName(r), position: pos };
          }
        } else {
          if (pos.includes('HR Designate')) {
            hrSig = { name: formatSigName(r), position: pos };
          } else if (pos.includes('Supervising Statistical Specialist')) {
            supSig = { name: formatSigName(r), position: pos };
          } else if (pos.includes('Chief Statistical Specialist')) {
            chiefSig = { name: formatSigName(r), position: pos };
          }
        }
      });

      const isCurrentCSS = (creditsData.user?.Position || '').includes('Chief Statistical Specialist');

      if (isCurrentCSS) {
        if (regionalHrSig) hrSig = regionalHrSig;
        supSig = { name: ' ', position: ' ' };
        if (regionalDirectorSig) chiefSig = regionalDirectorSig;
      }

      setSignatories({ hr: hrSig, supervisor: supSig, chief: chiefSig });
      setDebugError("");
    } catch (err) {
      console.error(err);
      setDebugError("Failed to fetch initial leave data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllUsersCredits = async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/leave?action=getAllUsersData', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      const creditsMap = {};
      (data.credits || []).forEach(c => {
        creditsMap[c.user_email] = c;
      });

      const merged = (data.users || []).map(u => {
        const lastNameWithSuffix = u.Suffix ? `${u.Last_Name || ''} ${u.Suffix}`.trim() : (u.Last_Name || '');
        const fullName = `${u.First_Name || ''} ${u.Middle_Name ? u.Middle_Name.charAt(0) + '.' : ''} ${lastNameWithSuffix}`.replace(/\s+/g, ' ').trim();
        return {
          ...u,
          Name: fullName,
          emp_stat: u.emp_stat,
          credits: creditsMap[u.Email] || {
            vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
          }
        };
      });
      setAllUsers(merged);
    } catch (err) {
      console.error('Error fetching all users data:', err);
    }
  };

  const fetchAllFiledLeaves = async () => {
    setIsAllFiledLeavesLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/leave?action=getAllLeaves', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAllFiledLeaves(data.leaves || []);
    } catch (err) {
      console.error('Error fetching all filed leaves:', err);
    } finally {
      setIsAllFiledLeavesLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [user]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);

    const vl = data.vl ? Number(data.vl) : 0;
    const sl = data.sl ? Number(data.sl) : 0;
    const fl = data.fl ? Number(data.fl) : 0;
    const wl = data.wl ? Number(data.wl) : 0;
    const useBal = data.use ? Number(data.use) : 0;
    const spl = data.spl ? Number(data.spl) : 0;

    try {
      const token = await getToken();
      const res = await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'updateUserCredits',
          email: editingUser.Email,
          vl, sl, fl, wl, use: useBal, spl
        })
      });

      if (!res.ok) throw new Error("Failed to update credits");

      if (editingUser.Email === user.primaryEmailAddress.emailAddress) {
        setUserBalances({
          vl_balance: Number(vl),
          sl_balance: Number(sl),
          fl_balance: Number(fl),
          wl_balance: Number(wl),
          use_balance: Number(useBal),
          spl_balance: Number(spl)
        });
      }

      setEditingUser(null);
      setAlertConfig({ message: 'Leave balances updated successfully!', type: 'success' });
      fetchAllUsersCredits();
    } catch (err) {
      console.error("Error saving edits:", err);
      setAlertConfig({ message: `Error saving edits: ${err.message}`, type: 'error' });
    }
  };

  const handleExportData = () => {
    try {
      const balancesData = allUsers.map(u => ({
        'Name': u.Name,
        'Email': u.Email,
        'Employment Status': u.emp_stat,
        'Vacation Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.vl_balance?.toFixed(2) || '0.00'),
        'Sick Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.sl_balance?.toFixed(2) || '0.00'),
        'Forced Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.fl_balance?.toFixed(2) || '0.00'),
        'Wellness Leave': u.credits?.wl_balance?.toFixed(2) || '0.00',
        'USE Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.Position && u.Position.toLowerCase().includes('chief statistical') ? '0.00' : (u.credits?.use_balance?.toFixed(2) || '0.00')),
        'Special Privilege Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.spl_balance?.toFixed(2) || '0.00')
      }));

      const applicationsData = allFiledLeaves.map(l => ({
        'Name': `${l.First_Name} ${l.Last_Name}`,
        'Email': l.user_email,
        'Leave Type': l.leave_type,
        'Inclusive Dates': l.start_date,
        'Days Applied': l.days_applied,
        'Status': l.status || 'Pending',
        'Filing Type': l.has_document === 1 ? 'Digital' : 'Manual',
        'Reason': l.reason || 'N/A'
      }));

      const wb = XLSX.utils.book_new();
      const balancesSheet = XLSX.utils.json_to_sheet(balancesData);
      const applicationsSheet = XLSX.utils.json_to_sheet(applicationsData);

      XLSX.utils.book_append_sheet(wb, balancesSheet, "Leave Balances");
      XLSX.utils.book_append_sheet(wb, applicationsSheet, "Leave History");

      XLSX.writeFile(wb, `OpsHUB_Leave_Data_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (error) {
      console.error("Export error:", error);
      setAlertConfig({ message: `Export error: ${error.message}`, type: 'error' });
    }
  };

  // Leave Cards Config
  const leaveCardsData = [
    {
      type: 'Vacation Leave',
      balance: userBalances.vl_balance,
      category: 'Rest & Recreation',
      iconColor: 'from-amber-500 to-orange-500',
      bgGlow: 'from-amber-500/10 to-orange-500/5',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
      accentBorder: 'from-amber-400 to-orange-500',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      ),
      visible: empStat !== 'COSW',
      description: 'Annual time-off for personal vacation, rest, and leisure activities.'
    },
    {
      type: 'Sick Leave',
      balance: userBalances.sl_balance,
      category: 'Medical & Recovery',
      iconColor: 'from-emerald-500 to-teal-500',
      bgGlow: 'from-emerald-500/10 to-teal-500/5',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
      accentBorder: 'from-emerald-400 to-teal-500',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      visible: empStat !== 'COSW',
      description: 'Absence due to illness, medical consultations, or hospital recovery.'
    },
    {
      type: 'Forced Leave',
      balance: userBalances.fl_balance,
      category: 'Mandatory Time-Off',
      iconColor: 'from-rose-500 to-red-500',
      bgGlow: 'from-rose-500/10 to-red-500/5',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40',
      accentBorder: 'from-rose-400 to-red-600',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      visible: empStat !== 'COSW',
      description: 'Mandatory 5-day annual leave deducted from Vacation Leave credits per CSC rules.'
    },
    {
      type: 'Special Privilege Leave',
      balance: userBalances.spl_balance,
      category: 'Milestones & Events',
      iconColor: 'from-indigo-500 to-blue-600',
      bgGlow: 'from-indigo-500/10 to-blue-500/5',
      badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40',
      accentBorder: 'from-indigo-400 to-blue-600',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      visible: empStat !== 'COSW',
      description: 'Non-cumulative leave for birthdays, anniversaries, and personal milestones.'
    },
    {
      type: 'Wellness Leave',
      balance: userBalances.wl_balance,
      category: 'Mental & Physical Health',
      iconColor: 'from-fuchsia-500 to-pink-500',
      bgGlow: 'from-fuchsia-500/10 to-pink-500/5',
      badgeBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-800/40',
      accentBorder: 'from-fuchsia-400 to-pink-600',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      visible: true,
      description: 'Dedicated leave for rest, mental rejuvenation, and physical well-being.'
    },
    {
      type: 'USE Leave',
      balance: userBalances.use_balance,
      category: 'Union Privileges',
      iconColor: 'from-sky-500 to-cyan-500',
      bgGlow: 'from-sky-500/10 to-cyan-500/5',
      badgeBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800/40',
      accentBorder: 'from-sky-400 to-cyan-500',
      iconSvg: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      visible: empStat !== 'COSW' && !(userPosition && userPosition.toLowerCase().includes('chief statistical')),
      description: 'Union of Statistics Employees designated day-off privileges.'
    }
  ];

  // Filtered Applications for Admin
  const filteredApplications = allFiledLeaves.filter(app => {
    const matchesFilter = appFilterStatus === 'all' 
      ? true 
      : (app.status || 'Pending').toLowerCase() === appFilterStatus.toLowerCase();
    
    const matchesSearch = !appSearchQuery.trim()
      ? true
      : `${app.First_Name || ''} ${app.Last_Name || ''} ${app.user_email || ''} ${app.leave_type || ''}`.toLowerCase().includes(appSearchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Filtered Users for Admin Balances
  const filteredUsers = allUsers.filter(u => {
    const matchesEmpStat = balanceFilterEmpStat === 'all' 
      ? true 
      : (u.emp_stat || '').toLowerCase() === balanceFilterEmpStat.toLowerCase();

    const matchesSearch = !balanceSearchQuery.trim()
      ? true
      : `${u.Name || ''} ${u.Email || ''} ${u.Position || ''}`.toLowerCase().includes(balanceSearchQuery.toLowerCase());

    return matchesEmpStat && matchesSearch;
  });

  const pendingApplicationsCount = allFiledLeaves.filter(l => (l.status || 'Pending') === 'Pending' || l.status === 'Transmitted').length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Hidden print element for PDF ref */}
      <div ref={printRef} className="hidden" />

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                Leave Credits
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                View balances, applications, and monthly credit history
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

      {/* Main Content Area - Expands vertically to fill entire window */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-4 flex flex-col gap-4 w-full min-h-0">
        
        {/* Top Action & Overview Banner */}
        <div className="shrink-0 bg-gradient-to-br from-white via-slate-50/80 to-teal-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-teal-950/20 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/40">
                {empStat === 'COSW' ? 'Contract of Service (COSW)' : (empStat || 'Regular Employee')}
              </span>
              {userPosition && (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  • {userPosition}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              My Leave Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Select any leave card below to view your filing history, upload signed transmittals, or check status.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={() => setShowFileLeave(true)}
              className="w-full md:w-auto group flex items-center justify-center gap-2.5 px-6 py-3 bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-600 hover:from-teal-400 hover:via-teal-500 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-md shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>File a Leave</span>
            </button>
          </div>
        </div>

        {debugError && (
          <div className="shrink-0 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{debugError}</span>
          </div>
        )}

        {/* Admin Navigation Tabs */}
        {isAdmin && (
          <div className="shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setActiveAdminTab('cards')}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeAdminTab === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Leave Cards
              </button>
              <button
                onClick={() => setActiveAdminTab('applications')}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeAdminTab === 'applications'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Leave Applications
                {pendingApplicationsCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-500 text-white rounded-full">
                    {pendingApplicationsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveAdminTab('balances')}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeAdminTab === 'balances'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Employee Balances
              </button>
            </div>

            <button
              onClick={handleExportData}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all flex items-center gap-2 shrink-0 self-end sm:self-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export to Excel</span>
            </button>
          </div>
        )}

        {/* Leave Cards Section - Expands to fill available vertical space */}
        {(!isAdmin || activeAdminTab === 'cards') && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 pb-2 min-h-0">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={`loading-card-${i}`} className="animate-pulse rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col justify-between h-full min-h-[260px]">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded w-1/3 my-auto"></div>
                  <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                </div>
              ))
            ) : (
              leaveCardsData.filter(card => card.visible).map((card) => (
                <div
                  key={card.type}
                  onClick={() => handleCardClick(card.type)}
                  className="group relative cursor-pointer flex flex-col justify-between rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/80 shadow-xs hover:shadow-2xl hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-1.5 active:translate-y-0 transition-all duration-300 overflow-hidden h-full min-h-[250px]"
                >
                  {/* Decorative Radial Background */}
                  <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${card.bgGlow} rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-500`}></div>

                  <div className="p-6 sm:p-7 relative z-10 flex flex-col flex-1">
                    {/* Top Header with Icon & Category */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr ${card.iconColor} text-white flex items-center justify-center shadow-md shadow-black/5 group-hover:scale-105 transition-transform duration-300 shrink-0`}>
                          {card.iconSvg}
                        </div>
                        <div>
                          <h3 className="text-base sm:text-lg lg:text-xl font-black text-slate-800 dark:text-white tracking-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-tight">
                            {card.type}
                          </h3>
                          <span className={`text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-md border inline-block mt-1 ${card.badgeBg}`}>
                            {card.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mb-4 leading-relaxed">
                      {card.description}
                    </p>

                    {/* Prominent Balance Number */}
                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800/70 flex items-baseline justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                          {Number(card.balance || 0).toFixed(2)}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          Days Available
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Interactive Banner */}
                  <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    <span>View Filing Records & Uploads</span>
                    <svg className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>

                  <div className={`h-1.5 w-full bg-gradient-to-r ${card.accentBorder}`}></div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Admin Section: Leave Applications Tab */}
        {isAdmin && activeAdminTab === 'applications' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl">
                {['all', 'Pending', 'Transmitted', 'Approved', 'Disapproved'].map(status => (
                  <button
                    key={status}
                    onClick={() => setAppFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize whitespace-nowrap ${
                      appFilterStatus === status
                        ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {status === 'all' ? 'All Records' : status}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="Search applicant or leave..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {isAllFiledLeavesLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 h-28"></div>
                ))
              ) : filteredApplications.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <svg className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-slate-600 dark:text-slate-300 font-bold">No leave applications found</p>
                  <p className="text-xs text-slate-400 mt-1">There are no leave requests matching your filter criteria.</p>
                </div>
              ) : (
                filteredApplications.map((leave, idx) => (
                  <div 
                    key={leave.id || idx} 
                    className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-slate-200 dark:border-slate-800 flex flex-col gap-4 relative overflow-hidden group"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-500 text-white font-bold flex items-center justify-center text-base shadow-sm">
                          {leave.First_Name ? leave.First_Name.charAt(0) : 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-white text-base">
                              {leave.First_Name} {leave.Last_Name}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {leave.user_email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-md border border-teal-200 dark:border-teal-800/40">
                              {leave.leave_type}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              Applied for <strong className="text-slate-800 dark:text-slate-200">{leave.days_applied} {Number(leave.days_applied) === 1 ? 'day' : 'days'}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${
                          leave.status === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' :
                          leave.status === 'Disapproved' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800' :
                          leave.status === 'Transmitted' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800' :
                          'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        }`}>
                          {leave.status || 'Pending'}
                        </span>

                        <button
                          onClick={() => setSelectedApplication(leave)}
                          className="px-4 py-2 rounded-xl text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-950/70 transition-colors inline-flex items-center gap-1.5 text-xs sm:text-sm border border-teal-200 dark:border-teal-800/40"
                        >
                          <span>Review & Process</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Inclusive Dates</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{leave.start_date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Applicant Document</span>
                        <span className={`font-semibold ${leave.has_document === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {leave.has_document === 1 ? '✓ Signed Form Uploaded' : 'Pending Upload'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Reason</span>
                        <span className="font-medium text-slate-600 dark:text-slate-400 truncate block">
                          {leave.reason || 'None specified'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Admin Section: Employee Balances Tab */}
        {isAdmin && activeAdminTab === 'balances' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl">
                {['all', 'Regular', 'COSW'].map(type => (
                  <button
                    key={type}
                    onClick={() => setBalanceFilterEmpStat(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize whitespace-nowrap ${
                      balanceFilterEmpStat === type
                        ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all' ? 'All Employees' : `${type} Staff`}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="Search employee by name..."
                  value={balanceSearchQuery}
                  onChange={(e) => setBalanceSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {filteredUsers.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-600 dark:text-slate-300 font-bold">No employees found</p>
                </div>
              ) : (
                filteredUsers.map((u, idx) => (
                  <div 
                    key={u.Email || idx}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-slate-200 dark:border-slate-800 flex flex-col gap-4 relative overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                          {u.Name ? u.Name.charAt(0) : '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-white text-base">
                              {u.Name}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                              {u.emp_stat || 'Regular'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {u.Email} {u.Position ? `• ${u.Position}` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setEditingUser(u)}
                        className="px-4 py-2 rounded-xl text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-950/70 transition-all inline-flex items-center gap-2 text-xs sm:text-sm border border-teal-200 dark:border-teal-800/40 self-end sm:self-auto"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        <span>Edit Balances</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-2">
                      <div className="flex flex-col items-center justify-center p-2.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/30">
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">VL</span>
                        <span className="text-lg font-black text-amber-700 dark:text-amber-300 font-mono">
                          {u.emp_stat === 'COSW' ? '-' : (u.credits?.vl_balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/60 dark:border-emerald-900/30">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">SL</span>
                        <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                          {u.emp_stat === 'COSW' ? '-' : (u.credits?.sl_balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-rose-50/60 dark:bg-rose-950/20 rounded-xl border border-rose-200/60 dark:border-rose-900/30">
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">FL</span>
                        <span className="text-lg font-black text-rose-700 dark:text-rose-300 font-mono">
                          {u.emp_stat === 'COSW' ? '-' : (u.credits?.fl_balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-fuchsia-50/60 dark:bg-fuchsia-950/20 rounded-xl border border-fuchsia-200/60 dark:border-fuchsia-900/30">
                        <span className="text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-400 uppercase">WL</span>
                        <span className="text-lg font-black text-fuchsia-700 dark:text-fuchsia-300 font-mono">
                          {(u.credits?.wl_balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-sky-50/60 dark:bg-sky-950/20 rounded-xl border border-sky-200/60 dark:border-sky-900/30">
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">USE</span>
                        <span className="text-lg font-black text-sky-700 dark:text-sky-300 font-mono">
                          {u.emp_stat === 'COSW' ? '-' : (u.Position && u.Position.toLowerCase().includes('chief statistical') ? '0.00' : (u.credits?.use_balance || 0).toFixed(2))}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-200/60 dark:border-indigo-900/30">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">SPL</span>
                        <span className="text-lg font-black text-indigo-700 dark:text-indigo-300 font-mono">
                          {u.emp_stat === 'COSW' ? '-' : (u.credits?.spl_balance || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: Individual Leave Type Records & History Drawer */}
      {/* ========================================================================= */}
      {selectedHistoryType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">
                    {selectedHistoryType} History
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Remaining Balance: <strong className="text-teal-600 dark:text-teal-400 font-mono font-black">{Number(getSelectedLeaveBalance(selectedHistoryType) || 0).toFixed(2)} Days</strong>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedHistoryType(null)} 
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              {isHistoryLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl h-24"></div>
                  ))}
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3 border border-teal-200/60 dark:border-teal-800/40">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">No Leave Records Found</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    You haven't filed any applications for {selectedHistoryType} yet.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedHistoryType(null);
                      setFileLeaveType(selectedHistoryType);
                      setShowFileLeave(true);
                    }}
                    className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    File {selectedHistoryType} Now
                  </button>
                </div>
              ) : (
                historyData.map((row) => (
                  <div 
                    key={row.id}
                    className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col gap-4"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 dark:text-white text-base">
                            {row.days_applied} {Number(row.days_applied) === 1 ? 'Day' : 'Days'} Applied
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            row.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            row.status === 'Disapproved' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                            row.status === 'Transmitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {row.status || 'Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Filed on: {row.created_at ? format(new Date(row.created_at), 'MMMM dd, yyyy') : 'N/A'}
                        </p>
                      </div>

                      {row.status === 'Disapproved' && row.disapproval_reason && (
                        <button
                          onClick={() => setViewingReason(row.disapproval_reason)}
                          className="px-3 py-1 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 text-xs font-bold rounded-lg border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100 transition-colors"
                        >
                          View Disapproval Reason
                        </button>
                      )}
                    </div>

                    <div className="bg-white dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 text-xs space-y-1">
                      <div className="flex gap-2">
                        <span className="text-slate-400 font-semibold w-24 shrink-0">Inclusive Dates:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{row.start_date}</span>
                      </div>
                      {row.reason && (
                        <div className="flex gap-2">
                          <span className="text-slate-400 font-semibold w-24 shrink-0">Reason:</span>
                          <span className="text-slate-600 dark:text-slate-300">{row.reason}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.has_document === 1 && (
                          <button
                            onClick={() => handleViewDocument(row)}
                            disabled={openingDocId === row.id}
                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            <span>{openingDocId === row.id ? 'Opening...' : 'View Uploaded Form'}</span>
                          </button>
                        )}

                        {row.status !== 'Approved' && row.status !== 'Disapproved' && (
                          <label className={`px-3 py-1.5 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold border border-teal-200 dark:border-teal-800/40 cursor-pointer transition-colors flex items-center gap-1.5 ${uploadingRecordId === row.id ? 'opacity-50 pointer-events-none' : ''}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            <span>{uploadingRecordId === row.id ? `Uploading (${uploadProgress}%)` : (row.has_document === 1 ? 'Replace Signed Form' : 'Upload Signed PDF')}</span>
                            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadSigned(e, row.id)} />
                          </label>
                        )}

                        {row.status === 'Pending' && (
                          <button
                            onClick={() => handleTransmitLeave(row)}
                            disabled={transmittingRecordId === row.id}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            <span>{transmittingRecordId === row.id ? 'Transmitting...' : 'Transmit to HR'}</span>
                          </button>
                        )}
                      </div>

                      {row.status === 'Pending' && (
                        <button
                          onClick={() => setRecordToDelete(row)}
                          className="px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          <span>Cancel & Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedHistoryType(null)}
                className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: File Leave Dialog */}
      {/* ========================================================================= */}
      {showFileLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-500 text-white flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">File Leave Application</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Civil Service Form No. 6 / USE Leave Generator</p>
                </div>
              </div>
              <button onClick={handleCloseFileLeave} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleFileLeave} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    1. Select Leave Type <span className="text-red-500">*</span>
                  </label>
                  <div className={`relative ${isLeaveTypeDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsLeaveTypeDropdownOpen(false);
                    }
                  }}>
                    <div
                      onClick={() => setIsLeaveTypeDropdownOpen(!isLeaveTypeDropdownOpen)}
                      className={`w-full px-4 py-3 border bg-slate-50 dark:bg-slate-950 rounded-xl cursor-pointer min-h-[46px] flex items-center justify-between hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors ${
                        formErrors.leaveType ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className={`text-sm font-semibold ${fileLeaveType ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                        {fileLeaveType ? fileLeaveType : 'Choose a leave type...'}
                      </span>
                      <div className="flex items-center gap-2">
                        {fileLeaveType && (
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                            Bal: {Number(getSelectedLeaveBalance(fileLeaveType) || 0).toFixed(2)}
                          </span>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isLeaveTypeDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5" />
                        </svg>
                      </div>
                    </div>

                    {isLeaveTypeDropdownOpen && (
                      <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden py-1">
                        {leaveOptions.map((opt) => {
                          const bal = getSelectedLeaveBalance(opt);
                          return (
                            <div
                              key={opt}
                              onClick={() => {
                                setFileLeaveType(opt);
                                setLeaveDetailType("");
                                setLeaveDetailSpecify("");
                                setIsLeaveTypeDropdownOpen(false);
                                setFormErrors(prev => ({ ...prev, leaveType: false }));
                              }}
                              className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-teal-50/60 dark:hover:bg-slate-800/80 transition-colors ${
                                fileLeaveType === opt ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold' : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span className="text-sm font-medium">{opt}</span>
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {bal !== null ? `${Number(bal).toFixed(2)} days` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {isBalanceZero && (
                    <div className="mt-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded-xl p-3 font-semibold flex items-center gap-2">
                      <svg className="w-5 h-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span>You have 0.00 balance remaining for {fileLeaveType}.</span>
                    </div>
                  )}

                  {fileLeaveType === 'Forced Leave' && (
                    <div className="mt-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 font-medium flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <div className="space-y-0.5">
                        <p className="font-bold text-amber-900 dark:text-amber-200">CSC Rule on Mandatory/Forced Leave:</p>
                        <p>Forced Leave will be deducted from your <strong>Vacation Leave</strong> balance ({Number(userBalances.vl_balance || 0).toFixed(2)} days available) as well as your annual 5-day Forced Leave quota.</p>
                      </div>
                    </div>
                  )}
                </div>

                {(fileLeaveType === "Vacation Leave" || fileLeaveType === "Special Privilege Leave" || fileLeaveType === "Forced Leave") && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Details of Leave (Location)
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="detail_type" value="Within the Philippines" checked={leaveDetailType === 'Within the Philippines'} onChange={(e) => setLeaveDetailType(e.target.value)} className="text-teal-600 focus:ring-teal-500" required />
                        Within the Philippines
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="detail_type" value="Abroad (Specify)" checked={leaveDetailType === 'Abroad (Specify)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="text-teal-600 focus:ring-teal-500" required />
                        Abroad (Specify)
                      </label>
                    </div>
                    {leaveDetailType && (
                      <input 
                        type="text" 
                        value={leaveDetailSpecify} 
                        onChange={(e) => setLeaveDetailSpecify(e.target.value)} 
                        required 
                        placeholder={leaveDetailType === 'Abroad (Specify)' ? "Specify country / destination..." : "Specify province / city..."} 
                        className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100" 
                      />
                    )}
                  </div>
                )}

                {fileLeaveType === "Sick Leave" && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Details of Sick Leave
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="detail_type" value="In Hospital (Specify Illness)" checked={leaveDetailType === 'In Hospital (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="text-teal-600 focus:ring-teal-500" required />
                        In Hospital
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="detail_type" value="Out Patient (Specify Illness)" checked={leaveDetailType === 'Out Patient (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="text-teal-600 focus:ring-teal-500" required />
                        Out Patient
                      </label>
                    </div>
                    {leaveDetailType && (
                      <input 
                        type="text" 
                        value={leaveDetailSpecify} 
                        onChange={(e) => setLeaveDetailSpecify(e.target.value)} 
                        required 
                        placeholder="Specify medical illness / diagnosis..." 
                        className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100" 
                      />
                    )}
                  </div>
                )}

                {fileLeaveType === "USE Leave" && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Where Day-off will be spent:
                    </label>
                    <input 
                      type="text" 
                      value={leaveDetailSpecify} 
                      onChange={(e) => setLeaveDetailSpecify(e.target.value)} 
                      required 
                      placeholder="Specify location..." 
                      className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100" 
                    />
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      2. Select Inclusive Dates <span className="text-red-500">*</span>
                    </label>
                    {inclusiveDates.length > 0 && (
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/50">
                        {inclusiveDates.length} {inclusiveDates.length === 1 ? 'day' : 'days'} selected
                      </span>
                    )}
                  </div>
                  
                  <div className={`w-full bg-slate-50 dark:bg-slate-950/60 border rounded-2xl p-4 shadow-xs leave-calendar ${formErrors.inclusiveDates ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <style>{`
                      .leave-calendar {
                        --rdp-accent-color: #0d9488;
                        --rdp-background-color: #ccfbf1;
                        font-size: 0.92rem;
                        width: 100%;
                      }
                      .leave-calendar .rdp {
                        margin: 0;
                        width: 100%;
                      }
                      .leave-calendar .rdp-months {
                        max-width: none;
                        width: 100%;
                      }
                      .leave-calendar .rdp-month {
                        width: 100%;
                      }
                      .leave-calendar .rdp-month_grid {
                        width: 100%;
                      }
                      .leave-calendar .rdp-day_button {
                        width: 100%;
                        height: 100%;
                        max-width: 38px;
                        max-height: 38px;
                        aspect-ratio: 1;
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        margin: 0 auto;
                        transition: all 0.15s ease-in-out;
                      }
                      .dark .rdp-day { color: #f1f5f9; }
                      .dark .rdp-head_cell { color: #94a3b8; }
                      .dark .leave-calendar { --rdp-background-color: #115e59; }
                      .dark .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #334155; }
                      .rdp-selected .rdp-day_button { 
                        background-color: #0d9488 !important; 
                        color: white !important; 
                        font-weight: bold; 
                        border-radius: 50% !important; 
                      }
                      .rdp-day_range_middle { background-color: #ccfbf1 !important; }
                      .dark .rdp-day_range_middle { background-color: #115e59 !important; }
                    `}</style>
                    <DayPicker
                      mode="multiple"
                      selected={inclusiveDates}
                      onSelect={(dates) => {
                        setInclusiveDates(dates || []);
                        setRequestedDays(dates ? dates.length : 0);
                        if (dates && dates.length > 0) setFormErrors(prev => ({ ...prev, inclusiveDates: false }));
                      }}
                      modifiers={{
                        range_start: (date) => inclusiveDates.some(d => isSameDay(d, date)) && !inclusiveDates.some(d => isSameDay(d, subDays(date, 1))),
                        range_middle: (date) => inclusiveDates.some(d => isSameDay(d, date)) && inclusiveDates.some(d => isSameDay(d, subDays(date, 1))) && inclusiveDates.some(d => isSameDay(d, addDays(date, 1))),
                        range_end: (date) => inclusiveDates.some(d => isSameDay(d, date)) && !inclusiveDates.some(d => isSameDay(d, addDays(date, 1))),
                      }}
                      modifiersClassNames={{
                        range_start: "rdp-day_range_start",
                        range_middle: "rdp-day_range_middle",
                        range_end: "rdp-day_range_end",
                        today: "font-bold text-teal-600 dark:text-teal-400"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    3. Reason / Notes (Optional)
                  </label>
                  <textarea 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)} 
                    rows="2" 
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs sm:text-sm text-slate-800 dark:text-slate-100 resize-none" 
                    placeholder="Provide additional details or reason for leave..."
                  />
                </div>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
                <button 
                  type="button" 
                  onClick={handleCloseFileLeave} 
                  disabled={isGeneratingPdf} 
                  className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handlePreviewPdf} 
                  disabled={isGeneratingPdf || isBalanceZero} 
                  className="px-4 py-2 text-xs sm:text-sm font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 rounded-xl border border-teal-200 dark:border-teal-800/40 transition-colors disabled:opacity-50"
                >
                  Preview PDF
                </button>
                <button 
                  type="submit" 
                  disabled={isGeneratingPdf || isBalanceZero} 
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-xl transition-all shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isGeneratingPdf ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <span>Generating Form...</span>
                    </>
                  ) : 'Generate & File Form'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Post-Generation Next Steps Modal */}
      {/* ========================================================================= */}
      {generatedPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4 border border-teal-200 dark:border-teal-800/50">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                Leave Form Ready!
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                Your application has been logged and the PDF generated. Download and sign the document, then upload and transmit it to HR.
              </p>

              <div className="flex flex-col gap-3 w-full mb-4">
                <a
                  href={generatedPdfUrl}
                  download="Leave_Application_Form.pdf"
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <span>Download Generated PDF</span>
                </a>

                <label className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors border border-slate-200 dark:border-slate-700">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  <span>Upload Signed PDF Document</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (generatedRecordId) {
                        handleUploadSigned(e, generatedRecordId);
                      }
                    }}
                  />
                </label>
              </div>

              <button
                onClick={() => {
                  setGeneratedPdfUrl(null);
                  setGeneratedRecordId(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold"
              >
                Done (I will upload later from Leave History)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: Edit User Balances (Admin) */}
      {/* ========================================================================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Edit Leave Balances</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{editingUser.Name} ({editingUser.Email})</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vacation Leave (VL)</label>
                    <input type="number" step="0.01" name="vl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.vl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Sick Leave (SL)</label>
                    <input type="number" step="0.01" name="sl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.sl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Forced Leave (FL)</label>
                    <input type="number" step="0.01" name="fl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.fl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Wellness Leave (WL)</label>
                    <input type="number" step="0.01" name="wl" defaultValue={editingUser.credits.wl_balance} required className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">USE Leave</label>
                    <input type="number" step="0.01" name="use" defaultValue={editingUser.emp_stat === 'COSW' ? '' : (editingUser.Position && editingUser.Position.toLowerCase().includes('chief statistical') ? '0.00' : editingUser.credits.use_balance)} disabled={editingUser.emp_stat === 'COSW' || (editingUser.Position && editingUser.Position.toLowerCase().includes('chief statistical'))} required={editingUser.emp_stat !== 'COSW' && !(editingUser.Position && editingUser.Position.toLowerCase().includes('chief statistical'))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Special Privilege (SPL)</label>
                    <input type="number" step="0.01" name="spl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.spl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 disabled:opacity-50" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: Application Details Review & Approvals Modal (Admin) */}
      {/* ========================================================================= */}
      {selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-white">Leave Application Details</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Application ID #{selectedApplication.id}</p>
              </div>
              <button onClick={() => { setSelectedApplication(null); setIsDisapproving(false); setDisapprovalReason(""); }} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-xs">
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">Applicant Name</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{selectedApplication.First_Name} {selectedApplication.Last_Name}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">Leave Type</p>
                  <p className="font-bold text-teal-600 dark:text-teal-400 text-sm">{selectedApplication.leave_type}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">Inclusive Dates</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.start_date}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">Days Applied</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{selectedApplication.days_applied} Days</p>
                </div>
                {selectedApplication.reason && (
                  <div className="col-span-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <p className="text-slate-400 font-semibold mb-0.5">Reason</p>
                    <p className="text-slate-700 dark:text-slate-300">{selectedApplication.reason}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Required Documents
                </h4>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">Applicant Signed Form</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedApplication.has_document === 1 ? '✓ Uploaded by employee' : 'No document uploaded yet'}
                      </p>
                    </div>
                  </div>
                  {selectedApplication.has_document === 1 && (
                    <button 
                      onClick={() => handleViewDocument(selectedApplication)} 
                      className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800"
                    >
                      View
                    </button>
                  )}
                </div>

                {!(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical')) && (
                  <div className="flex items-center justify-between p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">HR / CSS Final Approved Document</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedApplication.has_final_document === 1 ? '✓ Final document attached' : 'Required before approval'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedApplication.has_final_document === 1 && (
                        <button 
                          onClick={() => handleViewFinalDocument(selectedApplication)} 
                          className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
                        >
                          View
                        </button>
                      )}

                      {selectedApplication.status !== 'Disapproved' && selectedApplication.status !== 'Approved' && (
                        <label className={`px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer ${isUploadingFinal ? 'opacity-50 pointer-events-none' : ''}`}>
                          {isUploadingFinal ? 'Uploading...' : (selectedApplication.has_final_document === 1 ? 'Replace' : 'Upload Final')}
                          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadFinalDocument(e, selectedApplication)} />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isDisapproving ? (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 shrink-0">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Reason for Disapproval</label>
                <textarea
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-red-500 outline-none resize-none text-xs h-20"
                  placeholder="State the reason for disapproving this leave request..."
                  value={disapprovalReason}
                  onChange={(e) => setDisapprovalReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setIsDisapproving(false); setDisapprovalReason(""); }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleUpdateLeaveStatus(selectedApplication, 'Disapproved', disapprovalReason);
                      setSelectedApplication(null);
                      setIsDisapproving(false);
                      setDisapprovalReason("");
                    }}
                    disabled={!disapprovalReason.trim()}
                    className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors shadow-xs"
                  >
                    Confirm Disapproval
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                {selectedApplication.status === 'Disapproved' || selectedApplication.status === 'Approved' ? (
                  <div className="flex w-full items-center justify-between">
                    <span className={`text-xs font-bold ${selectedApplication.status === 'Approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      Application {selectedApplication.status}
                    </span>
                    <button onClick={() => setSelectedApplication(null)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                      Close
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      {!selectedApplication.has_final_document && !(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical')) && (
                        <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Final PDF required for approval
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsDisapproving(true)}
                        className="px-4 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                      >
                        Disapprove
                      </button>
                      <button
                        onClick={() => setApprovingApplication(selectedApplication)}
                        disabled={(!selectedApplication.has_final_document && !(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical'))) || selectedApplication.status === 'Approved'}
                        className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve Application
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: Confirm Deletion Modal */}
      {/* ========================================================================= */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Cancel Leave Record</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mb-6 leading-relaxed">
              Are you sure you want to cancel this <strong>{recordToDelete.leave_type}</strong> record?
              The <strong>{recordToDelete.days_applied}</strong> day(s) will be immediately restored to your balance.
            </p>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setRecordToDelete(null)} className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                Keep Application
              </button>
              <button
                onClick={() => {
                  handleDeleteLeave(recordToDelete);
                  setRecordToDelete(null);
                }}
                className="px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs sm:text-sm font-bold shadow-xs"
              >
                Yes, Cancel Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: Confirm Approval Modal */}
      {/* ========================================================================= */}
      {approvingApplication && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-200 dark:border-emerald-800">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 dark:text-white mb-1">Approve Leave</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mb-6">
                Are you sure you want to approve this {approvingApplication.leave_type} for <strong>{approvingApplication.First_Name} {approvingApplication.Last_Name}</strong>?
              </p>
              <div className="flex gap-2.5 w-full">
                <button
                  onClick={() => setApprovingApplication(null)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUpdateLeaveStatus(approvingApplication, 'Approved');
                    setApprovingApplication(null);
                    setSelectedApplication(null);
                  }}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 font-bold rounded-xl text-xs transition-colors shadow-xs"
                >
                  Confirm Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: Viewing Disapproval Reason */}
      {/* ========================================================================= */}
      {viewingReason && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Disapproval Reason</h3>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5">
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm whitespace-pre-wrap">{viewingReason}</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setViewingReason(null)} className="px-5 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlays for ongoing transmissions / status updates */}
      {transmittingRecordId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center animate-spin">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Transmitting to HR...</p>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${transmitProgress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {isProcessingDisapproval && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950 text-red-600 flex items-center justify-center animate-spin">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Processing Disapproval...</p>
          </div>
        </div>
      )}

      {isProcessingApproval && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center animate-spin">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Processing Approval...</p>
          </div>
        </div>
      )}

      {/* Alert Notification Component */}
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
