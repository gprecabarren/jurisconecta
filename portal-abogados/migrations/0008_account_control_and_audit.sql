PRAGMA foreign_keys = ON;

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT NOT NULL,
  location TEXT NOT NULL,
  ip_hint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX idx_user_sessions_user_created ON user_sessions(user_id, created_at DESC);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  device TEXT NOT NULL,
  location TEXT NOT NULL,
  ip_hint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX idx_admin_sessions_login_created ON admin_sessions(github_login, created_at DESC);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_created ON admin_audit_log(created_at DESC);

CREATE TABLE account_deletion_log (
  id TEXT PRIMARY KEY,
  deleted_role TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
