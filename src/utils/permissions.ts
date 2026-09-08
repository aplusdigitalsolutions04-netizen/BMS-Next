import type { AppState } from '../store/AppContext';

// ADMIN always has access; everyone else needs an explicit `tab:<tabId>` permission on
// their role. Feature access is configured only at the role level (Roles & Permissions) --
// there is no per-user override.
export function hasTabAccess(state: AppState, tabId: string): boolean {
  const user = state.currentUser;
  if (!user) return false;
  if (user.roleId === 'ADMIN') return true;
  const role = state.roles.find(r => r.id === user.roleId);
  return role?.permissions.includes(`tab:${tabId}` as never) ?? false;
}
