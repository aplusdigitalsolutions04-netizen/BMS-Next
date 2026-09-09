import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const isSelf = auth.userId === id
    if (!auth.isAdmin && !isSelf) {
      return NextResponse.json({ error: 'You do not have permission to edit this user' }, { status: 403 })
    }

    const body = await req.json()
    let { fullName, email, roleCode, password, avatar, globalAccess, firmAccess } = body
    // Role and firm/global access are admin-only fields -- a non-admin editing their own
    // profile (Profile.tsx) sends roleCode back unchanged, but must never be able to grant
    // themselves a different role or wider firm access by tampering with the request body.
    if (!auth.isAdmin) {
      roleCode = undefined
      globalAccess = undefined
      firmAccess = undefined
    }

    // Check email uniqueness
    if (email) {
      const emailConflict = await query<Record<string, unknown>>(
        `SELECT id FROM user WHERE email = ? AND id != ?`,
        [email, id]
      )
      if (emailConflict.length > 0) {
        return NextResponse.json({ error: 'This email is already in use' }, { status: 409 })
      }
    }

    // Check role exists
    if (roleCode) {
      const roleExists = await query<Record<string, unknown>>(`SELECT code FROM masterdata WHERE code = ?`, [roleCode])
      if (roleExists.length === 0) {
        return NextResponse.json({ error: 'Selected role does not exist' }, { status: 400 })
      }
    }

    // Build update -- only touch fields that were actually sent, so a partial payload
    // (e.g. just a password or avatar change) can never null out the others.
    const setParts: string[] = []
    const setValues: unknown[] = []
    if (fullName !== undefined) { setParts.push('fullName=?'); setValues.push(fullName) }
    if (email !== undefined) { setParts.push('email=?'); setValues.push(email) }
    if (roleCode !== undefined) { setParts.push('roleCode=?'); setValues.push(roleCode) }

    if (password) {
      setParts.push('password=?')
      setValues.push(await bcrypt.hash(password, 10))
    }
    if (avatar !== undefined) {
      setParts.push('avatar=?')
      setValues.push(avatar)
    }

    // Feature access is role-only now (see Roles & Permissions) -- there is no per-user
    // override to persist here. `customPermissions` used to be written on every save
    // whenever globalAccess was sent (which is always, since the form always includes it),
    // which meant any edit to any user -- even just their name -- silently overwrote that
    // column to null. Since nothing reads it anymore either, it's simplest to just stop
    // touching it here rather than recompute a value nobody uses.
    const isGlobal = globalAccess !== undefined ? globalAccess !== false : undefined
    if (isGlobal !== undefined) {
      const firmAccessJson = !isGlobal && firmAccess ? JSON.stringify(firmAccess) : null
      setParts.push('globalAccess=?', 'firmAccess=?')
      setValues.push(isGlobal ? 1 : 0, firmAccessJson)
    }

    if (setParts.length > 0) {
      setValues.push(id)
      await query(`UPDATE user SET ${setParts.join(', ')} WHERE id=?`, setValues)
    }

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
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params
    await query(`UPDATE user SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
