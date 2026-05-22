-- Portelo Database Schema v1
-- All monetary amounts in RSD, period format: YYYY-MM

CREATE TABLE IF NOT EXISTS buildings (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  logo_url    TEXT,
  accent_color TEXT DEFAULT '#1e7f54',
  settings    TEXT DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS residents (
  id            TEXT PRIMARY KEY,
  building_id   TEXT NOT NULL REFERENCES buildings(id),
  apartment_ref TEXT NOT NULL,
  pin_hash      TEXT NOT NULL,
  display_name  TEXT,
  email         TEXT,
  phone         TEXT,
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(building_id, apartment_ref)
);

CREATE TABLE IF NOT EXISTS bills (
  id            TEXT PRIMARY KEY,
  resident_id   TEXT NOT NULL REFERENCES residents(id),
  building_id   TEXT NOT NULL REFERENCES buildings(id),
  period        TEXT NOT NULL,
  total_amount  REAL NOT NULL,
  currency      TEXT DEFAULT 'RSD',
  status        TEXT DEFAULT 'pending',
  paid_amount   REAL DEFAULT 0,
  paid_at       TEXT,
  due_date      TEXT,
  line_items    TEXT DEFAULT '[]',
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS infostan_references (
  id                  TEXT PRIMARY KEY,
  resident_id         TEXT NOT NULL REFERENCES residents(id),
  building_id         TEXT NOT NULL REFERENCES buildings(id),
  period              TEXT NOT NULL,
  expected_amount     REAL,
  infostan_amount     REAL,
  line_items          TEXT DEFAULT '[]',
  infostan_line_items TEXT DEFAULT '[]',
  status              TEXT DEFAULT 'pending_verification',
  discrepancy_amount  REAL,
  resident_notes      TEXT,
  admin_notes         TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_bills (
  id              TEXT PRIMARY KEY,
  building_id     TEXT NOT NULL REFERENCES buildings(id),
  period          TEXT NOT NULL,
  consumption_kwh REAL,
  total_amount    REAL,
  currency        TEXT DEFAULT 'RSD',
  pdf_r2_key      TEXT,
  extracted_data  TEXT,
  extraction_ok   INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL,
  building_id   TEXT,
  password_hash TEXT NOT NULL,
  last_login    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  resident_id   TEXT REFERENCES residents(id),
  admin_id      TEXT REFERENCES admin_users(id),
  expires_at    TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_logs (
  id            TEXT PRIMARY KEY,
  building_id   TEXT NOT NULL REFERENCES buildings(id),
  period        TEXT,
  import_type   TEXT NOT NULL,
  row_count     INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  skipped_rows  TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT PRIMARY KEY,
  attempts      INTEGER DEFAULT 0,
  reset_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_residents_building ON residents(building_id);
CREATE INDEX IF NOT EXISTS idx_bills_resident ON bills(resident_id);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(building_id, period);
CREATE INDEX IF NOT EXISTS idx_infostan_resident ON infostan_references(resident_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
