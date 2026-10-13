-- Small, bounded first-party logos. No external image product or R2 activation.
CREATE TABLE home_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
  category TEXT NOT NULL CHECK(category IN ('company', 'law_firm')),
  alt TEXT NOT NULL CHECK(length(alt) BETWEEN 2 AND 200),
  link_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 9999),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  data_base64 TEXT,
  mime_type TEXT CHECK(mime_type IN ('image/png', 'image/webp')),
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK(byte_size BETWEEN 0 AND 49152),
  storage_size INTEGER NOT NULL DEFAULT 0 CHECK(storage_size BETWEEN 0 AND 65536),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  CHECK((archived = 1 AND active = 0 AND data_base64 IS NULL AND byte_size = 0 AND storage_size = 0)
    OR (archived = 0 AND data_base64 IS NOT NULL AND mime_type IS NOT NULL AND byte_size > 0 AND storage_size = length(data_base64)))
);
CREATE INDEX idx_home_partners_public ON home_partners(active, archived, category, sort_order, name);
-- Enforce both quotas in the database, including concurrent administrators.
CREATE TRIGGER home_partners_insert_quota BEFORE INSERT ON home_partners
WHEN (SELECT COUNT(*) FROM home_partners) >= 40
  OR (SELECT COALESCE(SUM(storage_size), 0) FROM home_partners) + NEW.storage_size > 2097152
BEGIN SELECT RAISE(ABORT, 'home_partners_quota'); END;
CREATE TRIGGER home_partners_update_quota BEFORE UPDATE OF storage_size ON home_partners
WHEN (SELECT COALESCE(SUM(storage_size), 0) FROM home_partners) - OLD.storage_size + NEW.storage_size > 2097152
BEGIN SELECT RAISE(ABORT, 'home_partners_quota'); END;
