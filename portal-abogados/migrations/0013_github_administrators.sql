PRAGMA foreign_keys = ON;

CREATE TABLE github_administrators (
  github_id INTEGER PRIMARY KEY,
  github_login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  invited_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  revoked_at TEXT
);
-- Existing owner only. Public GitHub ID verified against /users/gprecabarren.
INSERT INTO github_administrators (github_id, github_login, role, accepted_at)
VALUES (58262409, 'gprecabarren', 'owner', CURRENT_TIMESTAMP);
ALTER TABLE admin_sessions ADD COLUMN github_id INTEGER REFERENCES github_administrators(github_id);
UPDATE admin_sessions SET github_id = 58262409 WHERE lower(github_login) = 'gprecabarren';

CREATE TABLE admin_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  github_id INTEGER NOT NULL,
  github_login TEXT NOT NULL COLLATE NOCASE,
  email TEXT NOT NULL COLLATE NOCASE,
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  accepted_proof TEXT UNIQUE
);
CREATE UNIQUE INDEX idx_admin_invitation_pending ON admin_invitations(github_id) WHERE status = 'pending';
CREATE TABLE github_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  invitation_id TEXT REFERENCES admin_invitations(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE admin_acceptance_proofs (
  token_hash TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES admin_invitations(id),
  github_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
