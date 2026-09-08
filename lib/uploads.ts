import fs from 'fs'
import path from 'path'
import { query } from './db'
import { uploadFileToDrive, deleteDriveFile, downloadDriveFile, updateDriveFileContent, findOrCreateFolder } from './googleDrive'

// Kept only so pre-migration files that are still sitting on local disk keep working (the
// serving route below falls back to this dir before checking Drive). New uploads never write
// here anymore -- everything now goes to Google Drive, see saveUploadedFile.
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

// Small helper so every firm-scoped upload route doesn't repeat the same lookup --
// resolves a firmId to the plain name saveUploadedFile/saveBufferAsUpload nest folders under.
export async function getFirmName(firmId: string | null | undefined): Promise<string | null> {
  if (!firmId) return null
  const rows = await query<{ name: string }>('SELECT name FROM firm WHERE id = ?', [firmId])
  return rows[0]?.name || null
}

function sanitizeFilename(name: string): string {
  return String(name || 'file').replace(/[^\w.\- ()]/g, '_')
}

// Drive folder names can't contain "/" and shouldn't have leading/trailing whitespace -- a
// firm named "A/B Traders" would otherwise silently create a nested "A" > "B Traders" pair.
function sanitizeFolderName(name: string): string {
  return String(name || '').replace(/[\\/]/g, '-').trim()
}

// Drive subfolder each doc type is filed under, keyed by the `folder` option callers pass to
// saveUploadedFile/saveBufferAsUpload.
const DRIVE_FOLDERS: Record<string, string> = {
  document: 'Documents',
  generatedDoc: 'Contracts',
  template: 'Templates',
  bidPdf: 'Bid PDFs',
}

// Firm-scoped doc types nest one level deeper: <Firm Name>/Documents, <Firm Name>/Contracts,
// <Firm Name>/Templates. Bid PDFs stay a flat top-level folder -- a bid isn't tied to a firm
// until later (a vendor responds to it), so there's no firm to nest it under at upload time.
const FIRM_SCOPED_FOLDERS = new Set(['document', 'generatedDoc', 'template'])

async function resolveParentFolderId(folder?: string, companyName?: string | null): Promise<string | undefined> {
  const folderName = folder && DRIVE_FOLDERS[folder]
  if (!folderName) return undefined
  if (companyName && folder && FIRM_SCOPED_FOLDERS.has(folder)) {
    const firmFolderId = await findOrCreateFolder(sanitizeFolderName(companyName))
    return findOrCreateFolder(folderName, firmFolderId)
  }
  return findOrCreateFolder(folderName)
}

// Same filename convention the old disk-storage version used -- every caller stores this
// string in the DB and builds `/uploads/${filename}` URLs from it, so keeping the shape
// unchanged means none of those callers need to change beyond adding `folder`/`companyName`.
// The file itself now lives in Google Drive; the `drive_files` table maps this filename to
// its Drive file ID. `folder` is one of DRIVE_FOLDERS' keys; `companyName` (the firm's name)
// nests it under that firm's own folder for the doc types in FIRM_SCOPED_FOLDERS.
export async function saveUploadedFile(
  file: File,
  fieldName: string,
  options: { folder?: string; companyName?: string | null } = {}
): Promise<{ fileName: string; filePath: string; fileSize: number; fileType: string }> {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  const safe = sanitizeFilename(file.name)
  const ext = path.extname(safe)
  const saveName = fieldName ? `${fieldName}-${unique}${ext}` : `${unique}-${safe}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await saveBufferAsUpload(buffer, saveName, file.type, options.folder, options.companyName)

  return {
    fileName: file.name,
    filePath: `/uploads/${saveName}`,
    fileSize: file.size,
    fileType: file.type,
  }
}

// Uploads a raw buffer to Drive under an already-decided filename and records it in
// `drive_files`. Used by saveUploadedFile above, and by callers that build a file
// server-side (e.g. a generated document's HTML) rather than receiving it from formData.
export async function saveBufferAsUpload(buffer: Buffer, filename: string, mimetype?: string, folder?: string, companyName?: string | null) {
  const parentFolderId = await resolveParentFolderId(folder, companyName)
  const driveFile = await uploadFileToDrive(buffer, filename, mimetype, parentFolderId)
  await query(
    'INSERT INTO drive_files (filename, driveFileId, mimetype, size) VALUES (?, ?, ?, ?)',
    [filename, driveFile.id, mimetype || null, buffer.length]
  )
  return { filename, size: buffer.length, mimetype }
}

// Overwrites a previously-uploaded file's content in place (same filename, same Drive file
// ID) -- used when a generated document is re-saved after editing.
export async function updateUploadedFileContent(filename: string, buffer: Buffer, mimetype?: string) {
  const safeName = path.basename(filename)
  const rows = await query<{ driveFileId: string }>('SELECT driveFileId FROM drive_files WHERE filename = ?', [safeName])
  if (!rows.length) {
    throw new Error(`No uploaded file found for "${safeName}"`)
  }
  await updateDriveFileContent(rows[0].driveFileId, buffer, mimetype)
  await query('UPDATE drive_files SET mimetype = ?, size = ? WHERE filename = ?', [mimetype || null, buffer.length, safeName])
}

// Best-effort cleanup for a file previously stored via saveUploadedFile. Never throws: a
// missed cleanup just leaves an orphaned Drive file, far less bad than failing the request
// that's replacing it.
export async function deleteUploadedFile(filename: string | null | undefined) {
  if (!filename) return
  const safeName = path.basename(filename)
  try {
    const filePath = path.join(UPLOADS_DIR, safeName)
    if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {})
    }
    const rows = await query<{ driveFileId: string }>('SELECT driveFileId FROM drive_files WHERE filename = ?', [safeName])
    if (rows.length) {
      await deleteDriveFile(rows[0].driveFileId).catch(() => {})
      await query('DELETE FROM drive_files WHERE filename = ?', [safeName])
    }
  } catch {
    // ignore -- best-effort
  }
}

// Reads a previously-uploaded file's bytes wherever it actually lives -- local disk for
// pre-migration uploads, Drive for everything since. Used by server code that needs the raw
// bytes directly (e.g. embedding a header image into a generated document, or parsing an
// uploaded PDF), as opposed to just proxying it to a browser. Returns null if not found.
export async function readUploadedFileBuffer(filename: string | null | undefined): Promise<Buffer | null> {
  if (!filename) return null
  const safeName = path.basename(filename)
  const filePath = path.join(UPLOADS_DIR, safeName)
  if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
    return fs.promises.readFile(filePath)
  }

  const rows = await query<{ driveFileId: string }>('SELECT driveFileId FROM drive_files WHERE filename = ?', [safeName])
  if (!rows.length) return null
  return downloadDriveFile(rows[0].driveFileId)
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ({
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html',
  } as Record<string, string>)[ext] || 'application/octet-stream'
}

// Backfills the local uploads/ folder into Drive: for every filename the DB already
// references (documentmeta, template, biddocument), checks whether it's still sitting in
// UPLOADS_DIR from before Drive was connected, and if so uploads it to the matching
// firm-scoped Drive folder. Safe to re-run -- anything already in drive_files is skipped.
// Local files are never deleted (kept as the disk-cache fallback the serving route uses).
export async function migrateLocalFilesToDrive() {
  type Source = { filename: string | null; folder: string; firmName: string | null }
  const sources: Source[] = []

  const docs = await query<{ fileName: string | null; firmName: string | null }>(`
    SELECT dm.fileName, f.name AS firmName
    FROM documentmeta dm
    LEFT JOIN document d ON d.id = dm.documentId
    LEFT JOIN firm f ON f.id = d.firmId
  `)
  for (const d of docs) {
    if (!d.fileName) continue
    sources.push({
      filename: d.fileName,
      folder: d.fileName.startsWith('generated_') ? 'generatedDoc' : 'document',
      firmName: d.firmName,
    })
  }

  const templates = await query<{ headerFileName: string | null; firmName: string | null }>(`
    SELECT t.headerFileName, f.name AS firmName FROM template t LEFT JOIN firm f ON f.id = t.firmId
  `)
  for (const t of templates) {
    if (t.headerFileName) sources.push({ filename: t.headerFileName, folder: 'template', firmName: t.firmName })
  }

  const bids = await query<{ fileName: string | null }>(`SELECT fileName FROM biddocument`)
  for (const b of bids) {
    if (b.fileName) sources.push({ filename: b.fileName, folder: 'bidPdf', firmName: null })
  }

  const localFiles = fs.existsSync(UPLOADS_DIR) ? new Set(fs.readdirSync(UPLOADS_DIR)) : new Set<string>()
  const toMigrate = sources.filter((s) => s.filename && localFiles.has(s.filename))

  const alreadyDone = await query<{ filename: string }>('SELECT filename FROM drive_files')
  const alreadyDoneSet = new Set(alreadyDone.map((r) => r.filename))

  let migrated = 0
  let skipped = 0
  const failed: { filename: string; error: string }[] = []

  for (const { filename, folder, firmName } of toMigrate) {
    if (!filename || alreadyDoneSet.has(filename)) { skipped++; continue }
    try {
      const buffer = await fs.promises.readFile(path.join(UPLOADS_DIR, filename))
      await saveBufferAsUpload(buffer, filename, guessMimeType(filename), folder, firmName)
      alreadyDoneSet.add(filename)
      migrated++
    } catch (err) {
      failed.push({ filename, error: (err as Error).message })
    }
  }

  return {
    referencedInDb: new Set(sources.map((s) => s.filename).filter(Boolean)).size,
    foundLocally: toMigrate.length,
    migrated,
    alreadyMigrated: skipped,
    failed,
  }
}
