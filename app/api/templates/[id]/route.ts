import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { saveUploadedFile, getFirmName } from '@/lib/uploads'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await req.formData()
    const firmId = formData.get('firmId') as string | null
    const name = formData.get('name') as string
    const content = formData.get('content') as string | null
    const isActiveRaw = formData.get('isActive')
    const removeHeader = formData.get('removeHeader') as string | null
    const headerFile = formData.get('headerFile') as File | null

    const isActive = isActiveRaw !== undefined ? isActiveRaw === 'true' : true

    const setParts: string[] = ['firmId=?', 'name=?', 'content=?', 'isActive=?', 'updatedOn=NOW()']
    const setValues: unknown[] = [firmId || null, name, content || null, isActive ? 1 : 0]

    if (headerFile && headerFile.size > 0) {
      const companyName = await getFirmName(firmId)
      const saved = await saveUploadedFile(headerFile, 'headerFile', { folder: 'template', companyName })
      setParts.push('headerFileName=?', 'headerFilePath=?')
      setValues.push(saved.fileName, saved.filePath)
    } else if (removeHeader === 'true') {
      setParts.push('headerFileName=?', 'headerFilePath=?')
      setValues.push(null, null)
    }

    setValues.push(id)
    await query(`UPDATE template SET ${setParts.join(', ')} WHERE id=?`, setValues)

    const [templateRow] = await query<Record<string, unknown>>(
      `SELECT t.*, f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode
       FROM template t LEFT JOIN firm f ON t.firmId = f.id WHERE t.id = ?`,
      [id]
    )

    return NextResponse.json({
      ...templateRow,
      firm: templateRow.firm_id ? { id: templateRow.firm_id, name: templateRow.firm_name, firmCode: templateRow.firm_firmCode } : null,
      firm_id: undefined, firm_name: undefined, firm_firmCode: undefined,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query(`UPDATE template SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
