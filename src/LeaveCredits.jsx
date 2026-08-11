import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import CscForm6Printable from './components/CscForm6Printable';
import UseLeavePrintable from './components/UseLeavePrintable';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';
import Alert from './Alert';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format } from "date-fns";
import * as XLSX from 'xlsx';

// Helper to calculate sync
async function syncLeaveCredits(email, token) {
  const res = await fetch(`/api/leave?action=getCredits&email=${encodeURIComponent(email)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch leave credits');
  const data = await res.json();
  return { credits: data.credits, user: data.user };
}

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [userBalances, setUserBalances] = useState({
    vl_balance: 0, sl_balance: 0, fl_balance: 5, wl_balance: 5, use_balance: 6, spl_balance: 3
  });
  const [allUsers, setAllUsers] = useState([]);
  const [allFiledLeaves, setAllFiledLeaves] = useState([]);
  const [isAllFiledLeavesLoading, setIsAllFiledLeavesLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugError, setDebugError] = useState("");
  const [showFileLeave, setShowFileLeave] = useState(false);
  const [selectedHistoryType, setSelectedHistoryType] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openProgress, setOpenProgress] = useState(0);
  const [uploadingRecordId, setUploadingRecordId] = useState(null);
  const [pendingUploadId, setPendingUploadId] = useState(null);
  const [pendingUploadDoc, setPendingUploadDoc] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [transmittingRecordId, setTransmittingRecordId] = useState(null);
  const [transmitProgress, setTransmitProgress] = useState(0);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [approvingApplication, setApprovingApplication] = useState(null);
  const [isUploadingFinal, setIsUploadingFinal] = useState(false);
  const [finalUploadProgress, setFinalUploadProgress] = useState(0);
  const [isDisapproving, setIsDisapproving] = useState(false);
  const [disapprovalReason, setDisapprovalReason] = useState("");
  const [viewingReason, setViewingReason] = useState(null);
  const [isProcessingDisapproval, setIsProcessingDisapproval] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
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
  const applicationsRef = useRef(null);
  const balancesRef = useRef(null);

  const leaveOptions = empStat === 'COSW'
    ? ['Wellness Leave']
    : (userPosition && userPosition.toLowerCase().includes('chief statistical'))
      ? ['Vacation Leave', 'Sick Leave', 'Forced Leave', 'Special Privilege Leave', 'Wellness Leave']
      : ['Vacation Leave', 'Sick Leave', 'Forced Leave', 'Special Privilege Leave', 'USE Leave', 'Wellness Leave'];

  const getSelectedLeaveBalance = () => {
    if (!fileLeaveType) return null;
    switch (fileLeaveType) {
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
      // Restore balance
      const balanceColumn = {
        'Vacation Leave': 'vl_balance',
        'Sick Leave': 'sl_balance',
        'Forced Leave': 'fl_balance',
        'Special Privilege Leave': 'spl_balance',
        'USE Leave': 'use_balance',
        'Wellness Leave': 'wl_balance',
      }[row.leave_type];

      if (balanceColumn) {
        const token = await getToken();
        const updatedCredits = await fetch(`/api/leave?action=deleteRestore&id=${row.id}&email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}&daysApplied=${row.days_applied}&leaveType=${encodeURIComponent(row.leave_type)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(d => ({ rows: [d.credits] }));
        if (updatedCredits.rows.length > 0) {
          const r = updatedCredits.rows[0];
          setUserBalances({
            vl_balance: Number(r.vl_balance),
            sl_balance: Number(r.sl_balance),
            fl_balance: Number(r.fl_balance),
            wl_balance: Number(r.wl_balance),
            use_balance: Number(r.use_balance),
            spl_balance: Number(r.spl_balance),
          });
        }
      }

      // Deleted handled by API above
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
        await fetch('/api/notify-transmit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leaveId: row.id })
        });
      } catch (emailErr) {
        console.error("Failed to trigger transmit API:", emailErr);
      }
      setTransmitProgress(100);
      await new Promise(resolve => setTimeout(resolve, 400));

      setAlertConfig({ message: 'Leave marked as transmitted!', type: 'success' });

      // Auto-close the file leave upload modal
      if (typeof setPendingUploadId === 'function') {
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
      popup.document.write('<div style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;"><div style="width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #10b981; border-radius: 50%; animation: spin 1s linear infinite;"></div><h3 style="margin-top: 20px; color: #1e293b;">Loading Final Document...</h3><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div>');
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
      popup.document.write('<div style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;"><h3>Loading Document...</h3></div>');
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
        if (data.type === 'url') {
          if (popup) {
            popup.location.href = data.document;
          } else {
            window.open(data.document, '_blank');
          }
        } else {
          // Legacy Base64 handling
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
    setFormErrors({});

    if (!printRef.current) return;

    setIsGeneratingPdf(true);
    setAlertConfig({ message: 'Generating PDF...', type: 'success' });

    try {
      // Log the leave application
      const parsedDays = parseFloat(requestedDays) || 0;
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
      const newRecordId = resData.id;

      // Small delay to ensure the hidden component renders cleanly before capture
      await new Promise(resolve => setTimeout(resolve, 100));

      const imgData = await toJpeg(printRef.current, {
        pixelRatio: 2,
        quality: 0.8,
        cacheBust: true,
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Get image dimensions to scale properly
      const img = new Image();
      img.src = imgData;
      await new Promise((resolve) => { img.onload = resolve; });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();

      let imgWidth = pdfWidth;
      let imgHeight = (img.height * pdfWidth) / img.width;

      // Scale down proportionally if it exceeds page height
      if (imgHeight > pdfPageHeight) {
        imgHeight = pdfPageHeight;
        imgWidth = (img.width * pdfPageHeight) / img.height;
      }

      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfPageHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight, undefined, 'FAST');
      const pdfBlobUrl = pdf.output('bloburl');
      const isCSS = userPosition && userPosition.toLowerCase().includes('chief statistical');

      if (isCSS) {
        const a = document.createElement('a');
        a.href = pdfBlobUrl;
        a.download = 'Leave_Form.pdf';
        a.click();
        setPendingUploadId(newRecordId);
        setAlertConfig({ message: 'Form generated and downloaded. Please upload the signed document.', type: 'success' });
      } else {
        setGeneratedPdfUrl(pdfBlobUrl);
        setGeneratedRecordId(newRecordId);
        setAlertConfig({ message: 'Form generated successfully. Please select how you want to proceed.', type: 'success' });
      }
      const currentLeaveType = fileLeaveType;
      handleCloseFileLeave();

      // Refresh UI state
      fetchInitialData();
      if (selectedHistoryType === 'all' || selectedHistoryType === currentLeaveType) {
        handleCardClick(selectedHistoryType);
      }
    } catch (error) {
      console.error('Error generating PDF', error);
      setAlertConfig({ message: `Error generating PDF: ${error.message || String(error)}`, type: 'error' });
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
      setDebugError("Failed to fetch initial data");
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

    try {
      const token = await getToken();
      const res = await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'updateUserCredits',
          email: editingUser.Email,
          vl: data.vl, sl: data.sl, fl: data.fl, wl: data.wl, use: data.use, spl: data.spl
        })
      });

      if (!res.ok) throw new Error("Failed to update credits");

      // If editing self, update self balances
      if (editingUser.Email === user.primaryEmailAddress.emailAddress) {
        setUserBalances({
          vl_balance: Number(data.vl),
          sl_balance: Number(data.sl),
          fl_balance: Number(data.fl),
          wl_balance: Number(data.wl),
          use_balance: Number(data.use),
          spl_balance: Number(data.spl)
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
      // 1. Prepare Leave Balances Data
      const balancesData = allUsers.map(u => ({
        'Name': u.Name,
        'Email': u.Email,
        'Employment Status': u.emp_stat,
        'Vacation Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.vl_balance?.toFixed(2) || '0.00'),
        'Sick Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.sl_balance?.toFixed(2) || '0.00'),
        'Forced Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.fl_balance?.toFixed(2) || '0.00'),
        'Wellness Leave': u.credits?.wl_balance?.toFixed(2) || '0.00',
        'USE Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.use_balance?.toFixed(2) || '0.00'),
        'Special Privilege Leave': u.emp_stat === 'COSW' ? 'N/A' : (u.credits?.spl_balance?.toFixed(2) || '0.00')
      }));

      // 2. Prepare Leave Applications Data
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

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Create sheets
      const balancesSheet = XLSX.utils.json_to_sheet(balancesData);
      const applicationsSheet = XLSX.utils.json_to_sheet(applicationsData);

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, balancesSheet, "Leave Balances");
      XLSX.utils.book_append_sheet(wb, applicationsSheet, "Leave History");

      // Save file
      XLSX.writeFile(wb, `Leave_Data_Export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (error) {
      console.error("Export error:", error);
      setAlertConfig({ message: `Export error: ${error.message}`, type: 'error' });
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
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Leave Credits
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col">
        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={() => setShowFileLeave(true)}
            className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl shadow-sm hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            File Leave
          </button>
        </div>

        {debugError && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30 rounded-lg whitespace-pre-wrap">
            <strong>Error:</strong> {debugError}
          </div>
        )}

        {/* Admin Tabs */}
        {isAdmin && (
          <div className="flex gap-4 mb-6 flex-wrap">
            <button
              onClick={() => setActiveAdminTab('cards')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'cards' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Leave Cards
            </button>
            <button
              onClick={() => setActiveAdminTab('applications')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'applications' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Leave Applications
            </button>
            <button
              onClick={() => setActiveAdminTab('balances')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'balances' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Leave Balances
            </button>
            <div className="flex-1 hidden sm:block"></div>
            <button
              onClick={handleExportData}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium shadow-sm hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Data
            </button>
          </div>
        )}

        {/* Leave Cards Section */}
        {(!isAdmin || activeAdminTab === 'cards') && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 pb-2">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={`loading-card-${i}`} className="animate-pulse rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm h-[256px]">
                  <div className="p-8">
                    <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-xl mb-6"></div>
                    <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-6"></div>
                    <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                  </div>
                </div>
              ))
            ) : (
            <>
              {/* Vacation Leave */}
              {empStat !== 'COSW' && (
                <div onClick={() => handleCardClick('Vacation Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-24 h-24 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                  </div>
                  <div className="p-8 relative z-10 flex flex-col flex-1">
                    <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-amber-100 dark:border-amber-800/30">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Vacation Leave</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Rest & Recreation</p>
                    <div className="mt-auto flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.vl_balance).toFixed(2)}</span>
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500"></div>
                </div>
              )}

              {/* Forced Leave */}
              {empStat !== 'COSW' && (
                <div onClick={() => handleCardClick('Forced Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-24 h-24 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div className="p-8 relative z-10 flex flex-col flex-1">
                    <div className="w-12 h-12 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-rose-100 dark:border-rose-800/30">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Forced Leave</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Mandatory Time Off</p>
                    <div className="mt-auto flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.fl_balance).toFixed(2)}</span>
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-gradient-to-r from-rose-400 to-red-600"></div>
                </div>
              )}

              {/* Sick Leave */}
              {empStat !== 'COSW' && (
                <div onClick={() => handleCardClick('Sick Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-24 h-24 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  </div>
                  <div className="p-8 relative z-10 flex flex-col flex-1">
                    <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-teal-100 dark:border-teal-800/30">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Sick Leave</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Medical & Recovery</p>
                    <div className="mt-auto flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.sl_balance).toFixed(2)}</span>
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 to-emerald-500"></div>
                </div>
              )}

              {/* Special Privilege Leave */}
              {empStat !== 'COSW' && (
                <div onClick={() => handleCardClick('Special Privilege Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-24 h-24 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                  </div>
                  <div className="p-8 relative z-10 flex flex-col flex-1">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100 dark:border-indigo-800/30">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Special Privilege Leave</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Personal Milestones</p>
                    <div className="mt-auto flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.spl_balance).toFixed(2)}</span>
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-gradient-to-r from-indigo-400 to-blue-600"></div>
                </div>
              )}

              {/* Wellness Leave */}
              <div onClick={() => handleCardClick('Wellness Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                  <svg className="w-24 h-24 text-fuchsia-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="p-8 relative z-10 flex flex-col flex-1">
                  <div className="w-12 h-12 bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-fuchsia-100 dark:border-fuchsia-800/30">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Wellness Leave</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Mental & Physical Health</p>
                  <div className="mt-auto flex items-end gap-2">
                    <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.wl_balance).toFixed(2)}</span>
                    <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-gradient-to-r from-fuchsia-400 to-pink-600"></div>
              </div>

              {/* USE Leave */}
              {(empStat !== 'COSW' && !(userPosition && userPosition.toLowerCase().includes('chief statistical'))) && (
                <div onClick={() => handleCardClick('USE Leave')} className="cursor-pointer flex flex-col group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg className="w-24 h-24 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div className="p-8 relative z-10 flex flex-col flex-1">
                    <div className="w-12 h-12 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-500 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-sky-100 dark:border-sky-800/30">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">USE Leave</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">Union of Statistics Employees</p>
                    <div className="mt-auto flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{Number(userBalances.use_balance).toFixed(2)}</span>
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Days</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-gradient-to-r from-sky-400 to-cyan-500"></div>
                </div>
              )}
            </>
            )}
          </div>
        )}
        {/* Admin Management Sections */}
        {isAdmin && (
          <div className="mt-8">

            {/* Leave Applications Management */}
            {activeAdminTab === 'applications' && (
              <div ref={applicationsRef} className="scroll-mt-8">
                <div className="flex flex-col gap-3">
                  {allFiledLeaves.map((leave, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-white text-lg">{leave.First_Name} {leave.Last_Name}</div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">{leave.user_email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                            leave.status === 'Disapproved' ? 'bg-red-100 text-red-800' :
                              leave.status === 'Transmitted' ? 'bg-amber-100 text-amber-800' :
                                'bg-slate-100 text-slate-800'
                            }`}>
                            {leave.status || 'Pending'}
                          </span>
                          <button
                            onClick={() => setSelectedApplication(leave)}
                            className="px-3 py-1.5 rounded-lg text-indigo-600 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors inline-flex items-center gap-1 text-sm border border-indigo-100 dark:border-indigo-800/30"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider mb-1">Leave Type</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{leave.leave_type}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider mb-1">Dates ({leave.days_applied} Days)</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap">{leave.start_date}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider mb-1">Processing</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{leave.has_document === 1 ? 'Digital' : 'Manual'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isAllFiledLeavesLoading && (
                    <div className="animate-pulse bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 h-32"></div>
                  )}
                  {!isAllFiledLeavesLoading && allFiledLeaves.length === 0 && (
                    <div className="text-center py-8 text-slate-500">No leave applications found.</div>
                  )}
                </div>
              </div>
            )}

            {/* Leave Balances Management */}
            {activeAdminTab === 'balances' && (
              <div ref={balancesRef} className="scroll-mt-8">
                <div className="flex flex-col gap-3">
                  {allUsers.map((u, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                      <div className="flex justify-between items-start md:items-center">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-white text-lg">{u.Name}</div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">{u.Email}</div>
                        </div>
                        <button
                          onClick={() => setEditingUser(u)}
                          className="px-3 py-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors inline-flex items-center gap-1 text-sm border border-indigo-100 dark:border-indigo-800/30"
                        >
                          Edit Balances
                        </button>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">VL</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.emp_stat === 'COSW' ? '-' : u.credits.vl_balance.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SL</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.emp_stat === 'COSW' ? '-' : u.credits.sl_balance.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">FL</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.emp_stat === 'COSW' ? '-' : u.credits.fl_balance.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">WL</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.credits.wl_balance.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">USE</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.emp_stat === 'COSW' ? '-' : u.credits.use_balance.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SPL</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{u.emp_stat === 'COSW' ? '-' : u.credits.spl_balance.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {allUsers.length === 0 && (
                    <div className="text-center py-8 text-slate-500">No employees found.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Leave Modal */}
      {showFileLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">File a Leave</h3>
              <button onClick={handleCloseFileLeave} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleFileLeave} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Leave Type</label>
                  <div className={`relative ${isLeaveTypeDropdownOpen ? 'z-50' : ''}`} tabIndex={0} onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsLeaveTypeDropdownOpen(false);
                    }
                  }}>
                    <div className="relative">
                      <div
                        onClick={() => setIsLeaveTypeDropdownOpen(!isLeaveTypeDropdownOpen)}
                        className={`w-full px-4 py-2 pr-10 border bg-slate-50 dark:bg-slate-950 rounded-lg cursor-pointer min-h-[42px] flex items-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${formErrors.leaveType ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'} ${fileLeaveType ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
                      >
                        {fileLeaveType || 'Select a leave type'}
                      </div>
                      <button type="button" onClick={() => setIsLeaveTypeDropdownOpen(!isLeaveTypeDropdownOpen)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-200 ${isLeaveTypeDropdownOpen ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>

                    {isLeaveTypeDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <ul className="max-h-60 overflow-auto py-1 text-base text-slate-700 dark:text-slate-300">
                          {leaveOptions.map((opt) => (
                            <li
                              key={opt}
                              onClick={() => {
                                setFileLeaveType(opt);
                                setLeaveDetailType("");
                                setLeaveDetailSpecify("");
                                setIsLeaveTypeDropdownOpen(false);
                                setFormErrors(prev => ({ ...prev, leaveType: false }));
                              }}
                              className={`cursor-pointer select-none relative py-2.5 pl-4 pr-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${fileLeaveType === opt ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-semibold' : ''}`}
                            >
                              {opt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {isBalanceZero && (
                    <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 font-medium flex items-start gap-2 shadow-sm">
                      <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span>You have 0 leave credits remaining for {fileLeaveType}. You cannot file this leave type.</span>
                    </div>
                  )}
                </div>

                {/* 6.B DETAILS OF LEAVE */}
                {(fileLeaveType === "Vacation Leave" || fileLeaveType === "Special Privilege Leave") && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 italic">In case of Vacation/Special Privilege Leave:</p>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Within the Philippines" checked={leaveDetailType === 'Within the Philippines'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800" required />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Within the Philippines</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Abroad (Specify)" checked={leaveDetailType === 'Abroad (Specify)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800" required />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Abroad (Specify)</span>
                      </label>
                    </div>
                    {(leaveDetailType === 'Within the Philippines' || leaveDetailType === 'Abroad (Specify)') && (
                      <div className="mt-3">
                        <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify location..." className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-sm dark:bg-slate-900 dark:text-slate-100" />
                      </div>
                    )}
                  </div>
                )}

                {fileLeaveType === "Sick Leave" && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 italic">In case of Sick Leave:</p>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="In Hospital (Specify Illness)" checked={leaveDetailType === 'In Hospital (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800" required />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">In Hospital (Specify Illness)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="detail_type" value="Out Patient (Specify Illness)" checked={leaveDetailType === 'Out Patient (Specify Illness)'} onChange={(e) => setLeaveDetailType(e.target.value)} className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800" required />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Out Patient (Specify Illness)</span>
                      </label>
                    </div>
                    {(leaveDetailType === 'In Hospital (Specify Illness)' || leaveDetailType === 'Out Patient (Specify Illness)') && (
                      <div className="mt-3">
                        <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify illness..." className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-sm dark:bg-slate-900 dark:text-slate-100" />
                      </div>
                    )}
                  </div>
                )}

                {fileLeaveType === "USE Leave" && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">DETAILS OF LEAVE</label>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 italic">In case of USE Leave:</p>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Where Day-off will be spent:</label>
                      <input type="text" value={leaveDetailSpecify} onChange={(e) => setLeaveDetailSpecify(e.target.value)} required placeholder="Specify location..." className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm dark:bg-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Inclusive Dates</label>
                  <div className={`w-full flex justify-center bg-white dark:bg-slate-900 border rounded-lg p-2 sm:p-4 shadow-sm leave-calendar ${formErrors.inclusiveDates ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}>
                    <style>{`
                      .leave-calendar {
                        --rdp-day-width: 11.5vw;
                        --rdp-day-height: 11.5vw;
                        font-size: 0.95rem;
                      }
                      @media (min-width: 512px) {
                        .leave-calendar {
                          --rdp-day-width: 62px;
                          --rdp-day-height: 62px;
                          font-size: 1.1rem;
                        }
                      }
                      /* Dark mode support for day picker */
                      .dark .rdp-day { color: #f1f5f9; }
                      .dark .rdp-head_cell { color: #94a3b8; }
                      .dark .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #334155; }
                    `}</style>
                    <DayPicker
                      mode="multiple"
                      selected={inclusiveDates}
                      onSelect={(dates) => {
                        setInclusiveDates(dates || []);
                        setRequestedDays(dates ? dates.length : 0);
                        if (dates && dates.length > 0) setFormErrors(prev => ({ ...prev, inclusiveDates: false }));
                      }}
                      modifiersClassNames={{
                        selected: "bg-blue-600 text-white font-bold rounded-lg shadow-md rdp-day_selected",
                        today: "font-bold text-blue-600 dark:text-blue-400"
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Reason</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="3" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none text-slate-800 dark:text-slate-100" placeholder="Please state your reason for leave..."></textarea>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button type="button" onClick={handleCloseFileLeave} disabled={isGeneratingPdf} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={isGeneratingPdf || isBalanceZero} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed">
                    {isGeneratingPdf ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Generating PDF...
                      </>
                    ) : 'Generate Form'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Signed Document Modal */}
      {pendingUploadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Upload Signed Document</h3>
              <button
                onClick={() => { setPendingUploadId(null); setPendingUploadDoc(null); }}
                disabled={uploadingRecordId === pendingUploadId || transmittingRecordId === pendingUploadId}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              {pendingUploadDoc ? (
                /* After upload: show success or replacing progress */
                <div className="flex flex-col items-center gap-4 py-4">
                  {uploadingRecordId === pendingUploadId ? (
                    <>
                      <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                      <div className="text-center w-full">
                        <p className="font-semibold text-slate-800 mb-3">Replacing document...</p>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{uploadProgress}%</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-slate-800 mb-1">Document uploaded successfully!</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-slate-600 dark:text-slate-300 mb-6">
                    Please upload the signed document to complete your leave submission.
                    If you prefer, you can skip this step and upload it later from your Leave History.
                  </p>
                  <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    {uploadingRecordId === pendingUploadId ? (
                      <div className="w-full">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center mb-2">Uploading...</p>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <svg className="w-12 h-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                        </svg>
                        <label className="cursor-pointer px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                          Select PDF File
                          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadSigned(e, pendingUploadId)} />
                        </label>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0 gap-2">
              {pendingUploadDoc ? (
                <>
                  {/* View */}
                  <button
                    disabled={uploadingRecordId === pendingUploadId}
                    onClick={() => {
                      const base64 = pendingUploadDoc;
                      const byteString = atob(base64.split(',')[1]);
                      const mimeType = base64.split(',')[0].split(':')[1].split(';')[0];
                      const ab = new ArrayBuffer(byteString.length);
                      const ia = new Uint8Array(ab);
                      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                      const blob = new Blob([ab], { type: mimeType });
                      window.open(URL.createObjectURL(blob), '_blank');
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  {/* Replace */}
                  <label className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg transition-colors ${uploadingRecordId === pendingUploadId ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-amber-100 cursor-pointer'
                    }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Replace
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadSigned(e, pendingUploadId)} />
                  </label>
                  {/* Transmit */}
                  <button
                    onClick={async () => {
                      await handleTransmitLeave({ id: pendingUploadId, status: null });
                      setPendingUploadId(null);
                      setPendingUploadDoc(null);
                      setShowFileLeave(false);
                    }}
                    disabled={uploadingRecordId === pendingUploadId || transmittingRecordId === pendingUploadId}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Transmit
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setPendingUploadId(null); setPendingUploadDoc(null); }}
                  disabled={uploadingRecordId === pendingUploadId || transmittingRecordId === pendingUploadId}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Upload Later
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {selectedHistoryType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border dark:border-slate-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{selectedHistoryType} History</h3>
              <button onClick={() => setSelectedHistoryType(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {isHistoryLoading ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">Inclusive Date(s)</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">Days</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">Reason</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">Filed On</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">Status</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {[...Array(4)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div></td>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-8"></div></td>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-40"></div></td>
                          <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div></td>
                          <td className="px-4 py-3"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-20"></div></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
                              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center text-slate-500 dark:text-slate-400 p-8">No leave history found for this type.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800">Inclusive Date(s)</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800">Days</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800">Reason</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800">Filed On</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800 text-center">Document</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800 text-center">Status</th>
                        <th className="px-4 py-3 font-semibold border-b border-slate-200 dark:border-slate-800 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {historyData.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-sm">{row.start_date || '-'}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium text-sm">{row.days_applied}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm max-w-[160px] truncate" title={row.reason}>{row.reason || '-'}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                          {/* Document column */}
                          <td className="px-4 py-3 text-center">
                            {uploadingRecordId === row.id ? (
                              <div className="w-20 mx-auto">
                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                  <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                              </div>
                            ) : row.status === 'Disapproved' ? (
                              <button
                                onClick={() => setViewingReason(row.disapproval_reason || 'No reason provided.')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                View Reason
                              </button>
                            ) : row.status === 'Approved' ? (
                              <span className="text-sm text-slate-400 italic">-</span>
                            ) : row.has_document ? (
                              <div className="flex items-center justify-center gap-2">
                                {/* View button — lazy fetches doc on click */}
                                <button
                                  onClick={() => handleViewDocument(row)}
                                  title="View Signed Document"
                                  disabled={openingDocId === row.id}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                {/* Change upload button — hidden when transmitted */}
                                {row.status !== 'Transmitted' && (
                                  <label
                                    title="Replace Signed Document"
                                    className={`p-1.5 rounded-lg text-amber-600 transition-colors ${(openingDocId === row.id || transmittingRecordId === row.id) ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-amber-50 cursor-pointer'
                                      }`}
                                  >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadSigned(e, row.id)} />
                                  </label>
                                )}
                              </div>
                            ) : row.status === 'Transmitted' ? (
                              <span className="text-sm text-slate-400 italic">-</span>
                            ) : (
                              <label title="Upload Signed Document" className={`p-1.5 rounded-lg text-indigo-600 transition-colors inline-flex ${(openingDocId === row.id || transmittingRecordId === row.id) ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-indigo-50 cursor-pointer'}`}>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadSigned(e, row.id)} />
                              </label>
                            )}
                          </td>
                          {/* Status column */}
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.status === 'Transmitted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'Disapproved'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                              }`}>
                              {row.status || 'Pending'}
                            </span>
                          </td>
                          {/* Actions column */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              {/* Transmit button */}
                              {(row.status !== 'Disapproved' && row.status !== 'Approved') && (
                                <button
                                  onClick={() => handleTransmitLeave(row)}
                                  disabled={row.status === 'Transmitted' || !row.has_document || openingDocId === row.id || transmittingRecordId === row.id}
                                  title={
                                    row.status === 'Transmitted' ? 'Already transmitted'
                                      : !row.has_document ? 'Upload signed document first'
                                        : 'Transmit'
                                  }
                                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                  </svg>
                                </button>
                              )}
                              {/* Delete button — hidden when transmitted, disapproved, or approved */}
                              {(row.status !== 'Transmitted' && row.status !== 'Disapproved' && row.status !== 'Approved') && (
                                <button
                                  onClick={() => setRecordToDelete(row)}
                                  disabled={openingDocId === row.id || transmittingRecordId === row.id}
                                  title="Delete and restore balance"
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button onClick={() => setSelectedHistoryType(null)} className="px-5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable container for PDF generation */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0, zIndex: -1000, pointerEvents: 'none' }}>
        <div ref={printRef} style={{ width: '210mm', backgroundColor: 'white' }}>
          {fileLeaveType === 'USE Leave' ? (
            <UseLeavePrintable
              formData={{
                officeDepartment: 'PSA-RSSO CAR, Kalinga',
                nameParts: {
                  firstName: userNameParts.firstName || user?.firstName || '',
                  lastName: userNameParts.lastName || user?.lastName || '',
                  middleName: userNameParts.middleName || ''
                },
                dateFiled: new Date().toLocaleDateString(),
                position: userPosition ? (userPosition.replace(/\s*[-\/]?\s*HR Designate\s*/gi, '').trim() || userPosition) : '',
                salary: userSalary,
                salaryGrade: userSalaryGrade,
                inclusiveDates: Array.isArray(inclusiveDates) ? formatInclusiveDates(inclusiveDates) : inclusiveDates,
                requestedDays,
                leaveDetailSpecify,
              }}
              signatories={signatories}
            />
          ) : (
            <CscForm6Printable
              formData={{
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
              }}
              userBalances={userBalances}
              signatories={signatories}
            />
          )}
        </div>
      </div>

      {/* Generated PDF Preview Modal */}
      {generatedPdfUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Generated Leave Form</h2>

            </div>
            <div className="flex-1 overflow-hidden p-4 bg-slate-100 dark:bg-slate-950">
              <iframe src={`${generatedPdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full rounded border border-slate-300 dark:border-slate-700" title="Generated PDF" />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex items-center justify-end gap-3">
              <button
                onClick={async () => {
                  const a = document.createElement('a');
                  a.href = generatedPdfUrl;
                  a.download = 'Leave_Form.pdf';
                  a.click();
                  await handleTransmitLeave({ id: generatedRecordId, status: null });
                  setGeneratedPdfUrl(null);
                  setGeneratedRecordId(null);
                  setAlertConfig({ message: 'Leave filed manually. It has been transmitted to HR.', type: 'success' });
                }}
                className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Manual
              </button>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = generatedPdfUrl;
                  a.download = 'Leave_Form.pdf';
                  a.click();
                  setPendingUploadId(generatedRecordId);
                  setGeneratedPdfUrl(null);
                  setGeneratedRecordId(null);
                }}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Digital Sign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Balances Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Edit Leave Balances</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col min-h-0">
              <div className="p-6 overflow-y-auto">
                <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-medium text-slate-800 dark:text-white">{editingUser.Name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{editingUser.Email}</p>
                  <div className="mt-2 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-3 py-2 rounded-lg flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>Saving overrides will reset their accrual cycle to start fresh from today.</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vacation Leave (VL)</label>
                    <input type="number" step="0.01" name="vl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.vl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sick Leave (SL)</label>
                    <input type="number" step="0.01" name="sl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.sl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Forced Leave (FL)</label>
                    <input type="number" step="0.01" name="fl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.fl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wellness Leave (WL)</label>
                    <input type="number" step="0.01" name="wl" defaultValue={editingUser.credits.wl_balance} required className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">USE Leave</label>
                    <input type="number" step="0.01" name="use" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.use_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Special Privilege (SPL)</label>
                    <input type="number" step="0.01" name="spl" defaultValue={editingUser.emp_stat === 'COSW' ? '' : editingUser.credits.spl_balance} disabled={editingUser.emp_stat === 'COSW'} required={editingUser.emp_stat !== 'COSW'} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Transmission Overlay */}
      {transmittingRecordId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-center w-full">
                <p className="font-semibold text-slate-800 dark:text-white mb-3">Transmitting Document...</p>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${transmitProgress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Disapproval Overlay */}
      {isProcessingDisapproval && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-center w-full">
                <p className="font-semibold text-slate-800 dark:text-white mb-1">Processing Disapproval...</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Updating records, emailing applicant, and cleaning up storage.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Approval Overlay */}
      {isProcessingApproval && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-center w-full">
                <p className="font-semibold text-slate-800 dark:text-white mb-1">Processing Approval...</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Updating records, emailing applicant, and cleaning up storage.</p>
              </div>
            </div>
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
      {recordToDelete && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Delete Leave Record</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6 ml-[52px]">
              Are you sure you want to delete this <strong>{recordToDelete.leave_type}</strong> record?
              The <strong>{recordToDelete.days_applied}</strong> day(s) will be immediately restored to your balance.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteLeave(recordToDelete);
                  setRecordToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Application Details Modal */}
      {selectedApplication && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border dark:border-slate-800 flex flex-col max-h-[100dvh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Leave Application Details</h3>
              <button onClick={() => { setSelectedApplication(null); setIsDisapproving(false); setDisapprovalReason(""); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Applicant</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.First_Name} {selectedApplication.Last_Name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Leave Type</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.leave_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Dates</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.start_date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Days Applied</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.days_applied}</p>
                </div>
                {selectedApplication.reason && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Reason</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedApplication.reason}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4">Documents</h4>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">Applicant's Signed Document</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{selectedApplication.has_document ? 'Uploaded by employee' : 'No document uploaded'}</p>
                      </div>
                    </div>
                    {selectedApplication.has_document === 1 && (
                      <button onClick={() => handleViewDocument(selectedApplication)} className="px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors">
                        View
                      </button>
                    )}
                  </div>

                  {!(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical')) && (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200 dark:border-emerald-800/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">HR/SSS/CSS Final Document</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{(selectedApplication.status === 'Disapproved' || selectedApplication.status === 'Approved') ? `Upload disabled (${selectedApplication.status})` : 'Required for approval'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {selectedApplication.has_final_document === 1 && (
                          <button onClick={() => handleViewFinalDocument(selectedApplication)} className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors">
                            View
                          </button>
                        )}

                        {(selectedApplication.status !== 'Disapproved' && selectedApplication.status !== 'Approved') && (
                          <label className={`px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer ${isUploadingFinal ? 'opacity-50 pointer-events-none' : ''}`}>
                            {isUploadingFinal ? 'Uploading...' : (selectedApplication.has_final_document === 1 ? 'Replace' : 'Upload')}
                            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUploadFinalDocument(e, selectedApplication)} />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {isDisapproving ? (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 shrink-0">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason for Disapproval</label>
                <textarea
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none h-20"
                  placeholder="Please provide a reason..."
                  value={disapprovalReason}
                  onChange={(e) => setDisapprovalReason(e.target.value)}
                ></textarea>
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setIsDisapproving(false);
                      setDisapprovalReason("");
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    Confirm Disapproval
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                {selectedApplication.status === 'Disapproved' || selectedApplication.status === 'Approved' ? (
                  <div className="flex w-full items-center justify-between">
                    <span className={`text-sm font-medium ${selectedApplication.status === 'Approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      Application {selectedApplication.status}
                    </span>
                    <button
                      onClick={() => setSelectedApplication(null)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      {!selectedApplication.has_final_document && !(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical')) && (
                        <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Final document required to approve
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsDisapproving(true)}
                        className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Disapprove
                      </button>
                      <button
                        onClick={() => {
                          setApprovingApplication(selectedApplication);
                        }}
                        disabled={(!selectedApplication.has_final_document && !(selectedApplication.Position && selectedApplication.Position.toLowerCase().includes('chief statistical'))) || selectedApplication.status === 'Approved'}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
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

      {/* Viewing Reason Modal */}
      {viewingReason && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Disapproval Reason</h3>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-6 ml-[52px]">
              <p className="text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap">{viewingReason}</p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setViewingReason(null)}
                className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors font-medium shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Approval Modal */}
      {approvingApplication && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Approve Leave</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Are you sure you want to approve this leave application for <strong>{approvingApplication.First_Name} {approvingApplication.Last_Name}</strong>?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setApprovingApplication(null)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUpdateLeaveStatus(approvingApplication, 'Approved');
                    setApprovingApplication(null);
                    setSelectedApplication(null);
                  }}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 font-medium rounded-lg transition-colors shadow-sm"
                >
                  Yes, Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
