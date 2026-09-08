import axios from 'axios';

interface AuditLogPayload {
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  ipAddress?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logAudit = async (payload: AuditLogPayload, dispatch: (action: any) => void) => {
  try {
    const res = await axios.post('/api/audit-logs', payload);
    dispatch({ type: 'ADD_AUDIT_LOG', payload: res.data });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};
