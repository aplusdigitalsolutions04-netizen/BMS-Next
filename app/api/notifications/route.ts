import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const notifications = await query<Record<string, unknown>>(
      `SELECT * FROM notification WHERE isDeleted = 0 ORDER BY createdOn DESC LIMIT 50`
    )
    return NextResponse.json(notifications)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await query(`UPDATE notification SET isDeleted = 1`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
