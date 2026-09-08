import type { AppState } from '../store/AppContext';

// ADMIN always has access; everyone else needs an explicit `tab:<tabId>` permission,
// either as a per-user override (customPermissions) or via their role's permissions.
export function hasTabAccess(state: AppState, tabId: string): boolean {
  const user = state.currentUser;
  if (!user) return false;
  if (user.roleId === 'ADMIN') return true;
  if (user.customPermissions) {
    try { return JSON.parse(user.customPermissions).includes(`tab:${tabId}`); } catch {}
  }
  const role = state.roles.find(r => r.id === user.roleId);
  return role?.permissions.includes(`tab:${tabId}` as never) ?? false;
}
