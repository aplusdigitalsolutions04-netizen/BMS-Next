'use client'

import { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import type { User } from '../../types';
import {
  Plus, Edit3, Search, Mail, Clock, Power, Trash2,
  Shield, Eye, BarChart2, UserCircle, Settings2,
  Users, Phone, ChevronRight, Check, X, Lock,
  LayoutGrid, Table2, EyeOff, MoreVertical,
} from 'lucide-react';
import { menuItems } from '../Layout/Sidebar';
import axios from 'axios';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';

//  Role meta (icon + palette) keyed by uppercase role ID 
const ROLE_META: Record<string, {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  gradient: string; text: string; soft: string; dot: string; letter: string;
}> = {
  ADMIN:         { Icon: Shield,     gradient: 'from-violet-500 to-purple-600', text: 'text-violet-600',  soft: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500',  letter: 'A' },
  ADMINISTRATOR: { Icon: Shield,     gradient: 'from-violet-500 to-purple-600', text: 'text-violet-600',  soft: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500',  letter: 'A' },
  SUPERVISOR:    { Icon: Eye,        gradient: 'from-sky-500 to-blue-600',      text: 'text-sky-600',     soft: 'bg-sky-100 text-sky-700',        dot: 'bg-sky-500',     letter: 'S' },
  ACCOUNTANT:    { Icon: BarChart2,  gradient: 'from-emerald-500 to-teal-600',  text: 'text-emerald-600', soft: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', letter: 'A' },
  USER:          { Icon: UserCircle, gradient: 'from-amber-400 to-orange-500',  text: 'text-amber-600',   soft: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500',   letter: 'U' },
  OPERATOR:      { Icon: Settings2,  gradient: 'from-rose-500 to-pink-600',     text: 'text-rose-600',    soft: 'bg-rose-100 text-rose-700',      dot: 'bg-rose-500',    letter: 'O' },
};

const FALLBACK_META = {
  Icon: Users, gradient: 'from-gray-500 to-gray-600', text: 'text-gray-600',
  soft: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500', letter: '?',
};

function getRoleMeta(roleId: string) {
  return ROLE_META[(roleId || '').toUpperCase()] || FALLBACK_META;
}

type ModalTab = 'profile' | 'features' | 'rules';

export default function UserManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, users, roles, firms } = state;

  const [showModal,    setShowModal]    = useState(false);
  const [modalTab,     setModalTab]     = useState<ModalTab>('profile');
  const [showMatrix,   setShowMatrix]   = useState(false);
  const [editing,      setEditing]      = useState<User | null>(null);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [roleFilter,   setRoleFilter]   = useState<string>('all');
  const [showPwd,      setShowPwd]      = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [menuOpen,     setMenuOpen]     = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '', fullName: '', email: '', phone: '', roleId: '', isActive: true, password: '',
  });
  const [globalAccess, setGlobalAccess] = useState(true);
  const [allowedFirms, setAllowedFirms] = useState<string[]>([]);
  // null = use role defaults; string[] = custom overrides
  const [customPerms, setCustomPerms] = useState<string[] | null>(null);

  const ALL_ACTION_PERMS = ['create', 'edit', 'delete', 'view', 'download', 'upload', 'approve', 'archive'];
  const SPECIAL_PERMS: { key: string; label: string; desc: string }[] = [
    { key: 'show:assign-column', label: 'Assign Column', desc: 'Can view and use the "Assign To" column on bids' },
    { key: 'bid:edit-parameters', label: 'Edit Bid Parameters', desc: 'Can edit extracted parameters after AI bid analysis' },
  ];
  const PERM_COLORS: Record<string, string> = {
    create: '#3b82f6', edit: '#f59e0b', delete: '#ef4444', view: '#10b981',
    download: '#06b6d4', upload: '#8b5cf6', approve: '#ec4899', archive: '#6b7280',
  };

  //  Derived
  const filtered = users.filter(u => {
    const matchSearch = !searchQuery ||
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'all' || u.roleId === roleFilter;
    return matchSearch && matchRole;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, roleFilter, pageSize]);
  const paginatedUsers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const selectedRole    = roles.find(r => r.id === form.roleId);
  const rolePermissions = selectedRole?.permissions.filter(p => !p.startsWith('tab:')) || [];
  const roleTabs        = selectedRole?.permissions.filter(p => p.startsWith('tab:')) || [];

  // effective permissions shown in the tab (custom if set, else role defaults)
  const effectivePerms: string[] = customPerms !== null
    ? customPerms
    : [...(selectedRole?.permissions || [])];
  const activeCount     = users.filter(u => u.isActive).length;

  //  Handlers 
  function openAdd() {
    setEditing(null);
    setForm({ username: '', fullName: '', email: '', phone: '', roleId: roles[0]?.id || '', isActive: true, password: '' });
    setGlobalAccess(true);
    setAllowedFirms([]);
    setCustomPerms(null);
    setModalTab('profile');
    setShowPwd(false);
    setShowModal(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({ username: user.username, fullName: user.fullName, email: user.email, phone: '', roleId: user.roleId, isActive: user.isActive, password: '' });
    const ga = user.globalAccess !== false;
    setGlobalAccess(ga);
    try { setAllowedFirms(ga ? [] : JSON.parse(user.firmAccess || '[]')); } catch { setAllowedFirms([]); }
    try {
      if (user.customPermissions) setCustomPerms(JSON.parse(user.customPermissions));
      else setCustomPerms(null);
    } catch { setCustomPerms(null); }
    setModalTab('profile');
    setShowPwd(false);
    setMenuOpen(null);
    setShowModal(true);
  }

  function togglePerm(perm: string) {
    const base = customPerms !== null ? customPerms : (selectedRole?.permissions || []);
    if (base.includes(perm)) setCustomPerms(base.filter(p => p !== perm));
    else setCustomPerms([...base, perm]);
  }

  function resetToRoleDefaults() {
    setCustomPerms(null);
  }

  function closeModal() { if (!submitting) setShowModal(false); }

  async function handleSave() {
    // Validation -- jump to Profile tab so the user can see the offending field
    const fail = (msg: string) => { setModalTab('profile'); toast.error(msg); };
    if (!form.roleId)                     { fail('Please select an access role'); return; }
    if (!editing && !form.username.trim()){ fail('Username is required'); return; }
    if (!form.fullName.trim())            { fail('Full Name is required'); return; }
    if (!form.email.trim())               { fail('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { fail('Enter a valid email address'); return; }
    if (!editing && !form.password)       { fail('Password is required'); return; }
    if (!editing && form.password.length < 6) { fail('Password must be at least 6 characters'); return; }

    setSubmitting(true);
    try {
      const accessPayload = {
        globalAccess,
        firmAccess: globalAccess ? null : allowedFirms,
        customPermissions: customPerms,
      };
      if (editing) {
        const res = await axios.put(`/api/users/${editing.id}`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          roleCode: form.roleId,
          ...(form.password ? { password: form.password } : {}),
          ...accessPayload,
        });
        dispatch({ type: 'UPDATE_USER', payload: { ...res.data, roleId: res.data.roleCode } });
        toast.success('Team member updated');
      } else {
        const res = await axios.post('/api/users', {
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          roleCode: form.roleId,
          ...accessPayload,
        });
        dispatch({ type: 'ADD_USER', payload: { ...res.data, roleId: res.data.roleCode } });
        toast.success('Team member created');
      }
      setShowModal(false);
    } catch (err: any) {
      // Show the real reason coming from the backend (duplicate email/username, bad role, etc.)
      const msg = err?.response?.data?.error || 'Failed to save team member';
      toast.error(msg);
    } finally { setSubmitting(false); }
  }

  async function handleToggleStatus(id: string) {
    setMenuOpen(null);
    try {
      const res = await axios.patch(`/api/users/${id}/toggle-status`);
      dispatch({ type: 'UPDATE_USER', payload: { ...res.data, roleId: res.data.roleCode } });
      toast.success('Status updated');
    } catch { toast.error('Failed to toggle status'); }
  }

  //  Theme tokens 
  const cardBg        = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary   = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inp           = `w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700/60 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white'
  }`;
  const lbl           = `block text-xs font-bold uppercase tracking-wider mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const fieldWrap     = `flex items-center gap-2 rounded-xl border transition px-4 py-2.5 ${
    darkMode ? 'bg-gray-700/60 border-gray-600 focus-within:border-blue-500' : 'bg-gray-50 border-gray-200 focus-within:border-blue-500 focus-within:bg-white'
  }`;
  const fieldInput    = `bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`;

  const TABS: { id: ModalTab; label: string; count?: number }[] = [
    { id: 'profile',  label: 'Profile' },
    { id: 'features', label: 'Feature Access', count: form.roleId.toUpperCase() === 'ADMIN' ? undefined : effectivePerms.length },
    { id: 'rules',    label: 'Data Rules' },
  ];

  return (
    <div className="space-y-6">

      {/*  Page heading row  */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${textPrimary}`}>Team Directory</h2>
          <p className={`text-sm mt-1 ${textSecondary}`}>
            Manage people, roles and access across your organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex rounded-xl border p-1 gap-0.5 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <button
              onClick={() => setShowMatrix(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!showMatrix ? 'bg-blue-600 text-white' : textSecondary}`}
            >
              <LayoutGrid size={14} /> Directory
            </button>
            <button
              onClick={() => setShowMatrix(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${showMatrix ? 'bg-blue-600 text-white' : textSecondary}`}
            >
              <Table2 size={14} /> Access Matrix
            </button>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition text-sm flex-shrink-0"
          >
            <Plus size={18} /> Add Member
          </button>
        </div>
      </div>

      {/*  Summary strip  */}
      <div className={`${cardBg} rounded-2xl border p-4 flex flex-wrap items-center gap-x-8 gap-y-4`}>
        <div className="flex items-center gap-3 pr-8 border-r border-dashed border-gray-300 dark:border-gray-700">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white">
            <Users size={20} />
          </div>
          <div>
            <p className={`text-2xl font-bold leading-none ${textPrimary}`}>{users.length}</p>
            <p className={`text-xs mt-1 ${textSecondary}`}>Total Members</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className={`text-sm ${textSecondary}`}><span className={`font-bold ${textPrimary}`}>{activeCount}</span> Active</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <p className={`text-sm ${textSecondary}`}><span className={`font-bold ${textPrimary}`}>{users.length - activeCount}</span> Inactive</p>
        </div>
      </div>

      {/*  Search + role filter  */}
      {!showMatrix && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`flex items-center gap-2 flex-1 px-3.5 py-2.5 rounded-xl border ${cardBg}`}>
            <Search size={16} className={textSecondary} />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900'}`}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')}><X size={14} className={textSecondary} /></button>}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                roleFilter === 'all' ? 'bg-blue-600 text-white' : `${cardBg} border ${textSecondary}`
              }`}
            >
              All ({users.length})
            </button>
            {roles.map(role => {
              const meta  = getRoleMeta(role.id);
              const count = users.filter(u => u.roleId === role.id).length;
              const active = roleFilter === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setRoleFilter(role.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                    active ? `bg-gradient-to-r ${meta.gradient} text-white border-transparent` : `${cardBg} ${textSecondary}`
                  }`}
                >
                  <meta.Icon size={12} /> {role.name} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/*  Empty state  */}
      {!showMatrix && filtered.length === 0 && (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <div className={`w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <Users size={36} className={textSecondary} />
          </div>
          <p className={`text-xl font-bold ${textPrimary}`}>{users.length === 0 ? 'No team members yet' : 'No matches found'}</p>
          <p className={`text-sm mt-2 ${textSecondary}`}>
            {users.length === 0 ? "Click 'Add Member' to get started." : 'Try a different search or role filter.'}
          </p>
          {users.length === 0 && (
            <button onClick={openAdd} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition">
              <Plus size={16} /> Add First Member
            </button>
          )}
        </div>
      )}

      {/*  Member card grid  */}
      {!showMatrix && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedUsers.map(u => {
            const meta = getRoleMeta(u.roleId);
            const role = roles.find(r => r.id === u.roleId);
            return (
              <div key={u.id} className={`${cardBg} rounded-2xl border p-5 relative group hover:shadow-xl hover:-translate-y-0.5 transition-all`}>
                {/* top accent bar */}
                <div className={`absolute top-0 left-5 right-5 h-1 rounded-b-full bg-gradient-to-r ${meta.gradient} opacity-80`} />

                {/* header */}
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br ${
                      u.isActive ? meta.gradient : 'from-gray-400 to-gray-500'
                    }`}>
                      {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 ${darkMode ? 'border-gray-800' : 'border-white'} ${u.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold truncate ${textPrimary}`}>{u.fullName}</p>
                    <p className={`text-xs ${textSecondary}`}>@{u.username}</p>
                    <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${meta.soft}`}>
                      <meta.Icon size={10} /> {role?.name || u.roleId}
                    </span>
                  </div>

                  {/* kebab menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                      className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === u.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                        <div className={`absolute right-0 top-9 w-40 rounded-xl shadow-xl border z-20 py-1 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                          <button onClick={() => openEdit(u)} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                            <Edit3 size={14} className="text-blue-500" /> Edit
                          </button>
                          <button onClick={() => handleToggleStatus(u.id)} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                            <Power size={14} className={u.isActive ? 'text-amber-500' : 'text-emerald-500'} /> {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <hr className={`my-1 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />
                          <button onClick={() => { setUserToDelete(u.id); setMenuOpen(null); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-red-50'}`}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* meta rows */}
                <div className={`mt-4 pt-4 border-t space-y-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                    <Mail size={13} className="flex-shrink-0" />
                    <span className="truncate">{u.email}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                    <Clock size={13} className="flex-shrink-0" />
                    <span>Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'}</span>
                  </div>
                </div>

                {/* quick actions (hover) */}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => openEdit(u)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                    darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <Edit3 size={13} /> Edit
                  </button>
                  <button onClick={() => handleToggleStatus(u.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                    u.isActive
                      ? (darkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100')
                      : (darkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')
                  }`}>
                    <Power size={13} /> {u.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!showMatrix && filtered.length > 0 && (
        <div className={`${cardBg} rounded-2xl border`}>
          <Pagination
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalItems={filtered.length}
            darkMode={darkMode}
            itemLabel="users"
            pageSizeOptions={[12, 24, 48, 96]}
          />
        </div>
      )}

      {/*  Access Matrix View  */}
      {showMatrix && users.length > 0 && (
        <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className={`border-b text-xs font-bold uppercase tracking-wider ${darkMode ? 'bg-gray-700/50 border-gray-700 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  <th className="px-5 py-3.5 w-10">#</th>
                  <th className="px-5 py-3.5">Member</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Action Permissions</th>
                  <th className="px-5 py-3.5">Module Access</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                {filtered.map((u, idx) => {
                  const meta    = getRoleMeta(u.roleId);
                  const role    = roles.find(r => r.id === u.roleId);
                  const acts    = role?.permissions.filter(p => !p.startsWith('tab:')) || [];
                  const tabs    = role?.permissions.filter(p => p.startsWith('tab:')) || [];
                  const isAdmin = u.roleId.toUpperCase() === 'ADMIN' || u.roleId.toUpperCase() === 'ADMINISTRATOR';
                  return (
                    <tr key={u.id} className={`transition-colors ${darkMode ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'}`}>
                      <td className={`px-5 py-4 text-sm font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{idx + 1}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gradient-to-br ${meta.gradient}`}>
                            {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className={`font-semibold ${textPrimary}`}>{u.fullName}</p>
                            <p className={`text-xs ${textSecondary}`}>@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.soft}`}>
                          <meta.Icon size={11} />{role?.name || u.roleId}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {isAdmin
                          ? <span className="text-xs font-bold text-emerald-500">FULL ACCESS</span>
                          : acts.length > 0
                            ? <div className="flex flex-wrap gap-1">{acts.map(a => (
                                <span key={a} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{a}</span>
                              ))}</div>
                            : <span className={`text-xs ${textSecondary}`}>--</span>
                        }
                      </td>
                      <td className="px-5 py-4">
                        {isAdmin
                          ? <span className="text-xs font-bold text-emerald-500">ALL MODULES</span>
                          : tabs.length > 0
                            ? <div className="flex flex-wrap gap-1">{tabs.map(tab => {
                                const tabId = tab.split(':')[1];
                                const label = menuItems.find(m => m.id === tabId)?.label || tabId;
                                return <span key={tab} className={`px-2 py-0.5 rounded text-[10px] font-bold ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>{label}</span>;
                              })}</div>
                            : <span className={`text-xs ${textSecondary}`}>--</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
          ADD / EDIT TEAM MEMBER MODAL
          a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`} style={{ maxHeight: '90vh' }}>

            {/* Modal header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${textPrimary}`}>{editing ? 'Edit Team Member' : 'New Team Member'}</h2>
                  <p className={`text-xs ${textSecondary}`}>Fill in the details below</p>
                </div>
              </div>
              <button onClick={closeModal} className={`p-2 rounded-xl transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className={`flex border-b px-6 flex-shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                    modalTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : `border-transparent ${textSecondary}`
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      modalTab === tab.id ? 'bg-blue-600 text-white' : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500')
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content (scrollable) */}
            <div className="px-6 py-5 overflow-y-auto flex-1">

              {/*  Profile Tab  */}
              {modalTab === 'profile' && (
                <div className="space-y-5">
                  {/* Access Role selector */}
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      ACCESS ROLE *
                    </p>
                    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 p-3 rounded-2xl border-2 ${
                      darkMode ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-indigo-100 bg-indigo-50/40'
                    }`}>
                      {roles.map(role => {
                        const meta     = getRoleMeta(role.id);
                        const isActive = form.roleId === role.id;
                        return (
                          <button
                            key={role.id}
                            onClick={() => setForm(p => ({ ...p, roleId: role.id }))}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition cursor-pointer ${
                              isActive
                                ? `border-current bg-gradient-to-br ${meta.gradient} text-white shadow-lg`
                                : `${darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300 hover:bg-gray-700' : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-white'}`
                            }`}
                          >
                            <meta.Icon size={20} className={isActive ? 'text-white' : meta.text} />
                            <span className={`text-[11px] font-bold ${isActive ? 'text-white' : ''}`}>{role.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fields */}
                  <div>
                    <label className={lbl}>USERNAME *</label>
                    <div className={fieldWrap}>
                      <Users size={14} className={textSecondary} />
                      <input
                        type="text"
                        placeholder="e.g. john_doe"
                        value={form.username}
                        onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                        disabled={!!editing}
                        className={`${fieldInput} disabled:opacity-50`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>FULL NAME</label>
                    <input
                      className={inp}
                      placeholder="John Doe"
                      value={form.fullName}
                      onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>EMAIL</label>
                      <div className={fieldWrap}>
                        <Mail size={14} className={textSecondary} />
                        <input
                          type="email"
                          placeholder="john@example.com"
                          value={form.email}
                          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          className={fieldInput}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>PHONE</label>
                      <div className={fieldWrap}>
                        <Phone size={14} className={textSecondary} />
                        <input
                          type="tel"
                          placeholder="+91 98765..."
                          value={form.phone}
                          onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                          className={fieldInput}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>{editing ? 'PASSWORD (leave blank to keep current)' : 'PASSWORD'}</label>
                    <div className={fieldWrap}>
                      <Lock size={14} className={textSecondary} />
                      <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="--------"
                        value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        className={fieldInput}
                      />
                      <button type="button" onClick={() => setShowPwd(v => !v)} className={`flex-shrink-0 ${textSecondary}`}>
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/*  Feature Access Tab  */}
              {modalTab === 'features' && (
                <div className="space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className={`flex items-start gap-2 p-3 rounded-xl border flex-1 mr-3 ${
                      darkMode ? 'bg-blue-900/20 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'
                    }`}>
                      <Shield size={14} className="flex-shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed">
                        {customPerms !== null
                          ? <><strong>Custom permissions</strong> are active for this user.</>
                          : <>Using <strong>{selectedRole?.name || 'role'}</strong> default permissions. Toggle below to override.</>}
                      </p>
                    </div>
                    {customPerms !== null && (
                      <button
                        type="button"
                        onClick={resetToRoleDefaults}
                        className={`flex-shrink-0 text-xs px-3 py-2 rounded-lg border transition ${
                          darkMode ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Reset to Role
                      </button>
                    )}
                  </div>

                  {form.roleId.toUpperCase() === 'ADMIN' || form.roleId.toUpperCase() === 'ADMINISTRATOR' ? (
                    <div className={`p-6 rounded-2xl border text-center ${darkMode ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-emerald-100 bg-emerald-50'}`}>
                      <Check size={32} className="mx-auto mb-2 text-emerald-500" />
                      <p className="font-bold text-emerald-600">Full Access</p>
                      <p className={`text-xs mt-1 ${textSecondary}`}>Administrator has unrestricted access to all features.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Action Permissions — interactive toggles */}
                      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                          <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Action Permissions</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setCustomPerms(p => {
                              const tabs = (p ?? effectivePerms).filter(x => x.startsWith('tab:'));
                              return [...ALL_ACTION_PERMS, ...tabs];
                            })} className="text-xs text-blue-500 hover:text-blue-600 font-medium">All</button>
                            <span className={`text-xs ${textSecondary}`}>·</span>
                            <button type="button" onClick={() => setCustomPerms(p => (p ?? effectivePerms).filter(x => x.startsWith('tab:')))}
                              className={`text-xs font-medium ${textSecondary} hover:text-red-500`}>None</button>
                          </div>
                        </div>
                        <div className="p-3 flex flex-wrap gap-2">
                          {ALL_ACTION_PERMS.map(perm => {
                            const active = effectivePerms.includes(perm);
                            return (
                              <button
                                key={perm}
                                type="button"
                                onClick={() => togglePerm(perm)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  active
                                    ? 'text-white border-transparent'
                                    : darkMode ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-white border-gray-200 text-gray-400'
                                }`}
                                style={active ? { backgroundColor: PERM_COLORS[perm] } : undefined}
                              >
                                {active ? <Check size={11} /> : <X size={11} />}
                                {perm.charAt(0).toUpperCase() + perm.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Module / Tab Access — interactive toggles */}
                      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                          <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Module Access</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setCustomPerms(p => {
                              const actions = (p ?? effectivePerms).filter(x => !x.startsWith('tab:'));
                              return [...actions, ...menuItems.map(m => `tab:${m.id}`)];
                            })} className="text-xs text-blue-500 hover:text-blue-600 font-medium">All</button>
                            <span className={`text-xs ${textSecondary}`}>·</span>
                            <button type="button" onClick={() => setCustomPerms(p => (p ?? effectivePerms).filter(x => !x.startsWith('tab:')))}
                              className={`text-xs font-medium ${textSecondary} hover:text-red-500`}>None</button>
                          </div>
                        </div>
                        <div className="p-3 flex flex-wrap gap-2">
                          {menuItems.map(item => {
                            const permKey = `tab:${item.id}`;
                            const active = effectivePerms.includes(permKey);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => togglePerm(permKey)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  active
                                    ? 'bg-indigo-500 text-white border-transparent'
                                    : darkMode ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-white border-gray-200 text-gray-400'
                                }`}
                              >
                                {active ? <Check size={11} /> : <X size={11} />}
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Special Column Visibility */}
                      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`px-4 py-2.5 border-b ${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                          <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Column Visibility</p>
                          <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Show or hide specific columns for this user</p>
                        </div>
                        <div className="p-3 space-y-2">
                          {SPECIAL_PERMS.map(sp => {
                            const active = effectivePerms.includes(sp.key);
                            return (
                              <div key={sp.key} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition ${
                                active
                                  ? darkMode ? 'border-violet-700 bg-violet-900/20' : 'border-violet-200 bg-violet-50'
                                  : darkMode ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white'
                              }`}>
                                <div className="min-w-0">
                                  <p className={`text-xs font-semibold ${active ? (darkMode ? 'text-violet-300' : 'text-violet-700') : textPrimary}`}>{sp.label}</p>
                                  <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{sp.desc}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => togglePerm(sp.key)}
                                  className={`w-10 h-5 rounded-full flex-shrink-0 flex items-center p-0.5 transition-colors ${
                                    active ? 'bg-violet-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/*  Data Rules Tab  */}
              {modalTab === 'rules' && (
                <div className="space-y-4">
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                    darkMode ? 'bg-amber-900/10 border-amber-800/30 text-amber-300' : 'bg-amber-50 border-amber-100 text-amber-700'
                  }`}>
                    <Shield size={16} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      Data Rules control which firm data this user can access. Turn off Global Access to restrict the user to specific firms only.
                    </p>
                  </div>

                  {/* Global Access Toggle */}
                  <div className={`p-5 rounded-2xl border ${darkMode ? 'border-gray-700 bg-gray-700/30' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold text-sm ${textPrimary}`}>Global Access</p>
                        <p className={`text-xs mt-0.5 ${textSecondary}`}>Can access all firms and their data</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setGlobalAccess(g => !g); setAllowedFirms([]); }}
                        className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors duration-200 ${
                          globalAccess ? 'bg-emerald-500' : (darkMode ? 'bg-gray-600' : 'bg-gray-300')
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${globalAccess ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Firm selector — shown when Global Access is OFF */}
                  {!globalAccess && (
                    <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                        <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Allowed Firms ({allowedFirms.length} selected)
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAllowedFirms(firms.filter(f => f.isActive && !f.isDeleted).map(f => f.id))}
                            className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                          >
                            Select All
                          </button>
                          <span className={`text-xs ${textSecondary}`}>·</span>
                          <button
                            type="button"
                            onClick={() => setAllowedFirms([])}
                            className={`text-xs font-medium ${textSecondary} hover:text-red-500`}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {firms.filter(f => !f.isDeleted).length === 0 ? (
                          <p className={`text-sm text-center py-6 ${textSecondary}`}>No firms available</p>
                        ) : (
                          firms.filter(f => !f.isDeleted).map(firm => {
                            const checked = allowedFirms.includes(firm.id);
                            return (
                              <label
                                key={firm.id}
                                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition border-b last:border-b-0 ${
                                  darkMode
                                    ? `border-gray-700 hover:bg-gray-700/40 ${checked ? 'bg-blue-900/20' : ''}`
                                    : `border-gray-100 hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setAllowedFirms(prev =>
                                    checked ? prev.filter(id => id !== firm.id) : [...prev, firm.id]
                                  )}
                                  className="accent-blue-600 w-4 h-4 flex-shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className={`text-sm font-medium truncate ${textPrimary}`}>{firm.name}</p>
                                  <p className={`text-xs truncate ${textSecondary}`}>{firm.firmCode} · {firm.firmType || 'Firm'}</p>
                                </div>
                                {!firm.isActive && (
                                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">Inactive</span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                      {!globalAccess && allowedFirms.length === 0 && (
                        <div className={`px-4 py-2 text-xs text-amber-600 bg-amber-50 border-t ${darkMode ? 'bg-amber-900/20 border-gray-700 text-amber-400' : 'border-gray-200'}`}>
                          No firms selected — this user will not be able to see any firm data.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between px-6 py-4 border-t flex-shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={closeModal}
                disabled={submitting}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-40 ${
                  darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {modalTab !== 'rules' && (
                  <button
                    onClick={() => setModalTab(modalTab === 'profile' ? 'features' : 'rules')}
                    className={`flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                      darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-40"
                >
                  <Plus size={16} />
                  {submitting ? 'Saving...' : (editing ? 'Update Account' : 'Create Account')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  Delete confirm  */}
      <ConfirmModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={async () => {
          if (userToDelete) {
            try {
              await axios.delete(`/api/users/${userToDelete}`);
              dispatch({ type: 'SET_USERS', payload: users.filter(u => u.id !== userToDelete) });
              toast.success('Team member deleted');
            } catch { toast.error('Failed to delete team member'); }
            setUserToDelete(null);
          }
        }}
        title="Remove Team Member"
        message="Are you sure you want to remove this team member? This action cannot be undone."
        isDanger
      />
    </div>
  );
}


