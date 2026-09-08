'use client'

import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import DataTable from '../UI/DataTable';
import Badge from '../UI/Badge';
import { Search } from 'lucide-react';
import type { AuditLog } from '../../types';

export default function AuditTrail() {
  const { state } = useApp();
  const { darkMode, auditLogs } = state;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterModule, setFilterModule] = useState('all');

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  const filtered = auditLogs.filter(log => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!log.userName.toLowerCase().includes(q) && !log.details.toLowerCase().includes(q)) return false;
    }
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterModule !== 'all' && log.module !== filterModule) return false;
    return true;
  });

  const actionColors: Record<string, string> = {
    Login: '#10b981', Logout: '#6b7280', Create: '#3b82f6', Upload: '#8b5cf6',
    Update: '#f59e0b', Delete: '#ef4444', Download: '#06b6d4', Archive: '#6b7280',
  };

  const columns = [
    { key: 'dateTime', label: 'Date & Time', render: (log: AuditLog) => (
      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        {new Date(log.dateTime).toLocaleString()}
      </span>
    )},
    { key: 'userName', label: 'User', render: (log: AuditLog) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
          {log.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <span className={`text-sm font-medium ${textPrimary}`}>{log.userName}</span>
      </div>
    )},
    { key: 'action', label: 'Action', render: (log: AuditLog) => (
      <Badge text={log.action} color={actionColors[log.action] || '#6b7280'} />
    )},
    { key: 'module', label: 'Module', render: (log: AuditLog) => (
      <span className={`text-sm ${textSecondary}`}>{log.module}</span>
    )},
    { key: 'details', label: 'Details', render: (log: AuditLog) => (
      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'} max-w-xs truncate block`}>{log.details}</span>
    )},
    { key: 'ipAddress', label: 'IP Address', render: (log: AuditLog) => (
      <span className="font-mono text-xs text-blue-500">{log.ipAddress}</span>
    )},
    { key: 'changes', label: 'Changes', sortable: false, render: (log: AuditLog) => (
      <div className="text-xs">
        {log.oldValue && <span className={`${darkMode ? 'text-red-400' : 'text-red-500'}`}>- {log.oldValue}</span>}
        {log.oldValue && log.newValue && <br/>}
        {log.newValue && <span className={`${darkMode ? 'text-green-400' : 'text-green-500'}`}>+ {log.newValue}</span>}
        {!log.oldValue && !log.newValue && <span className={textSecondary}>--</span>}
      </div>
    )},
  ];

  const actions = [...new Set(auditLogs.map(l => l.action))];
  const modules = [...new Set(auditLogs.map(l => l.module))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-bold ${textPrimary}`}>Audit Trail</h2>
        <p className={`text-sm ${textSecondary}`}>Track every activity across the system</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Logs', value: auditLogs.length, color: 'from-blue-500 to-blue-600' },
          { label: 'Today', value: auditLogs.filter(l => l.dateTime.startsWith('2026-01-15')).length, color: 'from-green-500 to-green-600' },
          { label: 'Unique Users', value: new Set(auditLogs.map(l => l.userId)).size, color: 'from-violet-500 to-violet-600' },
          { label: 'Critical Actions', value: auditLogs.filter(l => l.action === 'Delete').length, color: 'from-red-500 to-red-600' },
        ].map(s => (
          <div key={s.label} className={`${cardBg} rounded-2xl border p-4`}>
            <p className={`text-2xl font-bold ${textPrimary}`}>{s.value}</p>
            <p className={`text-sm ${textSecondary}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-2xl border p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <Search size={18} className="opacity-50" />
          <input type="text" placeholder="Search logs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`} />
        </div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
          className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
          <option value="all">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
        <DataTable columns={columns} data={filtered} pageSize={10} showSerial />
      </div>
    </div>
  );
}

