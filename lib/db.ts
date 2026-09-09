import mysql from 'mysql2/promise'

function parseDbUrl(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: parseInt(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  }
}

// In Next.js dev mode, editing any file that imports this module makes webpack re-evaluate
// it on the next request, which would otherwise call mysql.createPool() again and leak the
// previous pool's connections. Stashing the pool on `global` survives that module reload so
// dev-server hot-reloading reuses the same pool instead of piling up new ones. In production
// the module is only evaluated once per process anyway, but it's stashed there too so a single
// module-level variable isn't the only thing keeping it alive.
const globalForDb = global as unknown as { __mysqlPool?: mysql.Pool }

// Set once startup migrations (ensureTables/ensureColumns/ensureProcedures/ensureSeedData)
// are kicked off near the bottom of this module. query()/withTransaction() await it before
// running so a request landing on a fresh process can't race the ALTER/CREATE statements
// still in flight -- see the longer comment near where this promise is created.
const globalForInit = global as unknown as { __dbInitPromise?: Promise<void> }
async function waitForInit() {
  if (globalForInit.__dbInitPromise) await globalForInit.__dbInitPromise.catch(() => {})
}

// Deferred until first actual query (not evaluated at module load) -- Next.js's build-time
// "collecting page data" step imports every API route module just to inspect it, which would
// otherwise crash the whole build the moment DATABASE_URL is missing from the deployment
// platform's environment variables, instead of failing at runtime with a clear message.
function getPool(): mysql.Pool {
  if (globalForDb.__mysqlPool) return globalForDb.__mysqlPool

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const pool = mysql.createPool({
    ...parseDbUrl(process.env.DATABASE_URL),
    waitForConnections: true,
    connectionLimit: 10,
  })

  // mysql2 pools can develop a connection-level problem in the background (the DB host
  // silently dropping an idle connection, a network blip, etc.) that never surfaces as a
  // normal query error -- it only shows up here. Without this listener that failure mode is
  // invisible: queries start throwing generic errors with no indication *why*, and nothing
  // in the terminal explains it. Logging it here means the real cause is always on record.
  // mysql2's promise-wrapped Pool does emit 'error' at runtime, but its type declarations
  // only list 'connection'/'acquire'/'release'/'enqueue' -- so this needs an EventEmitter
  // cast to register the listener without a bogus type error.
  ;(pool as unknown as import('events').EventEmitter).on('error', (err: { code?: string; message?: string }) => {
    console.error('[mysql pool error]', err.code, err.message)
  })

  globalForDb.__mysqlPool = pool
  return pool
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = unknown>(sql: string, params?: any[]): Promise<T[]> {
  await waitForInit()
  try {
    const [rows] = await getPool().execute(sql, params)
    return rows as T[]
  } catch (err) {
    const e = err as { code?: string; errno?: number; sqlMessage?: string; message?: string }
    console.error(
      `[db query failed] code=${e.code} errno=${e.errno} msg=${e.sqlMessage || e.message}\n  sql: ${sql.replace(/\s+/g, ' ').trim().slice(0, 300)}`
    )
    throw err
  }
}

// Runs a series of statements on a single connection inside a transaction, rolling back
// on any error so a partial failure (e.g. mid-way through a delete-then-reinsert) can't
// leave the database with data deleted but not replaced.
export async function withTransaction<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (exec: (sql: string, params?: any[]) => Promise<void>) => Promise<T>
): Promise<T> {
  await waitForInit()
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exec = async (sql: string, params?: any[]) => {
      await connection.execute(sql, params)
    }
    const result = await fn(exec)
    await connection.commit()
    return result
  } catch (e) {
    await connection.rollback()
    throw e
  } finally {
    connection.release()
  }
}

// Create new tables that don't exist yet (idempotent -- safe to run on every boot)
async function ensureTables() {
  const tables = [
    // Spreadsheet workbooks (FortuneSheet) -- one row per workbook, whole grid stored as JSON.
    `CREATE TABLE IF NOT EXISTS \`advanced_sheet\` (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      createdBy VARCHAR(255),
      isDeleted TINYINT(1) DEFAULT 0,
      shareToken VARCHAR(100) UNIQUE,
      shareMode VARCHAR(20) DEFAULT 'NONE',
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedOn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`advanced_sheet_tabs\` (
      id VARCHAR(255) PRIMARY KEY,
      workbook_id VARCHAR(255) NOT NULL,
      sheet_index VARCHAR(255) NOT NULL,
      tab_name VARCHAR(255) NOT NULL,
      config JSON NOT NULL,
      INDEX idx_workbook (workbook_id)
    )`,
    `CREATE TABLE IF NOT EXISTS \`advanced_sheet_cells\` (
      id VARCHAR(255) PRIMARY KEY,
      workbook_id VARCHAR(255) NOT NULL,
      sheet_index VARCHAR(255) NOT NULL,
      row_index INT NOT NULL,
      col_index INT NOT NULL,
      cell_data JSON NOT NULL,
      INDEX idx_workbook (workbook_id),
      INDEX idx_sheet (workbook_id, sheet_index)
    )`,
    // Direct Link entries -- quick product listings with pricing/availability info
    `CREATE TABLE IF NOT EXISTS \`direct_link\` (
      id VARCHAR(255) PRIMARY KEY,
      entryDate DATE NOT NULL,
      productName VARCHAR(255) NOT NULL,
      link TEXT,
      catalogId VARCHAR(255),
      itemCategoryCode VARCHAR(255),
      maxAvailableQty INT,
      minConsigneeQty INT,
      mrp DECIMAL(12,2),
      offerPrice DECIMAL(12,2),
      firm VARCHAR(255),
      firmId VARCHAR(255),
      sellerLocation VARCHAR(255),
      taggedLocations TEXT,
      client VARCHAR(255),
      clientCode VARCHAR(255),
      cartingStatus TINYINT(1) DEFAULT 0,
      cartingDate DATE,
      orderStatus VARCHAR(20) DEFAULT 'PENDING',
      createdBy VARCHAR(255),
      isDeleted TINYINT(1) DEFAULT 0,
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedOn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    // Maps a locally-generated filename (the same string every upload route already stores
    // and builds /uploads/<filename> URLs from) to the Google Drive file that actually holds
    // the bytes -- see lib/uploads.ts and lib/googleDrive.ts.
    `CREATE TABLE IF NOT EXISTS \`drive_files\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      driveFileId VARCHAR(255) NOT NULL,
      mimetype VARCHAR(255),
      size BIGINT,
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // Stores the one admin Google account's OAuth refresh token that authorizes every
    // Drive upload/download -- see lib/googleDrive.ts.
    `CREATE TABLE IF NOT EXISTS \`google_drive_auth\` (
      id INT PRIMARY KEY,
      refreshToken TEXT NOT NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    // A firm's documents can be organized into folders -- created explicitly (via
    // /api/document-folders) before any document is uploaded into them, so they show up as
    // selectable even when empty. `folderName` on documentmeta stores the plain name (not
    // this id) since that's also the Drive subfolder name -- see lib/uploads.ts.
    `CREATE TABLE IF NOT EXISTS \`document_folder\` (
      id VARCHAR(255) PRIMARY KEY,
      firmId VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      createdBy VARCHAR(255),
      isDeleted TINYINT(1) DEFAULT 0,
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_firm (firmId)
    )`
  ];

  for (const stmt of tables) {
    try {
      await getPool().execute(stmt);
    } catch (e: any) {
      console.error('Error creating table:', e.message);
    }
  }
}

// Auto-generate missing columns when the project runs
async function ensureColumns() {
  const alters = [
    // Previous fixes
    'ALTER TABLE `user` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE `notification` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE `template` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    // Master data fixes
    'ALTER TABLE `masterdata` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE `mastergroup` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    // Advanced sheet sharing
    'ALTER TABLE `advanced_sheet` ADD COLUMN shareToken VARCHAR(100) UNIQUE',
    'ALTER TABLE `advanced_sheet` ADD COLUMN shareMode VARCHAR(20) DEFAULT "NONE"',
    // Bid document fixes
    'ALTER TABLE `biddocument` ADD COLUMN isDeleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE `biddocument` ADD COLUMN categoryCode VARCHAR(255)',
    // Add bidStatus to track the GeM bid evaluation stage -- no default, so a newly
    // saved bid has no status until the user explicitly picks one (UI shows a neutral
    // "Select Status" placeholder rather than silently assuming the first stage).
    'ALTER TABLE `biddocument` ADD COLUMN bidStatus VARCHAR(50) DEFAULT NULL',
    // Column already existed with an old default ("PENDING") on running databases -- drop it.
    'ALTER TABLE `biddocument` MODIFY COLUMN bidStatus VARCHAR(50) DEFAULT NULL',
    // Persist the regex-cleaned "Buyer Added Bid Specific Terms & Conditions" text (footer/disclaimer/page-number stripped)
    // so document generation from the Saved Bids tab uses the same clean source as generating right after analysis.
    'ALTER TABLE `biddocument` ADD COLUMN buyerTerms TEXT',
    // Document & DocumentMeta fixes
    'ALTER TABLE `document` ADD COLUMN bidDocumentId VARCHAR(255)',
    // Documents uploaded against a bid (via Bid Documents tab) have no firmId -- make it nullable
    'ALTER TABLE `document` MODIFY COLUMN firmId VARCHAR(255) NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN approvalStatus VARCHAR(50) DEFAULT "PENDING"',
    'ALTER TABLE `documentmeta` ADD COLUMN approvedBy VARCHAR(255)',
    'ALTER TABLE `documentmeta` ADD COLUMN approvedOn DATETIME',
    'ALTER TABLE `documentmeta` ADD COLUMN approvalNote TEXT',
    // Tracks whether the "removing in 1 hour" reminder has already been sent for a pending
    // bid-linked document, so the approval-check cron doesn't email the same reminder twice.
    'ALTER TABLE `documentmeta` ADD COLUMN approvalReminderSent TINYINT(1) DEFAULT 0',
    // Optional free-text folder a document is filed under within its firm -- lets a user
    // organize a firm's documents (and the matching Drive subfolder) without needing a
    // separate folders table; any existing value typed for that firm becomes a reusable
    // suggestion in the upload form.
    'ALTER TABLE `documentmeta` ADD COLUMN folderName VARCHAR(255)',
    // Direct Link step-2 fields (carting/order status)
    'ALTER TABLE `direct_link` ADD COLUMN cartingStatus TINYINT(1) DEFAULT 0',
    'ALTER TABLE `direct_link` ADD COLUMN cartingDate DATE',
    "ALTER TABLE `direct_link` ADD COLUMN orderStatus VARCHAR(20) DEFAULT 'PENDING'",
    // Direct Link firm/client become dropdowns backed by real data -- these reference
    // the firm table and the new CLIENT masterdata group. The old firm/client text
    // columns stay so pre-existing rows keep displaying correctly.
    'ALTER TABLE `direct_link` ADD COLUMN firmId VARCHAR(255)',
    'ALTER TABLE `direct_link` ADD COLUMN clientCode VARCHAR(255)',
    // Which location(s) this Direct Link product/offer applies to -- stored as a
    // JSON array of LOCATION masterdata codes, so one entry can be tagged for many places.
    'ALTER TABLE `direct_link` ADD COLUMN taggedLocations TEXT',
    'ALTER TABLE `direct_link` ADD COLUMN catalogId VARCHAR(255)',
    // Indexes on columns that are filtered/joined/sorted on every list request -- without
    // these, MySQL falls back to a full table scan that gets slower as each table grows
    // (documents/firms/audit log are re-fetched in full on every 30s poll).
    'ALTER TABLE `document` ADD INDEX idx_document_firm_deleted (firmId, isDeleted)',
    'ALTER TABLE `document` ADD INDEX idx_document_expiry (expiryDate)',
    'ALTER TABLE `documentmeta` ADD INDEX idx_documentmeta_category (categoryCode)',
    'ALTER TABLE `documentmeta` ADD INDEX idx_documentmeta_department (departmentCode)',
    'ALTER TABLE `documentmeta` ADD INDEX idx_documentmeta_status (statusCode)',
    'ALTER TABLE `documentmeta` ADD INDEX idx_documentmeta_approval (approvalStatus)',
    'ALTER TABLE `user` ADD INDEX idx_user_deleted_active (isDeleted, isActive)',
    'ALTER TABLE `user` ADD INDEX idx_user_role (roleCode)',
    'ALTER TABLE `auditlog` ADD INDEX idx_auditlog_datetime (dateTime)',
    'ALTER TABLE `auditlog` ADD INDEX idx_auditlog_user (userId)',
    'ALTER TABLE `firm` ADD INDEX idx_firm_deleted (isDeleted)',
    'ALTER TABLE `masterdata` ADD INDEX idx_masterdata_group_deleted (groupCode, isDeleted)',
    'ALTER TABLE `bid_parameters` ADD INDEX idx_bidparam_biddoc (bidDocumentId)',
    'ALTER TABLE `notification` ADD INDEX idx_notification_deleted_created (isDeleted, createdOn)',
    // Notifications are a single shared feed (broadcast to everyone), but "mark read" /
    // "clear" need to be per-viewer -- otherwise one user reading or clearing a notification
    // hides it for every other user too. These track, per notification, which user ids have
    // read/dismissed it, on top of the existing global isRead/isDeleted (which stay as an
    // admin-only "remove for everyone" action).
    'ALTER TABLE `notification` ADD COLUMN readBy JSON NULL',
    'ALTER TABLE `notification` ADD COLUMN deletedBy JSON NULL',
    // Lets a document_folder nest inside another one (folder-in-a-folder) -- NULL means a
    // top-level folder for the firm. See app/api/document-folders/route.ts.
    'ALTER TABLE `document_folder` ADD COLUMN parentFolderId VARCHAR(255) NULL',
    'ALTER TABLE `document_folder` ADD INDEX idx_document_folder_parent (parentFolderId)',
    // Tags a folder as belonging to one CLIENT masterdata entry (the same client list used by
    // Direct Link), so a folder can be organized as "this client's documents only" -- purely
    // an organizational label, shown on the folder tile; it doesn't restrict which documents
    // can be filed inside it.
    'ALTER TABLE `document_folder` ADD COLUMN clientCode VARCHAR(255) NULL',
    'ALTER TABLE `document_folder` ADD INDEX idx_document_folder_client (clientCode)',
    // Optional AI-extracted (or manually typed) challan-style fields for a document uploaded
    // into a client-tagged folder -- see app/api/documents/extract/route.ts. mrp is always
    // typed by hand (never extracted), the rest can be pre-filled from the uploaded PDF and
    // edited before saving.
    'ALTER TABLE `documentmeta` ADD COLUMN extractedDate DATE NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN challanNumber VARCHAR(255) NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN extractedClientName VARCHAR(255) NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN productName VARCHAR(255) NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN quantity VARCHAR(100) NULL',
    'ALTER TABLE `documentmeta` ADD COLUMN mrp DECIMAL(12,2) NULL',
  ];

  for (const query of alters) {
    try {
      await getPool().execute(query);
      console.log(`Successfully executed: ${query}`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') {
        console.error(`Error executing auto-generate query (${query}):`, e.message);
      }
    }
  }
}

// Stored procedures for masterdata/mastergroup writes -- see lib/sql/procedures.sql for the
// full explanation (that file is the copy meant for manually running against a separately
// hosted/live database via phpMyAdmin; this keeps the same procedures created automatically
// on every boot here, dev included). `masterdata` is keyed by `code` alone, so the database
// doesn't stop two rows meaning the same thing under a different code (e.g. the "MANAGER" /
// "MANAGER " duplicate role) -- these procedures add that check before every insert.
async function ensureProcedures() {
  await getPool().query(`DROP PROCEDURE IF EXISTS sp_mastergroup_upsert`);
  await getPool().query(`
    CREATE PROCEDURE sp_mastergroup_upsert(
      IN p_code VARCHAR(191), IN p_name VARCHAR(191), IN p_description VARCHAR(500)
    )
    BEGIN
      DECLARE v_code VARCHAR(191);
      SET v_code = UPPER(TRIM(p_code));
      IF v_code = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Group code cannot be blank';
      END IF;
      INSERT INTO mastergroup (code, name, description, isActive)
      VALUES (v_code, TRIM(p_name), p_description, 1)
      ON DUPLICATE KEY UPDATE code = code;
    END
  `);

  await getPool().query(`DROP PROCEDURE IF EXISTS sp_masterdata_upsert`);
  await getPool().query(`
    CREATE PROCEDURE sp_masterdata_upsert(
      IN p_code VARCHAR(191), IN p_groupCode VARCHAR(191), IN p_value VARCHAR(191), IN p_metadata TEXT
    )
    BEGIN
      -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly rather than
      -- relying on it matching the columns' actual one (which varies by MySQL version/host
      -- default -- e.g. utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci -- and otherwise throws
      -- "Illegal mix of collations"). utf8mb4_general_ci exists on every MySQL/MariaDB version.
      DECLARE v_code VARCHAR(191);
      DECLARE v_value VARCHAR(191);
      DECLARE v_existingCode VARCHAR(191);
      SET v_code = TRIM(p_code);
      SET v_value = TRIM(p_value);
      IF v_code = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Code cannot be blank';
      END IF;
      IF v_value = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Value cannot be blank';
      END IF;
      SELECT code INTO v_existingCode
      FROM masterdata
      WHERE groupCode COLLATE utf8mb4_general_ci = p_groupCode COLLATE utf8mb4_general_ci
        AND isDeleted = 0
        AND code COLLATE utf8mb4_general_ci <> v_code COLLATE utf8mb4_general_ci
        AND LOWER(TRIM(value)) COLLATE utf8mb4_general_ci = LOWER(v_value) COLLATE utf8mb4_general_ci
      LIMIT 1;
      IF v_existingCode IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'An entry with this name already exists in this group (check for extra spaces/case)';
      END IF;
      INSERT INTO masterdata (code, groupCode, value, metadata, isActive, isDeleted)
      VALUES (v_code, p_groupCode, v_value, p_metadata, 1, 0)
      ON DUPLICATE KEY UPDATE value = v_value, metadata = p_metadata;
    END
  `);

  // Advanced Sheets (workbooks) -- `id` is a random UUID, so nothing stops two workbooks
  // being created with the same (or same-but-for-whitespace) name. Blocks that the same way
  // as masterdata above: trim + case-insensitive compare against other non-deleted workbooks.
  await getPool().query(`DROP PROCEDURE IF EXISTS sp_advanced_sheet_create`);
  await getPool().query(`
    CREATE PROCEDURE sp_advanced_sheet_create(
      IN p_id VARCHAR(255), IN p_name VARCHAR(255), IN p_createdBy VARCHAR(255)
    )
    BEGIN
      DECLARE v_name VARCHAR(255);
      DECLARE v_existingId VARCHAR(255);
      SET v_name = TRIM(p_name);
      IF v_name = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Workbook name cannot be blank';
      END IF;
      -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly rather than
      -- relying on it matching the column's actual one (which varies by MySQL version/host
      -- default -- e.g. utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci -- and otherwise throws
      -- "Illegal mix of collations"). utf8mb4_general_ci exists on every MySQL/MariaDB version.
      SELECT id INTO v_existingId
      FROM advanced_sheet
      WHERE isDeleted = 0
        AND LOWER(TRIM(name)) COLLATE utf8mb4_general_ci = LOWER(v_name) COLLATE utf8mb4_general_ci
      LIMIT 1;
      IF v_existingId IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'A workbook with this name already exists (check for extra spaces/case)';
      END IF;
      INSERT INTO advanced_sheet (id, name, createdBy, isDeleted)
      VALUES (p_id, v_name, p_createdBy, 0);
    END
  `);

  // Direct Link entries -- `catalogId` (the GeM catalog ID) is the real-world identifier for
  // a product listing when present, so two active entries sharing one is a genuine duplicate
  // data-entry mistake, not a coincidence. Only checked when a catalogId is actually given.
  await getPool().query(`DROP PROCEDURE IF EXISTS sp_direct_link_create`);
  await getPool().query(`
    CREATE PROCEDURE sp_direct_link_create(
      IN p_id VARCHAR(255), IN p_entryDate DATE, IN p_productName VARCHAR(255), IN p_link TEXT,
      IN p_catalogId VARCHAR(255), IN p_itemCategoryCode VARCHAR(255), IN p_maxAvailableQty INT,
      IN p_minConsigneeQty INT, IN p_mrp DECIMAL(12,2), IN p_offerPrice DECIMAL(12,2),
      IN p_firm VARCHAR(255), IN p_firmId VARCHAR(255), IN p_sellerLocation VARCHAR(255),
      IN p_taggedLocations TEXT, IN p_client VARCHAR(255), IN p_clientCode VARCHAR(255),
      IN p_cartingStatus TINYINT, IN p_cartingDate DATE, IN p_orderStatus VARCHAR(20),
      IN p_createdBy VARCHAR(255)
    )
    BEGIN
      DECLARE v_productName VARCHAR(255);
      DECLARE v_catalogId VARCHAR(255);
      DECLARE v_existingId VARCHAR(255);
      SET v_productName = TRIM(p_productName);
      SET v_catalogId = TRIM(p_catalogId);
      IF v_productName = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Product name cannot be blank';
      END IF;
      IF v_catalogId IS NOT NULL AND v_catalogId <> '' THEN
        -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly (see the
        -- matching comment in sp_advanced_sheet_create above).
        SELECT id INTO v_existingId
        FROM direct_link
        WHERE isDeleted = 0
          AND LOWER(TRIM(catalogId)) COLLATE utf8mb4_general_ci = LOWER(v_catalogId) COLLATE utf8mb4_general_ci
        LIMIT 1;
        IF v_existingId IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An entry with this Catalog ID already exists';
        END IF;
      END IF;
      INSERT INTO direct_link
        (id, entryDate, productName, link, catalogId, itemCategoryCode, maxAvailableQty, minConsigneeQty,
         mrp, offerPrice, firm, firmId, sellerLocation, taggedLocations, client, clientCode,
         cartingStatus, cartingDate, orderStatus, createdBy, isDeleted)
      VALUES
        (p_id, p_entryDate, v_productName, p_link, NULLIF(v_catalogId, ''), p_itemCategoryCode, p_maxAvailableQty,
         p_minConsigneeQty, p_mrp, p_offerPrice, p_firm, p_firmId, p_sellerLocation, p_taggedLocations,
         p_client, p_clientCode, p_cartingStatus, p_cartingDate, p_orderStatus, p_createdBy, 0);
    END
  `);
}

// Seed the master-data groups used by Direct Link (item category + client), so the
// generic /api/master/[groupCode] endpoints work for them out of the box.
async function ensureSeedData() {
  const groups: [string, string, string][] = [
    ['ITEM_CATEGORY', 'ITEM CATEGORY', 'Categories for Direct Link product entries'],
    ['CLIENT', 'CLIENT', 'Clients for Direct Link product entries'],
    ['LOCATION', 'LOCATION', 'Locations a Direct Link entry can be tagged for'],
    ['BID_STATUS', 'BID STATUS', 'Allowed statuses for a saved bid (won/lost/pending)'],
  ];
  for (const [code, name, description] of groups) {
    try {
      await getPool().execute(
        `INSERT IGNORE INTO mastergroup (code, name, description, isActive) VALUES (?, ?, ?, 1)`,
        [code, name, description]
      );
    } catch (e: any) {
      console.error(`Error seeding ${code} group:`, e.message);
    }
  }

  const bidStatuses: [string, string, number][] = [
    ['EVAL_SINGLE_PACKET', 'Evaluation :- IN Single Packet Bid', 1],
    ['FIN_EVAL_TWO_PACKET', 'Financial Evaluation:- IN Two Packet Bid', 2],
    ['TECH_EVALUATED', 'Technical Evaluated', 3],
    ['BID_RA_AWARDED', 'Bid /RA Awarded', 4],
  ];
  for (const [code, value, sortOrder] of bidStatuses) {
    try {
      await getPool().execute(
        `INSERT INTO masterdata (code, groupCode, value, sortOrder, isDeleted) VALUES (?, 'BID_STATUS', ?, ?, 0)
         ON DUPLICATE KEY UPDATE value = VALUES(value), sortOrder = VALUES(sortOrder), isDeleted = 0`,
        [code, value, sortOrder]
      );
    } catch (e: any) {
      console.error(`Error seeding BID_STATUS entry ${code}:`, e.message);
    }
  }
  // Replaced the old PENDING/WON/LOST set with the GeM evaluation-stage statuses above --
  // soft-delete any leftover old codes so they stop showing up as selectable options.
  try {
    await getPool().execute(
      `UPDATE masterdata SET isDeleted = 1 WHERE groupCode = 'BID_STATUS' AND code IN ('PENDING', 'WON', 'LOST')`
    )
    // Carry existing bids forward onto the new statuses: WON maps to the final "Awarded"
    // stage. PENDING/LOST have no real equivalent stage, so leave those (and bids that
    // never had a status) unset -- the UI shows a neutral "Select Status" placeholder
    // rather than silently assuming the first evaluation stage.
    await getPool().execute(`UPDATE biddocument SET bidStatus = 'BID_RA_AWARDED' WHERE bidStatus = 'WON'`)
    await getPool().execute(`UPDATE biddocument SET bidStatus = NULL WHERE bidStatus IN ('PENDING', 'LOST')`)
  } catch (e: any) {
    console.error('Error migrating old BID_STATUS values:', e.message)
  }
}

// Fetch the allowed bid status codes from masterdata (BID_STATUS group) so the
// valid set lives in the database rather than being hardcoded in route handlers.
export async function getBidStatusCodes(): Promise<string[]> {
  const rows = await query<{ code: string }>(
    `SELECT code FROM masterdata WHERE groupCode = 'BID_STATUS' AND isDeleted = 0 ORDER BY sortOrder ASC`
  )
  return rows.map(r => r.code)
}

// Run this once per actual process, not once per module re-evaluation. In dev, editing any
// file that (transitively) imports this module makes webpack hot-reload it -- without this
// guard that re-ran every CREATE TABLE / ALTER TABLE / seed statement again on every such
// edit, concurrently with whatever request handlers were using the shared pool at that
// moment. A request touching a table mid-ALTER could then get a transient, irreproducible
// error (the same query always succeeds when re-run standalone afterwards) -- this was the
// most likely cause of the random, hard-to-reproduce 500s seen on unrelated routes.
// Only kick this off when DATABASE_URL is actually present -- e.g. during a deployment
// platform's build-time "collecting page data" step, which imports every route module
// (this one transitively included) without the runtime environment variables set yet.
// Running it unconditionally would call getPool() immediately at import time and crash
// the whole build the instant DATABASE_URL is missing.
if (process.env.DATABASE_URL) {
  globalForInit.__dbInitPromise ??= ensureTables().then(() => ensureColumns()).then(() => ensureProcedures()).then(() => ensureSeedData())
  globalForInit.__dbInitPromise.catch((err) => console.error('[db init] startup migration failed:', err))
}

export default getPool
