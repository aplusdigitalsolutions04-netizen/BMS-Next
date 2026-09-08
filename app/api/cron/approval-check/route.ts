import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'

// Bid-linked documents must be approved within 2 days of upload:
//  - at the 47h mark (1 hour before the deadline) send a "will be removed soon" reminder
//  - at the 48h mark, if still PENDING, soft-delete the document and notify uploader + managers
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 1. Reminder pass -- documents pending for 47-48h that haven't been reminded yet
    const dueForReminder = await query<Record<string, unknown>>(`
      SELECT d.id, d.title, dm.uploadedBy
      FROM document d
      JOIN documentmeta dm ON dm.documentId = d.id
      WHERE d.isDeleted = 0
        AND d.bidDocumentId IS NOT NULL
        AND dm.approvalStatus = 'PENDING'
        AND dm.approvalReminderSent = 0
        AND dm.uploadDate <= DATE_SUB(NOW(), INTERVAL 47 HOUR)
        AND dm.uploadDate >  DATE_SUB(NOW(), INTERVAL 48 HOUR)
    `)

    let reminded = 0
    for (const doc of dueForReminder) {
      const title = doc.title as string
      const uploadedBy = doc.uploadedBy as string | null
      await query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
        [crypto.randomUUID(), 'Document Approval Expiring Soon', `Document '${title}' has not been approved and will be automatically removed in 1 hour.`, 'warning']
      )
      await dispatchNotification(
        'Document Approval Expiring Soon',
        `Document '${title}' has not been approved yet and will be automatically removed in 1 hour unless approved now.`,
        uploadedBy
      )
      await query(`UPDATE documentmeta SET approvalReminderSent = 1 WHERE documentId = ?`, [doc.id])
      reminded++
    }

    // 2. Auto-remove pass -- documents still pending after 48h
    const dueForRemoval = await query<Record<string, unknown>>(`
      SELECT d.id, d.title, dm.uploadedBy
      FROM document d
      JOIN documentmeta dm ON dm.documentId = d.id
      WHERE d.isDeleted = 0
        AND d.bidDocumentId IS NOT NULL
        AND dm.approvalStatus = 'PENDING'
        AND dm.uploadDate <= DATE_SUB(NOW(), INTERVAL 48 HOUR)
    `)

    let removed = 0
    for (const doc of dueForRemoval) {
      const title = doc.title as string
      const uploadedBy = doc.uploadedBy as string | null
      await query(`UPDATE document SET isDeleted = 1 WHERE id = ?`, [doc.id])
      await query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
        [crypto.randomUUID(), 'Document Removed — Not Approved', `Document '${title}' was not approved within 2 days and has been automatically removed.`, 'error']
      )
      await dispatchNotification(
        'Document Removed — Not Approved',
        `Document '${title}' was not approved within 2 days and has been automatically removed. Please re-upload if it's still needed.`,
        uploadedBy
      )
      removed++
    }

    return NextResponse.json({ success: true, reminded, removed })
  } catch (error) {
    console.error('Error running approval-check cron job:', error)
    return NextResponse.json({ error: 'Approval check cron failed' }, { status: 500 })
  }
}
