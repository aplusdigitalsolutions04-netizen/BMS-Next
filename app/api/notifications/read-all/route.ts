import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// Per-viewer: marks the feed read for the calling user only (see notes in
// app/api/notifications/route.ts) instead of the previous unscoped UPDATE that marked every
// notification read for every user.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await query(
      `UPDATE notification
       SET readBy = JSON_ARRAY_APPEND(COALESCE(readBy, JSON_ARRAY()), '$', ?)
       WHERE isDeleted = 0 AND isRead = 0 AND NOT JSON_CONTAINS(COALESCE(readBy, JSON_ARRAY()), JSON_QUOTE(?))`,
      [auth.userId, auth.userId]
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 })
  }
}
