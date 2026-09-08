'use client'

import { useApp } from '../../store/AppContext';
import Badge from '../UI/Badge';
import { AlertTriangle, Clock, XCircle, Bell } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function ExpiryManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, documents, firms, expiryAlerts: ackState, alertConfig } = state;
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  const expiryAlerts = documents
    .filter(d => !d.isDeleted && d.expiryDate && !d.isArchived)
    .map(d => {
      const firm = firms.find(f => f.id === d.firmId);
      const expDate = new Date(d.expiryDate);
      const today = new Date();
      // Reset time to start of day for accurate day calculation
      today.setHours(0, 0, 0, 0);
      expDate.setHours(0, 0, 0, 0);
      
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let alertLevel: '7days' | '15days' | '30days' | '60days' | 'expired' | null = null;
      if (diffDays < 0) alertLevel = 'expired';
      else if (diffDays <= 7 && alertConfig[7]) alertLevel = '7days';
      else if (diffDays <= 15 && alertConfig[15]) alertLevel = '15days';
      else if (diffDays <= 30 && alertConfig[30]) alertLevel = '30days';
      else if (diffDays <= 60 && alertConfig[60]) alertLevel = '60days';

      if (!alertLevel) return null;

      const isAck = ackState.find(a => a.id === d.id)?.isAcknowledged || false;

      return {
        id: d.id,
        documentId: d.id,
        documentTitle: d.title,
        firmName: firm?.name || 'Unknown Firm',
        expiryDate: expDate.toISOString().split('T')[0],
        daysRemaining: diffDays,
        alertLevel,
        isAcknowledged: isAck,
      };
    })
    .filter(Boolean) as any[];

  const expired = expiryAlerts.filter(a => a.alertLevel === 'expired');
  const critical = expiryAlerts.filter(a => a.alertLevel === '7days');
  const warning = expiryAlerts.filter(a => a.alertLevel === '15days');
  const upcoming = expiryAlerts.filter(a => a.alertLevel === '30days' || a.alertLevel === '60days');

  const handleToggleConfig = async (days: number) => {
    try {
      const newConfig = { ...alertConfig, [days]: !alertConfig[days] };
      await axios.put('/api/master/SETTINGS/ALERT_CONFIG', {
        value: 'Alert Configurations',
        metadata: JSON.stringify(newConfig)
      });
      dispatch({ type: 'SET_ALERT_CONFIG', payload: newConfig });
      toast.success('Alert configuration updated');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update alert configuration');
    }
  };

  const alertConfigCards = [
    { label: 'Expired', items: expired, icon: <XCircle size={20} />, color: 'from-red-500 to-red-600', borderColor: 'border-red-500/30', bg: darkMode ? 'bg-red-500/10' : 'bg-red-50' },
    { label: 'Critical (7 days)', items: critical, icon: <AlertTriangle size={20} />, color: 'from-orange-500 to-orange-600', borderColor: 'border-orange-500/30', bg: darkMode ? 'bg-orange-500/10' : 'bg-orange-50' },
    { label: 'Warning (15 days)', items: warning, icon: <Clock size={20} />, color: 'from-yellow-500 to-yellow-600', borderColor: 'border-yellow-500/30', bg: darkMode ? 'bg-yellow-500/10' : 'bg-yellow-50' },
    { label: 'Upcoming (60 days)', items: upcoming, icon: <Bell size={20} />, color: 'from-blue-500 to-blue-600', borderColor: 'border-blue-500/30', bg: darkMode ? 'bg-blue-500/10' : 'bg-blue-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-bold ${textPrimary}`}>Expiry Management</h2>
        <p className={`text-sm ${textSecondary}`}>Monitor and track document expiry dates</p>
      </div>

      {/* Alert Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {alertConfigCards.map(cfg => (
          <div key={cfg.label} className={`${cardBg} rounded-2xl border p-5`}>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-white mb-3`}>
              {cfg.icon}
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>{cfg.items.length}</p>
            <p className={`text-sm ${textSecondary} mt-0.5`}>{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Alert Configuration */}
      <div className={`${cardBg} rounded-2xl border p-6`}>
        <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Alert Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[7, 15, 30, 60].map(days => (
            <div key={days} className={`p-4 rounded-xl border ${darkMode ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${textPrimary}`}>{days} Days Before</span>
                <div 
                  onClick={() => handleToggleConfig(days)}
                  className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${alertConfig[days] ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${alertConfig[days] ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </div>
              <p className={`text-xs mt-1 ${textSecondary}`}>Email + Dashboard</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Details */}
      {alertConfigCards.map(cfg => cfg.items.length > 0 && (
        <div key={cfg.label} className={`${cardBg} rounded-2xl border overflow-hidden`}>
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`text-lg font-semibold ${textPrimary}`}>{cfg.label}</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {cfg.items.map(alert => (
              <div key={alert.id} className={`px-6 py-4 flex items-center justify-between ${cfg.bg}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-white`}>
                    {cfg.icon}
                  </div>
                  <div>
                    <p className={`font-medium ${textPrimary}`}>{alert.documentTitle}</p>
                    <p className={`text-sm ${textSecondary}`}>{alert.firmName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-sm font-medium ${textPrimary}`}>{alert.expiryDate}</p>
                    <p className={`text-xs ${
                      alert.daysRemaining < 0 ? 'text-red-500' : alert.daysRemaining <= 7 ? 'text-orange-500' : 'text-yellow-600'
                    }`}>
                      {alert.daysRemaining < 0 ? `${Math.abs(alert.daysRemaining)} days overdue` : `${alert.daysRemaining} days remaining`}
                    </p>
                  </div>
                  {!alert.isAcknowledged ? (
                    <button
                      onClick={() => dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: alert.id })}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <Badge text="Acknowledged" color="#10b981" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


