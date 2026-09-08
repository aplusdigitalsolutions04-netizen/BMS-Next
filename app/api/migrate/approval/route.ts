import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    await query(`
      ALTER TABLE documentmeta
        ADD COLUMN IF NOT EXISTS approvalStatus ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS approvedBy    VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS approvedOn    DATETIME    NULL,
        ADD COLUMN IF NOT EXISTS approvalNote  TEXT        NULL
    `)
    // All docs uploaded before this system existed are considered approved
    await query(`UPDATE documentmeta SET approvalStatus = 'APPROVED' WHERE approvalStatus = 'PENDING'`)
    return NextResponse.json({ success: true, message: 'Migration done — existing docs marked APPROVED' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
