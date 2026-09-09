import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    // Per-viewer read state -- see notes in app/api/notifications/route.ts.
    await query(
      `UPDATE notification
       SET readBy = JSON_ARRAY_APPEND(COALESCE(readBy, JSON_ARRAY()), '$', ?)
       WHERE id = ? AND NOT JSON_CONTAINS(COALESCE(readBy, JSON_ARRAY()), JSON_QUOTE(?))`,
      [auth.userId, id, auth.userId]
    )
    const [updated] = await query<Record<string, unknown>>(
      `SELECT id, title, message, type, createdOn, link,
              (isRead = 1 OR JSON_CONTAINS(COALESCE(readBy, JSON_ARRAY()), JSON_QUOTE(?))) AS isRead
       FROM notification WHERE id = ?`,
      [auth.userId, id]
    )
    return NextResponse.json(updated ? { ...updated, isRead: !!updated.isRead } : updated)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }
}
