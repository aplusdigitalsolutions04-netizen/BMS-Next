import { NextRequest, NextResponse } from 'next/server'
import { query, getBidStatusCodes } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await query<Record<string, unknown>>(`SELECT * FROM biddocument WHERE id = ?`, [id])
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const parameters = await query<Record<string, unknown>>(
      `SELECT id, gem_id AS gemId, parameter_name AS parameterName, parameter_value AS parameterValue, bidDocumentId
       FROM bid_parameters WHERE bidDocumentId = ?`,
      [id]
    )

    return NextResponse.json({ ...rows[0], parameters })
  } catch (error) {
    console.error('GET /api/bids/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch bid' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    
    // Build update query dynamically based on what was sent
    const updates: string[] = []
    const values: any[] = []
    
    if (body.uploadedBy !== undefined) {
      updates.push('uploadedBy = ?')
      values.push(body.uploadedBy ?? null)
    }
    if (body.bidStatus !== undefined) {
      const allowedStatuses = await getBidStatusCodes()
      if (!allowedStatuses.includes(body.bidStatus)) {
        return NextResponse.json({ error: 'Invalid bidStatus' }, { status: 400 })
      }
      updates.push('bidStatus = ?')
      values.push(body.bidStatus)
    }
    
    if (updates.length > 0) {
      values.push(id)
      await query(`UPDATE biddocument SET ${updates.join(', ')} WHERE id = ?`, values)
    }

    const [row] = await query<Record<string, unknown>>(`SELECT * FROM biddocument WHERE id = ?`, [id])
    return NextResponse.json(row)
  } catch (error) {
    console.error('PATCH /api/bids/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update bid' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query(`UPDATE biddocument SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/bids error:', error)
    return NextResponse.json({ error: 'Failed to delete bid' }, { status: 500 })
  }
}
