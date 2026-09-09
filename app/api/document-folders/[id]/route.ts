import { NextRequest, NextResponse } from 'next/server'
import { query, withTransaction } from '@/lib/db'
import { getFirmName, renameUploadedFolder } from '@/lib/uploads'

// Loads every non-deleted folder for a firm and resolves one folder's ancestor chain -- used
// by both PATCH (to compute the old/new full path for cascading the rename onto documents and
// Drive) and DELETE (to compute the path documents must not still reference).
async function resolveFolder(firmId: string, folderId: string) {
  const rows = await query<{ id: string; name: string; parentFolderId: string | null; clientCode: string | null }>(
    `SELECT id, name, parentFolderId, clientCode FROM document_folder WHERE firmId = ? AND isDeleted = 0`,
    [firmId]
  )
  const byId = new Map(rows.map(r => [r.id, r]))
  const folder = byId.get(folderId)
  if (!folder) return null

  const ancestorNames: string[] = []
  let cur = folder.parentFolderId ? byId.get(folder.parentFolderId) : undefined
  while (cur) {
    ancestorNames.unshift(cur.name)
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
  }
  const parentPath = ancestorNames.join('/')
  const path = parentPath ? `${parentPath}/${folder.name}` : folder.name
  return { folder, ancestorNames, parentPath, path }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { firmId, name, clientCode } = await req.json()
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })

    const resolved = await resolveFolder(firmId, id)
    if (!resolved) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    const { folder, parentPath, path: oldPath } = resolved

    const trimmedName = name !== undefined ? String(name).trim() : folder.name
    if (!trimmedName) return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
    if (trimmedName.includes('/')) {
      return NextResponse.json({ error: 'Folder name cannot contain "/"' }, { status: 400 })
    }
    const newClientCode = clientCode !== undefined ? (clientCode ? String(clientCode) : null) : folder.clientCode

    if (trimmedName.toLowerCase() !== folder.name.toLowerCase()) {
      const existing = await query<Record<string, unknown>>(
        folder.parentFolderId
          ? `SELECT id FROM document_folder WHERE firmId = ? AND isDeleted = 0 AND id != ? AND LOWER(name) = LOWER(?) AND parentFolderId = ?`
          : `SELECT id FROM document_folder WHERE firmId = ? AND isDeleted = 0 AND id != ? AND LOWER(name) = LOWER(?) AND parentFolderId IS NULL`,
        folder.parentFolderId ? [firmId, id, trimmedName, folder.parentFolderId] : [firmId, id, trimmedName]
      )
      if (existing.length > 0) {
        return NextResponse.json({ error: 'A folder with this name already exists here' }, { status: 409 })
      }
    }

    const newPath = parentPath ? `${parentPath}/${trimmedName}` : trimmedName

    await withTransaction(async (exec) => {
      await exec(`UPDATE document_folder SET name = ?, clientCode = ? WHERE id = ?`, [trimmedName, newClientCode, id])

      if (newPath !== oldPath) {
        // Documents filed directly in this folder.
        await exec(
          `UPDATE documentmeta dm JOIN document d ON d.id = dm.documentId
           SET dm.folderName = ? WHERE d.firmId = ? AND dm.folderName = ?`,
          [newPath, firmId, oldPath]
        )
        // Documents filed in any subfolder of this one -- their stored path carries the old
        // prefix too (e.g. renaming "Compliance" to "Compliance 2024" must also turn
        // "Compliance/2024" into "Compliance 2024/2024").
        await exec(
          `UPDATE documentmeta dm JOIN document d ON d.id = dm.documentId
           SET dm.folderName = CONCAT(?, SUBSTRING(dm.folderName, ?))
           WHERE d.firmId = ? AND dm.folderName LIKE ?`,
          [newPath, oldPath.length + 1, firmId, `${oldPath}/%`]
        )
      }
    })

    // Best-effort: keep the actual Drive folder name in sync so it doesn't silently drift
    // from what the app shows. Never fails the request -- the DB rename (and the documents
    // still being findable via their own Drive file ids) already succeeded either way.
    if (newPath !== oldPath) {
      try {
        const companyName = await getFirmName(firmId)
        await renameUploadedFolder(companyName, parentPath || null, folder.name, trimmedName)
      } catch (err) {
        console.error('[PATCH /api/document-folders/[id]] Drive rename failed:', err)
      }
    }

    return NextResponse.json({ id, firmId, name: trimmedName, parentFolderId: folder.parentFolderId, clientCode: newClientCode })
  } catch (error) {
    console.error('[PATCH /api/document-folders/[id]] failed:', error)
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const firmId = req.nextUrl.searchParams.get('firmId')
    if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })

    const resolved = await resolveFolder(firmId, id)
    if (!resolved) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    const { path } = resolved

    // Deleting a folder never deletes documents -- rather than silently orphaning or
    // cascading, require it to be empty first (no subfolders, no documents filed directly in
    // it) so nothing about a document's folder assignment changes without the user seeing it.
    const [subfolderRows, docRows] = await Promise.all([
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM document_folder WHERE parentFolderId = ? AND isDeleted = 0`,
        [id]
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM documentmeta dm JOIN document d ON d.id = dm.documentId
         WHERE d.firmId = ? AND d.isDeleted = 0 AND dm.folderName = ?`,
        [firmId, path]
      ),
    ])
    if (Number(subfolderRows[0]?.count) > 0) {
      return NextResponse.json({ error: 'This folder still has subfolders -- delete or move those first' }, { status: 409 })
    }
    if (Number(docRows[0]?.count) > 0) {
      return NextResponse.json({ error: 'This folder still has documents in it -- move or delete those first' }, { status: 409 })
    }

    await query(`UPDATE document_folder SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/document-folders/[id]] failed:', error)
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 })
  }
}
