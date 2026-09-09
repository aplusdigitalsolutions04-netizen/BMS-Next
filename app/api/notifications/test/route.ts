import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'

export async function POST() {
  try {
    const message = 'This is a test notification generated manually to check if the system is working.'
    const id = crypto.randomUUID()
    await query(
      `INSERT INTO notification (id, title, message, type, isRead, createdOn, link) VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
      [id, 'System Test Notification', message, 'info', '/documents']
    )
    const [notif] = await query<Record<string, unknown>>(`SELECT * FROM notification WHERE id = ?`, [id])
    await dispatchNotification('System Test Notification', message)
    return NextResponse.json(notif)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to create test notification' }, { status: 500 })
  }
}
