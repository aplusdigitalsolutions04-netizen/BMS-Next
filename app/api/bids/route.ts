import { NextRequest, NextResponse } from 'next/server'
import { query, getBidStatusCodes } from '@/lib/db'

export async function GET() {
  try {
    const bids = await query<Record<string, unknown>>(
      `SELECT id, gemOrderId, title, fileName, filePath, uploadedBy, offeredProduct, categoryCode, buyerTerms, bidStatus, extractedSummary, createdOn
       FROM biddocument WHERE isDeleted = 0 ORDER BY createdOn DESC LIMIT 500`
    )

    const bidIds = bids.map(b => b.id as string)
    let parameters: Record<string, unknown>[] = []
    if (bidIds.length > 0) {
      const placeholders = bidIds.map(() => '?').join(',')
      parameters = await query<Record<string, unknown>>(
        `SELECT id, gem_id AS gemId, parameter_name AS parameterName, parameter_value AS parameterValue, bidDocumentId
         FROM bid_parameters WHERE bidDocumentId IN (${placeholders})`,
        bidIds
      )
    }

    const paramsByBid: Record<string, unknown[]> = {}
    for (const p of parameters) {
      const bid = p.bidDocumentId as string
      if (!paramsByBid[bid]) paramsByBid[bid] = []
      paramsByBid[bid].push({ id: p.id, gemId: p.gemId, parameterName: p.parameterName, parameterValue: p.parameterValue })
    }

    const result = bids.map(b => ({
      ...b,
      parameters: paramsByBid[b.id as string] || [],
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/bids error:', error)
    return NextResponse.json({ error: 'Failed to fetch bids' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, gemOrderId, fileName, filePath, uploadedBy, extractedSummary, parameters, offeredProduct, categoryCode, buyerTerms, bidStatus } =
      await req.json()

    if (!fileName || !extractedSummary) {
      return NextResponse.json(
        { error: 'fileName and extractedSummary are required' },
        { status: 400 }
      )
    }

    if (bidStatus !== undefined && bidStatus !== null) {
      const allowedStatuses = await getBidStatusCodes()
      if (!allowedStatuses.includes(bidStatus)) {
        return NextResponse.json({ error: 'Invalid bidStatus' }, { status: 400 })
      }
    }

    const bidId = crypto.randomUUID()
    const bidTitle = title || fileName.replace(/\.pdf$/i, '')

    await query(
      `INSERT INTO biddocument (id, gemOrderId, title, fileName, filePath, uploadedBy, extractedSummary, offeredProduct, categoryCode, buyerTerms, bidStatus, createdOn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [bidId, gemOrderId || null, bidTitle, fileName, filePath || '', uploadedBy || null, extractedSummary, offeredProduct || null, categoryCode || null, buyerTerms || null, bidStatus || null]
    )

    if (parameters && Array.isArray(parameters)) {
      for (const p of parameters as { name: string; value: string | null }[]) {
        await query(
          `INSERT INTO bid_parameters (gem_id, parameter_name, parameter_value, created_date, bidDocumentId) VALUES (?, ?, ?, NOW(), ?)`,
          // gem_id is NOT NULL in the schema -- fall back to '' (not null) when no GEM Order ID was provided
          [gemOrderId || '', String(p.name), p.value ? String(p.value) : null, bidId]
        )
      }
    }

    const [bid] = await query<Record<string, unknown>>(`SELECT * FROM biddocument WHERE id = ?`, [bidId])
    return NextResponse.json({ success: true, bid }, { status: 201 })
  } catch (error) {
    console.error('POST /api/bids save error:', error)
    return NextResponse.json({ error: 'Failed to save bid' }, { status: 500 })
  }
}
