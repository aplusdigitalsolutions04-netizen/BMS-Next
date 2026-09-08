import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      entryDate, productName, link, catalogId, itemCategoryCode,
      maxAvailableQty, minConsigneeQty, mrp, offerPrice,
      firm, firmId, sellerLocation, taggedLocations, client, clientCode,
      cartingStatus, cartingDate, orderStatus,
    } = body

    await query(
      `UPDATE direct_link SET
        entryDate = ?, productName = ?, link = ?, catalogId = ?, itemCategoryCode = ?,
        maxAvailableQty = ?, minConsigneeQty = ?, mrp = ?, offerPrice = ?,
        firm = ?, firmId = ?, sellerLocation = ?, taggedLocations = ?, client = ?, clientCode = ?,
        cartingStatus = ?, cartingDate = ?, orderStatus = ?
       WHERE id = ?`,
      [
        entryDate, String(productName).trim(), link || null, catalogId || null, itemCategoryCode || null,
        maxAvailableQty ?? null, minConsigneeQty ?? null, mrp ?? null, offerPrice ?? null,
        firm || null, firmId || null, sellerLocation || null,
        Array.isArray(taggedLocations) && taggedLocations.length ? JSON.stringify(taggedLocations) : null,
        client || null, clientCode || null,
        cartingStatus ? 1 : 0, cartingDate || null, orderStatus || 'PENDING',
        id,
      ]
    )

    const [entry] = await query<Record<string, unknown>>(`SELECT * FROM direct_link WHERE id = ?`, [id])
    return NextResponse.json(entry)
  } catch (error) {
    console.error('PUT /api/direct-links/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update direct link entry' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query(`UPDATE direct_link SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/direct-links/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete direct link entry' }, { status: 500 })
  }
}
