-- Private transactional template drafts only: no email provider, queue or outbound trigger is enabled.
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  published_revision INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT,
  CHECK ((published_json IS NULL AND published_revision IS NULL) OR (published_json IS NOT NULL AND published_revision > 0 AND published_revision <= revision))
);
CREATE TABLE IF NOT EXISTS email_template_versions (
  template_id TEXT NOT NULL REFERENCES email_templates(id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save_draft', 'publish', 'reset_draft')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  PRIMARY KEY (template_id, revision)
);
CREATE TABLE IF NOT EXISTS email_template_transaction_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK (valid = 1));
