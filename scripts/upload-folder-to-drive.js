'use strict';

// Ad-hoc uploader: uploads every file sitting in the project's uploads/ folder to Google
// Drive (using the account already authorized via /api/google-drive/authorize) and records
// each one in the `drive_files` table, the same way lib/uploads.ts's saveBufferAsUpload does
// for in-app uploads. Files already present in `drive_files` (by filename) are skipped, so
// this is safe to re-run any time new files are dropped into uploads/.
//
// Usage: node scripts/upload-folder-to-drive.js

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const mysql = require('mysql2/promise');
const { Readable } = require('stream');

const ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

function loadEnv() {
  const env = {};
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
  return env;
}

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ({
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[ext] || 'application/octet-stream';
}

async function main() {
  const env = loadEnv();

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log(`No uploads/ folder found at ${UPLOADS_DIR} -- nothing to do.`);
    return;
  }
  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => fs.statSync(path.join(UPLOADS_DIR, f)).isFile());
  if (files.length === 0) {
    console.log('uploads/ folder is empty -- drop files in there and re-run.');
    return;
  }

  const u = new URL(env.DATABASE_URL);
  const conn = await mysql.createConnection({
    host: u.hostname, port: parseInt(u.port) || 3306, user: u.username,
    password: decodeURIComponent(u.password), database: u.pathname.slice(1),
  });

  const [authRows] = await conn.execute('SELECT refreshToken FROM google_drive_auth WHERE id = 1');
  const refreshToken = authRows[0]?.refreshToken;
  if (!refreshToken) {
    console.error('Google Drive is not authorized yet -- visit /api/google-drive/authorize first.');
    await conn.end();
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const parentFolderId = env.GOOGLE_DRIVE_FOLDER_ID;

  const [existing] = await conn.execute('SELECT filename FROM drive_files');
  const alreadyUploaded = new Set(existing.map((r) => r.filename));

  let uploaded = 0;
  let skipped = 0;
  const failed = [];

  for (const filename of files) {
    if (alreadyUploaded.has(filename)) {
      console.log(`[skip] ${filename} -- already in drive_files`);
      skipped++;
      continue;
    }
    try {
      const filePath = path.join(UPLOADS_DIR, filename);
      const buffer = fs.readFileSync(filePath);
      const mimeType = guessMimeType(filename);

      const res = await drive.files.create({
        requestBody: { name: filename, parents: [parentFolderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id, name',
        supportsAllDrives: true,
      });

      await conn.execute(
        'INSERT INTO drive_files (filename, driveFileId, mimetype, size) VALUES (?, ?, ?, ?)',
        [filename, res.data.id, mimeType, buffer.length]
      );

      console.log(`[ok] ${filename} -> Drive file ${res.data.id}`);
      uploaded++;
    } catch (err) {
      console.error(`[fail] ${filename}: ${err.message}`);
      failed.push({ filename, error: err.message });
    }
  }

  await conn.end();
  console.log(`\nDone -- uploaded ${uploaded}, skipped ${skipped} (already done), failed ${failed.length}.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
