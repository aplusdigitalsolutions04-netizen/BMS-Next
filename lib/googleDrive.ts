import { google } from 'googleapis'
import { Readable } from 'stream'
import { query } from './db'

// Single admin Google account authorizes once (via /api/google-drive/authorize); the
// resulting refresh token lets every upload/download run unattended after that, all stored
// under that one account's Drive quota in GOOGLE_DRIVE_FOLDER_ID.
//
// The refresh token lives in the DB (google_drive_auth table -- created by lib/db.ts's
// startup migration), not an env var -- writing it to .env.local would need a process
// restart to take effect, which doesn't work on most hosts. A DB row takes effect on the
// very next request.

// 30s cache so every Drive call doesn't round-trip to the DB for the token.
let cachedToken: { value: string | null | undefined; expiresAt: number } = { value: undefined, expiresAt: 0 }

async function getStoredRefreshToken(): Promise<string | null> {
  if (cachedToken.value !== undefined && Date.now() < cachedToken.expiresAt) return cachedToken.value
  const rows = await query<{ refreshToken: string }>('SELECT refreshToken FROM google_drive_auth WHERE id = 1')
  const value = rows[0]?.refreshToken || null
  cachedToken = { value, expiresAt: Date.now() + 30_000 }
  return value
}

export async function saveRefreshToken(token: string) {
  const { default: getPool } = await import('./db')
  await getPool().execute(
    'INSERT INTO google_drive_auth (id, refreshToken) VALUES (1, ?) ON DUPLICATE KEY UPDATE refreshToken = VALUES(refreshToken)',
    [token]
  )
  cachedToken = { value: token, expiresAt: Date.now() + 30_000 }
  driveClient = null // force re-creation with the new token on next use
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let driveClient: any = null

async function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)')
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  const refreshToken = await getStoredRefreshToken()
  if (refreshToken) oAuth2Client.setCredentials({ refresh_token: refreshToken })
  return oAuth2Client
}

export async function getAuthUrl(): Promise<string> {
  const oAuth2Client = await getOAuthClient()
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
  })
}

export async function exchangeCodeForTokens(code: string) {
  const oAuth2Client = await getOAuthClient()
  const { tokens } = await oAuth2Client.getToken(code)
  return tokens
}

async function getDriveClient() {
  if (driveClient) return driveClient
  const refreshToken = await getStoredRefreshToken()
  if (!refreshToken) {
    throw new Error('Google Drive is not authorized yet. Visit /api/google-drive/authorize to connect an account.')
  }
  driveClient = google.drive({ version: 'v3', auth: await getOAuthClient() })
  return driveClient
}

function rootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured')
  return id
}

// In-memory cache of "parentId::name" -> Drive folder ID, so repeated uploads of the same
// doc type don't re-search Drive every time. Resets on server restart, but findOrCreateFolder
// re-discovers by name then, so folders never get duplicated even across restarts.
const folderIdCache = new Map<string, string>()

export async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const parent = parentId || rootFolderId()
  const cacheKey = `${parent}::${name}`
  const cached = folderIdCache.get(cacheKey)
  if (cached) return cached

  const drive = await getDriveClient()
  const escapedName = name.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  let folderId: string | undefined = res.data.files?.[0]?.id
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
      fields: 'id',
      supportsAllDrives: true,
    })
    folderId = created.data.id
  }

  folderIdCache.set(cacheKey, folderId!)
  return folderId!
}

export async function uploadFileToDrive(buffer: Buffer, filename: string, mimeType?: string, parentFolderId?: string) {
  const drive = await getDriveClient()
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentFolderId || rootFolderId()] },
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, name, mimeType',
    supportsAllDrives: true,
  })
  return { id: res.data.id as string, name: res.data.name as string, mimeType: res.data.mimeType as string }
}

// Overwrites an existing Drive file's content in place -- used when a generated document is
// re-saved after editing, so the same Drive file ID (and every DB reference to it) stays valid.
export async function updateDriveFileContent(fileId: string, buffer: Buffer, mimeType?: string) {
  const drive = await getDriveClient()
  await drive.files.update({
    fileId,
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    supportsAllDrives: true,
  })
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient()
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data as ArrayBuffer)
}

export async function deleteDriveFile(fileId: string) {
  const drive = await getDriveClient()
  await drive.files.delete({ fileId, supportsAllDrives: true })
}

// Used by an admin "Test Connection" action -- confirms the stored refresh token still works
// and GOOGLE_DRIVE_FOLDER_ID still points at a real, reachable folder.
export async function testDriveConnection() {
  const drive = await getDriveClient()
  const folderId = rootFolderId()

  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, trashed',
    supportsAllDrives: true,
  })

  if (res.data.trashed) throw new Error('The configured Drive folder has been moved to trash.')
  if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID does not point to a folder.')
  }

  return { folderId: res.data.id as string, folderName: res.data.name as string }
}
