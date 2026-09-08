'use client'

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import axios from 'axios';
import type {
  Firm, DocumentCategory, Department, DocumentStatus, Tag,
  FirmDocument, User, Role, AuditLog, Notification,
  ExpiryAlert, DashboardStats, ViewMode, BidTemplate, MasterGroup
} from '../types';

export interface AppState {
  currentView: ViewMode;
  currentUser: User;
  darkMode: boolean;
  sidebarOpen: boolean;
  firms: Firm[];
  documents: FirmDocument[];
  categories: DocumentCategory[];
  departments: Department[];
  statuses: DocumentStatus[];
  tags: Tag[];
  firmTypes: DocumentCategory[];
  bidCategories: DocumentCategory[];
  itemCategories: DocumentCategory[];
  clients: DocumentCategory[];
  users: User[];
  roles: Role[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  expiryAlerts: ExpiryAlert[];
  dashboardStats: DashboardStats;
  selectedFirmId: string | null;
  globalSearch: string;
  isAuthenticated: boolean;
  masterGroups: MasterGroup[];
  alertConfig: Record<number, boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemSettings: Record<string, any>;
  templates: BidTemplate[];
  isHydrated: boolean;
  isDataLoading: boolean;
}

type Action =
  | { type: 'SET_FIRMS'; payload: Firm[] }
  | { type: 'SET_DOCUMENTS'; payload: FirmDocument[] }
  | { type: 'SET_MASTER_GROUPS'; payload: MasterGroup[] }
  | { type: 'SET_ALERT_CONFIG'; payload: Record<number, boolean> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: 'SET_SYSTEM_SETTINGS'; payload: Record<string, any> }
  | { type: 'SET_CATEGORIES'; payload: DocumentCategory[] }
  | { type: 'SET_DEPARTMENTS'; payload: Department[] }
  | { type: 'SET_STATUSES'; payload: DocumentStatus[] }
  | { type: 'SET_TAGS'; payload: Tag[] }
  | { type: 'SET_FIRM_TYPES'; payload: DocumentCategory[] }
  | { type: 'SET_BID_CATEGORIES'; payload: DocumentCategory[] }
  | { type: 'SET_ITEM_CATEGORIES'; payload: DocumentCategory[] }
  | { type: 'SET_CLIENTS'; payload: DocumentCategory[] }
  | { type: 'SET_VIEW'; payload: ViewMode }
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_GLOBAL_SEARCH'; payload: string }
  | { type: 'SELECT_FIRM'; payload: string | null }
  | { type: 'SET_NOTIFICATIONS'; payload: Notification[] }
  | { type: 'ADD_ROLE'; payload: Role }
  | { type: 'UPDATE_ROLE'; payload: Role }
  | { type: 'DELETE_ROLE'; payload: string }
  | { type: 'ADD_FIRM'; payload: Firm }
  | { type: 'UPDATE_FIRM'; payload: Firm }
  | { type: 'DELETE_FIRM'; payload: string }
  | { type: 'TOGGLE_FIRM_STATUS'; payload: string }
  | { type: 'ADD_DOCUMENT'; payload: FirmDocument }
  | { type: 'UPDATE_DOCUMENT'; payload: FirmDocument }
  | { type: 'DELETE_DOCUMENT'; payload: string }
  | { type: 'ARCHIVE_DOCUMENT'; payload: string }
  | { type: 'RESTORE_DOCUMENT'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: DocumentCategory }
  | { type: 'UPDATE_CATEGORY'; payload: DocumentCategory }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'ADD_DEPARTMENT'; payload: Department }
  | { type: 'UPDATE_DEPARTMENT'; payload: Department }
  | { type: 'DELETE_DEPARTMENT'; payload: string }
  | { type: 'ADD_TAG'; payload: Tag }
  | { type: 'UPDATE_TAG'; payload: Tag }
  | { type: 'DELETE_TAG'; payload: string }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'DELETE_NOTIFICATION'; payload: string }
  | { type: 'DELETE_ALL_NOTIFICATIONS' }
  | { type: 'ADD_AUDIT_LOG'; payload: Omit<AuditLog, 'id' | 'dateTime' | 'ipAddress'> }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_ROLES'; payload: Role[] }
  | { type: 'SET_AUDIT_LOGS'; payload: AuditLog[] }
  | { type: 'ACKNOWLEDGE_ALERT'; payload: string }
  | { type: 'SET_EXPIRY_ALERTS'; payload: ExpiryAlert[] }
  | { type: 'SET_TEMPLATES'; payload: BidTemplate[] }
  | { type: 'ADD_TEMPLATE'; payload: BidTemplate }
  | { type: 'UPDATE_TEMPLATE'; payload: BidTemplate }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  | { type: 'RESTORE_SESSION'; payload: { user: User; darkMode: boolean; initialView?: ViewMode } }
  | { type: 'SET_HYDRATED' }
  | { type: 'SET_DATA_LOADING'; payload: boolean };

function getTokenExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp as number) * 1000;
  } catch {
    return 0;
  }
}

const initialState: AppState = {
  currentView: 'dashboard',
  currentUser: null as unknown as User,
  darkMode: false,
  sidebarOpen: true,
  firms: [],
  documents: [],
  categories: [],
  departments: [],
  statuses: [],
  tags: [],
  firmTypes: [],
  bidCategories: [],
  itemCategories: [],
  clients: [],
  users: [],
  roles: [],
  auditLogs: [],
  notifications: [],
  expiryAlerts: [],
  dashboardStats: {
    totalFirms: 0,
    activeFirms: 0,
    totalDocuments: 0,
    documentsToday: 0,
    expiringDocuments: 0,
    expiredDocuments: 0,
    storageUsed: 0,
    storageTotal: 100
  },
  selectedFirmId: null,
  globalSearch: '',
  isAuthenticated: false,
  isHydrated: false,
  isDataLoading: false,
  masterGroups: [],
  templates: [],
  alertConfig: {
    7: true,
    15: true,
    30: true,
    60: true
  },
  systemSettings: {
    appName: 'Bid Management ',
    defaultLanguage: 'English',
    dateFormat: 'DD/MM/YYYY',
    timeZone: 'Asia/Kolkata (IST)',
    twoFactorAuth: true,
    sessionTimeout: '30',
    passwordExpiry: '90',
    maxLoginAttempts: '5',
    emailNotifications: true,
    dashboardAlerts: true,
    maxFileSize: '50',
    storageQuota: '100',
    autoBackup: true,
    backupRetention: '30'
  }
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FIRMS':
      return { ...state, firms: action.payload };
    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };
    case 'SET_MASTER_GROUPS':
      return { ...state, masterGroups: action.payload };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    case 'SET_DEPARTMENTS':
      return { ...state, departments: action.payload };
    case 'SET_STATUSES':
      return { ...state, statuses: action.payload };
    case 'SET_TAGS':
      return { ...state, tags: action.payload };
    case 'SET_FIRM_TYPES':
      return { ...state, firmTypes: action.payload };
    case 'SET_BID_CATEGORIES':
      return { ...state, bidCategories: action.payload };
    case 'SET_ITEM_CATEGORIES':
      return { ...state, itemCategories: action.payload };
    case 'SET_CLIENTS':
      return { ...state, clients: action.payload };
    case 'SET_ALERT_CONFIG':
      return { ...state, alertConfig: action.payload };
    case 'SET_SYSTEM_SETTINGS':
      return { ...state, systemSettings: { ...state.systemSettings, ...action.payload } };
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'LOGIN': {
      const { token: _tok, ...userData } = action.payload as User & { token?: string };
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(userData));
        if (_tok) {
          localStorage.setItem('authToken', _tok);
          axios.defaults.headers.common['Authorization'] = `Bearer ${_tok}`;
        }
      }
      return { ...state, currentUser: userData as User, isAuthenticated: true };
    }
    case 'LOGOUT':
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        localStorage.removeItem('authToken');
        delete axios.defaults.headers.common['Authorization'];
      }
      return { ...state, currentUser: null as unknown as User, isAuthenticated: false, currentView: 'dashboard' };
    case 'TOGGLE_DARK_MODE': {
      const newDarkMode = !state.darkMode;
      if (typeof window !== 'undefined') localStorage.setItem('darkMode', String(newDarkMode));
      return { ...state, darkMode: newDarkMode };
    }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'SET_GLOBAL_SEARCH':
      return { ...state, globalSearch: action.payload };
    case 'SELECT_FIRM':
      return { ...state, selectedFirmId: action.payload };
    case 'ADD_FIRM':
      return {
        ...state,
        firms: [...state.firms, action.payload],
        dashboardStats: {
          ...state.dashboardStats,
          totalFirms: state.dashboardStats.totalFirms + 1,
          activeFirms: action.payload.isActive ? state.dashboardStats.activeFirms + 1 : state.dashboardStats.activeFirms,
        }
      };
    case 'UPDATE_FIRM':
      return {
        ...state,
        firms: state.firms.map(f => f.id === action.payload.id ? action.payload : f),
      };
    case 'DELETE_FIRM':
      return {
        ...state,
        firms: state.firms.map(f => f.id === action.payload ? { ...f, isDeleted: true } : f),
        dashboardStats: {
          ...state.dashboardStats,
          totalFirms: state.dashboardStats.totalFirms - 1,
        }
      };
    case 'TOGGLE_FIRM_STATUS':
      return {
        ...state,
        firms: state.firms.map(f => f.id === action.payload ? { ...f, isActive: !f.isActive } : f),
      };
    case 'ADD_DOCUMENT':
      return {
        ...state,
        documents: [...state.documents, action.payload],
        dashboardStats: {
          ...state.dashboardStats,
          totalDocuments: state.dashboardStats.totalDocuments + 1,
          documentsToday: state.dashboardStats.documentsToday + 1,
        }
      };
    case 'UPDATE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map(d => d.id === action.payload.id ? action.payload : d),
      };
    case 'DELETE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map(d => d.id === action.payload ? { ...d, isDeleted: true } : d),
        dashboardStats: {
          ...state.dashboardStats,
          totalDocuments: state.dashboardStats.totalDocuments - 1,
        }
      };
    case 'ARCHIVE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map(d => d.id === action.payload ? { ...d, isArchived: true, statusId: 'ARCHIVED' } : d),
      };
    case 'RESTORE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map(d => d.id === action.payload ? { ...d, isArchived: false, statusId: 'ACTIVE' } : d),
      };
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload ? { ...c, isDeleted: true } : c) };
    case 'ADD_DEPARTMENT':
      return { ...state, departments: [...state.departments, action.payload] };
    case 'UPDATE_DEPARTMENT':
      return { ...state, departments: state.departments.map(d => d.id === action.payload.id ? action.payload : d) };
    case 'DELETE_DEPARTMENT':
      return { ...state, departments: state.departments.map(d => d.id === action.payload ? { ...d, isDeleted: true } : d) };
    case 'ADD_TAG':
      return { ...state, tags: [...state.tags, action.payload] };
    case 'UPDATE_TAG':
      return { ...state, tags: state.tags.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TAG':
      return { ...state, tags: state.tags.filter(t => t.id !== action.payload) };
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_ROLES':
      return { ...state, roles: action.payload };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload };
    case 'ADD_ROLE':
      return { ...state, roles: [...state.roles, action.payload] };
    case 'UPDATE_ROLE':
      return { ...state, roles: state.roles.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_ROLE':
      return { ...state, roles: state.roles.filter(r => r.id !== action.payload) };
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'UPDATE_USER':
      return { ...state, users: state.users.map(u => u.id === action.payload.id ? action.payload : u) };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(n => n.id === action.payload ? { ...n, isRead: true } : n),
      };
    case 'MARK_ALL_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map(n => ({ ...n, isRead: true })),
      };
    case 'DELETE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };
    case 'DELETE_ALL_NOTIFICATIONS':
      return { ...state, notifications: [] };
    case 'SET_AUDIT_LOGS':
      return { ...state, auditLogs: action.payload };
    case 'ADD_AUDIT_LOG':
      return {
        ...state,
        auditLogs: [{
          ...action.payload,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          ipAddress: '',
          dateTime: new Date().toISOString(),
          oldValue: String((action.payload as Record<string, unknown>).oldValue ?? ''),
          newValue: String((action.payload as Record<string, unknown>).newValue ?? ''),
        }, ...state.auditLogs],
      };
    case 'ACKNOWLEDGE_ALERT': {
      const exists = state.expiryAlerts.find(a => a.id === action.payload);
      if (exists) {
        return {
          ...state,
          expiryAlerts: state.expiryAlerts.map(a => a.id === action.payload ? { ...a, isAcknowledged: true } : a),
        };
      } else {
        return {
          ...state,
          expiryAlerts: [...state.expiryAlerts, { id: action.payload, isAcknowledged: true } as ExpiryAlert],
        };
      }
    }
    case 'SET_EXPIRY_ALERTS':
      return { ...state, expiryAlerts: action.payload };
    case 'SET_TEMPLATES':
      return { ...state, templates: action.payload };
    case 'ADD_TEMPLATE':
      return { ...state, templates: [action.payload, ...state.templates] };
    case 'UPDATE_TEMPLATE':
      return { ...state, templates: state.templates.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TEMPLATE':
      return { ...state, templates: state.templates.filter(t => t.id !== action.payload) };
    case 'RESTORE_SESSION':
      return { ...state, currentUser: action.payload.user, isAuthenticated: true, darkMode: action.payload.darkMode, isHydrated: true, ...(action.payload.initialView ? { currentView: action.payload.initialView } : {}) };
    case 'SET_HYDRATED':
      return { ...state, isHydrated: true };
    case 'SET_DATA_LOADING':
      return { ...state, isDataLoading: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore session from localStorage after hydration (client-side only)
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('authToken');
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';

    if (savedToken) {
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + savedToken;
    }

    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (!parsedUser.roleId && parsedUser.roleCode) parsedUser.roleId = parsedUser.roleCode;
        // Read URL view on restore so the correct page renders immediately (no flicker)
        const VALID_VIEWS = ['dashboard','firms','documents','bids','saved-bids','bid-docs','templates','sheets','direct-link','search','expiry','categories','departments','tags','statuses','firm-types','bid-categories','item-categories','clients','users','roles','approvals','audit','reports','notifications','settings','profile','google-drive']
        const urlView = window.location.pathname.replace(/^\//, '').split('/')[0]
        const initialView = VALID_VIEWS.includes(urlView) ? urlView as ViewMode : undefined
        dispatch({ type: 'RESTORE_SESSION', payload: { user: parsedUser, darkMode: savedDarkMode, initialView } });
      } catch {
        dispatch({ type: 'SET_HYDRATED' });
      }
    } else {
      dispatch({ type: 'SET_HYDRATED' });
    }
  }, []);

  // Auto-logout when JWT expires (8 hours)
  useEffect(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

    if (!state.isAuthenticated) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) return;

    const remainingMs = getTokenExpiryMs(token) - Date.now();
    if (remainingMs <= 0) {
      dispatch({ type: 'LOGOUT' });
      return;
    }

    logoutTimerRef.current = setTimeout(() => {
      dispatch({ type: 'LOGOUT' });
    }, remainingMs);

    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [state.isAuthenticated]);

  // Axios 401 interceptor -- auto-logout if server rejects token
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error.response?.status === 401) {
          dispatch({ type: 'LOGOUT' });
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  useEffect(() => {
    const ackedIds = state.expiryAlerts
      .filter((a: ExpiryAlert) => a.isAcknowledged)
      .map((a: ExpiryAlert) => a.id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('acknowledgedAlerts', JSON.stringify(ackedIds));
    }
  }, [state.expiryAlerts]);

  // `isPoll` is true for the background auto-refresh (see the effect below) so it never
  // toggles the full-screen loading state -- only the very first, initial load does that.
  const fetchData = useCallback(async (isPoll = false) => {
      if (!isPoll) dispatch({ type: 'SET_DATA_LOADING', payload: true });
      try {
        const [firmsRes, masterRes, docsRes, usersRes, notifRes, auditRes, templatesRes] = await Promise.all([
          axios.get('/api/firms').catch(() => ({ data: [] })),
          axios.get('/api/master').catch(() => ({ data: [] })),
          axios.get('/api/documents').catch(() => ({ data: [] })),
          axios.get('/api/users').catch(() => ({ data: [] })),
          axios.get('/api/notifications').catch(() => ({ data: [] })),
          axios.get('/api/audit-logs').catch(() => ({ data: [] })),
          axios.get('/api/templates').catch(() => ({ data: [] })),
        ]);

        dispatch({ type: 'SET_NOTIFICATIONS', payload: notifRes.data });
        dispatch({ type: 'SET_MASTER_GROUPS', payload: masterRes.data });
        dispatch({ type: 'SET_AUDIT_LOGS', payload: auditRes.data });
        dispatch({ type: 'SET_TEMPLATES', payload: templatesRes.data });

        const settingsGroup = masterRes.data.find((g: { code: string }) => g.code === 'SETTINGS');
        const alertCfg = settingsGroup?.masterData.find((m: { code: string }) => m.code === 'ALERT_CONFIG');
        if (alertCfg?.metadata) {
          try {
            const parsedCfg = JSON.parse(alertCfg.metadata);
            dispatch({ type: 'SET_ALERT_CONFIG', payload: parsedCfg });
          } catch {}
        }

        const appSettings = settingsGroup?.masterData.find((m: { code: string }) => m.code === 'APP_SETTINGS');
        if (appSettings?.metadata) {
          try {
            const parsedSettings = JSON.parse(appSettings.metadata);
            dispatch({ type: 'SET_SYSTEM_SETTINGS', payload: parsedSettings });
          } catch {}
        }

        const roleGroup = masterRes.data.find((g: { code: string }) => g.code === 'ROLES');
        const parsedRoles = roleGroup
          ? roleGroup.masterData.map((r: { code: string; value: string; description?: string; metadata?: string }) => {
              let perms = [];
              try { if (r.metadata) perms = JSON.parse(r.metadata); } catch {}
              return {
                id: r.code,
                name: r.value,
                description: r.description || `${r.value} Role`,
                permissions: perms,
              };
            })
          : [];
        dispatch({ type: 'SET_ROLES', payload: parsedRoles });

        const parseMasterData = (groupCode: string) => {
          const group = masterRes.data.find((g: { code: string }) => g.code === groupCode);
          return group
            ? group.masterData.map((r: { code: string; value: string; metadata?: string; isActive: boolean }) => {
                let meta: Record<string, string> = {};
                try { if (r.metadata) meta = JSON.parse(r.metadata); } catch {}
                return {
                  id: r.code,
                  name: r.value,
                  description: meta.description || '',
                  color: meta.color || undefined,
                  isActive: r.isActive,
                  isDeleted: false,
                  createdOn: ''
                };
              })
            : [];
        };

        dispatch({ type: 'SET_CATEGORIES', payload: parseMasterData('DOC_CATEGORY') });
        dispatch({ type: 'SET_DEPARTMENTS', payload: parseMasterData('DOC_DEPARTMENT') });
        dispatch({ type: 'SET_STATUSES', payload: parseMasterData('DOC_STATUS') });
        dispatch({ type: 'SET_TAGS', payload: parseMasterData('DOC_TAG') });
        dispatch({ type: 'SET_FIRM_TYPES', payload: parseMasterData('FIRM_TYPE') });
        dispatch({ type: 'SET_BID_CATEGORIES', payload: parseMasterData('BID_CATEGORY') });
        dispatch({ type: 'SET_ITEM_CATEGORIES', payload: parseMasterData('ITEM_CATEGORY') });
        dispatch({ type: 'SET_CLIENTS', payload: parseMasterData('CLIENT') });

        const mappedUsers = usersRes.data.map((u: { roleCode?: string }) => ({
          ...u,
          roleId: (u as { roleCode?: string }).roleCode,
        }));
        dispatch({ type: 'SET_USERS', payload: mappedUsers });

        const mappedFirms = firmsRes.data.map((f: {
          type?: { value?: string };
          addresses?: { addressLine?: string; city?: string; state?: string; pincode?: string }[];
        }) => ({
          ...f,
          firmType: f.type?.value || 'Partnership',
          address: f.addresses?.[0]?.addressLine || '',
          city: f.addresses?.[0]?.city || '',
          state: f.addresses?.[0]?.state || '',
          pincode: f.addresses?.[0]?.pincode || '',
        }));

        const mappedDocs = docsRes.data.map((d: {
          id: string; firmId: string; title: string; documentNumber: string;
          issueDate?: string; expiryDate?: string; isArchived: boolean; isDeleted: boolean; createdOn: string;
          bidDocumentId?: string | null; gemOrderId?: string | null;
          meta?: {
            categoryCode?: string; departmentCode?: string; statusCode?: string;
            description?: string; tags?: string; keywords?: string; fileName?: string;
            fileSize?: number; fileType?: string; filePath?: string; uploadedBy?: string;
            uploadDate?: string; version?: number;
            approvalStatus?: string; approvedBy?: string; approvedOn?: string; approvalNote?: string;
          };
        }) => ({
          id: d.id,
          firmId: d.firmId,
          bidDocumentId: d.bidDocumentId || null,
          gemOrderId: d.gemOrderId || null,
          title: d.title,
          documentNumber: d.documentNumber,
          categoryId: d.meta?.categoryCode || '',
          departmentId: d.meta?.departmentCode || '',
          statusId: d.meta?.statusCode || '',
          issueDate: d.issueDate ? String(d.issueDate).substring(0, 10) : '',
          expiryDate: d.expiryDate ? String(d.expiryDate).substring(0, 10) : '',
          description: d.meta?.description || '',
          tags: d.meta?.tags ? d.meta.tags.split(',') : [],
          keywords: d.meta?.keywords || '',
          fileName: d.meta?.fileName || '',
          fileSize: d.meta?.fileSize || 0,
          fileType: d.meta?.fileType || '',
          filePath: d.meta?.filePath || '',
          uploadedBy: d.meta?.uploadedBy || '',
          uploadDate: d.meta?.uploadDate || d.createdOn,
          version: d.meta?.version || 1,
          approvalStatus: (d.meta?.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED') || 'APPROVED',
          approvedBy: d.meta?.approvedBy || null,
          approvedOn: d.meta?.approvedOn || null,
          approvalNote: d.meta?.approvalNote || null,
          isArchived: d.isArchived,
          isDeleted: d.isDeleted,
          createdBy: 'system',
          createdOn: d.createdOn,
          updatedBy: 'system',
          updatedOn: d.createdOn,
        }));

        // Apply firm-level access restrictions for non-global users
        const currentUser = state.currentUser;
        let visibleFirms = mappedFirms;
        let visibleDocs = mappedDocs;
        if (currentUser && currentUser.globalAccess === false && currentUser.firmAccess) {
          let allowedIds: string[] = [];
          try { allowedIds = JSON.parse(currentUser.firmAccess); } catch {}
          visibleFirms = mappedFirms.filter((f: { id: string }) => allowedIds.includes(f.id));
          visibleDocs = mappedDocs.filter((d: { firmId: string }) => allowedIds.includes(d.firmId));
        }

        dispatch({ type: 'SET_FIRMS', payload: visibleFirms });
        dispatch({ type: 'SET_DOCUMENTS', payload: visibleDocs });

        // Compute expiry alerts from visible documents
        const ackedIds: string[] = (() => {
          try { return JSON.parse(localStorage.getItem('acknowledgedAlerts') || '[]'); } catch { return []; }
        })();
        const today = new Date();
        const computedAlerts: ExpiryAlert[] = visibleDocs
          .filter((d: { isDeleted: boolean; expiryDate: string }) => !d.isDeleted && d.expiryDate)
          .map((d: { id: string; title: string; firmId: string; expiryDate: string }) => {
            const expDate = new Date(d.expiryDate);
            const daysRemaining = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const firm = visibleFirms.find((f: { id: string; name: string }) => f.id === d.firmId);
            const alertLevel: ExpiryAlert['alertLevel'] =
              daysRemaining < 0 ? 'expired'
              : daysRemaining <= 7 ? '7days'
              : daysRemaining <= 15 ? '15days'
              : daysRemaining <= 30 ? '30days'
              : '60days';
            return {
              id: d.id,
              documentId: d.id,
              documentTitle: d.title,
              firmName: firm?.name || '',
              expiryDate: d.expiryDate,
              daysRemaining,
              alertLevel,
              isAcknowledged: ackedIds.includes(d.id),
            };
          })
          .filter((a: { daysRemaining: number }) => a.daysRemaining < 0 || a.daysRemaining <= 60);
        dispatch({ type: 'SET_EXPIRY_ALERTS', payload: computedAlerts });
      } catch (error) {
        console.error('Error fetching data from backend:', error);
      } finally {
        if (!isPoll) dispatch({ type: 'SET_DATA_LOADING', payload: false });
      }
  }, [state.isAuthenticated, state.currentUser]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    fetchData();
  }, [state.isAuthenticated, fetchData]);

  // Background auto-refresh: so one user's upload/edit/delete shows up for everyone else
  // without a manual page reload -- see also the per-module polling in BidManagement,
  // DirectLinkManagement, and SpreadsheetDashboard for data this bootstrap doesn't cover.
  // Runs every 30s (not every few seconds) since it fetches 7 endpoints' worth of data on
  // every tick -- a short interval was making every page feel sluggish (constant re-renders
  // and network activity fighting with whatever the user was actually doing). It also
  // pauses entirely while the tab isn't visible, so a background tab doesn't keep hammering
  // the API, and immediately refreshes once when the tab regains focus.
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const POLL_MS = 30000;
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id) return;
      id = setInterval(() => fetchData(true), POLL_MS);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        fetchData(true);
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [state.isAuthenticated, fetchData]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
