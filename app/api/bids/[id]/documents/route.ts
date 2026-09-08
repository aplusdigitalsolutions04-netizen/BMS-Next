import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await query<Record<string, unknown>>(`
      SELECT d.id, d.title, d.firmId, d.createdOn,
        dm.fileName, dm.fileSize, dm.fileType, dm.filePath, dm.uploadedBy, dm.uploadDate,
        dm.approvalStatus,
        f.name AS firmName
      FROM document d
      LEFT JOIN documentmeta dm ON dm.documentId = d.id
      LEFT JOIN firm f ON f.id = d.firmId
      WHERE d.bidDocumentId = ? AND d.isDeleted = 0
      ORDER BY d.createdOn DESC
    `, [id])
    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET bid documents error:', error)
    return NextResponse.json({ error: 'Failed to fetch bid documents' }, { status: 500 })
  }
}
