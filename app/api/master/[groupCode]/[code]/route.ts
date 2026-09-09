import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ groupCode: string; code: string }> }
) {
  try {
    const { groupCode, code } = await params
    const { value, metadata } = await req.json()

    if (!value) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 })
    }

    // sp_mastergroup_upsert / sp_masterdata_upsert (see lib/sql/procedures.sql) trim the
    // input and reject a new row whose value duplicates an existing one in the same group
    // (case-insensitive) -- this is what stops e.g. "Manager" and "Manager " (trailing
    // space) from ending up as two different roles the way they once did.
    await query(`CALL sp_mastergroup_upsert(?, ?, ?)`, [groupCode, groupCode, null])
    await query(`CALL sp_masterdata_upsert(?, ?, ?, ?)`, [code, groupCode, value, metadata || null])

    const [updated] = await query<Record<string, unknown>>(
      `SELECT * FROM masterdata WHERE code = ? AND groupCode = ?`, [code, groupCode]
    )
    return NextResponse.json(updated)
  } catch (e: unknown) {
    const message = (e as { sqlMessage?: string })?.sqlMessage
    return NextResponse.json({ error: message || 'Failed to update master data' }, { status: message ? 400 : 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ groupCode: string; code: string }> }
) {
  try {
    const { groupCode, code } = await params
    await query(`UPDATE masterdata SET isDeleted = 1, isActive = 0 WHERE code = ? AND groupCode = ?`, [code, groupCode])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete master data' }, { status: 500 })
  }
}
