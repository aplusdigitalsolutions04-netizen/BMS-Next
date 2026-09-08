import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const gemOrderId = searchParams.get('gemOrderId')
    if (!gemOrderId) return NextResponse.json({ exists: false })

    const rows = await query<Record<string, unknown>>(
      `SELECT id, title, gemOrderId FROM biddocument WHERE gemOrderId = ? LIMIT 1`,
      [gemOrderId]
    )
    const existing = rows[0] || null
    return NextResponse.json({ exists: !!existing, bid: existing })
  } catch {
    return NextResponse.json({ error: 'Check failed' }, { status: 500 })
  }
}
