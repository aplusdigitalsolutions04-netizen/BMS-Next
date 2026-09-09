import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST() {
  try {
    const groups = ['FIRM_TYPE', 'DOC_CATEGORY', 'DOC_DEPARTMENT', 'DOC_STATUS', 'ROLES', 'DOC_TAG']
    for (const code of groups) {
      const existing = await query<Record<string, unknown>>(`SELECT code FROM mastergroup WHERE code = ?`, [code])
      if (existing.length === 0) {
        await query(
          `INSERT INTO mastergroup (code, name) VALUES (?, ?)`,
          [code, code.replace('_', ' ')]
        )
      }
    }
    return NextResponse.json({ message: 'Master groups seeded successfully' })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to seed master groups' }, { status: 500 })
  }
}
