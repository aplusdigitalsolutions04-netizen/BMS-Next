'use client'

import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { formatFileSize } from '../../utils/helpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { FileText, Download, Building2, Clock, AlertTriangle, Users } from 'lucide-react';

type ReportType = 'firm-docs' | 'expiring' | 'expired' | 'user-activity' | 'upload-summary';

export default function Reports() {
  const { state } = useApp();
  const { darkMode, documents, firms, categories, auditLogs, expiryAlerts, users } = state;
  const [selectedReport, setSelectedReport] = useState<ReportType>('firm-docs');

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  const reports = [
    { id: 'firm-docs' as ReportType, label: 'Firm-Wise Documents', icon: <Building2 size={20} />, color: 'from-blue-500 to-blue-600' },
    { id: 'expiring' as ReportType, label: 'Expiring Documents', icon: <Clock size={20} />, color: 'from-amber-500 to-amber-600' },
    { id: 'expired' as ReportType, label: 'Expired Documents', icon: <AlertTriangle size={20} />, color: 'from-red-500 to-red-600' },
    { id: 'user-activity' as ReportType, label: 'User Activity', icon: <Users size={20} />, color: 'from-violet-500 to-violet-600' },
    { id: 'upload-summary' as ReportType, label: 'Upload Summary', icon: <FileText size={20} />, color: 'from-emerald-500 to-emerald-600' },
  ];

  const firmDocData = firms.filter(f => !f.isDeleted).map(f => ({
    name: f.name.split(' ').slice(0, 2).join(' '),
    documents: documents.filter(d => d.firmId === f.id && !d.isDeleted).length,
    storage: documents.filter(d => d.firmId === f.id && !d.isDeleted).reduce((s, d) => s + d.fileSize, 0),
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const categoryData = categories.slice(0, 6).map((c, i) => ({
    name: c.name,
    value: documents.filter(d => d.categoryId === c.id && !d.isDeleted).length,
    color: COLORS[i % COLORS.length],
  })).filter(c => c.value > 0);

  const userActivityData = users.map(u => ({
    name: u.fullName.split(' ')[0],
    actions: auditLogs.filter(l => l.userId === u.id).length,
  }));

  function getReportRows(): { headers: string[]; rows: (string | number)[][] } {
    const ts = new Date().toLocaleString('en-IN');
    if (selectedReport === 'firm-docs') {
      const headers = ['#', 'Firm Name', 'Firm Code', 'Documents', 'Storage (KB)', 'Status'];
      const rows = firms.filter(f => !f.isDeleted).map((f, i) => {
        const docs = documents.filter(d => d.firmId === f.id && !d.isDeleted);
        return [i + 1, f.name, f.firmCode, docs.length, Math.round(docs.reduce((s, d) => s + d.fileSize, 0) / 1024), f.isActive ? 'Active' : 'Inactive'];
      });
      return { headers, rows };
    }
    if (selectedReport === 'expiring') {
      const headers = ['#', 'Document', 'Firm', 'Expiry Date', 'Days Left', 'Alert Level'];
      const rows = expiryAlerts.filter(a => a.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining).map((a, i) => [
        i + 1, a.documentTitle, a.firmName, a.expiryDate, a.daysRemaining, a.alertLevel,
      ]);
      return { headers, rows };
    }
    if (selectedReport === 'expired') {
      const headers = ['#', 'Document', 'Firm', 'Expiry Date', 'Days Overdue'];
      const rows = expiryAlerts.filter(a => a.daysRemaining < 0).map((a, i) => [
        i + 1, a.documentTitle, a.firmName, a.expiryDate, Math.abs(a.daysRemaining),
      ]);
      return { headers, rows };
    }
    if (selectedReport === 'user-activity') {
      const headers = ['#', 'User', 'Role', 'Last Login', 'Total Actions', 'Status'];
      const rows = users.map((u, i) => {
        const role = state.roles.find(r => r.id === u.roleId);
        return [i + 1, u.fullName, role?.name || u.roleId, new Date(u.lastLogin).toLocaleString('en-IN'), auditLogs.filter(l => l.userId === u.id).length, u.isActive ? 'Active' : 'Inactive'];
      });
      return { headers, rows };
    }
    // upload-summary
    const headers = ['#', 'Category', 'Documents', 'Generated'];
    const rows = categories.map((c, i) => [
      i + 1, c.name, documents.filter(d => d.categoryId === c.id && !d.isDeleted).length, ts,
    ]);
    return { headers, rows };
  }

  async function handleExport(format: string) {
    const { headers, rows } = getReportRows();
    const filename = `report_${selectedReport}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'excel') {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } else if (format === 'pdf') {
      window.print();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>Reports</h2>
          <p className={`text-sm ${textSecondary}`}>Generate and export comprehensive reports</p>
        </div>
        <div className="flex gap-2">
          {['PDF', 'Excel', 'CSV'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt.toLowerCase())}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}>
              <Download size={14} /> {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Report Selector */}
      <div className="flex flex-wrap gap-3">
        {reports.map(r => (
          <button key={r.id} onClick={() => setSelectedReport(r.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
              selectedReport === r.id
                ? `bg-gradient-to-r ${r.color} text-white shadow-lg`
                : `${cardBg} border ${darkMode ? 'text-gray-300 hover:border-gray-600' : 'text-gray-700 hover:border-gray-300'}`
            }`}>
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      {/* Report Content */}
      {selectedReport === 'firm-docs' && (
        <div className="space-y-6">
          <div className={`${cardBg} rounded-2xl border p-6`}>
            <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Documents per Firm</h3>
            {firmDocData.length === 0 ? (
              <div className={`text-center py-12 ${textSecondary}`}><FileText size={36} className="mx-auto mb-3 opacity-30" /><p>No data available</p></div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={firmDocData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                <XAxis dataKey="name" tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} />
                <YAxis tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: darkMode ? '#1f2937' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '12px' }} />
                <Bar dataKey="documents" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
          <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  {['#', 'Firm', 'Code', 'Documents', 'Storage', 'Status'].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase ${textSecondary}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {firms.filter(f => !f.isDeleted).map((f, idx) => {
                  const docs = documents.filter(d => d.firmId === f.id && !d.isDeleted);
                  return (
                    <tr key={f.id} className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
                      <td className={`px-4 py-3 text-sm font-medium ${textSecondary}`}>{idx + 1}</td>
                      <td className={`px-4 py-3 text-sm font-medium ${textPrimary}`}>{f.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-500">{f.firmCode}</td>
                      <td className={`px-4 py-3 text-sm ${textPrimary}`}>{docs.length}</td>
                      <td className={`px-4 py-3 text-sm ${textSecondary}`}>{formatFileSize(docs.reduce((s, d) => s + d.fileSize, 0))}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${f.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {f.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedReport === 'expiring' && (
        <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Expiring Documents Report</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                {['#', 'Document', 'Firm', 'Expiry Date', 'Days Left', 'Alert Level'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase ${textSecondary}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expiryAlerts.filter(a => a.daysRemaining > 0).length === 0 && (
                <tr><td colSpan={6} className={`px-4 py-10 text-center text-sm ${textSecondary}`}>No expiring documents found</td></tr>
              )}
              {expiryAlerts.filter(a => a.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining).map((alert, idx) => (
                <tr key={alert.id} className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
                  <td className={`px-4 py-3 text-sm font-medium ${textSecondary}`}>{idx + 1}</td>
                  <td className={`px-4 py-3 text-sm font-medium ${textPrimary}`}>{alert.documentTitle}</td>
                  <td className={`px-4 py-3 text-sm ${textSecondary}`}>{alert.firmName}</td>
                  <td className={`px-4 py-3 text-sm ${textSecondary}`}>{alert.expiryDate}</td>
                  <td className={`px-4 py-3 text-sm font-medium ${alert.daysRemaining <= 7 ? 'text-red-500' : alert.daysRemaining <= 15 ? 'text-orange-500' : 'text-yellow-500'}`}>
                    {alert.daysRemaining} days
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      alert.alertLevel === '7days' ? 'bg-red-100 text-red-700' :
                      alert.alertLevel === '15days' ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{alert.alertLevel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedReport === 'expired' && (
        <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Expired Documents Report</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                {['#', 'Document', 'Firm', 'Expiry Date', 'Days Overdue'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase ${textSecondary}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expiryAlerts.filter(a => a.daysRemaining < 0).length === 0 && (
                <tr><td colSpan={5} className={`px-4 py-10 text-center text-sm ${textSecondary}`}>No expired documents found</td></tr>
              )}
              {expiryAlerts.filter(a => a.daysRemaining < 0).map((alert, idx) => (
                <tr key={alert.id} className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
                  <td className={`px-4 py-3 text-sm font-medium ${textSecondary}`}>{idx + 1}</td>
                  <td className={`px-4 py-3 text-sm font-medium ${textPrimary}`}>{alert.documentTitle}</td>
                  <td className={`px-4 py-3 text-sm ${textSecondary}`}>{alert.firmName}</td>
                  <td className={`px-4 py-3 text-sm ${textSecondary}`}>{alert.expiryDate}</td>
                  <td className="px-4 py-3 text-sm font-medium text-red-500">{Math.abs(alert.daysRemaining)} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedReport === 'user-activity' && (
        <div className="space-y-6">
          <div className={`${cardBg} rounded-2xl border p-6`}>
            <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>User Activity Overview</h3>
            {userActivityData.every(u => u.actions === 0) ? (
              <div className={`text-center py-12 ${textSecondary}`}><Users size={36} className="mx-auto mb-3 opacity-30" /><p>No activity logs found</p></div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={userActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                <XAxis dataKey="name" tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} />
                <YAxis tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: darkMode ? '#1f2937' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '12px' }} />
                <Bar dataKey="actions" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
          <div className={`${cardBg} rounded-2xl border overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  {['#', 'User', 'Role', 'Last Login', 'Total Actions', 'Status'].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase ${textSecondary}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const role = state.roles.find(r => r.id === u.roleId);
                  return (
                    <tr key={u.id} className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
                      <td className={`px-4 py-3 text-sm font-medium ${textSecondary}`}>{idx + 1}</td>
                      <td className={`px-4 py-3`}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                            {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className={`text-sm font-medium ${textPrimary}`}>{u.fullName}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-sm ${textSecondary}`}>{role?.name}</td>
                      <td className={`px-4 py-3 text-sm ${textSecondary}`}>{new Date(u.lastLogin).toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm font-medium ${textPrimary}`}>{auditLogs.filter(l => l.userId === u.id).length}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedReport === 'upload-summary' && (
        <div className="space-y-6">
          <div className={`${cardBg} rounded-2xl border p-6`}>
            <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Category Distribution</h3>
            {categoryData.length === 0 ? (
              <div className={`text-center py-12 ${textSecondary}`}><FileText size={36} className="mx-auto mb-3 opacity-30" /><p>No categorized documents found</p></div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: darkMode ? '#1f2937' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Documents', value: documents.filter(d => !d.isDeleted).length },
              { label: 'Total Storage', value: formatFileSize(documents.filter(d => !d.isDeleted).reduce((s, d) => s + d.fileSize, 0)) },
              { label: 'PDF Files', value: documents.filter(d => !d.isDeleted && d.fileType.includes('pdf')).length },
              { label: 'Avg File Size', value: formatFileSize(documents.filter(d => !d.isDeleted).reduce((s, d) => s + d.fileSize, 0) / Math.max(documents.filter(d => !d.isDeleted).length, 1)) },
            ].map(s => (
              <div key={s.label} className={`${cardBg} rounded-2xl border p-4`}>
                <p className={`text-2xl font-bold ${textPrimary}`}>{s.value}</p>
                <p className={`text-sm ${textSecondary}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

