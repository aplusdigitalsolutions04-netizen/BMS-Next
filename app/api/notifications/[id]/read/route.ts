import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query(`UPDATE notification SET isRead = 1 WHERE id = ?`, [id])
    const [updated] = await query<Record<string, unknown>>(`SELECT * FROM notification WHERE id = ?`, [id])
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }
}
