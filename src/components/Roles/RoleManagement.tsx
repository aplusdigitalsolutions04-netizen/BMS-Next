'use client'

import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import type { Permission, Role } from '../../types';
import { Shield, Check, X, Plus, Trash2 } from 'lucide-react';
import Modal from '../UI/Modal';
import axios from 'axios';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import { menuItems } from '../Layout/Sidebar';

const ALL_PERMISSIONS: Permission[] = ['create', 'edit', 'delete', 'view', 'download', 'upload', 'approve', 'archive'];

const permColors: Record<string, string> = {
  create: '#3b82f6', edit: '#f59e0b', delete: '#ef4444', view: '#10b981',
  download: '#06b6d4', upload: '#8b5cf6', approve: '#ec4899', archive: '#6b7280',
};

// Display-only labels -- the underlying permission keys (e.g. "approve") stay the same so
// existing role data isn't affected; "approve" specifically is renamed here since it's the
// permission that gates the Document Approvals page, and "approve" alone read as too generic.
const permLabels: Record<string, string> = { approve: 'Document Approval' };

export default function RoleManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, roles, users } = state;
  const [showModal, setShowModal] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [seedPerms, setSeedPerms] = useState<Permission[]>([]);
  const [seedTabs, setSeedTabs] = useState<string[]>([]);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const labelClass = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;

  const handleAddRole = async () => {
    if (!form.name.trim()) return;
    const code = form.name.toUpperCase().replace(/\s+/g, '_');
    const initialPerms: string[] = [...seedPerms, ...seedTabs.map(t => `tab:${t}`)];

    try {
      await axios.put(`/api/master/ROLES/${code}`, {
        value: form.name,
        description: form.description || `${form.name} Role`,
        metadata: JSON.stringify(initialPerms),
      });

      const newRole: Role = {
        id: code,
        name: form.name,
        description: form.description || `${form.name} Role`,
        permissions: initialPerms as Permission[],
      };

      dispatch({ type: 'ADD_ROLE', payload: newRole });
      setShowModal(false);
      setForm({ name: '', description: '' });
      setSeedPerms([]);
      setSeedTabs([]);
      toast.success('Role added successfully');
    } catch (e) {
      console.error(e);
      // The API returns a specific message (e.g. a duplicate-name rejection from the
      // sp_masterdata_upsert stored procedure) when available -- show that instead of a
      // generic failure so the user knows *why*, not just that it failed.
      toast.error(axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to add role');
    }
  };

  const handleTogglePermission = async (role: Role, perm: Permission) => {
    if (role.id === 'ADMIN') {
      toast.error('The Administrator role has full access and cannot be modified.');
      return;
    }
    try {
      const newPermissions = role.permissions.includes(perm)
        ? role.permissions.filter(p => p !== perm)
        : [...role.permissions, perm];
      
      await axios.put(`/api/master/ROLES/${role.id}`, {
        value: role.name,
        metadata: JSON.stringify(newPermissions)
      });
      
      dispatch({ type: 'UPDATE_ROLE', payload: { ...role, permissions: newPermissions } });
    } catch (e) {
      console.error(e);
      toast.error(axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to update role permissions');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (roleId === 'ADMIN') {
      toast.error('The Administrator role cannot be deleted.');
      return;
    }
    if (users.some(u => u.roleId === roleId)) {
      toast.error('Cannot delete a role that is assigned to users. Please reassign the users first.');
      return;
    }
    setRoleToDelete(roleId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>Roles & Permissions</h2>
          <p className={`text-sm ${textSecondary}`}>Manage role-based access control (RBAC)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition">
          <Plus size={18} /> Add Role
        </button>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {roles.map(role => {
          const roleUsers = users.filter(u => u.roleId === role.id);
          return (
            <div key={role.id} className={`${cardBg} rounded-2xl border p-6 hover:shadow-lg transition-shadow`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                    <Shield size={22} />
                  </div>
                  <div>
                    <h3 className={`font-semibold ${textPrimary}`}>{role.name}</h3>
                    <p className={`text-xs ${textSecondary}`}>{role.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {roleUsers.length} users
                  </span>
                  {role.id !== 'ADMIN' && (
                    <button onClick={() => handleDeleteRole(role.id)} className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 rounded-lg transition" title="Delete Role">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${textSecondary}`}>Action Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PERMISSIONS.map(perm => (
                    <span 
                      key={perm} 
                      onClick={() => role.id !== 'ADMIN' && handleTogglePermission(role, perm)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${role.id !== 'ADMIN' ? 'cursor-pointer transition-transform hover:scale-105' : 'cursor-not-allowed'} ${
                      role.permissions.includes(perm)
                        ? 'text-white'
                        : darkMode ? 'bg-gray-700 text-gray-500 line-through' : 'bg-gray-100 text-gray-400 line-through'
                    }`} style={role.permissions.includes(perm) ? { backgroundColor: permColors[perm] } : undefined}>
                      {role.permissions.includes(perm) ? <Check size={10} /> : <X size={10} />}
                      {permLabels[perm] || perm}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${textSecondary}`}>Tab Access</p>
                <div className="flex flex-wrap gap-1.5">
                  {menuItems.map(item => {
                    const permName = `tab:${item.id}` as any;
                    const hasAccess = role.permissions.includes(permName) || role.id === 'ADMIN';
                    return (
                      <span 
                        key={item.id} 
                        onClick={() => role.id !== 'ADMIN' && handleTogglePermission(role, permName)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${role.id !== 'ADMIN' ? 'cursor-pointer transition-transform hover:scale-105' : 'cursor-not-allowed'} ${
                        hasAccess
                          ? 'bg-indigo-500 text-white'
                          : darkMode ? 'bg-gray-700 text-gray-500 line-through' : 'bg-gray-100 text-gray-400 line-through'
                      }`}>
                        {hasAccess ? <Check size={10} /> : <X size={10} />}
                        {item.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {roleUsers.length > 0 && (
                <div className="mt-4">
                  <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${textSecondary}`}>Users</p>
                  <div className="flex -space-x-2">
                    {roleUsers.slice(0, 5).map(u => (
                      <div key={u.id} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800" title={u.fullName}>
                        {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    ))}
                    {roleUsers.length > 5 && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 ${
                        darkMode ? 'bg-gray-700 text-gray-300 border-gray-800' : 'bg-gray-200 text-gray-600 border-white'
                      }`}>+{roleUsers.length - 5}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Permission Matrix */}
      <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
        <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h3 className={`text-lg font-semibold ${textPrimary}`}>Permission Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${textSecondary}`}>Role</th>
                {ALL_PERMISSIONS.map(p => (
                  <th key={p} className={`px-4 py-3 text-center text-xs font-semibold uppercase ${textSecondary}`}>{permLabels[p] || p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.id} className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
                  <td className={`px-4 py-3 text-sm font-medium ${textPrimary}`}>{role.name}</td>
                  {ALL_PERMISSIONS.map(perm => (
                    <td key={perm} className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleTogglePermission(role, perm)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center mx-auto transition-colors ${
                          role.permissions.includes(perm) ? 'bg-green-100 hover:bg-green-200 text-green-600' : 'bg-red-100 hover:bg-red-200 text-red-400'
                        }`}
                      >
                        {role.permissions.includes(perm) ? <Check size={14} /> : <X size={14} />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setSeedPerms([]); setSeedTabs([]); }} title="Add New Role">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Role Name *</label>
            <input className={inputClass} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Manager" />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <input className={inputClass} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief description of this role" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowModal(false); setSeedPerms([]); setSeedTabs([]); }} className={`px-5 py-2.5 rounded-xl text-sm font-medium ${
              darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}>Cancel</button>
            <button onClick={handleAddRole} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition">
              Create Role
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={async () => {
          if (roleToDelete) {
            try {
              await axios.delete(`/api/master/ROLES/${roleToDelete}`);
              dispatch({ type: 'DELETE_ROLE', payload: roleToDelete });
              toast.success('Role deleted successfully');
            } catch (e) {
              console.error(e);
              toast.error('Failed to delete role');
            }
          }
        }}
        title="Delete Role"
        message="Are you sure you want to delete this role? This cannot be undone."
        isDanger={true}
      />
    </div>
  );
}


