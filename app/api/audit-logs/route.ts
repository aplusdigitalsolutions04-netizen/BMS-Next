import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requirePermission } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission(req, 'tab:audit')
    if (auth instanceof NextResponse) return auth

    const logs = await query<Record<string, unknown>>(
      `SELECT * FROM auditlog ORDER BY dateTime DESC LIMIT 100`
    )
    return NextResponse.json(logs)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, module, details, ipAddress } = await req.json()
    const id = crypto.randomUUID()
    const ip = ipAddress || req.headers.get('x-forwarded-for') || 'Unknown'
    // Trust the identity middleware.ts already verified from the JWT, not whatever userId/
    // userName the client sends -- otherwise any logged-in user could write audit entries
    // attributing actions to someone else.
    const headerUserId = req.headers.get('x-user-id') || 'unknown'
    const headerUserNameRaw = req.headers.get('x-user-name')
    const headerUserName = headerUserNameRaw ? decodeURIComponent(headerUserNameRaw) : 'Unknown'
    await query(
      `INSERT INTO auditlog (id, userId, userName, action, module, details, ipAddress, dateTime) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [id, headerUserId, headerUserName, action, module, details, ip]
    )
    const [log] = await query<Record<string, unknown>>(`SELECT * FROM auditlog WHERE id = ?`, [id])
    return NextResponse.json(log)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}
