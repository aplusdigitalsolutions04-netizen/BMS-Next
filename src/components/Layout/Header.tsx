'use client'

import { useApp } from '../../store/AppContext';
import { Search, Bell, Moon, Sun, LogOut, User, Menu } from 'lucide-react';
import { logAudit } from '../../utils/auditLogger';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import branding from '../../config/branding';

export default function Header() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { darkMode, currentUser, notifications, globalSearch } = state;
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const [showNotifDrop, setShowNotifDrop] = useState(false);
  const [showUserDrop, setShowUserDrop] = useState(false);
  // Local input state -- typing here must NOT re-render the whole app on every keystroke.
  // We only push to global state when the user actually searches (Enter).
  const [searchText, setSearchText] = useState(globalSearch);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  // Keep local input in sync if global search is changed elsewhere
  useEffect(() => { setSearchText(globalSearch); }, [globalSearch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifDrop(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserDrop(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const role = state.roles.find(r => r.id === currentUser.roleId);

  return (
    <header className={`h-16 border-b flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur-md ${
      darkMode ? 'bg-gray-900/85 border-gray-700' : 'bg-white/85 border-gray-200'
    }`}>
      {/* Left: hamburger + search */}
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className={`lg:hidden p-2 rounded-lg ${darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <Menu size={20} />
        </button>

        {/* Search bar */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl max-w-md w-full border transition-all duration-200 ${
          darkMode
            ? 'bg-gray-800 text-gray-300 border-transparent focus-within:border-blue-500 focus-within:bg-gray-800/80 focus-within:shadow-lg focus-within:shadow-blue-500/10'
            : 'bg-gray-100 text-gray-600 border-transparent focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-blue-500/10'
        }`}>
          <Search size={18} className="flex-shrink-0 opacity-50" />
          <input
            type="text"
            placeholder={state.systemSettings?.searchPlaceholder || branding.searchPlaceholder}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchText.trim()) {
                dispatch({ type: 'SET_GLOBAL_SEARCH', payload: searchText });
                router.push('/search');
              }
            }}
            className={`bg-transparent outline-none w-full text-sm ${
              darkMode ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'
            }`}
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Dark Mode Toggle */}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
          className={`p-2.5 rounded-xl transition ${
            darkMode ? 'text-yellow-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'
          }`}
          title="Toggle dark mode"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifDrop(!showNotifDrop)}
            className={`p-2.5 rounded-xl transition relative ${
              darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-badge-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifDrop && (
            <div className={`absolute right-0 top-12 w-96 rounded-2xl shadow-2xl border z-50 animate-pop-in ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}>
              <div className={`flex items-center justify-between px-5 py-3 border-b ${
                darkMode ? 'border-gray-700' : 'border-gray-100'
              }`}>
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Notifications</h3>
                <button
                  onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}
                  className="text-xs text-blue-500 hover:text-blue-600"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.slice(0, 6).map(n => (
                  <div
                    key={n.id}
                    className={`px-5 py-3 flex items-start gap-3 cursor-pointer transition ${
                      !n.isRead
                        ? darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
                        : ''
                    } ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                    onClick={() => {
                      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id });
                      if (n.link) router.push(n.link);
                      setShowNotifDrop(false);
                    }}
                  >
                    <span className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      n.type === 'error' ? 'bg-red-500'
                      : n.type === 'warning' ? 'bg-yellow-500'
                      : n.type === 'success' ? 'bg-green-500'
                      : 'bg-blue-500'
                    }`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{n.title}</p>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{n.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`px-5 py-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <button
                  onClick={() => { router.push('/notifications'); setShowNotifDrop(false); }}
                  className="text-sm text-blue-500 hover:text-blue-600 font-medium"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUserDrop(!showUserDrop)}
            className={`flex items-center gap-3 pl-3 pr-4 py-1.5 rounded-xl transition ${
              darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            }`}
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
              {currentUser.avatar
                ? <img src={currentUser.avatar} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                    {currentUser.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
              }
            </div>
            <div className="text-left hidden sm:block">
              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{currentUser.fullName}</p>
              <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{role?.name || 'User'}</p>
            </div>
          </button>

          {showUserDrop && (
            <div className={`absolute right-0 top-14 w-56 rounded-2xl shadow-2xl border z-50 py-2 animate-pop-in ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}>
              <button 
                onClick={() => { router.push('/profile'); setShowUserDrop(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm ${
                darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}>
                <User size={16} /> Profile
              </button>
              <button
                onClick={() => { router.push('/settings'); setShowUserDrop(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm ${
                  darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Search size={16} /> Settings
              </button>
              <hr className={`my-1 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />
              <button 
                onClick={() => {
                  logAudit({
                    userId: state.currentUser?.id || 'sys',
                    userName: state.currentUser?.fullName || 'System',
                    action: 'Logout',
                    module: 'Authentication',
                    details: 'User logged out'
                  }, dispatch);
                  dispatch({ type: 'LOGOUT' });
                  router.push('/');
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 ${
                darkMode ? 'hover:bg-gray-700' : 'hover:bg-red-50'
              }`}>
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

