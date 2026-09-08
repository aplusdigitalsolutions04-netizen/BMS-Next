import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await query<Record<string, unknown>>(`SELECT isActive FROM firm WHERE id = ?`, [id])
    if (rows.length === 0) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

    const newActive = rows[0].isActive ? 0 : 1
    await query(`UPDATE firm SET isActive = ? WHERE id = ?`, [newActive, id])

    const [updated] = await query<Record<string, unknown>>(`SELECT * FROM firm WHERE id = ?`, [id])
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to toggle firm status' }, { status: 500 })
  }
}
