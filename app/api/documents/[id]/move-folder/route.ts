import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getFirmName, moveUploadedFileFolder } from '@/lib/uploads'

// Moves a document to a different folder (or out of any folder, folderName: null) within its
// own firm -- updates the DB record and, if a file is attached, actually relocates it in
// Google Drive too so the two never drift apart.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { folderName } = await req.json()
    const safeFolderName = folderName && String(folderName).trim() !== '' ? String(folderName).trim() : null

    const [doc] = await query<{ firmId: string | null; fileName: string | null }>(
      `SELECT d.firmId, dm.fileName FROM document d LEFT JOIN documentmeta dm ON dm.documentId = d.id WHERE d.id = ?`,
      [id]
    )
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Move the Drive file BEFORE updating the DB record -- these two steps can't be one atomic
    // transaction (Drive is a separate system), so ordering matters: if the Drive move fails
    // (revoked token, quota, transient error), failing here means the DB still reflects
    // reality (old folder) instead of claiming a move that never actually happened.
    if (doc.fileName && doc.firmId) {
      const companyName = await getFirmName(doc.firmId)
      await moveUploadedFileFolder(doc.fileName, 'document', companyName, safeFolderName)
    }

    await query(`UPDATE documentmeta SET folderName = ? WHERE documentId = ?`, [safeFolderName, id])

    return NextResponse.json({ success: true, folderName: safeFolderName })
  } catch (error) {
    console.error('[PATCH /api/documents/[id]/move-folder] failed:', error)
    return NextResponse.json({ error: 'Failed to move document' }, { status: 500 })
  }
}
