import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const groups = await query<Record<string, unknown>>(`SELECT * FROM mastergroup ORDER BY code`)
    const allData = await query<Record<string, unknown>>(`SELECT * FROM masterdata WHERE isDeleted = 0 ORDER BY sortOrder ASC`)

    const dataByGroup: Record<string, unknown[]> = {}
    for (const d of allData) {
      const gc = d.groupCode as string
      if (!dataByGroup[gc]) dataByGroup[gc] = []
      dataByGroup[gc].push(d)
    }

    const result = groups.map(g => ({
      ...g,
      masterData: dataByGroup[g.code as string] || [],
    }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch master data' }, { status: 500 })
  }
}
