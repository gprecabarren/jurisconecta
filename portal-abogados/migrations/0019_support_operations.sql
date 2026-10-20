PRAGMA foreign_keys = ON;

ALTER TABLE support_tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE support_tickets ADD COLUMN assigned_github_id INTEGER REFERENCES github_administrators(github_id);
ALTER TABLE support_tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN first_response_at TEXT;
ALTER TABLE support_tickets ADD COLUMN last_user_message_at TEXT;
ALTER TABLE support_tickets ADD COLUMN last_public_reply_at TEXT;
ALTER TABLE support_tickets ADD COLUMN resolved_at TEXT;
ALTER TABLE support_tickets ADD COLUMN closed_at TEXT;
ALTER TABLE support_tickets ADD COLUMN create_request_key TEXT;
ALTER TABLE support_tickets ADD COLUMN create_payload_hash TEXT;
ALTER TABLE support_ticket_messages ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal'));
ALTER TABLE support_ticket_messages ADD COLUMN admin_github_id INTEGER REFERENCES github_administrators(github_id);
ALTER TABLE support_ticket_messages ADD COLUMN admin_login TEXT;

UPDATE support_tickets SET
  first_response_at = (SELECT MIN(created_at) FROM support_ticket_messages WHERE ticket_id = support_tickets.id AND author = 'admin'),
  last_public_reply_at = (SELECT MAX(created_at) FROM support_ticket_messages WHERE ticket_id = support_tickets.id AND author = 'admin'),
  last_user_message_at = (SELECT MAX(created_at) FROM support_ticket_messages WHERE ticket_id = support_tickets.id AND author = 'user'),
  resolved_at = CASE WHEN status IN ('resolved', 'closed') THEN updated_at END,
  closed_at = CASE WHEN status = 'closed' THEN updated_at END;

CREATE UNIQUE INDEX idx_support_create_request ON support_tickets(user_id, create_request_key) WHERE create_request_key IS NOT NULL;
CREATE INDEX idx_support_created_id ON support_tickets(created_at DESC, id DESC);
CREATE INDEX idx_support_assigned_status ON support_tickets(assigned_github_id, status);
CREATE INDEX idx_support_message_visibility ON support_ticket_messages(ticket_id, visibility);

CREATE TABLE support_team_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ticket_created', 'user_replied', 'user_reopened')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE support_alert_receipts (
  github_id INTEGER NOT NULL REFERENCES github_administrators(github_id),
  alert_id INTEGER NOT NULL REFERENCES support_team_alerts(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (github_id, alert_id)
);
CREATE INDEX idx_support_alerts_ticket ON support_team_alerts(ticket_id, id);

-- One immutable mutation is the atomic boundary for status, messages, audit and notices.
-- The version check executes inside SQLite, not between two network requests.
CREATE TABLE support_mutations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'admin')),
  actor_id TEXT NOT NULL,
  actor_login TEXT,
  request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('reply', 'reopen', 'update')),
  target_status TEXT NOT NULL CHECK (target_status IN ('open', 'waiting_user', 'resolved', 'closed')),
  target_priority TEXT NOT NULL CHECK (target_priority IN ('low', 'normal', 'high', 'urgent')),
  target_assignee INTEGER REFERENCES github_administrators(github_id),
  body TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'internal')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (actor_key, request_key)
);
CREATE INDEX idx_support_mutations_actor_created ON support_mutations(actor_key, created_at);

CREATE TRIGGER support_creation_limit BEFORE INSERT ON support_tickets
WHEN (SELECT COUNT(*) FROM support_tickets WHERE user_id = NEW.user_id AND created_at >= datetime('now', '-1 day')) >= 5
BEGIN SELECT RAISE(ABORT, 'support_daily_limit'); END;
CREATE TRIGGER support_creation_alert AFTER INSERT ON support_tickets
BEGIN INSERT INTO support_team_alerts (ticket_id, kind) VALUES (NEW.id, 'ticket_created'); END;
CREATE TRIGGER support_case_permission BEFORE INSERT ON support_tickets
WHEN NEW.case_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM legal_cases c JOIN users u ON u.id = NEW.user_id WHERE c.id = NEW.case_id
    AND u.status != 'suspended' AND (
      (u.role = 'person' AND c.person_id = u.id) OR
      (u.role = 'lawyer' AND u.status = 'active' AND c.person_id != u.id AND EXISTS (
        SELECT 1 FROM case_proposals p JOIN lawyer_profiles lp ON lp.user_id = p.lawyer_id
        WHERE p.case_id = c.id AND p.lawyer_id = u.id AND p.status = 'accepted' AND lp.application_status = 'approved'
      ))
    )
)
BEGIN SELECT RAISE(ABORT, 'support_case_permission'); END;

CREATE TRIGGER support_mutation_guard BEFORE INSERT ON support_mutations
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM support_tickets WHERE id = NEW.ticket_id AND version = NEW.expected_version)
    THEN RAISE(ABORT, 'support_version_conflict') END;
  SELECT CASE WHEN NEW.actor_kind = 'user' AND NOT EXISTS (
    SELECT 1 FROM support_tickets WHERE id = NEW.ticket_id AND user_id = NEW.actor_id
      AND (status != 'closed' OR NEW.action = 'reopen')
  ) THEN RAISE(ABORT, 'support_permission') END;
  SELECT CASE WHEN NEW.actor_kind = 'admin' AND NOT EXISTS (
    SELECT 1 FROM github_administrators WHERE github_id = CAST(NEW.actor_id AS INTEGER) AND status = 'active'
  ) THEN RAISE(ABORT, 'support_permission') END;
  SELECT CASE WHEN NEW.target_assignee IS NOT NULL AND NEW.target_assignee IS NOT (SELECT assigned_github_id FROM support_tickets WHERE id = NEW.ticket_id) AND NOT EXISTS (
    SELECT 1 FROM github_administrators WHERE github_id = NEW.target_assignee AND status = 'active'
  ) THEN RAISE(ABORT, 'support_invalid_assignee') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM support_mutations WHERE actor_key = NEW.actor_key AND created_at >= datetime('now', '-1 hour'))
      >= CASE WHEN NEW.actor_kind = 'admin' THEN 200 ELSE 30 END
    THEN RAISE(ABORT, 'support_reply_limit') END;
END;

-- SQLite lower() only folds ASCII. Pre-normalize Spanish accents/ñ explicitly
-- for search, including decomposed accents, without modifying displayed data.
ALTER TABLE support_tickets ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
UPDATE support_tickets SET search_text = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(support_tickets.id || ' ' || support_tickets.subject || ' ' || COALESCE((SELECT full_name || ' ' || email FROM users WHERE id = support_tickets.user_id), ''), 'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'), '́', ''), '̈', ''), '̃', ''));
CREATE TRIGGER support_search_insert AFTER INSERT ON support_tickets
BEGIN UPDATE support_tickets SET search_text = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(NEW.id || ' ' || NEW.subject || ' ' || COALESCE((SELECT full_name || ' ' || email FROM users WHERE id = NEW.user_id), ''), 'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'), '́', ''), '̈', ''), '̃', '')) WHERE id = NEW.id; END;
CREATE TRIGGER support_search_update AFTER UPDATE OF subject, user_id ON support_tickets
BEGIN UPDATE support_tickets SET search_text = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(NEW.id || ' ' || NEW.subject || ' ' || COALESCE((SELECT full_name || ' ' || email FROM users WHERE id = NEW.user_id), ''), 'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'), '́', ''), '̈', ''), '̃', '')) WHERE id = NEW.id; END;
CREATE TRIGGER support_search_user_update AFTER UPDATE OF full_name, email ON users
BEGIN UPDATE support_tickets SET search_text = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(id || ' ' || subject || ' ' || NEW.full_name || ' ' || NEW.email, 'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'), '́', ''), '̈', ''), '̃', '')) WHERE user_id = NEW.id; END;

CREATE TRIGGER support_mutation_apply AFTER INSERT ON support_mutations
BEGIN
  INSERT INTO support_ticket_messages (id, ticket_id, author, body, visibility, admin_github_id, admin_login)
    SELECT NEW.id, NEW.ticket_id, NEW.actor_kind, NEW.body, NEW.visibility,
      CASE WHEN NEW.actor_kind = 'admin' THEN CAST(NEW.actor_id AS INTEGER) END, NEW.actor_login
    WHERE length(NEW.body) > 0;
  INSERT INTO notifications (id, user_id, category, title, body, href)
    SELECT NEW.id, t.user_id, 'support', 'Tu ticket tiene novedades',
      CASE WHEN length(NEW.body) > 0 AND NEW.visibility = 'public' THEN 'Soporte respondió tu solicitud.' ELSE 'El estado de tu ticket cambió. Revisa el panel de soporte.' END,
      '/soporte/#mis-tickets'
    FROM support_tickets t WHERE t.id = NEW.ticket_id AND NEW.actor_kind = 'admin'
      AND ((length(NEW.body) > 0 AND NEW.visibility = 'public') OR t.status != NEW.target_status)
      AND COALESCE((SELECT support_updates FROM notification_preferences WHERE user_id = t.user_id), 1) = 1;
  INSERT INTO support_team_alerts (ticket_id, kind)
    SELECT NEW.ticket_id, CASE WHEN NEW.action = 'reopen' THEN 'user_reopened' ELSE 'user_replied' END WHERE NEW.actor_kind = 'user';
  INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json)
    SELECT NEW.id, NEW.actor_login, 'ticket.update', 'ticket', NEW.ticket_id,
      json_object('status', NEW.target_status, 'priority', NEW.target_priority, 'assignedGithubId', NEW.target_assignee,
        'visibility', NEW.visibility, 'replied', length(NEW.body) > 0, 'previousVersion', NEW.expected_version)
    WHERE NEW.actor_kind = 'admin';
  UPDATE support_tickets SET
    status = NEW.target_status, priority = NEW.target_priority, assigned_github_id = NEW.target_assignee,
    version = version + 1, updated_at = CURRENT_TIMESTAMP,
    first_response_at = CASE WHEN NEW.actor_kind = 'admin' AND NEW.visibility = 'public' AND length(NEW.body) > 0 THEN COALESCE(first_response_at, CURRENT_TIMESTAMP) ELSE first_response_at END,
    last_public_reply_at = CASE WHEN NEW.actor_kind = 'admin' AND NEW.visibility = 'public' AND length(NEW.body) > 0 THEN CURRENT_TIMESTAMP ELSE last_public_reply_at END,
    last_user_message_at = CASE WHEN NEW.actor_kind = 'user' THEN CURRENT_TIMESTAMP ELSE last_user_message_at END,
    resolved_at = CASE WHEN NEW.target_status IN ('resolved', 'closed') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
    closed_at = CASE WHEN NEW.target_status = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE NULL END
    WHERE id = NEW.ticket_id;
END;
