import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'
import { saveUploadedFile, getFirmName } from '@/lib/uploads'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await req.formData()

    const firmId = formData.get('firmId') as string
    const title = formData.get('title') as string
    const documentNumber = formData.get('documentNumber') as string
    const issueDate = formData.get('issueDate') as string | null
    const expiryDate = formData.get('expiryDate') as string | null
    const categoryCode = formData.get('categoryCode') as string | null
    const departmentCode = formData.get('departmentCode') as string | null
    const statusCode = formData.get('statusCode') as string | null
    const description = formData.get('description') as string | null
    const keywords = formData.get('keywords') as string | null
    const uploadedBy = formData.get('uploadedBy') as string | null
    const tags = formData.get('tags') as string | null
    const file = formData.get('file') as File | null

    const safeCategoryCode = categoryCode && categoryCode !== '' ? categoryCode : null
    const safeDepartmentCode = departmentCode && departmentCode !== '' ? departmentCode : null
    const safeStatusCode = statusCode && statusCode !== '' ? statusCode : null

    const safeIssueDate = issueDate && issueDate !== 'null' ? new Date(issueDate) : null
    const safeExpiryDate = expiryDate && expiryDate !== 'null' ? new Date(expiryDate) : null

    await query(
      `UPDATE document SET firmId=?, title=?, documentNumber=?, issueDate=?, expiryDate=? WHERE id=?`,
      [firmId, title, documentNumber, safeIssueDate, safeExpiryDate, id]
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaFields: Record<string, any> = {
      categoryCode: safeCategoryCode,
      departmentCode: safeDepartmentCode,
      statusCode: safeStatusCode,
      description,
      keywords,
      tags,
      uploadedBy,
    }

    if (file && file.size > 0) {
      const companyName = await getFirmName(firmId)
      const saved = await saveUploadedFile(file, 'file', { folder: 'document', companyName })
      metaFields.fileName = saved.fileName
      metaFields.fileSize = saved.fileSize
      metaFields.fileType = saved.fileType
      metaFields.filePath = saved.filePath
    }

    const setClauses = Object.keys(metaFields).map(k => `${k}=?`).join(', ')
    const metaValues = [...Object.values(metaFields), id]
    await query(`UPDATE documentmeta SET ${setClauses} WHERE documentId=?`, metaValues)

    const [docRow] = await query<Record<string, unknown>>(
      `SELECT d.*,
        f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode,
        dm.id AS meta_id, dm.categoryCode, dm.departmentCode, dm.statusCode,
        dm.description, dm.keywords, dm.fileName, dm.fileSize, dm.fileType,
        dm.tags, dm.filePath, dm.uploadedBy, dm.uploadDate, dm.version,
        dm.approvalStatus, dm.approvedBy, dm.approvedOn, dm.approvalNote,
        cat.value AS cat_value, dept.value AS dept_value, stat.value AS stat_value
       FROM document d
       LEFT JOIN firm f ON d.firmId = f.id
       LEFT JOIN documentmeta dm ON dm.documentId = d.id
       LEFT JOIN masterdata cat ON dm.categoryCode = cat.code
       LEFT JOIN masterdata dept ON dm.departmentCode = dept.code
       LEFT JOIN masterdata stat ON dm.statusCode = stat.code
       WHERE d.id = ?`,
      [id]
    )

    const document = {
      ...docRow,
      isArchived: !!docRow?.isArchived,
      isDeleted: !!docRow?.isDeleted,
      firm: docRow?.firm_id ? { id: docRow.firm_id, name: docRow.firm_name, firmCode: docRow.firm_firmCode } : null,
      meta: docRow?.meta_id ? {
        id: docRow.meta_id,
        documentId: id,
        categoryCode: docRow.categoryCode,
        departmentCode: docRow.departmentCode,
        statusCode: docRow.statusCode,
        description: docRow.description,
        keywords: docRow.keywords,
        fileName: docRow.fileName,
        fileSize: docRow.fileSize,
        fileType: docRow.fileType,
        tags: docRow.tags,
        filePath: docRow.filePath,
        uploadedBy: docRow.uploadedBy,
        uploadDate: docRow.uploadDate,
        version: docRow.version,
        approvalStatus: docRow.approvalStatus || 'APPROVED',
        approvedBy: docRow.approvedBy,
        approvedOn: docRow.approvedOn,
        approvalNote: docRow.approvalNote,
        category: docRow.categoryCode ? { code: docRow.categoryCode, value: docRow.cat_value } : null,
        department: docRow.departmentCode ? { code: docRow.departmentCode, value: docRow.dept_value } : null,
        status: docRow.statusCode ? { code: docRow.statusCode, value: docRow.stat_value } : null,
      } : null,
    }

    return NextResponse.json(document)
  } catch (error) {
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [doc] = await query<Record<string, unknown>>(
      `SELECT d.title, dm.uploadedBy FROM document d LEFT JOIN documentmeta dm ON dm.documentId = d.id WHERE d.id = ?`,
      [id]
    )
    await query(`UPDATE document SET isDeleted = 1 WHERE id = ?`, [id])

    if (doc) {
      query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
        [crypto.randomUUID(), 'Document Deleted', `Document '${doc.title}' was permanently deleted.`, 'warning']
      ).catch(() => {})
      dispatchNotification('Document Deleted', `Document '${doc.title}' was permanently deleted.`, doc.uploadedBy as string | undefined)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
