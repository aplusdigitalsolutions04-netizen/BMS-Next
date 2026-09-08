import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    await query('DROP TABLE IF EXISTS advanced_sheet_cells');
    await query('DROP TABLE IF EXISTS advanced_sheet_tabs');
    try {
      await query('ALTER TABLE advanced_sheet DROP COLUMN data');
    } catch(e) {}
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
