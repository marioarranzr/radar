-- Radar SQLite schema — see docs/05-BACKEND-SCHEMA.md.
-- Idempotent: it runs on every connection.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;   -- polling reads while the agent writes

CREATE TABLE IF NOT EXISTS research (
  id            TEXT PRIMARY KEY,
  query         TEXT NOT NULL CHECK (length(query) BETWEEN 2 AND 200),
  context       TEXT CHECK (context IS NULL OR length(context) <= 300),
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','done','failed')),
  report        TEXT,
  company_name  TEXT,
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  searches      INTEGER,
  pages_read    INTEGER,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_research_created_at ON research (created_at DESC);

CREATE TABLE IF NOT EXISTS research_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  research_id TEXT NOT NULL REFERENCES research(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('search','fetch','thinking','info')),
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_steps_research ON research_steps (research_id, id);
