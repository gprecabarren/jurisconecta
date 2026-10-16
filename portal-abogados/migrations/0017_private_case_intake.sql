-- Private, short-lived drafts. No anonymous case is published or account created here.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM google_identities g WHERE g.user_id = users.id);
ALTER TABLE google_oauth_flows ADD COLUMN return_to TEXT CHECK(return_to IS NULL OR return_to = '/solicitar/');
ALTER TABLE google_registrations ADD COLUMN return_to TEXT CHECK(return_to IS NULL OR return_to = '/solicitar/');
CREATE TABLE case_intake_drafts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload_cipher TEXT CHECK(payload_cipher IS NULL OR length(payload_cipher) <= 48000),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  submitted_case_id TEXT REFERENCES legal_cases(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_intake_expiry ON case_intake_drafts(expires_at);
CREATE TRIGGER intake_count_limit BEFORE INSERT ON case_intake_drafts
WHEN (SELECT COUNT(*) FROM case_intake_drafts) >= 200
BEGIN SELECT RAISE(ABORT, 'intake_capacity'); END;
CREATE TRIGGER intake_storage_insert BEFORE INSERT ON case_intake_drafts
WHEN COALESCE((SELECT SUM(length(payload_cipher)) FROM case_intake_drafts),0) + COALESCE(length(NEW.payload_cipher),0) > 8000000
BEGIN SELECT RAISE(ABORT, 'intake_capacity'); END;
CREATE TRIGGER intake_storage_update BEFORE UPDATE OF payload_cipher ON case_intake_drafts
WHEN COALESCE((SELECT SUM(length(payload_cipher)) FROM case_intake_drafts),0) - COALESCE(length(OLD.payload_cipher),0) + COALESCE(length(NEW.payload_cipher),0) > 8000000
BEGIN SELECT RAISE(ABORT, 'intake_capacity'); END;
CREATE TABLE intake_assertions (ok INTEGER NOT NULL CHECK(ok = 1));
CREATE TABLE case_intake_responses (
  case_id TEXT PRIMARY KEY REFERENCES legal_cases(id) ON DELETE CASCADE,
  type_id TEXT NOT NULL,
  type_version INTEGER NOT NULL,
  schema_json TEXT NOT NULL CHECK(length(schema_json) <= 24000),
  answers_json TEXT NOT NULL CHECK(length(answers_json) <= 16000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
