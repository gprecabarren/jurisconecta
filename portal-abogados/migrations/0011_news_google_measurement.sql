PRAGMA foreign_keys = ON;

CREATE TABLE news_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_html TEXT NOT NULL,
  cover_url TEXT NOT NULL DEFAULT '/og-jurisconecta.png',
  cover_alt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  seo_title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  focus_keyword TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL,
  og_title TEXT NOT NULL,
  og_description TEXT NOT NULL,
  noindex INTEGER NOT NULL DEFAULT 0 CHECK(noindex IN (0,1)),
  author TEXT NOT NULL DEFAULT 'Equipo editorial de JurisConecta',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_news_public_date ON news_posts(status,published_at DESC);
CREATE TABLE news_media (
  id TEXT PRIMARY KEY,
  data_base64 TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp','image/jpeg','image/png')),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 61440),
  alt TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE google_identities (
  subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE google_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  intent TEXT NOT NULL CHECK(intent IN ('login','register','link','reauth')),
  role TEXT NOT NULL CHECK(role IN ('person','lawyer')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_google_flow_expiry ON google_oauth_flows(expires_at);
CREATE TABLE google_registrations (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('person','lawyer')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_google_registration_expiry ON google_registrations(expires_at);
CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE user_sessions ADD COLUMN google_reauth_at INTEGER;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;

ALTER TABLE site_settings ADD COLUMN gtm_id TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN ga_measurement_id TEXT NOT NULL DEFAULT '';
