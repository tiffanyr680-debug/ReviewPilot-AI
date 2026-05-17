-- ReviewPilot AI — Turso (libSQL/SQLite) schema.
-- IDs are app-generated UUID strings. Timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  brand_voice TEXT NOT NULL DEFAULT 'We are a friendly, professional local service business. Our replies should be warm, grateful, and concise.',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS organization_members (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  google_place_id TEXT,
  facebook_page_id TEXT,
  rating_avg      REAL NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  location_id   TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('google','facebook','yelp','manual')),
  author_name   TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  content       TEXT,
  reply_content TEXT,
  sentiment     TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  posted_at     TEXT,
  synced_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS review_requests (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id    TEXT REFERENCES locations(id),
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  template_id    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','opened','clicked','completed','failed')),
  sent_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS request_templates (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  sms_body            TEXT,
  email_subject       TEXT,
  email_body          TEXT,
  trigger_delay_hours INTEGER NOT NULL DEFAULT 24,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  status               TEXT NOT NULL DEFAULT 'inactive',
  plan                 TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','agency')),
  current_period_end   TEXT,
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_location_source ON reviews(location_id, source);
CREATE INDEX IF NOT EXISTS idx_reviews_org_sentiment   ON reviews(org_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_org_posted      ON reviews(org_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_org_status     ON review_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_locations_org           ON locations(org_id);
CREATE INDEX IF NOT EXISTS idx_members_user            ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user           ON sessions(user_id);

-- Used by review-sync upserts (INSERT ... ON CONFLICT). Postgres lacked this
-- unique constraint; it is required for ON CONFLICT to work in SQLite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_dedupe
  ON reviews(location_id, source, author_name, posted_at);
