-- Stored procedures for masterdata / mastergroup writes.
--
-- Why: `masterdata` is keyed by `code` alone (see PRIMARY KEY), so the database itself only
-- blocks a second row with the exact same code -- it does nothing to stop two rows that mean
-- the same thing with a different code, which is exactly how the "MANAGER" / "MANAGER " (a
-- trailing space, upper-cased to "MANAGER_") duplicate role happened: the app generated a
-- different code from slightly different input text, and both inserts succeeded.
--
-- These procedures move that check into the database itself (trim + case-insensitive compare
-- against existing rows in the same group before allowing an insert) so it can't be bypassed
-- by any future code path that writes to these tables, not just the ones already updated to
-- call them.
--
-- Run this once in phpMyAdmin's SQL tab (or via any MySQL client) against the live database.
-- Safe to re-run: each DROP PROCEDURE IF EXISTS makes the whole file idempotent.

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_mastergroup_upsert$$
CREATE PROCEDURE sp_mastergroup_upsert(
  IN p_code VARCHAR(191),
  IN p_name VARCHAR(191),
  IN p_description VARCHAR(500)
)
BEGIN
  DECLARE v_code VARCHAR(191);
  SET v_code = UPPER(TRIM(p_code));

  IF v_code = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Group code cannot be blank';
  END IF;

  -- Create-if-missing only -- never overwrites an existing group's name/description, since
  -- callers that are really just upserting a masterdata row under it (not managing the group
  -- itself) pass no real name/description here.
  INSERT INTO mastergroup (code, name, description, isActive)
  VALUES (v_code, TRIM(p_name), p_description, 1)
  ON DUPLICATE KEY UPDATE code = code;
END$$

DROP PROCEDURE IF EXISTS sp_masterdata_upsert$$
CREATE PROCEDURE sp_masterdata_upsert(
  IN p_code VARCHAR(191),
  IN p_groupCode VARCHAR(191),
  IN p_value VARCHAR(191),
  IN p_metadata TEXT
)
BEGIN
  -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly rather than relying
  -- on it matching the columns' actual one (which varies by MySQL version/host default --
  -- e.g. utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci -- and otherwise throws "Illegal mix of
  -- collations"). utf8mb4_general_ci exists on every MySQL/MariaDB version.
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

  -- Is there already a different, non-deleted row in this same group whose value matches
  -- (trimmed, case-insensitive)? If so this is the "MANAGER" / "MANAGER " situation -- block
  -- it instead of silently creating a second entry for the same thing.
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
END$$

-- Advanced Sheets (workbooks) -- `id` is a random UUID, so nothing stops two workbooks being
-- created with the same (or same-but-for-whitespace) name. Blocks that the same way as
-- masterdata above: trim + case-insensitive compare against other non-deleted workbooks.
DROP PROCEDURE IF EXISTS sp_advanced_sheet_create$$
CREATE PROCEDURE sp_advanced_sheet_create(
  IN p_id VARCHAR(255),
  IN p_name VARCHAR(255),
  IN p_createdBy VARCHAR(255)
)
BEGIN
  DECLARE v_name VARCHAR(255);
  DECLARE v_existingId VARCHAR(255);
  SET v_name = TRIM(p_name);

  IF v_name = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Workbook name cannot be blank';
  END IF;

  -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly rather than relying
  -- on it matching the column's actual one (which varies by MySQL version/host default --
  -- e.g. utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci -- and otherwise throws "Illegal mix of
  -- collations"). utf8mb4_general_ci exists on every MySQL/MariaDB version.
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
END$$

-- Direct Link entries -- `catalogId` (the GeM catalog ID) is the real-world identifier for a
-- product listing when present, so two active entries sharing one is a genuine duplicate
-- data-entry mistake, not a coincidence. Only checked when a catalogId is actually given.
DROP PROCEDURE IF EXISTS sp_direct_link_create$$
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
    -- COLLATE utf8mb4_general_ci pins the comparison collation explicitly (see the matching
    -- comment in sp_advanced_sheet_create above).
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
END$$

DELIMITER ;
