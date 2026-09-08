import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH() {
  try {
    await query(`UPDATE notification SET isRead = 1 WHERE isRead = 0`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 })
  }
}
