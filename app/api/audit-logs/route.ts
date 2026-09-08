import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const logs = await query<Record<string, unknown>>(
      `SELECT * FROM auditlog ORDER BY dateTime DESC LIMIT 100`
    )
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, userName, action, module, details, ipAddress } = await req.json()
    const id = crypto.randomUUID()
    const ip = ipAddress || req.headers.get('x-forwarded-for') || 'Unknown'
    await query(
      `INSERT INTO auditlog (id, userId, userName, action, module, details, ipAddress, dateTime) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [id, userId, userName, action, module, details, ip]
    )
    const [log] = await query<Record<string, unknown>>(`SELECT * FROM auditlog WHERE id = ?`, [id])
    return NextResponse.json(log)
  } catch {
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}
