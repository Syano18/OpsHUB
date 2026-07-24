import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { turso } from './db';
import Alert from './Alert';

export default function Profile() {
    const { setIsSidebarOpen } = useOutletContext();
const { user } = useUser();
  const { getToken } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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

  // Create User State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserMiddleName, setNewUserMiddleName] = useState('');
  const [newUserSuffix, setNewUserSuffix] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [newUserEmpStat, setNewUserEmpStat] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isNewUserRoleDropdownOpen, setIsNewUserRoleDropdownOpen] = useState(false);
  const [isNewUserEmpStatDropdownOpen, setIsNewUserEmpStatDropdownOpen] = useState(false);
  const [createUserSuccess, setCreateUserSuccess] = useState('');

  // Password Update State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user || !user.primaryEmailAddress?.emailAddress) return;

      try {
        const result = await turso.execute({
          sql: `SELECT * FROM User_Permissions WHERE LOWER(Email) = LOWER(?)`,
          args: [user.primaryEmailAddress.emailAddress]
        });

        if (result.rows.length > 0) {
          const loggedInUser = result.rows[0];
          setUserData(loggedInUser);
          
          if (loggedInUser.Role === 'Admin' || loggedInUser.Role === 'Super Admin') {
            const allUsersResult = await turso.execute('SELECT Email, First_Name, Last_Name, Role FROM User_Permissions');
            setAllUsers(allUsersResult.rows);
          }
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">Loading profile data...</div>
      </div>
    );
  }

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      await user.setProfileImage({ file });
    } catch (err) {
      console.error("Failed to upload image", err);
      setError("Failed to upload profile picture. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleEditClick = () => {
    setEditForm({
      First_Name: userData.First_Name || '',
      Middle_Name: userData.Middle_Name || '',
      Last_Name: userData.Last_Name || '',
      Suffix: userData.Suffix || '',
      Position: userData.Position || '',
      sex: userData.sex || '',
      emp_stat: userData.emp_stat || '',
      Salary_Grade: userData.Salary_Grade || '',
      Salary: userData.Salary || '',
    });
    setIsEditing(true);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError('');
    try {
      const email = user?.primaryEmailAddress?.emailAddress;
      if (!email) throw new Error("User email not found");

      const salaryGrade = editForm.Salary_Grade ? parseInt(editForm.Salary_Grade) : null;
      const salary = editForm.Salary ? parseFloat(editForm.Salary) : null;

      await turso.execute({
        sql: `UPDATE User_Permissions SET 
                First_Name = ?, Middle_Name = ?, Last_Name = ?, Suffix = ?, 
                Position = ?, sex = ?, emp_stat = ?, Salary_Grade = ?, Salary = ?
              WHERE LOWER(Email) = LOWER(?)`,
        args: [
          editForm.First_Name || '',
          editForm.Middle_Name || '',
          editForm.Last_Name || '',
          editForm.Suffix || '',
          editForm.Position || '',
          editForm.sex || '',
          editForm.emp_stat || '',
          isNaN(salaryGrade) ? null : salaryGrade,
          isNaN(salary) ? null : salary,
          email
        ]
      });
      setUserData({ ...userData, ...editForm });
      setIsEditing(false);
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
      await turso.execute({
        sql: `UPDATE User_Permissions SET Role = ? WHERE LOWER(Email) = LOWER(?)`,
        args: [selectedUserRole, selectedUserEmail]
      });
      setAllUsers(users => users.map(u => u.Email === selectedUserEmail ? { ...u, Role: selectedUserRole } : u));
      if (selectedUserEmail.toLowerCase() === user?.primaryEmailAddress?.emailAddress?.toLowerCase()) {
         setUserData(prev => ({ ...prev, Role: selectedUserRole }));
      }
      setSelectedUserEmail('');
      setSelectedUserRole('');
    } catch (err) {
      console.error(err);
      setError("Failed to update role: " + err.message);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserFirstName || !newUserLastName || !newUserRole) {
      setError("Please fill in all fields to create a user.");
      return;
    }
    setIsCreatingUser(true);
    setError('');
    setCreateUserSuccess('');
    try {
      const token = await getToken();
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserEmail,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          middleName: newUserMiddleName,
          suffix: newUserSuffix,
          role: newUserRole,
          empStat: newUserEmpStat
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('The server is currently unavailable or restarting. Please try again in a few seconds.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create user');
      }
      
      setAllUsers([...allUsers, { Email: newUserEmail, First_Name: newUserFirstName, Last_Name: newUserLastName, Middle_Name: newUserMiddleName, Suffix: newUserSuffix, Role: newUserRole, emp_stat: newUserEmpStat }]);
      
      setCreateUserSuccess(`Successfully created user: ${newUserEmail}`);
      setNewUserEmail('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserMiddleName('');
      setNewUserSuffix('');
      setNewUserRole('');
      setNewUserEmpStat('');
      setTimeout(() => setCreateUserSuccess(''), 5000);
    } catch (err) {
      console.error(err);
      setError("Failed to create user: " + err.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }
    
    setIsChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    
    try {
      await user.updatePassword({
        currentPassword: currentPassword,
        newPassword: newPassword
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
    if (amount == null) return 'N/A';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 mr-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span className="text-2xl">👤</span> User Profile
        </h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="w-full min-h-full flex flex-col space-y-4">

          <Alert message={error} onClose={() => setError('')} duration={5000} />

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
            {/* Profile Header */}
            <div className="h-32 bg-gradient-to-r from-teal-500 to-emerald-400"></div>
            <div className="px-8 pb-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end -mt-12 mb-6 gap-4 sm:gap-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6 w-full">
                  <div className="relative shrink-0 w-24 h-24 rounded-2xl bg-white p-1 shadow-md border border-slate-100 group">
                    <label htmlFor="profile-upload" className={`absolute inset-1 rounded-xl bg-black/40 flex items-center justify-center cursor-pointer transition-opacity z-10 ${isUploadingImage ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {isUploadingImage ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="size-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
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
                      className="w-full h-full rounded-xl object-cover relative z-0"
                    />
                  </div>
                  <div className="pb-0 sm:pb-6 w-full min-w-0">
                    <h1 className="text-2xl font-bold text-slate-900 break-words">
                      {userData ? `${userData.First_Name || ''} ${userData.Middle_Name ? userData.Middle_Name.charAt(0).toUpperCase() + '.' : ''} ${userData.Last_Name || ''} ${userData.Suffix || ''}`.replace(/\s+/g, ' ').trim() : user?.fullName}
                    </h1>
                    <p className="text-slate-500 font-medium">{user?.primaryEmailAddress?.emailAddress}</p>
                  </div>
                </div>
                {userData?.Role && (
                  <div className="mb-0 sm:mb-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 font-semibold text-sm shadow-sm flex items-center gap-2 self-start sm:self-auto">
                    <span className="shrink-0 w-2 h-2 rounded-full bg-teal-500"></span>
                    <span className="whitespace-nowrap">{userData.Role} Access</span>
                  </div>
                )}
              </div>

              {userData ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

                  {/* General Info */}
                  <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 relative">
                    {!isEditing && (
                      <button
                        onClick={handleEditClick}
                        className="absolute top-6 right-6 text-slate-400 hover:text-teal-600 transition-colors"
                        title="Edit Information"
                      >
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                      General Information
                    </h3>

                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">First Name</label>
                            <input type="text" value={editForm.First_Name} onChange={e => setEditForm({ ...editForm, First_Name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Last Name</label>
                            <input type="text" value={editForm.Last_Name} onChange={e => setEditForm({ ...editForm, Last_Name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Middle Name</label>
                            <input type="text" value={editForm.Middle_Name} onChange={e => setEditForm({ ...editForm, Middle_Name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Suffix</label>
                            <input type="text" value={editForm.Suffix} onChange={e => setEditForm({ ...editForm, Suffix: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Position</label>
                          <input type="text" value={editForm.Position} onChange={e => setEditForm({ ...editForm, Position: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Sex</label>
                          <div className="relative">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={editForm.sex || ''}
                                onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}
                                onFocus={() => setIsSexDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsSexDropdownOpen(false), 200)}
                                placeholder="Select sex..."
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setIsSexDropdownOpen(!isSexDropdownOpen)}
                                className="absolute right-1 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              >
                                <svg className={`size-4 transition-transform duration-200 ${isSexDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            {isSexDropdownOpen && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto py-1">
                                {["Male", "Female"]
                                  .filter(opt => opt.toLowerCase().includes((editForm.sex || "").toLowerCase()))
                                  .map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => { setEditForm({ ...editForm, sex: opt }); setIsSexDropdownOpen(false); }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm text-slate-700 focus:bg-teal-50 focus:outline-none"
                                    >
                                      {opt}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Full Name</div>
                          <div className="font-medium text-slate-900">
                            {`${userData.First_Name || ''} ${userData.Middle_Name ? userData.Middle_Name.charAt(0).toUpperCase() + '.' : ''} ${userData.Last_Name || ''} ${userData.Suffix || ''}`.replace(/\s+/g, ' ').trim() || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Position</div>
                          <div className="font-medium text-slate-900">{userData.Position || 'N/A'}</div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Sex</div>
                            <div className="font-medium text-slate-900">{userData.sex || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Employment Details */}
                  <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        Employment Details
                      </h3>

                      {isEditing ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Employment Status</label>
                            <input type="text" value={editForm.emp_stat} onChange={e => setEditForm({ ...editForm, emp_stat: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Salary Grade</label>
                              <input type="number" value={editForm.Salary_Grade} onChange={e => setEditForm({ ...editForm, Salary_Grade: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Salary</label>
                              <input type="number" step="0.01" value={editForm.Salary} onChange={e => setEditForm({ ...editForm, Salary: e.target.value })} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Employment Status</div>
                            <div className="font-medium text-slate-900">{userData.emp_stat || 'N/A'}</div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Salary Grade</div>
                              <div className="font-medium text-slate-900">{userData.Salary_Grade ? `SG-${userData.Salary_Grade}` : 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 mb-1">Salary</div>
                              <div className="font-medium text-slate-900">{formatCurrency(userData.Salary)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {isEditing && (
                      <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <button
                          onClick={() => setIsEditing(false)}
                          disabled={isSaving}
                          className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveChanges}
                          disabled={isSaving}
                          className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
                        >
                          {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* Security Settings */}
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 mt-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Security Settings
                  </h3>
                  
                  <div className="max-w-md">
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      {passwordError && (
                        <div className="bg-rose-50 text-rose-700 p-2 text-xs rounded border border-rose-200">
                          {passwordError}
                        </div>
                      )}
                      {passwordSuccess && (
                        <div className="bg-emerald-50 text-emerald-700 p-2 text-xs rounded border border-emerald-200">
                          {passwordSuccess}
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Current Password</label>
                        <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">New Password</label>
                        <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Confirm New Password</label>
                        <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                      </div>
                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                          className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          {isChangingPassword && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                          Update Password
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* User Management */}
                {(userData.Role === 'Admin' || userData.Role === 'Super Admin') && (
                  <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 mt-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      User Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      
                      {/* Update Existing User */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-slate-800 font-semibold border-b border-slate-200 pb-2">Update User Role</h4>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Select User</label>
                          <div className={`relative ${isUserDropdownOpen ? 'z-50' : ''}`}>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={selectedUserEmail}
                                onChange={(e) => setSelectedUserEmail(e.target.value)}
                                onFocus={() => { setIsUserDropdownOpen(true); setSelectedUserEmail(''); setSelectedUserRole(''); }}
                                onBlur={() => setTimeout(() => setIsUserDropdownOpen(false), 200)}
                                placeholder="Search user by email or name..."
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => { setIsUserDropdownOpen(!isUserDropdownOpen); if (!isUserDropdownOpen) { setSelectedUserEmail(''); setSelectedUserRole(''); } }}
                                className="absolute right-1 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              >
                                <svg className={`size-4 transition-transform duration-200 ${isUserDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            {isUserDropdownOpen && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto py-1">
                                {allUsers
                                  .filter(u => u.Email.toLowerCase().includes((selectedUserEmail || "").toLowerCase()) || (u.First_Name || "").toLowerCase().includes((selectedUserEmail || "").toLowerCase()))
                                  .map((u) => (
                                    <button
                                      key={u.Email}
                                      type="button"
                                      onClick={() => { setSelectedUserEmail(u.Email); setSelectedUserRole(u.Role || ''); setIsUserDropdownOpen(false); }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm text-slate-700 focus:bg-teal-50 focus:outline-none flex flex-col"
                                    >
                                      <span className="font-medium">{u.First_Name} {u.Last_Name}</span>
                                      <span className="text-xs text-slate-400">{u.Email}</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {selectedUserEmail && (
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">New System Role</label>
                            <div className={`relative ${isUserRoleDropdownOpen ? 'z-50' : ''}`}>
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  value={selectedUserRole}
                                  onChange={(e) => setSelectedUserRole(e.target.value)}
                                  onFocus={() => { setIsUserRoleDropdownOpen(true); setSelectedUserRole(''); }}
                                  onBlur={() => setTimeout(() => setIsUserRoleDropdownOpen(false), 200)}
                                  placeholder="Select a role..."
                                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 pr-8"
                                />
                                <button
                                  type="button"
                                  onClick={() => { setIsUserRoleDropdownOpen(!isUserRoleDropdownOpen); if (!isUserRoleDropdownOpen) setSelectedUserRole(''); }}
                                  className="absolute right-1 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                >
                                  <svg className={`size-4 transition-transform duration-200 ${isUserRoleDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </div>
                              {isUserRoleDropdownOpen && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1">
                                  {(userData.Role === 'Super Admin' ? ["Super Admin", "Admin", "PACD", "Staff"] : ["PACD", "Staff"])
                                    .filter(role => role.toLowerCase().includes((selectedUserRole || "").toLowerCase()))
                                    .map((role) => (
                                      <button
                                        key={role}
                                        type="button"
                                        onClick={() => { setSelectedUserRole(role); setIsUserRoleDropdownOpen(false); }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm text-slate-700 focus:bg-teal-50 focus:outline-none"
                                      >
                                        {role}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <div className="mt-4 flex justify-end">
                              <button
                                onClick={handleUpdateUserRole}
                                disabled={isUpdatingRole || !selectedUserRole}
                                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                              >
                                {isUpdatingRole && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                Update Role
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Create New User */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-slate-800 font-semibold border-b border-slate-200 pb-2">Create New User</h4>
                        
                        {createUserSuccess && (
                          <div className="bg-emerald-50 text-emerald-700 p-2 text-xs rounded border border-emerald-200">
                            {createUserSuccess}
                          </div>
                        )}

                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Email</label>
                          <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="Email Address" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">First Name</label>
                            <input type="text" value={newUserFirstName} onChange={e => setNewUserFirstName(e.target.value)} placeholder="First Name" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Middle Name (Optional)</label>
                            <input type="text" value={newUserMiddleName} onChange={e => setNewUserMiddleName(e.target.value)} placeholder="Middle Name" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Last Name</label>
                            <input type="text" value={newUserLastName} onChange={e => setNewUserLastName(e.target.value)} placeholder="Last Name" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Suffix (Optional)</label>
                            <input type="text" value={newUserSuffix} onChange={e => setNewUserSuffix(e.target.value)} placeholder="E.g., Jr., Sr., III" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900" />
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">System Role</label>
                          <div className={`relative ${isNewUserRoleDropdownOpen ? 'z-50' : ''}`}>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value)}
                                onFocus={() => setIsNewUserRoleDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsNewUserRoleDropdownOpen(false), 200)}
                                placeholder="Select a role..."
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setIsNewUserRoleDropdownOpen(!isNewUserRoleDropdownOpen)}
                                className="absolute right-1 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              >
                                <svg className={`size-4 transition-transform duration-200 ${isNewUserRoleDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            {isNewUserRoleDropdownOpen && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1">
                                {(userData.Role === 'Super Admin' ? ["Super Admin", "Admin", "PACD", "Staff"] : ["PACD", "Staff"])
                                  .filter(role => role.toLowerCase().includes((newUserRole || "").toLowerCase()))
                                  .map((role) => (
                                    <button
                                      key={role}
                                      type="button"
                                      onClick={() => { setNewUserRole(role); setIsNewUserRoleDropdownOpen(false); }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm text-slate-700 focus:bg-teal-50 focus:outline-none"
                                    >
                                      {role}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Employment Status</label>
                          <div className={`relative ${isNewUserEmpStatDropdownOpen ? 'z-50' : ''}`}>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={newUserEmpStat}
                                onChange={(e) => setNewUserEmpStat(e.target.value)}
                                onFocus={() => setIsNewUserEmpStatDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setIsNewUserEmpStatDropdownOpen(false), 200)}
                                placeholder="Select employment status..."
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setIsNewUserEmpStatDropdownOpen(!isNewUserEmpStatDropdownOpen)}
                                className="absolute right-1 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              >
                                <svg className={`size-4 transition-transform duration-200 ${isNewUserEmpStatDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            {isNewUserEmpStatDropdownOpen && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1">
                                {["COSW", "Permanent", "Contractual"]
                                  .filter(stat => stat.toLowerCase().includes((newUserEmpStat || "").toLowerCase()))
                                  .map((stat) => (
                                    <button
                                      key={stat}
                                      type="button"
                                      onClick={() => { setNewUserEmpStat(stat); setIsNewUserEmpStatDropdownOpen(false); }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm text-slate-700 focus:bg-teal-50 focus:outline-none"
                                    >
                                      {stat}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                          <button
                            onClick={handleCreateUser}
                            disabled={isCreatingUser || !newUserEmail || !newUserFirstName || !newUserLastName || !newUserRole}
                            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                            {isCreatingUser && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                            Create User
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="mt-8 text-center py-12 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <div className="w-12 h-12 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-slate-900 font-medium mb-1">No Profile Data Found</h3>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto">Your account is active, but we couldn't find an associated record in the permissions database. Please contact an Administrator to update your profile.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
