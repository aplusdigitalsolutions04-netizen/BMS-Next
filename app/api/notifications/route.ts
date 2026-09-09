import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // isRead/isDeleted here are per-viewer: a notification is "read"/"deleted" for this user
    // if either the global flag is set (admin cleared it for everyone) or their own id is in
    // readBy/deletedBy (they read/cleared it for just themselves).
    const notifications = await query<Record<string, unknown>>(
      `SELECT id, title, message, type, createdOn, link,
              (isRead = 1 OR JSON_CONTAINS(COALESCE(readBy, JSON_ARRAY()), JSON_QUOTE(?))) AS isRead
       FROM notification
       WHERE isDeleted = 0 AND NOT JSON_CONTAINS(COALESCE(deletedBy, JSON_ARRAY()), JSON_QUOTE(?))
       ORDER BY createdOn DESC LIMIT 50`,
      [auth.userId, auth.userId]
    )
    const result = notifications.map(n => ({ ...n, isRead: !!n.isRead }))
    return NextResponse.json(result)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// "Clear all" only dismisses the feed for the calling user (appends their id to deletedBy on
// every currently-visible row) -- it used to hard-delete every notification for every user in
// the system with a single unscoped UPDATE.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await query(
      `UPDATE notification
       SET deletedBy = JSON_ARRAY_APPEND(COALESCE(deletedBy, JSON_ARRAY()), '$', ?)
       WHERE isDeleted = 0 AND NOT JSON_CONTAINS(COALESCE(deletedBy, JSON_ARRAY()), JSON_QUOTE(?))`,
      [auth.userId, auth.userId]
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
