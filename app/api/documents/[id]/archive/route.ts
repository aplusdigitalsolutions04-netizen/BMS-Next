import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { isArchived } = await req.json()
    await query(`UPDATE document SET isArchived = ? WHERE id = ?`, [isArchived === true ? 1 : 0, id])
    const [doc] = await query<Record<string, unknown>>(`SELECT * FROM document WHERE id = ?`, [id])
    return NextResponse.json(doc)
  } catch {
    return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 })
  }
}
