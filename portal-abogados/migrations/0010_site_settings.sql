CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  maintenance_enabled INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_enabled IN (0, 1)),
  contact_email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (id, maintenance_enabled, contact_email) VALUES (1, 0, '');
