'use client'

import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import axios from 'axios';
import { User, Mail, Shield, Save, Key, Camera } from 'lucide-react';

export default function Profile() {
  const { state, dispatch } = useApp();
  const { darkMode, currentUser, roles } = state;
  const role = roles.find(r => r.id === currentUser.roleId);

  const [form, setForm] = useState({
    fullName: currentUser.fullName || '',
    email: currentUser.email || '',
    password: '',
    confirmPassword: '',
    avatar: currentUser.avatar || ''
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (form.password && form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const payload: any = {
        fullName: form.fullName,
        email: form.email,
        roleCode: currentUser.roleId, // passing back existing
        avatar: form.avatar
      };
      if (form.password) payload.password = form.password;

      const res = await axios.put(`/api/users/${currentUser.id}`, payload);
      
      const updatedUser = { ...res.data, roleId: res.data.roleCode };
      dispatch({ type: 'UPDATE_USER', payload: updatedUser });
      
      // Update current user in local storage
      const mergedUser = { ...currentUser, ...updatedUser };
      localStorage.setItem('user', JSON.stringify(mergedUser));
      dispatch({ type: 'LOGIN', payload: mergedUser }); // Re-login to update state

      setMessage('Profile updated successfully!');
      setForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
    } catch (e) {
      console.error(e);
      setError('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>My Profile</h1>
          <p className={`text-sm mt-1 ${textSecondary}`}>Manage your personal information and security settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className={`flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all ${loading ? 'opacity-70' : ''}`}
        >
          <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {message && <div className="p-4 bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 rounded-xl font-medium">{message}</div>}
      {error && <div className="p-4 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 rounded-xl font-medium">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Avatar Section */}
        <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center ${cardBg}`}>
          <div className="relative group">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold overflow-hidden shadow-xl">
              {form.avatar ? (
                <img src={form.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                currentUser.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
              )}
            </div>
            <label className="absolute bottom-0 right-0 p-3 bg-white dark:bg-gray-700 rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform">
              <Camera size={20} className="text-gray-700 dark:text-gray-300" />
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </label>
          </div>
          <h3 className={`mt-6 font-bold text-lg ${textPrimary}`}>{currentUser.fullName}</h3>
          <p className={`text-sm ${textSecondary}`}>{role?.name || 'User'}</p>
          <span className="mt-4 px-3 py-1 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 text-xs font-semibold rounded-full uppercase tracking-wider">
            Active Account
          </span>
        </div>

        {/* Details Section */}
        <div className={`md:col-span-2 p-6 rounded-2xl border space-y-6 ${cardBg}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${textPrimary}`}>
            <User size={18} className="text-blue-500" /> Personal Information
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.fullName}
                  onChange={e => setForm({...form, fullName: e.target.value})}
                  className={`${inputClass} pl-10`}
                />
                <User size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className={`${inputClass} pl-10`}
                />
                <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Username (Read Only)</label>
              <div className="relative">
                <input
                  type="text"
                  value={currentUser.username}
                  readOnly
                  className={`${inputClass} pl-10 opacity-70 cursor-not-allowed`}
                />
                <Shield size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>
          </div>

          <hr className={`my-8 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`} />

          <h3 className={`font-semibold flex items-center gap-2 ${textPrimary}`}>
            <Key size={18} className="text-indigo-500" /> Security
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>New Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                placeholder="Leave blank to keep current"
                className={inputClass}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Confirm Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={e => setForm({...form, confirmPassword: e.target.value})}
                placeholder="Confirm new password"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


