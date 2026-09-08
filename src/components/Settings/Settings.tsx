'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../store/AppContext';
import { Database, Shield, Bell, Palette, Globe, Save, HardDrive, SlidersHorizontal } from 'lucide-react';
import axios from 'axios';
import { logAudit } from '../../utils/auditLogger';
import NotificationCenter from '../Notifications/NotificationCenter';
import GoogleDriveStatus from './GoogleDriveStatus';

const viewToTab = (v: string): 'general' | 'notifications' | 'google-drive' =>
  v === 'notifications' ? 'notifications' : v === 'google-drive' ? 'google-drive' : 'general';

export default function Settings() {
  const { state, dispatch } = useApp();
  const { darkMode, systemSettings, alertConfig } = state;
  const router = useRouter();

  // "Settings" has its own sidebar entry, but Notifications and Google Drive are just tabs
  // inside it -- same pattern as the Bids page's tabs (see BidManagement.tsx): the tab is
  // driven by state.currentView so the sidebar highlight and the URL stay in sync with
  // whichever tab is open, and switching sidebar entries into this page re-syncs the tab.
  const [activeTab, setActiveTabState] = useState<'general' | 'notifications' | 'google-drive'>(() =>
    typeof window === 'undefined' ? 'general' : viewToTab(state.currentView)
  );

  useEffect(() => {
    if (state.currentView !== 'settings' && state.currentView !== 'notifications' && state.currentView !== 'google-drive') return;
    setActiveTabState(viewToTab(state.currentView));
  }, [state.currentView]);

  function setActiveTab(tab: 'general' | 'notifications' | 'google-drive') {
    setActiveTabState(tab);
    const view = tab === 'general' ? 'settings' : tab;
    if (state.currentView !== view) router.push(`/${view}`);
  }

  const [form, setForm] = useState(systemSettings || {});
  const [emailTemplate, setEmailTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchEmailTemplate = async () => {
      try {
        const res = await axios.get('/api/master/EMAIL_TEMPLATE');
        if (res.data && res.data.metadata) {
          setEmailTemplate(res.data.metadata);
        }
      } catch (err) {
        console.log('No email template found, using default plain text');
      }
    };
    fetchEmailTemplate();
  }, []);

  useEffect(() => {
    if (systemSettings) {
      setForm(systemSettings);
    }
  }, [systemSettings]);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;

  const handleChange = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      await axios.put('/api/master/SETTINGS/APP_SETTINGS', {
        value: 'App Settings',
        metadata: JSON.stringify(form)
      });

      if (emailTemplate.trim()) {
        await axios.put('/api/master/SETTINGS/EMAIL_TEMPLATE', {
          value: 'Email Template',
          metadata: emailTemplate
        });
      }

      dispatch({ type: 'SET_SYSTEM_SETTINGS', payload: form });
      logAudit({
        userId: state.currentUser?.id || 'sys',
        userName: state.currentUser?.fullName || 'System',
        action: 'Update',
        module: 'Settings',
        details: `Updated System Settings`
      }, dispatch);
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleAppearance = (key: 'darkMode' | 'sidebarOpen') => {
    if (key === 'darkMode') dispatch({ type: 'TOGGLE_DARK_MODE' });
    if (key === 'sidebarOpen') dispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  interface SettingItem {
    label: string;
    desc: string;
    type: string;
    value: string | boolean;
    key?: string;
    options?: string[];
    action?: () => void;
    disabled?: boolean;
  }

  const sections: Array<{ title: string; icon: React.ReactElement; items: SettingItem[] }> = [
    {
      title: 'General Settings',
      icon: <Globe size={20} />,
      items: [
        { label: 'Application Name', key: 'appName', type: 'text', value: form?.appName || '', desc: 'Portal display name' },
        { label: 'Default Language', key: 'defaultLanguage', type: 'select', value: form?.defaultLanguage || 'English', desc: 'UI language', options: ['English', 'Hindi'] },
        { label: 'Date Format', key: 'dateFormat', type: 'select', value: form?.dateFormat || 'DD/MM/YYYY', desc: 'System date format', options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
        { label: 'Time Zone', key: 'timeZone', type: 'select', value: form?.timeZone || 'Asia/Kolkata (IST)', desc: 'System timezone', options: ['Asia/Kolkata (IST)', 'UTC', 'US/Eastern'] },
      ]
    },
    {
      title: 'Appearance',
      icon: <Palette size={20} />,
      items: [
        { label: 'Dark Mode', type: 'toggle', value: darkMode, desc: 'Toggle dark theme', action: () => toggleAppearance('darkMode') },
        { label: 'Sidebar Collapsed', type: 'toggle', value: !state.sidebarOpen, desc: 'Collapse sidebar by default', action: () => toggleAppearance('sidebarOpen') },
      ]
    },
    {
      title: 'Security',
      icon: <Shield size={20} />,
      items: [
        { label: 'Two-Factor Authentication', key: 'twoFactorAuth', type: 'toggle', value: form?.twoFactorAuth || false, desc: 'Enable 2FA for all users' },
        { label: 'Session Timeout (minutes)', key: 'sessionTimeout', type: 'text', value: form?.sessionTimeout || '30', desc: 'Auto logout after inactivity' },
        { label: 'Password Expiry (days)', key: 'passwordExpiry', type: 'text', value: form?.passwordExpiry || '90', desc: 'Force password change' },
        { label: 'Max Login Attempts', key: 'maxLoginAttempts', type: 'text', value: form?.maxLoginAttempts || '5', desc: 'Before account lockout' },
      ]
    },
    {
      title: 'Notification Settings',
      icon: <Bell size={20} />,
      items: [
        { label: 'Email Notifications', key: 'emailNotifications', type: 'toggle', value: form?.emailNotifications || false, desc: 'Send email alerts' },
        { label: 'Dashboard Alerts', key: 'dashboardAlerts', type: 'toggle', value: form?.dashboardAlerts || false, desc: 'Show dashboard notifications' },
        { label: 'Expiry Alerts (7 days)', type: 'toggle', value: alertConfig[7] ?? true, desc: 'Controlled from Master Expiry Config', disabled: true },
        { label: 'Expiry Alerts (30 days)', type: 'toggle', value: alertConfig[30] ?? true, desc: 'Controlled from Master Expiry Config', disabled: true },
      ]
    },
    {
      title: 'Storage & Database',
      icon: <Database size={20} />,
      items: [
        { label: 'Max File Size (MB)', key: 'maxFileSize', type: 'text', value: form?.maxFileSize || '50', desc: 'Maximum upload file size' },
        { label: 'Storage Quota (GB)', key: 'storageQuota', type: 'text', value: form?.storageQuota || '100', desc: 'Total storage limit' },
        { label: 'Auto Backup', key: 'autoBackup', type: 'toggle', value: form?.autoBackup || false, desc: 'Daily automated backups' },
        { label: 'Backup Retention (days)', key: 'backupRetention', type: 'text', value: form?.backupRetention || '30', desc: 'Keep backups for' },
      ]
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>System Settings</h2>
          <p className={`text-sm ${textSecondary}`}>Configure portal settings, security, and preferences</p>
        </div>
        {activeTab === 'general' && (
          <button
            onClick={handleSave}
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all ${loading ? 'opacity-70' : ''}`}
          >
            <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className={`flex gap-1 p-1 rounded-xl w-fit ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        {([
          { key: 'general',       label: 'General',      Icon: SlidersHorizontal },
          { key: 'notifications', label: 'Notifications', Icon: Bell },
          { key: 'google-drive',  label: 'Google Drive',  Icon: HardDrive },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === key
                ? 'bg-blue-600 text-white shadow'
                : darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'notifications' && <NotificationCenter />}
      {activeTab === 'google-drive' && <GoogleDriveStatus />}

      {activeTab === 'general' && (
      <>
      {message && (
        <div className={`p-4 rounded-xl font-medium ${message.includes('success') ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {sections.map((section, idx) => (
          <div key={idx} className={`${cardBg} rounded-2xl border overflow-hidden`}>
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="text-blue-500">{section.icon}</div>
              <h3 className={`font-semibold ${textPrimary}`}>{section.title}</h3>
            </div>
            <div className="p-6 space-y-6">
              {section.items.map((item, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${textPrimary}`}>{item.label}</p>
                    <p className={`text-xs ${textSecondary}`}>{item.desc}</p>
                  </div>
                  <div className="w-full sm:w-48 shrink-0">
                    {item.type === 'toggle' ? (
                      <button
                        onClick={item.disabled ? undefined : (item.action ? item.action : () => handleChange(item.key as string, !item.value))}
                        disabled={item.disabled}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          item.value ? 'bg-blue-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                        } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          item.value ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    ) : item.type === 'select' ? (
                      <select
                        className={inputClass}
                        value={item.value as string}
                        onChange={e => handleChange(item.key as string, e.target.value)}
                      >
                        {item.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={item.type}
                        value={item.value as string}
                        onChange={e => handleChange(item.key as string, e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Email Template Section */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b flex justify-between items-center ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-3">
              <div className="text-blue-500"><Palette size={20} /></div>
              <h3 className={`font-semibold ${textPrimary}`}>Email Template Configuration</h3>
            </div>
            <button
              onClick={handleSave}
              disabled={loading}
              className={`px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors ${loading ? 'opacity-70' : ''}`}
            >
              {loading ? 'Saving...' : 'Save Template'}
            </button>
          </div>
          <div className="p-6">
            <p className={`text-sm font-medium mb-2 ${textPrimary}`}>HTML Email Layout</p>
            <p className={`text-xs mb-4 ${textSecondary}`}>
              Write your custom HTML email here. Use <code>{`{{message}}`}</code> wherever you want the system alert text to appear. Leave blank for plain text emails.
            </p>
            <textarea
              className={`${inputClass} font-mono h-64 resize-y`}
              placeholder={`<div style="padding: 20px;">\n  <h1>Document Portal</h1>\n  <p>{{message}}</p>\n</div>`}
              value={emailTemplate}
              onChange={(e) => setEmailTemplate(e.target.value)}
            />
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
