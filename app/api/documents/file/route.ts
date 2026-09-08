import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { UPLOADS_DIR, updateUploadedFileContent } from '@/lib/uploads'

export async function PUT(req: NextRequest) {
  try {
    const { fileName, content } = await req.json()

    if (!fileName || !content) {
      return NextResponse.json({ error: 'fileName and content required' }, { status: 400 })
    }

    // Security: prevent path traversal
    const safe = path.basename(fileName)
    if (!safe.startsWith('generated_') || !safe.endsWith('.html')) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
    }

    const buffer = Buffer.from(content, 'utf8')
    await updateUploadedFileContent(safe, buffer, 'text/html')

    // The /uploads serving route write-through-caches Drive files to local disk on first
    // read -- refresh that cache copy too (or drop it) so a stale pre-edit version doesn't
    // keep being served instead of the content just saved.
    const filePath = path.join(UPLOADS_DIR, safe)
    fs.writeFile(filePath, buffer, () => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('File update error:', error)
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 })
  }
}
