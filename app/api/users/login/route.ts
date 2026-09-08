import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { signToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT u.*, md.code AS role_code, md.value AS role_value, md.groupCode AS role_groupCode
       FROM user u LEFT JOIN masterdata md ON u.roleCode = md.code WHERE u.username = ? AND u.isDeleted = 0`,
      [username]
    )

    const user = rows[0]
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid credentials or inactive account' }, { status: 401 })
    }

    let valid = false
    const isHashed = typeof user.password === 'string' && (user.password as string).startsWith('$2')
    if (isHashed) {
      valid = await bcrypt.compare(password, user.password as string)
    } else {
      valid = user.password === password
      if (valid) {
        const hashed = await bcrypt.hash(password, 10)
        await query(`UPDATE user SET password = ? WHERE id = ?`, [hashed, user.id])
      }
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials or inactive account' }, { status: 401 })
    }

    // Update lastLogin
    await query(`UPDATE user SET lastLogin = NOW() WHERE id = ?`, [user.id]).catch(() => {})

    const token = await signToken({
      id: user.id as string,
      username: user.username as string,
      fullName: user.fullName as string,
      email: (user.email as string) ?? '',
      roleCode: (user.roleCode as string) ?? '',
    })

    return NextResponse.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roleCode: user.roleCode,
      isActive: !!user.isActive,
      lastLogin: user.lastLogin,
      avatar: user.avatar,
      role: user.role_code ? { code: user.role_code, value: user.role_value, groupCode: user.role_groupCode } : null,
      globalAccess: (user.globalAccess as number) !== 0,
      firmAccess: user.firmAccess ?? null,
      customPermissions: user.customPermissions ?? null,
      token,
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
