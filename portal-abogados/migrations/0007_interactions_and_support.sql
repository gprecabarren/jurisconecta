PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_data_url TEXT;

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  case_updates INTEGER NOT NULL DEFAULT 1 CHECK (case_updates IN (0, 1)),
  support_updates INTEGER NOT NULL DEFAULT 1 CHECK (support_updates IN (0, 1)),
  account_updates INTEGER NOT NULL DEFAULT 1 CHECK (account_updates IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('case', 'support', 'account')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE lawyer_verifications (
  lawyer_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('video', 'in_person')),
  evidence_note TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('account', 'case', 'technical', 'privacy', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_user', 'resolved', 'closed')),
  case_id TEXT REFERENCES legal_cases(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_support_tickets_user_updated ON support_tickets(user_id, updated_at DESC);
CREATE INDEX idx_support_tickets_status_updated ON support_tickets(status, updated_at DESC);

CREATE TABLE support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('user', 'admin')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ticket_messages_ticket_created ON support_ticket_messages(ticket_id, created_at);

CREATE TABLE password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'used', 'cancelled')),
  token_hash TEXT,
  expires_at TEXT,
  verification_note TEXT,
  issued_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_at TEXT,
  used_at TEXT
);
CREATE INDEX idx_password_reset_user_created ON password_reset_requests(user_id, created_at DESC);

CREATE TABLE case_reviews (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES legal_cases(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lawyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_case_reviews_lawyer_created ON case_reviews(lawyer_id, created_at DESC);

CREATE UNIQUE INDEX idx_case_proposals_one_accepted ON case_proposals(case_id) WHERE status = 'accepted';

CREATE TRIGGER case_proposals_limit_three
BEFORE INSERT ON case_proposals
WHEN (SELECT COUNT(*) FROM case_proposals WHERE case_id = NEW.case_id) >= 3
BEGIN
  SELECT RAISE(ABORT, 'proposal_limit_reached');
END;

CREATE TRIGGER case_access_requires_accepted_proposal
BEFORE INSERT ON case_accesses
WHEN NOT EXISTS (
  SELECT 1 FROM case_proposals
  WHERE case_id = NEW.case_id AND lawyer_id = NEW.lawyer_id AND status = 'accepted'
)
BEGIN
  SELECT RAISE(ABORT, 'proposal_not_accepted');
END;
