CREATE TABLE IF NOT EXISTS site_social_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE CHECK (platform IN ('instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x', 'whatsapp', 'telegram')),
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
