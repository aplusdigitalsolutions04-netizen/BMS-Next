import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import crypto from 'crypto'

export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT id, name, createdBy, createdOn, updatedOn FROM advanced_sheet WHERE isDeleted = 0 ORDER BY updatedOn DESC`
    )
    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/advanced-sheets error:', error)
    return NextResponse.json({ error: 'Failed to fetch advanced sheets' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, createdBy } = await req.json()
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const id = crypto.randomUUID()

    // sp_advanced_sheet_create (see lib/sql/procedures.sql) rejects the insert if a
    // non-deleted workbook already has this name (trimmed, case-insensitive).
    await query(`CALL sp_advanced_sheet_create(?, ?, ?)`, [id, name, createdBy || 'System'])

    // The workbook's grid data isn't stored on advanced_sheet itself -- it lives in
    // advanced_sheet_tabs (one row per sheet tab) + advanced_sheet_cells (one row per
    // cell), same as GET/PUT /api/advanced-sheets/[id] already expect. A new workbook
    // just needs one empty "Sheet1" tab row; there are no cells yet.

    await query(
      `INSERT INTO advanced_sheet_tabs (id, workbook_id, sheet_index, tab_name, config) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), id, 'sheet_01', 'Sheet1', JSON.stringify({ color: '', status: 1, order: 0, row: 36, column: 18 })]
    )

    const [sheet] = await query<Record<string, unknown>>(
      `SELECT id, name, createdBy, createdOn, updatedOn FROM advanced_sheet WHERE id = ?`,
      [id]
    )
    return NextResponse.json(sheet, { status: 201 })
  } catch (error) {
    console.error('POST /api/advanced-sheets error:', error)
    const message = (error as { sqlMessage?: string })?.sqlMessage
    return NextResponse.json({ error: message || 'Failed to create advanced sheet' }, { status: message ? 400 : 500 })
  }
}
