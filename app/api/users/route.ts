import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const users = await query<Record<string, unknown>>(
      `SELECT u.id, u.username, u.fullName, u.email, u.roleCode, u.isActive, u.lastLogin, u.avatar,
              u.globalAccess, u.firmAccess,
              md.code AS role_code, md.value AS role_value, md.groupCode AS role_groupCode
       FROM user u
       LEFT JOIN masterdata md ON u.roleCode = md.code
       WHERE u.isDeleted = 0`
    )

    // Reports/BidAnalyser/SavedBids all read fullName/roleCode/lastLogin for every user to
    // populate dropdowns and activity reports, so those stay visible to any authenticated
    // user. globalAccess/firmAccess (which firms a restricted user can see) is the genuinely
    // sensitive part -- only admins (who manage that access) get to see it for other users.
    const result = users.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      roleCode: u.roleCode,
      isActive: !!u.isActive,
      lastLogin: u.lastLogin,
      avatar: u.avatar,
      role: u.role_code ? { code: u.role_code, value: u.role_value, groupCode: u.role_groupCode } : null,
      ...(auth.isAdmin || u.id === auth.userId ? {
        globalAccess: (u.globalAccess as number) !== 0,
        firmAccess: u.firmAccess ?? null,
      } : {}),
    }))

    return NextResponse.json(result)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { username, password, fullName, email, roleCode, globalAccess, firmAccess } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }
    if (!fullName) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    if (!roleCode) return NextResponse.json({ error: 'Please select an access role' }, { status: 400 })

    // Check uniqueness -- one query returning the colliding row's own fields, instead of a
    // second round trip just to figure out which of username/email collided.
    const existing = await query<{ username: string; email: string }>(
      `SELECT username, email FROM user WHERE username = ? OR email = ?`,
      [username, email]
    )
    if (existing.length > 0) {
      const what = existing.some((u) => u.username === username) ? 'username' : 'email'
      return NextResponse.json({ error: `This ${what} is already in use` }, { status: 409 })
    }

    // Check role exists
    const roleExists = await query<Record<string, unknown>>(`SELECT code FROM masterdata WHERE code = ?`, [roleCode])
    if (roleExists.length === 0) {
      return NextResponse.json({ error: 'Selected role does not exist' }, { status: 400 })
    }

    const isGlobal = globalAccess !== false
    const firmAccessJson = !isGlobal && firmAccess ? JSON.stringify(firmAccess) : null

    const id = crypto.randomUUID()
    const hashedPassword = await bcrypt.hash(password, 10)

    await query(
      `INSERT INTO user (id, username, password, fullName, email, roleCode, isActive, globalAccess, firmAccess)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, username, hashedPassword, fullName, email, roleCode, isGlobal ? 1 : 0, firmAccessJson]
    )

    const [roleRow] = await query<Record<string, unknown>>(`SELECT code, value, groupCode FROM masterdata WHERE code = ?`, [roleCode])

    return NextResponse.json({
      id, username, fullName, email, roleCode, isActive: true, lastLogin: null, avatar: null,
      role: roleRow ? { code: roleRow.code, value: roleRow.value, groupCode: roleRow.groupCode } : null,
      globalAccess: isGlobal,
      firmAccess: firmAccessJson,
    }, { status: 201 })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
