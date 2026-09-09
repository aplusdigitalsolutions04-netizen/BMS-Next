import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    // Per-viewer dismissal -- see notes in app/api/notifications/route.ts.
    await query(
      `UPDATE notification
       SET deletedBy = JSON_ARRAY_APPEND(COALESCE(deletedBy, JSON_ARRAY()), '$', ?)
       WHERE id = ? AND NOT JSON_CONTAINS(COALESCE(deletedBy, JSON_ARRAY()), JSON_QUOTE(?))`,
      [auth.userId, id, auth.userId]
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
  }
}
