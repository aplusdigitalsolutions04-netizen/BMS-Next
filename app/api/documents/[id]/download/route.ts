import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { query } from '@/lib/db'
import { readUploadedFileBuffer } from '@/lib/uploads'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await query<Record<string, unknown>>(
      `SELECT filePath, fileName, fileType FROM documentmeta WHERE documentId = ?`,
      [id]
    )
    const docMeta = rows[0]
    if (!docMeta?.filePath) return new NextResponse('No file attached', { status: 404 })

    const file = await readUploadedFileBuffer(path.basename(docMeta.filePath as string))
    if (!file) return new NextResponse('File not found', { status: 404 })

    const fileName = (docMeta.fileName as string) || 'download'

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': (docMeta.fileType as string) || 'application/octet-stream',
      },
    })
  } catch {
    return new NextResponse('Download failed', { status: 500 })
  }
}
