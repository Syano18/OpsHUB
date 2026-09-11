import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import Alert from './Alert';
import Loading from './components/Loading';
import CustomUserButton from './CustomUserButton';
import NotificationBell from './NotificationBell';

export default function Profile() {
  const { setIsSidebarOpen } = useOutletContext();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Active Tab: 'profile' | 'security' | 'admin'
  const [activeTab, setActiveTab] = useState('profile');
  const [adminSubTab, setAdminSubTab] = useState('update'); // 'update' | 'create' | 'directory'

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [isSexDropdownOpen, setIsSexDropdownOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [selectedUserRole, setSelectedUserRole] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isUserRoleDropdownOpen, setIsUserRoleDropdownOpen] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Update User Details State
  const [selectedUserFirstName, setSelectedUserFirstName] = useState('');
  const [selectedUserLastName, setSelectedUserLastName] = useState('');
  const [selectedUserMiddleName, setSelectedUserMiddleName] = useState('');
  const [selectedUserSuffix, setSelectedUserSuffix] = useState('');
  const [selectedUserPosition, setSelectedUserPosition] = useState('');
  const [selectedUserSalary, setSelectedUserSalary] = useState('');
  const [selectedUserSalaryGrade, setSelectedUserSalaryGrade] = useState('');
  const [selectedUserIsRegional, setSelectedUserIsRegional] = useState(false);
  const [selectedUserEmpStat, setSelectedUserEmpStat] = useState('');
  const [selectedUserBirthdate, setSelectedUserBirthdate] = useState('');
  const [isSelectedUserEmpStatDropdownOpen, setIsSelectedUserEmpStatDropdownOpen] = useState(false);

  // Create User State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserMiddleName, setNewUserMiddleName] = useState('');
  const [newUserSuffix, setNewUserSuffix] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [newUserEmpStat, setNewUserEmpStat] = useState('');
  const [newUserPosition, setNewUserPosition] = useState('');
  const [newUserBirthdate, setNewUserBirthdate] = useState('');
  const [newUserIsRegional, setNewUserIsRegional] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isNewUserRoleDropdownOpen, setIsNewUserRoleDropdownOpen] = useState(false);
  const [isNewUserEmpStatDropdownOpen, setIsNewUserEmpStatDropdownOpen] = useState(false);
  const [createUserSuccess, setCreateUserSuccess] = useState('');

  // Password Update State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Directory Search
  const [directorySearch, setDirectorySearch] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user || !user.primaryEmailAddress?.emailAddress) return;

      try {
        const token = await getToken();
        const res = await fetch(`/api/users?email=${encodeURIComponent(user.primaryEmailAddress.emailAddress)}&fetchAll=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to fetch user data');

        const data = await res.json();
        setUserData(data.user);

        if (data.allUsers && data.allUsers.length > 0) {
          setAllUsers(data.allUsers);
        }
      } catch (err) {
        console.error("Failed to fetch user permissions:", err);
        setError("Unable to load profile data from database.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  const isAdmin = userData?.Role === 'Admin' || userData?.Role === 'Super Admin';

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      await user.setProfileImage({ file });
      setSuccessMessage("Profile photo updated successfully!");
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error("Failed to upload image", err);
      setError("Failed to upload profile picture. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleEditClick = () => {
    setEditForm({
      First_Name: userData?.First_Name || '',
      Middle_Name: userData?.Middle_Name || '',
      Last_Name: userData?.Last_Name || '',
      Suffix: userData?.Suffix || '',
      Position: userData?.Position || '',
      sex: userData?.sex || '',
      birthdate: userData?.birthdate || '',
      emp_stat: userData?.emp_stat || '',
      Salary_Grade: userData?.Salary_Grade || '',
      Salary: userData?.Salary || '',
    });
    setIsEditing(true);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError('');
    try {
      const email = user?.primaryEmailAddress?.emailAddress;
      if (!email) throw new Error("User email not found");

      const token = await getToken();
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, editForm })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }
      setUserData({ ...userData, ...editForm });
      setIsEditing(false);
      setSuccessMessage("Profile information saved successfully!");
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setError("Failed to save changes: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUserRole = async () => {
    if (!selectedUserEmail || !selectedUserRole) return;
    setIsUpdatingRole(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminEmail: user?.primaryEmailAddress?.emailAddress,
          targetEmail: selectedUserEmail,
          targetRole: selectedUserRole,
          firstName: selectedUserFirstName,
          lastName: selectedUserLastName,
          middleName: selectedUserMiddleName,
          suffix: selectedUserSuffix,
          position: selectedUserPosition,
          salary: selectedUserSalary,
          salaryGrade: selectedUserSalaryGrade,
          isRegional: selectedUserIsRegional,
          emp_stat: selectedUserEmpStat,
          birthdate: selectedUserBirthdate || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user profile');
      }
      setAllUsers(users => users.map(u => u.Email === selectedUserEmail ? {
        ...u,
        Role: selectedUserRole,
        First_Name: selectedUserFirstName,
        Last_Name: selectedUserLastName,
        Middle_Name: selectedUserMiddleName,
        Suffix: selectedUserSuffix,
        Position: selectedUserPosition,
        Salary: selectedUserSalary,
        Salary_Grade: selectedUserSalaryGrade,
        is_regional: selectedUserIsRegional ? 1 : 0,
        emp_stat: selectedUserEmpStat,
        birthdate: selectedUserBirthdate || null
      } : u));

      if (selectedUserEmail.toLowerCase() === user?.primaryEmailAddress?.emailAddress?.toLowerCase()) {
        setUserData(prev => ({
          ...prev,
          Role: selectedUserRole,
          First_Name: selectedUserFirstName,
          Last_Name: selectedUserLastName,
          Middle_Name: selectedUserMiddleName,
          Suffix: selectedUserSuffix,
          Position: selectedUserPosition,
          is_regional: selectedUserIsRegional ? 1 : 0,
          emp_stat: selectedUserEmpStat,
          birthdate: selectedUserBirthdate || null
        }));
      }

      setSuccessMessage(`Updated record for ${selectedUserFirstName} ${selectedUserLastName} (${selectedUserEmail})`);
      setTimeout(() => setSuccessMessage(''), 4000);

      setSelectedUserEmail('');
      setSelectedUserRole('');
      setSelectedUserFirstName('');
      setSelectedUserLastName('');
      setSelectedUserMiddleName('');
      setSelectedUserSuffix('');
      setSelectedUserPosition('');
      setSelectedUserSalary('');
      setSelectedUserSalaryGrade('');
      setSelectedUserBirthdate('');
      setSelectedUserIsRegional(false);
    } catch (err) {
      console.error(err);
      setError("Failed to update user: " + err.message);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserFirstName || !newUserLastName || !newUserRole) {
      setError("Please fill in all required fields to create a user.");
      return;
    }
    setIsCreatingUser(true);
    setError('');
    setCreateUserSuccess('');
    try {
      const token = await getToken();
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create',
          email: newUserEmail,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          middleName: newUserMiddleName,
          suffix: newUserSuffix,
          role: newUserRole,
          empStat: newUserEmpStat,
          position: newUserPosition,
          isRegional: newUserIsRegional,
          birthdate: newUserBirthdate || null
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('The server is currently unavailable. Please try again.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create user');
      }

      setAllUsers([...allUsers, {
        Email: newUserEmail,
        First_Name: newUserFirstName,
        Last_Name: newUserLastName,
        Middle_Name: newUserMiddleName,
        Suffix: newUserSuffix,
        Role: newUserRole,
        emp_stat: newUserEmpStat,
        Position: newUserPosition,
        is_regional: newUserIsRegional ? 1 : 0
      }]);

      setCreateUserSuccess(`Successfully created user: ${newUserEmail}`);
      setNewUserEmail('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserMiddleName('');
      setNewUserSuffix('');
      setNewUserRole('');
      setNewUserEmpStat('');
      setNewUserPosition('');
      setNewUserIsRegional(false);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await user.updatePassword({
        currentPassword,
        newPassword
      });
      setPasswordSuccess("Password updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (err) {
      console.error(err);
      setPasswordError(err.errors?.[0]?.longMessage || err.message || "Failed to update password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null || amount === '') return 'N/A';
    const num = parseFloat(amount.toString().replace(/,/g, ''));
    if (isNaN(num)) return amount;
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
  };

  const filteredDirectoryUsers = useMemo(() => {
    if (!directorySearch) return allUsers;
    const q = directorySearch.toLowerCase();
    return allUsers.filter(u => 
      (u.First_Name && u.First_Name.toLowerCase().includes(q)) ||
      (u.Last_Name && u.Last_Name.toLowerCase().includes(q)) ||
      (u.Email && u.Email.toLowerCase().includes(q)) ||
      (u.Position && u.Position.toLowerCase().includes(q)) ||
      (u.Role && u.Role.toLowerCase().includes(q))
    );
  }, [allUsers, directorySearch]);

  if (loading) {
    return (
      <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-hidden flex items-center justify-center">
        <Loading type="profile" />
      </div>
    );
  }

  const fullName = userData 
    ? `${userData.First_Name || ''} ${userData.Middle_Name ? userData.Middle_Name.charAt(0).toUpperCase() + '.' : ''} ${userData.Last_Name || ''} ${userData.Suffix || ''}`.replace(/\s+/g, ' ').trim()
    : user?.fullName || 'User Profile';

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center text-white shadow-md shadow-slate-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">
                User Profile
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Account settings, position, and credentials
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">
            {userData?.First_Name ? `Hello, ${userData.First_Name} 👋` : 'Welcome back!'}
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
          <NotificationBell />
          <CustomUserButton />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-4 flex flex-col gap-4 min-h-0 w-full">
        
        {/* Alerts */}
        <Alert message={error} onClose={() => setError('')} duration={5000} />
        {successMessage && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-700">&times;</button>
          </div>
        )}

        {/* Hero Card with Mesh Gradient */}
        <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          {/* Ambient Banner Backdrop */}
          <div className="h-36 sm:h-44 bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-700 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.2),transparent)]"></div>
            <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute left-1/3 -top-10 w-48 h-48 bg-teal-300/20 rounded-full blur-xl"></div>
          </div>

          <div className="px-5 sm:px-8 pb-6 sm:pb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              
              {/* Avatar & User Core Details */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full md:w-auto">
                {/* Avatar with negative margin so ONLY the avatar pops out over the banner */}
                <div className="relative -mt-14 sm:-mt-16 shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-white dark:bg-slate-900 p-1.5 shadow-xl border-4 border-white dark:border-slate-900 group z-10">
                  <label 
                    htmlFor="profile-upload" 
                    className={`absolute inset-1.5 rounded-2xl bg-black/50 flex flex-col items-center justify-center cursor-pointer transition-opacity z-10 ${
                      isUploadingImage ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isUploadingImage ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] text-white font-bold">Update</span>
                      </>
                    )}
                  </label>
                  <input
                    type="file"
                    id="profile-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                    disabled={isUploadingImage}
                  />
                  <img
                    src={user?.imageUrl || `https://ui-avatars.com/api/?name=${user?.firstName}&background=0D8ABC&color=fff`}
                    alt="Profile"
                    className="w-full h-full rounded-2xl object-cover"
                  />
                </div>

                {/* Name, Role & Email (sitting comfortably below banner) */}
                <div className="pt-1 sm:pt-3">
                  <div className="flex items-center gap-2.5 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                      {fullName}
                    </h1>
                    {userData?.Role && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50 shadow-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                        {userData.Role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 flex-wrap">
                    <span>{user?.primaryEmailAddress?.emailAddress}</span>
                    {userData?.Position && (
                      <>
                        <span>•</span>
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">{userData.Position}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Quick Profile Stats Chips */}
              <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto self-start md:self-end pt-2 sm:pt-4">
                <div className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Employment</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{userData?.emp_stat || 'Permanent'}</span>
                </div>
                {userData?.Salary_Grade && (
                  <div className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Salary Grade</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">SG-{userData.Salary_Grade}</span>
                  </div>
                )}
                <div className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Location</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{userData?.is_regional === 1 ? 'Regional Office' : 'Provincial Office'}</span>
                </div>
              </div>

            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="border-t border-slate-200 dark:border-slate-800 px-5 sm:px-8 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between overflow-x-auto gap-2">
            <div className="flex items-center gap-2 py-2">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'profile'
                    ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Personal & Employment Details
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'security'
                    ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Security & Password
              </button>

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'admin'
                      ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  Admin Management
                  <span className="px-1.5 py-0.5 rounded-full bg-teal-500 text-white text-[10px] font-extrabold">{allUsers.length}</span>
                </button>
              )}
            </div>

            {activeTab === 'profile' && !isEditing && (
              <button
                onClick={handleEditClick}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit Information
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Personal & Employment Information */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* General Information Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                      General Information
                    </h3>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">First Name</label>
                        <input type="text" value={editForm.First_Name} onChange={e => setEditForm({ ...editForm, First_Name: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Middle Name</label>
                        <input type="text" value={editForm.Middle_Name} onChange={e => setEditForm({ ...editForm, Middle_Name: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Last Name</label>
                        <input type="text" value={editForm.Last_Name} onChange={e => setEditForm({ ...editForm, Last_Name: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Suffix</label>
                        <input type="text" value={editForm.Suffix} onChange={e => setEditForm({ ...editForm, Suffix: e.target.value })} placeholder="E.g., Jr., Sr., III" className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Position</label>
                      <input type="text" value={editForm.Position} onChange={e => setEditForm({ ...editForm, Position: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Sex</label>
                        <div className="relative">
                          <select
                            value={editForm.sex || ''}
                            onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                          >
                            <option value="">Select sex...</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block">Date of Birth</label>
                          {!isAdmin && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Admin only</span>
                          )}
                        </div>
                        <input
                          type="date"
                          disabled={!isAdmin}
                          value={editForm.birthdate || ''}
                          onChange={(e) => setEditForm({ ...editForm, birthdate: e.target.value })}
                          className={`w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                            !isAdmin ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Full Legal Name</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{fullName}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Position / Designation</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{userData?.Position || 'N/A'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Primary Email</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 break-all">{user?.primaryEmailAddress?.emailAddress}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Sex</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{userData?.sex || 'N/A'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Date of Birth</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {userData?.birthdate ? (
                          <>
                            <span>🎂 {new Date(userData.birthdate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Not set</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Employment & Compensation Details Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                      Employment & Compensation
                    </h3>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                        <span>Employment Status</span>
                        {!isAdmin && <span className="text-[10px] text-slate-400 font-normal">Admin editable</span>}
                      </label>
                      <input 
                        type="text" 
                        value={editForm.emp_stat} 
                        onChange={e => setEditForm({ ...editForm, emp_stat: e.target.value })} 
                        disabled={!isAdmin}
                        className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                          <span>Salary Grade</span>
                          {!isAdmin && <span className="text-[10px] text-slate-400 font-normal">Admin editable</span>}
                        </label>
                        <input 
                          type="number" 
                          value={editForm.Salary_Grade} 
                          onChange={e => setEditForm({ ...editForm, Salary_Grade: e.target.value })} 
                          disabled={!isAdmin}
                          className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" 
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                          <span>Monthly Salary (PHP)</span>
                          {!isAdmin && <span className="text-[10px] text-slate-400 font-normal">Admin editable</span>}
                        </label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={editForm.Salary} 
                          onChange={e => setEditForm({ ...editForm, Salary: e.target.value })} 
                          disabled={!isAdmin}
                          className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" 
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Employment Status</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{userData?.emp_stat || 'Permanent'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Salary Grade</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{userData?.Salary_Grade ? `SG-${userData.Salary_Grade}` : 'N/A'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 col-span-1 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Monthly Salary Rate</span>
                      <span className="text-base font-extrabold text-teal-600 dark:text-teal-400 font-mono">{formatCurrency(userData?.Salary)}</span>
                    </div>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl hover:shadow-lg hover:shadow-teal-500/20 active:scale-95 transition-all flex items-center gap-2"
                  >
                    {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Save Profile
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 2: Security & Credentials */}
        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Change Account Password</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Keep your account secure with a strong password.</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800/40 text-xs font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{passwordError}</span>
                </div>
              )}
              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/40 text-xs font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showCurrentPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showConfirmPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-md shadow-teal-500/20 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center gap-2"
                >
                  {isChangingPassword && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Admin User Management */}
        {activeTab === 'admin' && isAdmin && (
          <div className="flex flex-col gap-5">
            
            {/* Sub-navigation bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setAdminSubTab('update')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    adminSubTab === 'update'
                      ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Update User Record
                </button>

                <button
                  onClick={() => setAdminSubTab('create')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    adminSubTab === 'create'
                      ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  Create New User
                </button>

                <button
                  onClick={() => setAdminSubTab('directory')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    adminSubTab === 'directory'
                      ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  Staff Directory ({allUsers.length})
                </button>
              </div>
            </div>

            {/* Sub-tab 1: Update Existing User */}
            {adminSubTab === 'update' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs max-w-3xl mx-auto w-full">
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white pb-3 mb-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                  Select & Modify Staff Profile
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Search Employee to Update</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={selectedUserEmail}
                        onChange={(e) => setSelectedUserEmail(e.target.value)}
                        onFocus={() => { setIsUserDropdownOpen(true); }}
                        onBlur={() => setTimeout(() => setIsUserDropdownOpen(false), 250)}
                        placeholder="Type name or email to search..."
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                        className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <svg className={`w-4 h-4 transition-transform duration-200 ${isUserDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isUserDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-72 overflow-y-auto py-1">
                          {allUsers
                            .filter(u => 
                              u.Email.toLowerCase().includes((selectedUserEmail || "").toLowerCase()) || 
                              (u.First_Name || "").toLowerCase().includes((selectedUserEmail || "").toLowerCase()) ||
                              (u.Last_Name || "").toLowerCase().includes((selectedUserEmail || "").toLowerCase())
                            )
                            .map((u) => (
                              <button
                                key={u.Email}
                                type="button"
                                onClick={() => {
                                  setSelectedUserEmail(u.Email);
                                  setSelectedUserRole(u.Role || '');
                                  setSelectedUserFirstName(u.First_Name || '');
                                  setSelectedUserLastName(u.Last_Name || '');
                                  setSelectedUserMiddleName(u.Middle_Name || '');
                                  setSelectedUserSuffix(u.Suffix || '');
                                  setSelectedUserPosition(u.Position || '');
                                  setSelectedUserSalary(u.Salary || '');
                                  setSelectedUserSalaryGrade(u.Salary_Grade || '');
                                  setSelectedUserIsRegional(u.is_regional === 1);
                                  setSelectedUserEmpStat(u.emp_stat || '');
                                  setSelectedUserBirthdate(u.birthdate || '');
                                  setIsUserDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-950/40 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-xs sm:text-sm text-slate-700 dark:text-slate-200 flex items-center justify-between border-b border-slate-50 dark:border-slate-800/40 last:border-none"
                              >
                                <div>
                                  <span className="font-bold block">{u.First_Name} {u.Last_Name} {u.Suffix || ''}</span>
                                  <span className="text-xs text-slate-400">{u.Email}</span>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {u.Role || 'Staff'}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedUserEmail && (
                    <div className="space-y-4 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">First Name</label>
                          <input type="text" value={selectedUserFirstName} onChange={e => setSelectedUserFirstName(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Middle Name</label>
                          <input type="text" value={selectedUserMiddleName} onChange={e => setSelectedUserMiddleName(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Last Name</label>
                          <input type="text" value={selectedUserLastName} onChange={e => setSelectedUserLastName(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Suffix</label>
                          <input type="text" value={selectedUserSuffix} onChange={e => setSelectedUserSuffix(e.target.value)} placeholder="E.g., Jr., Sr., III" className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Position</label>
                          <input type="text" value={selectedUserPosition} onChange={e => setSelectedUserPosition(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Date of Birth</label>
                          <input type="date" value={selectedUserBirthdate} onChange={e => setSelectedUserBirthdate(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Salary Grade</label>
                          <input type="number" value={selectedUserSalaryGrade} onChange={e => setSelectedUserSalaryGrade(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Monthly Salary (PHP)</label>
                          <input type="number" step="0.01" value={selectedUserSalary} onChange={e => setSelectedUserSalary(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">System Role</label>
                          <select
                            value={selectedUserRole}
                            onChange={e => setSelectedUserRole(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                          >
                            <option value="">Select a role...</option>
                            <option value="Super Admin">Super Admin</option>
                            <option value="Admin">Admin</option>
                            <option value="PACD">PACD</option>
                            <option value="Staff">Staff</option>
                            <option value="Focal Person">Focal Person</option>
                            <option value="External Signatory">External Signatory</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Employment Status</label>
                          <select
                            value={selectedUserEmpStat}
                            onChange={e => setSelectedUserEmpStat(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                          >
                            <option value="">Select status...</option>
                            <option value="Permanent">Permanent</option>
                            <option value="COSW">COSW</option>
                            <option value="Contractual">Contractual</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <input
                          type="checkbox"
                          id="updateIsRegional"
                          checked={selectedUserIsRegional}
                          onChange={e => setSelectedUserIsRegional(e.target.checked)}
                          className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                        />
                        <label htmlFor="updateIsRegional" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                          Assigned to Regional Office (External Signatory)
                        </label>
                      </div>

                      <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserEmail('');
                            setSelectedUserRole('');
                          }}
                          className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdateUserRole}
                          disabled={isUpdatingRole || !selectedUserRole}
                          className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-md shadow-teal-500/20 hover:shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {isUpdatingRole && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Create New User */}
            {adminSubTab === 'create' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs max-w-3xl mx-auto w-full">
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white pb-3 mb-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Add New Staff Member
                </h4>

                {createUserSuccess && (
                  <div className="p-3 mb-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/40 text-xs font-semibold flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{createUserSuccess}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Email Address *</label>
                    <input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="user@psa.gov.ph" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">First Name *</label>
                      <input type="text" required value={newUserFirstName} onChange={e => setNewUserFirstName(e.target.value)} placeholder="First Name" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Middle Name (Optional)</label>
                      <input type="text" value={newUserMiddleName} onChange={e => setNewUserMiddleName(e.target.value)} placeholder="Middle Name" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Last Name *</label>
                      <input type="text" required value={newUserLastName} onChange={e => setNewUserLastName(e.target.value)} placeholder="Last Name" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Suffix (Optional)</label>
                      <input type="text" value={newUserSuffix} onChange={e => setNewUserSuffix(e.target.value)} placeholder="E.g., Jr., Sr., III" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Position *</label>
                    <input type="text" required value={newUserPosition} onChange={e => setNewUserPosition(e.target.value)} placeholder="E.g., Statistical Specialist II" className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">System Role *</label>
                      <select
                        value={newUserRole}
                        onChange={e => setNewUserRole(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                      >
                        <option value="">Select a role...</option>
                        <option value="Super Admin">Super Admin</option>
                        <option value="Admin">Admin</option>
                        <option value="PACD">PACD</option>
                        <option value="Staff">Staff</option>
                        <option value="Focal Person">Focal Person</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Employment Status</label>
                      <select
                        value={newUserEmpStat}
                        onChange={e => setNewUserEmpStat(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                      >
                        <option value="">Select status...</option>
                        <option value="Permanent">Permanent</option>
                        <option value="COSW">COSW</option>
                        <option value="Contractual">Contractual</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">Date of Birth (Optional)</label>
                    <input type="date" value={newUserBirthdate} onChange={e => setNewUserBirthdate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                  </div>

                  <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setNewUserEmail('');
                        setNewUserFirstName('');
                        setNewUserLastName('');
                        setNewUserMiddleName('');
                        setNewUserSuffix('');
                        setNewUserPosition('');
                        setNewUserEmpStat('');
                        setNewUserRole('');
                        setNewUserBirthdate('');
                        setCreateUserSuccess('');
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateUser}
                      disabled={isCreatingUser || !newUserEmail || !newUserFirstName || !newUserLastName || !newUserRole}
                      className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-md shadow-teal-500/20 hover:shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isCreatingUser && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                      Create User
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab 3: Staff Directory */}
            {adminSubTab === 'directory' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900 dark:text-white">Active Staff Directory</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total registered system users: {allUsers.length}</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Search directory..."
                      value={directorySearch}
                      onChange={e => setDirectorySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Position</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Salary Grade</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {filteredDirectoryUsers.map((u) => (
                        <tr key={u.Email} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {u.First_Name} {u.Last_Name} {u.Suffix || ''}
                            </div>
                            <div className="text-[11px] text-slate-400">{u.Email}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                            {u.Position || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {u.Role || 'Staff'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              u.emp_stat === 'COSW' 
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                                : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/40'
                            }`}>
                              {u.emp_stat || 'Permanent'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {u.Salary_Grade ? `SG-${u.Salary_Grade}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedUserEmail(u.Email);
                                setSelectedUserRole(u.Role || '');
                                setSelectedUserFirstName(u.First_Name || '');
                                setSelectedUserLastName(u.Last_Name || '');
                                setSelectedUserMiddleName(u.Middle_Name || '');
                                setSelectedUserSuffix(u.Suffix || '');
                                setSelectedUserPosition(u.Position || '');
                                setSelectedUserSalary(u.Salary || '');
                                setSelectedUserSalaryGrade(u.Salary_Grade || '');
                                setSelectedUserIsRegional(u.is_regional === 1);
                                setSelectedUserEmpStat(u.emp_stat || '');
                                setAdminSubTab('update');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 font-bold text-[11px] transition-all"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
