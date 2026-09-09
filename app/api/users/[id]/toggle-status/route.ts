import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const rows = await query<Record<string, unknown>>(`SELECT isActive FROM user WHERE id = ?`, [id])
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const newActive = rows[0].isActive ? 0 : 1
    await query(`UPDATE user SET isActive = ? WHERE id = ?`, [newActive, id])

    const [userRow] = await query<Record<string, unknown>>(
      `SELECT u.id, u.username, u.fullName, u.email, u.roleCode, u.isActive, u.lastLogin, u.avatar,
              u.globalAccess, u.firmAccess,
              md.code AS role_code, md.value AS role_value, md.groupCode AS role_groupCode
       FROM user u LEFT JOIN masterdata md ON u.roleCode = md.code WHERE u.id = ?`,
      [id]
    )

    return NextResponse.json({
      id: userRow.id,
      username: userRow.username,
      fullName: userRow.fullName,
      email: userRow.email,
      roleCode: userRow.roleCode,
      isActive: !!userRow.isActive,
      lastLogin: userRow.lastLogin,
      avatar: userRow.avatar,
      role: userRow.role_code ? { code: userRow.role_code, value: userRow.role_value, groupCode: userRow.role_groupCode } : null,
      globalAccess: (userRow.globalAccess as number) !== 0,
      firmAccess: userRow.firmAccess ?? null,
    })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to toggle user status' }, { status: 500 })
  }
}
