import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Folders are created explicitly here (before any document is uploaded into them) so they
// show up as choices in the upload form even while still empty -- the "create the folder
// first, then upload into it" flow.

export async function GET(req: NextRequest) {
  try {
    const firmId = req.nextUrl.searchParams.get('firmId')
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })

    const folders = await query<Record<string, unknown>>(
      `SELECT id, firmId, name, createdBy, createdOn FROM document_folder WHERE firmId = ? AND isDeleted = 0 ORDER BY name ASC`,
      [firmId]
    )
    return NextResponse.json(folders)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { firmId, name, createdBy } = await req.json()
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })
    const trimmedName = String(name || '').trim()
    if (!trimmedName) return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })

    const existing = await query<Record<string, unknown>>(
      `SELECT id FROM document_folder WHERE firmId = ? AND isDeleted = 0 AND LOWER(name) = LOWER(?)`,
      [firmId, trimmedName]
    )
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A folder with this name already exists for this firm' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    await query(
      `INSERT INTO document_folder (id, firmId, name, createdBy) VALUES (?, ?, ?, ?)`,
      [id, firmId, trimmedName, createdBy || 'system']
    )
    const [folder] = await query<Record<string, unknown>>(
      `SELECT id, firmId, name, createdBy, createdOn FROM document_folder WHERE id = ?`,
      [id]
    )
    return NextResponse.json(folder, { status: 201 })
  } catch (error) {
    console.error('[POST /api/document-folders] failed:', error)
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }
}
