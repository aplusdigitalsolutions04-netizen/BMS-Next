import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { saveUploadedFile, getFirmName } from '@/lib/uploads'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const firmId = searchParams.get('firmId')

    let rows: Record<string, unknown>[]
    if (firmId) {
      rows = await query<Record<string, unknown>>(
        `SELECT t.*, f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode
         FROM template t LEFT JOIN firm f ON t.firmId = f.id
         WHERE t.firmId = ? AND t.isDeleted = 0 ORDER BY t.createdOn DESC`,
        [firmId]
      )
    } else {
      rows = await query<Record<string, unknown>>(
        `SELECT t.*, f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode
         FROM template t LEFT JOIN firm f ON t.firmId = f.id
         WHERE t.isDeleted = 0 ORDER BY t.createdOn DESC`
      )
    }

    const templates = rows.map(r => ({
      ...r,
      firm: r.firm_id ? { id: r.firm_id, name: r.firm_name, firmCode: r.firm_firmCode } : null,
      firm_id: undefined, firm_name: undefined, firm_firmCode: undefined,
    }))

    return NextResponse.json(templates)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const firmId = formData.get('firmId') as string | null
    const name = formData.get('name') as string
    const content = formData.get('content') as string | null
    const createdBy = formData.get('createdBy') as string | null
    const headerFile = formData.get('headerFile') as File | null

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    let headerFileName: string | null = null
    let headerFilePath: string | null = null

    if (headerFile && headerFile.size > 0) {
      const companyName = await getFirmName(firmId)
      const saved = await saveUploadedFile(headerFile, 'headerFile', { folder: 'template', companyName })
      headerFileName = saved.fileName
      headerFilePath = saved.filePath
    }

    const id = crypto.randomUUID()
    await query(
      `INSERT INTO template (id, firmId, name, content, headerFileName, headerFilePath, isActive, createdBy, createdOn, updatedOn)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [id, firmId || null, name, content || null, headerFileName, headerFilePath, createdBy || null]
    )

    const [templateRow] = await query<Record<string, unknown>>(
      `SELECT t.*, f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode
       FROM template t LEFT JOIN firm f ON t.firmId = f.id WHERE t.id = ?`,
      [id]
    )

    return NextResponse.json({
      ...templateRow,
      firm: templateRow.firm_id ? { id: templateRow.firm_id, name: templateRow.firm_name, firmCode: templateRow.firm_firmCode } : null,
      firm_id: undefined, firm_name: undefined, firm_firmCode: undefined,
    }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
