'use client'

import { useApp } from '../../store/AppContext';
import { Bell, Check, CheckCheck, Info, AlertTriangle, XCircle, CheckCircle, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useState, useEffect } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';
import toast from 'react-hot-toast';

export default function NotificationCenter() {
  const { state, dispatch } = useApp();
  const { darkMode, notifications } = state;
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  const unread = notifications.filter(n => !n.isRead);
  const read = notifications.filter(n => n.isRead);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setCurrentPage(1); }, [read.length, pageSize]);
  const paginatedRead = read.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const typeIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info size={18} className="text-blue-500" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
      case 'error': return <XCircle size={18} className="text-red-500" />;
      case 'success': return <CheckCircle size={18} className="text-green-500" />;
      default: return <Bell size={18} className="text-gray-500" />;
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.patch('/api/notifications/read-all');
      dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await axios.patch(`/api/notifications/${id}/read`);
      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestNotification = async () => {
    try {
      await axios.post('/api/notifications/test');
      // Fetch latest notifications to show the new one
      const notifRes = await axios.get('/api/notifications');
      dispatch({ type: 'SET_NOTIFICATIONS', payload: notifRes.data });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAll = async () => {
    try {
      await axios.delete('/api/notifications');
      dispatch({ type: 'DELETE_ALL_NOTIFICATIONS' });
      toast.success('All notifications cleared');
    } catch (e) {
      toast.error('Failed to clear notifications');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/notifications/${id}`);
      dispatch({ type: 'DELETE_NOTIFICATION', payload: id });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>Notifications</h2>
          <p className={`text-sm ${textSecondary}`}>{unread.length} unread notification(s)</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleTestNotification}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition">
            <Bell size={16} /> Send Test Alert
          </button>
          {unread.length > 0 && (
            <button onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition">
              <CheckCheck size={16} /> Mark All Read
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded-xl text-sm font-medium transition">
              <Trash2 size={16} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: notifications.length, color: 'from-blue-500 to-blue-600' },
          { label: 'Unread', value: unread.length, color: 'from-red-500 to-red-600' },
          { label: 'Warnings', value: notifications.filter(n => n.type === 'warning').length, color: 'from-amber-500 to-amber-600' },
          { label: 'Errors', value: notifications.filter(n => n.type === 'error').length, color: 'from-red-500 to-rose-600' },
        ].map(s => (
          <div key={s.label} className={`${cardBg} rounded-2xl border p-4`}>
            <p className={`text-2xl font-bold ${textPrimary}`}>{s.value}</p>
            <p className={`text-sm ${textSecondary}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unread */}
      {unread.length > 0 && (
        <div>
          <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>Unread</h3>
          <div className="space-y-2">
            {unread.map((n, idx) => (
              <div key={n.id} className={`${cardBg} rounded-2xl border p-4 flex items-start gap-4 ${
                darkMode ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50 border-blue-100'
              }`}>
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-white text-gray-500'}`}>{idx + 1}</span>
                <div className="flex-shrink-0 mt-0.5">{typeIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold text-sm ${textPrimary}`}>{n.title}</h4>
                  <p className={`text-sm mt-0.5 ${textSecondary}`}>{n.message}</p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(n.createdOn).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleMarkRead(n.id)}
                    className={`p-2 rounded-lg flex-shrink-0 ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-white text-gray-500'}`} title="Mark as read">
                    <Check size={16} />
                  </button>
                  <button onClick={() => handleDelete(n.id)}
                    className={`p-2 rounded-lg flex-shrink-0 ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-white text-red-500'}`} title="Delete notification">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Read */}
      {read.length > 0 && (
        <div>
          <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>Read</h3>
          <div className="space-y-2">
            {paginatedRead.map((n, idx) => (
              <div key={n.id} className={`${cardBg} rounded-2xl border p-4 flex items-start gap-4 opacity-60`}>
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{idx + 1}</span>
                <div className="flex-shrink-0 mt-0.5">{typeIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold text-sm ${textPrimary}`}>{n.title}</h4>
                  <p className={`text-sm mt-0.5 ${textSecondary}`}>{n.message}</p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(n.createdOn).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => handleDelete(n.id)}
                  className={`p-2 rounded-lg flex-shrink-0 ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-100 text-red-500'}`} title="Delete notification">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className={`${cardBg} rounded-2xl border mt-3`}>
            <Pagination
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              totalItems={read.length}
              darkMode={darkMode}
              itemLabel="read notifications"
            />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
        title="Clear All Notifications"
        message="Are you sure you want to permanently delete all notifications? This action cannot be undone."
        confirmText="Yes, clear all"
        isDanger={true}
      />
    </div>
  );
}


