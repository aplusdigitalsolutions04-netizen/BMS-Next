import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Folders are created explicitly here (before any document is uploaded into them) so they
// show up as choices in the upload form even while still empty -- the "create the folder
// first, then upload into it" flow. A folder can nest inside another folder (parentFolderId),
// so the response is a flat list the client assembles into a tree using parentFolderId.

export async function GET(req: NextRequest) {
  try {
    const firmId = req.nextUrl.searchParams.get('firmId')
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })

    const folders = await query<Record<string, unknown>>(
      `SELECT f.id, f.firmId, f.name, f.parentFolderId, f.clientCode, f.createdBy, f.createdOn,
              md.value AS clientName
       FROM document_folder f
       LEFT JOIN masterdata md ON md.code COLLATE utf8mb4_general_ci = f.clientCode COLLATE utf8mb4_general_ci
       WHERE f.firmId = ? AND f.isDeleted = 0 ORDER BY f.name ASC`,
      [firmId]
    )
    return NextResponse.json(folders)
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { firmId, name, parentFolderId, clientCode, createdBy } = await req.json()
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })
    const trimmedName = String(name || '').trim()
    if (!trimmedName) return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
    // "/" is the path separator used to store a document's folder location (see folderName on
    // documentmeta) and Drive folder names can't contain it either, so reject it in the name
    // itself rather than silently mangling it into a nested path no one asked for.
    if (trimmedName.includes('/')) {
      return NextResponse.json({ error: 'Folder name cannot contain "/"' }, { status: 400 })
    }

    const parentId = parentFolderId ? String(parentFolderId) : null
    let resolvedClientCode = clientCode ? String(clientCode) : null
    if (parentId) {
      const parentRows = await query<{ clientCode: string | null }>(
        `SELECT clientCode FROM document_folder WHERE id = ? AND firmId = ? AND isDeleted = 0`,
        [parentId, firmId]
      )
      if (parentRows.length === 0) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 })
      }
      // A subfolder created without its own client explicitly picked inherits the parent
      // folder's client -- a folder tagged "Client A" is meant to hold only that client's
      // documents, so its subfolders default to the same scope rather than "no client".
      if (!resolvedClientCode && parentRows[0].clientCode) resolvedClientCode = parentRows[0].clientCode
    }

    // Sibling folders (same parent) can't share a name -- but the same name is fine under a
    // different parent, e.g. "2024" inside both "Compliance" and "Contracts".
    const existing = await query<Record<string, unknown>>(
      parentId
        ? `SELECT id FROM document_folder WHERE firmId = ? AND isDeleted = 0 AND LOWER(name) = LOWER(?) AND parentFolderId = ?`
        : `SELECT id FROM document_folder WHERE firmId = ? AND isDeleted = 0 AND LOWER(name) = LOWER(?) AND parentFolderId IS NULL`,
      parentId ? [firmId, trimmedName, parentId] : [firmId, trimmedName]
    )
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A folder with this name already exists here' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    await query(
      `INSERT INTO document_folder (id, firmId, name, parentFolderId, clientCode, createdBy) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, firmId, trimmedName, parentId, resolvedClientCode, createdBy || 'system']
    )
    const [folder] = await query<Record<string, unknown>>(
      `SELECT f.id, f.firmId, f.name, f.parentFolderId, f.clientCode, f.createdBy, f.createdOn,
              md.value AS clientName
       FROM document_folder f
       LEFT JOIN masterdata md ON md.code COLLATE utf8mb4_general_ci = f.clientCode COLLATE utf8mb4_general_ci
       WHERE f.id = ?`,
      [id]
    )
    return NextResponse.json(folder, { status: 201 })
  } catch (error) {
    console.error('[POST /api/document-folders] failed:', error)
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }
}
