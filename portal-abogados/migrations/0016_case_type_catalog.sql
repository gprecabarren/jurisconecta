-- TS supplies the versioned baseline. This table stores bounded editorial overrides/new types.
-- No user, case or historical topic is changed by this migration.
CREATE TABLE case_type_catalog (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80),
  schema_json TEXT NOT NULL CHECK(json_valid(schema_json) AND length(schema_json) <= 24000),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 9999),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL
);
CREATE INDEX idx_case_type_catalog_public ON case_type_catalog(enabled, sort_order, id);
-- Atomic CAS assertions roll back both edits and their audit entries on stale versions.
CREATE TABLE case_type_transaction_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid = 1)
);
CREATE TRIGGER case_type_catalog_quota BEFORE INSERT ON case_type_catalog
WHEN (SELECT COUNT(*) FROM case_type_catalog) >= 120
BEGIN SELECT RAISE(ABORT, 'case_type_catalog_quota'); END;
