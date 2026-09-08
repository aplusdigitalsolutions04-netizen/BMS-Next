export interface MasterData {
  id?: string;
  groupId?: string;
  groupCode?: string;
  value: string;
  code: string;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: string | null;
  description?: string;
}

export interface MasterGroup {
  id?: string;
  code: string;
  name: string;
  masterData: MasterData[];
}

export interface Firm {
  id: string;
  firmCode: string;
  name: string;
  gstNumber: string;
  panNumber: string;
  cinNumber: string;
  gemSellerId?: string;
  firmType: 'Proprietorship' | 'Partnership' | 'LLP' | 'Private Limited' | 'Public Limited' | 'Trust' | 'Society' | 'Other' | string;
  contactPerson: string;
  mobile: string;
  email: string;
  website: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  address: string;
  state: string;
  city: string;
  pincode: string;
  logoUrl: string;
  remarks: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy: string;
  createdOn: string;
  updatedBy: string;
  updatedOn: string;
}

export interface DocumentCategory {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
}

export interface DocumentStatus {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  isDeleted?: boolean;
}

export interface FirmDocument {
  id: string;
  firmId: string;
  title: string;
  documentNumber: string;
  categoryId: string;
  departmentId: string;
  statusId: string;
  issueDate: string;
  expiryDate: string;
  description: string;
  tags: string[];
  keywords: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  filePath?: string;
  uploadedBy: string;
  uploadDate: string;
  version: number;
  folderName?: string | null;
  isArchived: boolean;
  isDeleted: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string | null;
  approvedOn?: string | null;
  approvalNote?: string | null;
  createdBy: string;
  createdOn: string;
  updatedBy: string;
  updatedOn: string;
  bidDocumentId?: string | null;
  gemOrderId?: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  uploadDate: string;
  changeNote: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  isActive: boolean;
  lastLogin: string;
  avatar: string;
  globalAccess?: boolean;
  firmAccess?: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export type Permission =
  | 'create' | 'edit' | 'delete' | 'view' | 'download' | 'upload' | 'approve' | 'archive'
  | 'show:assign-column' | 'bid:edit-parameters'
  | `tab:${string}`;

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  oldValue: string;
  newValue: string;
  ipAddress: string;
  dateTime: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  isRead: boolean;
  createdOn: string;
  link?: string;
}

export interface ExpiryAlert {
  id: string;
  documentId: string;
  documentTitle: string;
  firmName: string;
  expiryDate: string;
  daysRemaining: number;
  alertLevel: '7days' | '15days' | '30days' | '60days' | 'expired';
  isAcknowledged: boolean;
}

export interface DashboardStats {
  totalFirms: number;
  activeFirms: number;
  totalDocuments: number;
  documentsToday: number;
  expiringDocuments: number;
  expiredDocuments: number;
  storageUsed: number;
  storageTotal: number;
}

export interface SearchFilters {
  firmId?: string;
  query?: string;
  documentNumber?: string;
  categoryId?: string;
  departmentId?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  expiryFrom?: string;
  expiryTo?: string;
  status?: string;
}

export interface BidTemplate {
  id: string;
  firmId: string | null;
  name: string;
  content: string | null;
  headerFileName: string | null;
  headerFilePath: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdOn: string;
  updatedOn: string;
  firm?: { id: string; name: string; firmCode: string } | null;
}

export type ViewMode = 'dashboard' | 'firms' | 'documents' | 'categories' | 'departments' | 'tags' | 'statuses' | 'firm-types' | 'bid-categories' | 'item-categories' | 'clients' | 'users' | 'roles' | 'audit' | 'reports' | 'search' | 'settings' | 'expiry' | 'notifications' | 'profile' | 'bids' | 'saved-bids' | 'bid-docs' | 'templates' | 'approvals' | 'sheets' | 'direct-link' | 'google-drive';
