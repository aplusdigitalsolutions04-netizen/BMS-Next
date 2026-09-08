import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'

// Routes that don't need a token. /api/google-drive/authorize is a plain browser
// navigation (redirects to Google's consent screen) so it can't carry the usual
// Authorization header the way fetch/axios calls do.
const PUBLIC_API_ROUTES = ['/api/users/login', '/api/google-drive/authorize']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only guard /api/* routes -- every view now has its own real page route under
  // app/(app)/, so a hard reload on any of them is served directly by Next.js and no
  // longer needs a client-only-URL fallback rewrite here.
  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Allow public routes through
  if (PUBLIC_API_ROUTES.some((r) => pathname === r)) return NextResponse.next()

  // Public sheet-share links (view/edit by anyone holding the link, no login) -- gated by
  // the unguessable token in the URL itself, not a Bearer token. Without this exemption the
  // whole "share a sheet by link" feature 401s for every anonymous visitor.
  if (pathname.startsWith('/api/share/sheet/')) return NextResponse.next()

  // Also allow cron routes if they have the correct CRON_SECRET header
  const CRON_ROUTES = ['/api/cron/expiry-check', '/api/cron/approval-check']
  if (CRON_ROUTES.includes(pathname)) {
    const cronAuth = req.headers.get('Authorization')
    if (!process.env.CRON_SECRET || cronAuth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Verify Bearer token
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const payload = await verifyToken(token)
    // Forward user info to route handler via request headers
    const requestHeaders = new Headers(req.headers)
    
    if (payload.id) requestHeaders.set('x-user-id', String(payload.id))
    if (payload.fullName) {
      // Safe encode to prevent invalid header characters
      requestHeaders.set('x-user-name', encodeURIComponent(String(payload.fullName)))
    }
    if (payload.roleCode) requestHeaders.set('x-user-role', String(payload.roleCode))

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}

export const config = {
  matcher: '/api/:path*',
}
