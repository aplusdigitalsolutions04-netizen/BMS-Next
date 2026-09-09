import { NextRequest, NextResponse } from 'next/server'
import { query } from './db'

export interface AuthContext {
  userId: string
  userName: string
  roleCode: string
  isAdmin: boolean
  globalAccess: boolean
  firmAccess: string[] | null
}

// Role -> permissions list is stored as JSON in masterdata.metadata for the ROLES group (see
// AppContext's client-side parsing of the same data). Cached briefly so a permission check on
// every request doesn't cost a DB round trip on every request.
let roleCache: { data: Map<string, string[]>; expiresAt: number } | null = null
async function getRolePermissions(roleCode: string): Promise<string[]> {
  if (!roleCache || Date.now() > roleCache.expiresAt) {
    const rows = await query<{ code: string; metadata: string | null }>(
      `SELECT code, metadata FROM masterdata WHERE groupCode = 'ROLES' AND isDeleted = 0`
    )
    const map = new Map<string, string[]>()
    for (const r of rows) {
      let perms: string[] = []
      try { if (r.metadata) perms = JSON.parse(r.metadata) } catch {}
      map.set(r.code, perms)
    }
    roleCache = { data: map, expiresAt: Date.now() + 30000 }
  }
  return roleCache.data.get(roleCode) || []
}

export function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return NextResponse.json({ error: message }, { status: 403 })
}

// middleware.ts already verified the JWT and forwards the trusted claims as headers -- routes
// should never trust a role/user id coming from the request body or query string instead.
export async function requireAuth(req: NextRequest): Promise<AuthContext | NextResponse> {
  const userId = req.headers.get('x-user-id') || ''
  const roleCode = req.headers.get('x-user-role') || ''
  const userNameRaw = req.headers.get('x-user-name')
  const userName = userNameRaw ? decodeURIComponent(userNameRaw) : ''
  if (!userId || !roleCode) return unauthorized()

  // globalAccess/firmAccess aren't in the JWT (they can change between logins), so fetch the
  // current value directly -- this is a single indexed primary-key lookup.
  const rows = await query<{ globalAccess: number; firmAccess: string | null; isActive: number; isDeleted: number }>(
    `SELECT globalAccess, firmAccess, isActive, isDeleted FROM user WHERE id = ?`,
    [userId]
  )
  if (!rows.length || rows[0].isDeleted || !rows[0].isActive) {
    return unauthorized('Account not found or inactive')
  }

  let firmAccess: string[] | null = null
  try { firmAccess = rows[0].firmAccess ? JSON.parse(rows[0].firmAccess) : null } catch {}

  return {
    userId,
    userName,
    roleCode,
    isAdmin: roleCode === 'ADMIN',
    globalAccess: rows[0].globalAccess !== 0,
    firmAccess,
  }
}

export async function requirePermission(req: NextRequest, permission: string): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.isAdmin) return auth
  const perms = await getRolePermissions(auth.roleCode)
  if (!perms.includes(permission)) return forbidden()
  return auth
}

export async function requireAdmin(req: NextRequest): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth
  if (!auth.isAdmin) return forbidden('Admin access required')
  return auth
}
