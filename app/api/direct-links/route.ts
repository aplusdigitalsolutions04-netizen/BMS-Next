import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM direct_link WHERE isDeleted = 0 ORDER BY entryDate DESC, createdOn DESC`
    )
    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/direct-links error:', error)
    return NextResponse.json({ error: 'Failed to fetch direct links' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      entryDate, productName, link, catalogId, itemCategoryCode,
      maxAvailableQty, minConsigneeQty, mrp, offerPrice,
      firm, firmId, sellerLocation, taggedLocations, client, clientCode, createdBy,
      cartingStatus, cartingDate, orderStatus,
    } = body

    if (!productName || !String(productName).trim()) {
      return NextResponse.json({ error: 'productName is required' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // sp_direct_link_create (see lib/sql/procedures.sql) rejects the insert if a non-deleted
    // entry already has this Catalog ID (trimmed, case-insensitive) -- skipped entirely when
    // no catalogId is given, since it's optional.
    await query(
      `CALL sp_direct_link_create(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entryDate || new Date().toISOString().slice(0, 10),
        String(productName).trim(),
        link || null,
        catalogId || null,
        itemCategoryCode || null,
        maxAvailableQty ?? null,
        minConsigneeQty ?? null,
        mrp ?? null,
        offerPrice ?? null,
        firm || null,
        firmId || null,
        sellerLocation || null,
        Array.isArray(taggedLocations) && taggedLocations.length ? JSON.stringify(taggedLocations) : null,
        client || null,
        clientCode || null,
        cartingStatus ? 1 : 0,
        cartingDate || new Date().toISOString().slice(0, 10),
        orderStatus || 'PENDING',
        createdBy || 'System',
      ]
    )

    const [entry] = await query<Record<string, unknown>>(`SELECT * FROM direct_link WHERE id = ?`, [id])
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('POST /api/direct-links error:', error)
    const message = (error as { sqlMessage?: string })?.sqlMessage
    return NextResponse.json({ error: message || 'Failed to create direct link entry' }, { status: message ? 400 : 500 })
  }
}
