'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '@/src/store/AppContext'
import Sidebar from '@/src/components/Layout/Sidebar'
import Header from '@/src/components/Layout/Header'
import { hasTabAccess } from '@/src/utils/permissions'

// Every real page route under here (dashboard, firms, documents, ...) shares this one
// shell -- same pattern as IMS-next's app/(app)/layout.tsx. Because each view is now a
// real Next.js route instead of a client-only pushState URL, a hard reload/bookmark on
// any of them just re-renders this layout + that page directly -- no 404, no middleware
// rewrite needed.
const VALID_VIEWS = [
  'dashboard', 'firms', 'documents', 'bids', 'saved-bids', 'bid-docs', 'templates', 'sheets', 'direct-link',
  'search', 'expiry', 'categories', 'departments', 'tags', 'statuses', 'firm-types', 'bid-categories', 'item-categories', 'clients',
  'users', 'roles', 'approvals', 'audit', 'reports', 'notifications', 'settings', 'profile', 'google-drive',
]

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp()
  const { darkMode, isAuthenticated, isHydrated, isDataLoading, currentUser } = state
  const pathname = usePathname()
  const router = useRouter()
  const view = pathname.replace(/^\//, '').split('/')[0]

  // Keep state.currentView in sync with the real route -- everything that already reads
  // it (Sidebar highlighting, badges, the Bids/Settings in-page tab sync) keeps working
  // unchanged; only the *navigation* itself (see Sidebar.navigateTo etc.) now uses real
  // router.push instead of the old pushState hack.
  useEffect(() => {
    if (!isHydrated || !isAuthenticated) return
    if (VALID_VIEWS.includes(view) && view !== state.currentView) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatch({ type: 'SET_VIEW', payload: view as any })
    }
  }, [pathname, isAuthenticated, isHydrated])

  useEffect(() => {
    if (!isHydrated) return
    if (!isAuthenticated) { router.replace('/'); return }
    // A user without access to this view's tab gets bounced to the dashboard, same as
    // the old renderView() fallback.
    if (view !== 'dashboard' && view !== 'profile' && currentUser?.roleId !== 'ADMIN' && !hasTabAccess(state, view)) {
      router.replace('/dashboard')
    }
  }, [isHydrated, isAuthenticated, view, currentUser])

  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen ${darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto relative">
          {isDataLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-gray-500">Loading data...</span>
              </div>
            </div>
          )}
          <div key={pathname} className="animate-page-in" onAnimationEnd={(e) => { e.currentTarget.style.animation = 'none' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
