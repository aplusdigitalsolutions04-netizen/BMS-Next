import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// GET /api/master/:code -- get a single master data entry by its code
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ groupCode: string }> }
) {
  try {
    const { groupCode: code } = await params
    const rows = await query<Record<string, unknown>>(`SELECT * FROM masterdata WHERE code = ?`, [code])
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch {
    return NextResponse.json({ error: 'Failed to fetch master data entry' }, { status: 500 })
  }
}

// POST /api/master/:groupCode -- create new master data entry in that group
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupCode: string }> }
) {
  try {
    const { groupCode } = await params
    const { value, code, metadata } = await req.json()

    const group = await query<Record<string, unknown>>(`SELECT code FROM mastergroup WHERE code = ?`, [groupCode])
    if (group.length === 0) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // sp_masterdata_upsert (see lib/sql/procedures.sql) trims the value and rejects a new
    // row whose value duplicates an existing one in this group (case-insensitive) -- e.g.
    // adding "Manager" when "Manager " already exists.
    await query(`CALL sp_masterdata_upsert(?, ?, ?, ?)`, [code, groupCode, value, metadata || null])
    const [newMasterData] = await query<Record<string, unknown>>(`SELECT * FROM masterdata WHERE code = ?`, [code])
    return NextResponse.json(newMasterData, { status: 201 })
  } catch (e: unknown) {
    const message = (e as { sqlMessage?: string })?.sqlMessage
    return NextResponse.json({ error: message || 'Failed to create master data' }, { status: message ? 400 : 500 })
  }
}
