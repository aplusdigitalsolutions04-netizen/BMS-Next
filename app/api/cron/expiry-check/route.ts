import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'

export async function GET(req: NextRequest) {
  // Protect with CRON_SECRET so only authorized callers (Vercel Cron / your scheduler) can invoke this
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 1. Auto-cleanup: delete pending documents uploaded more than 2 days ago
    await query(`
      UPDATE document d
      JOIN documentmeta dm ON d.id = dm.documentId
      SET d.isDeleted = 1
      WHERE dm.approvalStatus = 'PENDING' AND dm.uploadDate < DATE_SUB(NOW(), INTERVAL 2 DAY)
    `)

    // 2. Fetch documents for expiry checks
    const documents = await query<Record<string, unknown>>(
      `SELECT d.*, f.name AS firm_name, dm.uploadedBy
       FROM document d
       LEFT JOIN firm f ON d.firmId = f.id
       LEFT JOIN documentmeta dm ON dm.documentId = d.id
       WHERE d.isDeleted = 0 AND d.isArchived = 0 AND d.expiryDate IS NOT NULL`
    )

    const configRows = await query<Record<string, unknown>>(
      `SELECT metadata FROM masterdata WHERE code = 'ALERT_CONFIG'`
    )
    let alertConfig: Record<string, boolean> = { '7': true, '15': true, '30': true, '60': false }
    if (configRows[0]?.metadata) {
      try { alertConfig = JSON.parse(configRows[0].metadata as string) } catch {}
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Pre-fetch today's document notifications
    const todayNotifications = await query<Record<string, unknown>>(
      `SELECT link FROM notification WHERE link LIKE '/documents/%' AND createdOn >= ? AND createdOn < ?`,
      [today, tomorrow]
    )
    const notifiedLinks = new Set(
      todayNotifications.map(n => n.link as string).filter(Boolean)
    )

    let processed = 0

    for (const doc of documents) {
      if (!doc.expiryDate) continue
      const expDate = new Date(doc.expiryDate as string | Date)
      expDate.setHours(0, 0, 0, 0)
      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      let level: string | null = null
      if (diffDays < 0) level = 'expired'
      else if (diffDays <= 7 && alertConfig['7']) level = '7days'
      else if (diffDays <= 15 && alertConfig['15']) level = '15days'
      else if (diffDays <= 30 && alertConfig['30']) level = '30days'
      else if (diffDays <= 60 && alertConfig['60']) level = '60days'

      if (!level) continue

      const docLink = `/documents/${doc.id}`
      if (notifiedLinks.has(docLink)) continue

      const firmName = doc.firm_name || ''
      const message =
        diffDays <= 0
          ? `Document "${doc.title}" for firm "${firmName}" has expired.`
          : `Document "${doc.title}" for firm "${firmName}" is expiring in ${diffDays} days.`

      await query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn, link) VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
        [
          crypto.randomUUID(),
          diffDays <= 0 ? 'Document Expired' : 'Document Expiring Soon',
          message,
          diffDays <= 0 ? 'error' : 'warning',
          docLink,
        ]
      )
      notifiedLinks.add(docLink)

      const subject = diffDays <= 0 ? `[EXPIRED] ${doc.title}` : `[EXPIRING] ${doc.title} in ${diffDays} days`
      await dispatchNotification(subject, message, doc.uploadedBy as string | undefined)
      processed++
    }

    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error('Error running expiry cron job:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}
