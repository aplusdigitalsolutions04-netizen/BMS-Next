import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { action, note, reviewedBy } = await req.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

    await query(
      `UPDATE documentmeta SET approvalStatus=?, approvedBy=?, approvedOn=NOW(), approvalNote=? WHERE documentId=?`,
      [newStatus, reviewedBy || 'System', note || null, id]
    )

    const [doc] = await query<Record<string, unknown>>(
      `SELECT d.title, dm.uploadedBy FROM document d LEFT JOIN documentmeta dm ON dm.documentId = d.id WHERE d.id = ?`,
      [id]
    )

    if (doc) {
      query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
        [
          crypto.randomUUID(),
          `Document ${newStatus === 'APPROVED' ? 'Approved' : 'Rejected'}`,
          `Document '${doc.title}' has been ${newStatus.toLowerCase()} by ${reviewedBy || 'Manager'}.${note ? ' Note: ' + note : ''}`,
          newStatus === 'APPROVED' ? 'success' : 'warning',
        ]
      ).catch(() => {})
    }

    return NextResponse.json({ success: true, approvalStatus: newStatus })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 })
  }
}
