import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'
import { saveUploadedFile, getFirmName } from '@/lib/uploads'

export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(`
      SELECT
        d.*,
        f.id AS firm_id, f.name AS firm_name, f.firmCode AS firm_firmCode,
        dm.id AS meta_id, dm.categoryCode, dm.departmentCode, dm.statusCode,
        dm.description, dm.keywords, dm.fileName, dm.fileSize, dm.fileType,
        dm.tags, dm.filePath, dm.uploadedBy, dm.uploadDate, dm.version, dm.folderName,
        dm.approvalStatus, dm.approvedBy, dm.approvedOn, dm.approvalNote,
        cat.value AS cat_value, dept.value AS dept_value, stat.value AS stat_value,
        bd.gemOrderId
      FROM document d
      LEFT JOIN firm f ON d.firmId = f.id
      LEFT JOIN documentmeta dm ON dm.documentId = d.id
      LEFT JOIN biddocument bd ON d.bidDocumentId = bd.id
      LEFT JOIN masterdata cat ON dm.categoryCode = cat.code
      LEFT JOIN masterdata dept ON dm.departmentCode = dept.code
      LEFT JOIN masterdata stat ON dm.statusCode = stat.code
      WHERE d.isDeleted = 0
      ORDER BY d.createdOn DESC
      LIMIT 1000
    `)

    const documents = rows.map(row => ({
      id: row.id,
      firmId: row.firmId,
      title: row.title,
      documentNumber: row.documentNumber,
      issueDate: row.issueDate,
      expiryDate: row.expiryDate,
      isArchived: !!row.isArchived,
      isDeleted: !!row.isDeleted,
      createdOn: row.createdOn,
      bidDocumentId: row.bidDocumentId || null,
      gemOrderId: row.gemOrderId || null,
      firm: row.firm_id ? { id: row.firm_id, name: row.firm_name, firmCode: row.firm_firmCode } : null,
      meta: row.meta_id ? {
        id: row.meta_id,
        documentId: row.id,
        categoryCode: row.categoryCode,
        departmentCode: row.departmentCode,
        statusCode: row.statusCode,
        description: row.description,
        keywords: row.keywords,
        fileName: row.fileName,
        fileSize: row.fileSize,
        fileType: row.fileType,
        tags: row.tags,
        filePath: row.filePath,
        uploadedBy: row.uploadedBy,
        uploadDate: row.uploadDate,
        version: row.version,
        folderName: row.folderName || null,
        approvalStatus: row.approvalStatus || 'APPROVED',
        approvedBy: row.approvedBy,
        approvedOn: row.approvedOn,
        approvalNote: row.approvalNote,
        category: row.categoryCode ? { code: row.categoryCode, value: row.cat_value } : null,
        department: row.departmentCode ? { code: row.departmentCode, value: row.dept_value } : null,
        status: row.statusCode ? { code: row.statusCode, value: row.stat_value } : null,
      } : null,
    }))

    return NextResponse.json(documents)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const firmId = formData.get('firmId') as string | null
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
    const bidDocumentId = formData.get('bidDocumentId') as string | null
    const folderName = formData.get('folderName') as string | null

    if (!title) {
      return NextResponse.json({ error: 'title is required.' }, { status: 400 })
    }
    if (!firmId && !bidDocumentId) {
      return NextResponse.json({ error: 'firmId is required when not uploading against a bid.' }, { status: 400 })
    }

    const safeCategoryCode = categoryCode && categoryCode !== '' ? categoryCode : null
    const safeDepartmentCode = departmentCode && departmentCode !== '' ? departmentCode : null
    const safeStatusCode = statusCode && statusCode !== '' ? statusCode : null
    const safeFolderName = folderName && folderName.trim() !== '' ? folderName.trim() : null

    let fileName = null, fileSize = null, fileType = null, filePath = null
    if (file && file.size > 0) {
      const companyName = await getFirmName(firmId)
      const saved = await saveUploadedFile(file, 'file', { folder: 'document', companyName, subFolder: safeFolderName })
      fileName = saved.fileName
      fileSize = saved.fileSize
      fileType = saved.fileType
      filePath = saved.filePath
    }

    const docId = crypto.randomUUID()
    const metaId = crypto.randomUUID()
    const safeIssueDate = issueDate && issueDate !== 'null' ? new Date(issueDate) : null
    const safeExpiryDate = expiryDate && expiryDate !== 'null' ? new Date(expiryDate) : null

    await query(
      `INSERT INTO document (id, firmId, title, documentNumber, issueDate, expiryDate, isArchived, isDeleted, bidDocumentId, createdOn) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, NOW())`,
      [docId, firmId, title, documentNumber, safeIssueDate, safeExpiryDate, bidDocumentId || null]
    )
    // Documents uploaded against a bid need manager approval (auto-removed after 2 days if
    // untouched); plain company documents go straight to APPROVED.
    const initialApprovalStatus = bidDocumentId ? 'PENDING' : 'APPROVED'

    await query(
      `INSERT INTO documentmeta (id, documentId, categoryCode, departmentCode, statusCode, description, keywords, fileName, fileSize, fileType, tags, filePath, uploadedBy, uploadDate, version, approvalStatus, folderName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?, ?)`,
      [metaId, docId, safeCategoryCode, safeDepartmentCode, safeStatusCode, description, keywords, fileName, fileSize, fileType, tags, filePath, uploadedBy || 'system', initialApprovalStatus, safeFolderName]
    )

    // Fire-and-forget notification
    ;(async () => {
      try {
        const context = firmId
          ? (await query<Record<string, unknown>>(`SELECT name FROM firm WHERE id = ?`, [firmId]))[0]?.name || ''
          : (bidDocumentId ? `Bid #${bidDocumentId.slice(0, 8)}` : '')
        if (initialApprovalStatus === 'PENDING') {
          await query(
            `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
            [crypto.randomUUID(), 'Document Pending Approval', `Document '${title}'${context ? ` for ${context}` : ''} uploaded by ${uploadedBy || 'a user'} needs approval within 2 days or it will be auto-removed.`, 'warning']
          )
          dispatchNotification('Document Pending Approval', `Document '${title}'${context ? ` for ${context}` : ''} needs your approval within 2 days.`, uploadedBy)
        } else {
          await query(
            `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
            [crypto.randomUUID(), 'Document Uploaded', `Document '${title}'${context ? ` for ${context}` : ''} was uploaded by ${uploadedBy || 'a user'}.`, 'success']
          )
          dispatchNotification('Document Uploaded', `Document '${title}'${context ? ` for ${context}` : ''} was uploaded.`, uploadedBy)
        }
      } catch (err) {
        console.error('Document upload notification failed:', err)
      }
    })()

    const [docRow] = await query<Record<string, unknown>>(
      `SELECT d.*, dm.id AS meta_id, dm.categoryCode, dm.departmentCode, dm.statusCode, dm.description, dm.keywords, dm.fileName, dm.fileSize, dm.fileType, dm.tags, dm.filePath, dm.uploadedBy, dm.uploadDate, dm.version, dm.folderName, dm.approvalStatus, dm.approvedBy, dm.approvedOn, dm.approvalNote,
        cat.value AS cat_value, dept.value AS dept_value, stat.value AS stat_value
       FROM document d
       LEFT JOIN documentmeta dm ON dm.documentId = d.id
       LEFT JOIN masterdata cat ON dm.categoryCode = cat.code
       LEFT JOIN masterdata dept ON dm.departmentCode = dept.code
       LEFT JOIN masterdata stat ON dm.statusCode = stat.code
       WHERE d.id = ?`,
      [docId]
    )

    const document = {
      ...docRow,
      isArchived: !!docRow?.isArchived,
      isDeleted: !!docRow?.isDeleted,
      meta: docRow?.meta_id ? {
        id: docRow.meta_id,
        documentId: docId,
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
        folderName: docRow.folderName || null,
        approvalStatus: docRow.approvalStatus || 'APPROVED',
        approvedBy: docRow.approvedBy,
        approvedOn: docRow.approvedOn,
        approvalNote: docRow.approvalNote,
        category: docRow.categoryCode ? { code: docRow.categoryCode, value: docRow.cat_value } : null,
        department: docRow.departmentCode ? { code: docRow.departmentCode, value: docRow.dept_value } : null,
        status: docRow.statusCode ? { code: docRow.statusCode, value: docRow.stat_value } : null,
      } : null,
    }

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Document creation error:', error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
