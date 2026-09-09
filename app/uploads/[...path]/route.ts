import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { query } from '@/lib/db'
import { downloadDriveFile } from '@/lib/googleDrive'

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params
    const filePath = path.join(process.cwd(), 'uploads', ...pathSegments)

    // Security: ensure the resolved path is within the uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!filePath.startsWith(uploadsDir)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

    // Pre-migration uploads (and anything the write-through cache below already fetched
    // once) still live on local disk -- serve those directly. Read async: a sync readFileSync
    // here blocks Node's single event loop thread for the whole read (multi-MB PDFs/images),
    // serializing every other request the process is handling at that moment.
    try {
      const file = await fs.promises.readFile(filePath)
      return new NextResponse(new Uint8Array(file), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      // File doesn't exist locally -- fall through to the Drive lookup below.
    }

    // Everything uploaded since the Google Drive migration is looked up here.
    const filename = pathSegments.join('/')
    const rows = await query<{ driveFileId: string; mimetype: string | null }>(
      'SELECT driveFileId, mimetype FROM drive_files WHERE filename = ?',
      [filename]
    )
    if (!rows.length) {
      return new NextResponse('Not found', { status: 404 })
    }

    const buffer = await downloadDriveFile(rows[0].driveFileId)

    // Write-through cache to local disk: Drive stays the source of truth, but every request
    // after the first one for this filename hits the fast local-disk path above instead of
    // round-tripping to the Drive API again.
    fs.promises.mkdir(uploadsDir, { recursive: true })
      .then(() => fs.promises.writeFile(filePath, buffer))
      .catch((err) => console.error(`Failed to cache Drive file "${filename}" to disk:`, err))

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': rows[0].mimetype || contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('GET /uploads/[...path] error:', error)
    return new NextResponse('Server error', { status: 500 })
  }
}
