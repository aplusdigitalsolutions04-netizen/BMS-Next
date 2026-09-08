'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../store/AppContext';
import type { ViewMode } from '../../types';
import branding from '../../config/branding';
import {
  LayoutDashboard, Building2, FileText, FolderOpen, Users, Shield,
  ClipboardList, BarChart3, Search, Settings, Tag, Layers,
  Clock, ChevronLeft, ChevronRight, FileCode2, ShieldCheck, Table2, ChevronDown, Link2, Bot
} from 'lucide-react';

export const menuItems: { id: ViewMode; label: string; icon: React.ReactNode; section: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, section: 'Main' },
  { id: 'firms', label: 'Firm Management', icon: <Building2 size={20} />, section: 'Firm' },
  { id: 'documents', label: 'Documents', icon: <FileText size={20} />, section: 'Firm' },
  { id: 'bids', label: 'AI Analyser', icon: <Bot size={20} />, section: 'Bid' },
  { id: 'saved-bids', label: 'Saved Bids', icon: <FolderOpen size={20} />, section: 'Bid' },
  { id: 'templates', label: 'Bid Templates', icon: <FileCode2 size={20} />, section: 'Bid' },
  { id: 'search', label: 'Advanced Search', icon: <Search size={20} />, section: 'Bid' },
  { id: 'expiry', label: 'Expiry Alerts', icon: <Clock size={20} />, section: 'Bid' },
  { id: 'bid-docs', label: 'Bid Documents', icon: <FileText size={20} />, section: 'Bid' },
  { id: 'direct-link', label: 'Direct Link', icon: <Link2 size={20} />, section: 'DirectLink' },
  { id: 'sheets', label: 'Sheets', icon: <Table2 size={20} />, section: 'Sheets' },
  { id: 'categories', label: 'Document Categories', icon: <FolderOpen size={20} />, section: 'Masters' },
  { id: 'departments', label: 'Departments ', icon: <Layers size={20} />, section: 'Masters' },
  { id: 'tags', label: 'Tag Master', icon: <Tag size={20} />, section: 'Masters' },
  { id: 'statuses', label: 'Doc Statuses', icon: <ClipboardList size={20} />, section: 'Masters' },
  { id: 'firm-types', label: 'Firm Types', icon: <Building2 size={20} />, section: 'Masters' },
  { id: 'bid-categories', label: 'Bid Categories', icon: <Tag size={20} />, section: 'Masters' },
  { id: 'item-categories', label: 'Item Categories', icon: <Tag size={20} />, section: 'Masters' },
  { id: 'clients', label: 'Client Master', icon: <Users size={20} />, section: 'Masters' },
  { id: 'users', label: 'Users', icon: <Users size={20} />, section: 'Admin' },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={20} />, section: 'Admin' },
  { id: 'approvals', label: 'Document Approvals', icon: <ShieldCheck size={20} />, section: 'Standalone' },
  { id: 'audit', label: 'Audit Trail', icon: <ClipboardList size={20} />, section: 'Admin' },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} />, section: 'Admin' },
  // Notifications and Google Drive live as tabs inside the Settings page (see Settings.tsx)
  // rather than as their own sidebar entries.
  { id: 'settings', label: 'Settings', icon: <Settings size={20} />, section: 'System' },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();
  const { currentView, sidebarOpen, darkMode, notifications } = state;
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Every entry (including "AI Analyser" / "Saved Bids" / "Bid Documents", which share the
  // BidManagement component across three real routes) is a real Next.js page now, so each
  // is a plain <Link> -- state.currentView stays in sync via the pathname watcher in
  // app/(app)/layout.tsx. Real anchors (rather than div/button + router.push) mean the
  // browser's own navigation semantics work (ctrl/cmd-click to open in a new tab, middle
  // click, right-click "copy link"), and Next prefetches the target route on hover/viewport
  // entry so the click itself is instant instead of waiting on a fresh compile/fetch.
  const sections = ['Main', 'Firm', 'Bid', 'DirectLink', 'Sheets', 'Masters', 'Admin', 'Standalone', 'System'];

  // All folders start collapsed on a fresh login/reload; a user's own expand/collapse choices
  // are then persisted (see below) so they aren't reset every time.
  const DEFAULT_EXPANDED_SECTIONS: Record<string, boolean> = {
    Firm: false,
    Bid: false,
    Sheets: false,
    Masters: false,
    Admin: false,
    System: false
  };

  // Persisted so a reload keeps whichever folders the user collapsed instead of re-opening
  // everything every time.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXPANDED_SECTIONS;
    try {
      const saved = localStorage.getItem('sidebarExpandedSections');
      return saved ? { ...DEFAULT_EXPANDED_SECTIONS, ...JSON.parse(saved) } : DEFAULT_EXPANDED_SECTIONS;
    } catch {
      return DEFAULT_EXPANDED_SECTIONS;
    }
  });

  const toggleSection = (section: string) => {
    if (sidebarOpen) {
      setExpandedSections(prev => {
        const next = { ...prev, [section]: !prev[section] };
        localStorage.setItem('sidebarExpandedSections', JSON.stringify(next));
        return next;
      });
    }
  };

  return (
    <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 flex-shrink-0 h-screen sticky top-0 flex flex-col ${
      darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
    } border-r`}>
      {/* Logo + App Name */}
      {(() => {
        const logoSrc = state.systemSettings?.companyLogo || branding.logoPath;
        const appName = state.systemSettings?.appName || branding.appName;
        return (
          <div className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            {logoSrc ? (
              <>
                <div className={darkMode ? 'bg-white/90 py-2' : ''}>
                  <img
                    src={logoSrc}
                    alt="Company Logo"
                    className="w-full object-contain"
                    style={{ maxHeight: sidebarOpen ? '80px' : '56px', transition: 'max-height 0.3s' }}
                  />
                </div>
                {sidebarOpen && appName && (
                  <div className={`text-center px-3 py-2 font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {appName}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 px-3">
                <div
                  className={`bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg ${sidebarOpen ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm'}`}
                  style={{ transition: 'width 0.3s, height 0.3s' }}
                >
                  {appName.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')}
                </div>
                {sidebarOpen && (
                  <div className="mt-2 text-center px-2">
                    <h1 className={`font-bold text-sm leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {appName}
                    </h1>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {sections.map(section => {
          let items = menuItems.filter(m => m.section === section);
          
          // Role-based access control
          if (state.currentUser?.roleId !== 'ADMIN') {
            let effectivePerms: string[] = [];
            if (state.currentUser?.customPermissions) {
              try { effectivePerms = JSON.parse(state.currentUser.customPermissions); } catch {}
            } else {
              const userRole = state.roles.find(r => r.id === state.currentUser?.roleId);
              effectivePerms = userRole?.permissions || [];
            }
            items = items.filter(m =>
              m.id === 'dashboard' || effectivePerms.includes(`tab:${m.id}`)
            );
          }
          
          if (items.length === 0) return null;

          // For the "Main", "Standalone", "Sheets", "DirectLink", or "System" section, render direct links. For others, render a Dropdown Folder.
          const isDropdown = !['Main', 'Standalone', 'Sheets', 'DirectLink', 'System'].includes(section);
          const isExpanded = !sidebarOpen || expandedSections[section] !== false;

          if (!isDropdown) {
            return (
              <div key={section} className="mb-4 space-y-0.5">
                {items.map(item => {
                  const isActive = currentView === item.id;
                  return (
                    <Link
                      key={item.id}
                      href={`/${item.id}`}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                          : darkMode
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800 hover:translate-x-0.5'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 hover:translate-x-0.5'
                      } ${!sidebarOpen ? 'justify-center' : ''}`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      {isActive && sidebarOpen && (
                        <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-blue-400" />
                      )}
                      <span className={`flex-shrink-0 transition-transform duration-200 ${!isActive ? 'group-hover:scale-110' : ''}`}>{item.icon}</span>
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                      {sidebarOpen && item.id === 'expiry' && state.expiryAlerts.filter(a => !a.isAcknowledged).length > 0 && (
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                          isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'
                        }`}>
                          {state.expiryAlerts.filter(a => !a.isAcknowledged).length}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          }

          // Render Dropdown Folder (Firm, Bid, Sheets, Masters, Admin, System)
          let sectionIcon = <FolderOpen size={20} />;
          if (section === 'Firm') sectionIcon = <Building2 size={20} />;
          else if (section === 'Bid') sectionIcon = <Layers size={20} />;
          else if (section === 'Sheets') sectionIcon = <Table2 size={20} />;
          else if (section === 'Admin') sectionIcon = <Shield size={20} />;
          else if (section === 'System') sectionIcon = <Settings size={20} />;
          
          return (
            <div key={section} className="mb-2">
              <button 
                onClick={() => toggleSection(section)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  darkMode
                    ? 'text-gray-300 hover:text-white hover:bg-gray-800'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                } ${!sidebarOpen ? 'justify-center' : ''}`}
                title={!sidebarOpen ? section : undefined}
              >
                <span className="flex-shrink-0">{sectionIcon}</span>
                {sidebarOpen && <span className="truncate flex-1 text-left">{section}</span>}
                {sidebarOpen && (
                  <div className={`transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}>
                    <ChevronDown size={16} />
                  </div>
                )}
              </button>
              
              <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[1000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                <div className={`${sidebarOpen ? 'pl-9 space-y-0.5' : 'space-y-0.5'}`}>
                  {items.map(item => {
                    // Notifications and Google Drive are tabs inside the Settings page, so the
                    // "Settings" sidebar entry stays highlighted while either of those is open too.
                    const isActive = currentView === item.id ||
                      (item.id === 'settings' && (currentView === 'notifications' || currentView === 'google-drive'));
                    return (
                      <Link
                        key={item.id}
                        href={`/${item.id}`}
                        className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : darkMode
                              ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                        } ${!sidebarOpen ? 'justify-center' : ''}`}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        {isActive && sidebarOpen && (
                          <span className="absolute -left-9 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-blue-500" />
                        )}
                        {!sidebarOpen && <span className={`flex-shrink-0 transition-transform duration-200 ${!isActive ? 'group-hover:scale-110' : ''}`}>{item.icon}</span>}
                        {sidebarOpen && <span className="truncate">{item.label}</span>}
                        {sidebarOpen && item.id === 'settings' && unreadCount > 0 && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                            isActive ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {unreadCount}
                          </span>
                        )}
                        {sidebarOpen && item.id === 'approvals' && state.documents.filter(d => !d.isDeleted && d.approvalStatus === 'PENDING' && d.bidDocumentId).length > 0 && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                            isActive ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {state.documents.filter(d => !d.isDeleted && d.approvalStatus === 'PENDING' && d.bidDocumentId).length}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm ${
            darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          {sidebarOpen && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

