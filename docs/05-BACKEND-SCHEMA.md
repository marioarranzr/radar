# 05 · Backend Schema

> **Local SQLite** using Node 24's built-in `node:sqlite` module. A single file:
> `data/radar.db` (path configurable via `DATABASE_PATH`, ignored by git).
> The schema lives in `db/schema.sql` and that is the only way to change it.

---

## 1. Authentication

**None in the MVP.** The app is for personal use and only listens on `localhost`.
There are no user tables. When there are more users, a `users` table, a `user_id` column
in `research` and a login flow will be added (record the change in TRD §9).

## 2. Entity diagram

```
research
   │ 1
   │
   │ N
research_steps      (research_id → research.id, ON DELETE CASCADE)
```

## 3. Tables

### 3.1 `research`
| Column | SQLite type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` | PRIMARY KEY | UUID generated in Node (`crypto.randomUUID()`) |
| `query` | `TEXT` | NOT NULL, CHECK length 2-200 | Company or URL |
| `context` | `TEXT` | NULL, CHECK length ≤ 300 | Optional context |
| `status` | `TEXT` | NOT NULL DEFAULT 'queued', CHECK in (`queued`,`running`,`done`,`failed`) | Status |
| `report` | `TEXT` | NULL | JSON of the validated brief (`ReportSchema`). Only when `status='done'` |
| `company_name` | `TEXT` | NULL | Extracted from `report` for the history |
| `error` | `TEXT` | NULL | Readable message if `failed` |
| `attempts` | `INTEGER` | NOT NULL DEFAULT 0 | Incremented on every run |
| `input_tokens` | `INTEGER` | NULL | Sum of `usage` |
| `output_tokens` | `INTEGER` | NULL | |
| `searches` | `INTEGER` | NULL | Number of `web_search` calls used |
| `pages_read` | `INTEGER` | NULL | Number of `web_fetch` calls used |
| `started_at` | `TEXT` | NULL | ISO 8601 UTC |
| `finished_at` | `TEXT` | NULL | ISO 8601 UTC |
| `created_at` | `TEXT` | NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) | ISO 8601 UTC |

Index: `idx_research_created_at` on `(created_at DESC)` for the history and the daily count.

### 3.2 `research_steps`
| Column | SQLite type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER` | PRIMARY KEY AUTOINCREMENT | Natural order |
| `research_id` | `TEXT` | NOT NULL, FK → `research.id` ON DELETE CASCADE | |
| `kind` | `TEXT` | NOT NULL, CHECK in (`search`,`fetch`,`thinking`,`info`) | Step type |
| `label` | `TEXT` | NOT NULL | Text shown to the user |
| `created_at` | `TEXT` | NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) | |

Index: `idx_steps_research` on `(research_id, id)`.

## 4. `db/schema.sql`

```sql
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
```

`PRAGMA foreign_keys = ON` runs **on every connection** (SQLite doesn't remember it).

## 5. Data access (`src/lib/db.ts`)

- `openDatabase(path)` opens a `DatabaseSync` connection; `createStore(db)` wraps it with the functions below.
  The app uses a single shared store via `getStore()` (module-level singleton); tests use `:memory:`.
- The store is opened from `src/instrumentation.ts`, so the database file is created when the server starts.
- On open: creates the `data/` folder if missing and runs `db/schema.sql` (idempotent thanks to `IF NOT EXISTS`).
- All queries use prepared statements with `?` parameters.
- `PRAGMA busy_timeout = 5000` so concurrent writers wait instead of failing.
- The store is cached on `globalThis` so Next.js hot-reload and separate bundles share one connection.
- `IF NOT EXISTS` never alters existing tables: a schema change on an existing `data/radar.db` needs a manual
  `ALTER TABLE` (or deleting the local file) — note it in the commit that changes the schema.
- Exposed functions (and nothing else):

| Function | Used by |
|---|---|
| `createResearch({ query, context })` → `id` | `POST /api/research` |
| `getResearch(id)` → row + parsed `report` | Brief, polling |
| `listResearch()` | History (most recent first) |
| `countResearchToday()` / `countResearchSince(iso)` | Daily limit |
| `markRunning(id)` / `markDone(id, report, metrics)` / `markFailed(id, error, metrics?)` | Agent (each returns `false` if the row was deleted → the agent stops) |
| `addStep(id, kind, label)` / `listSteps(id)` | Progress (`addStep` returns `false` if the row was deleted) |
| `resetForRetry(id)` | Retry, **only if `status='failed'`**: deletes steps, clears error/report/metrics, `status='queued'`; returns `false` otherwise |
| `failInterruptedRuns()` | On startup: rows left `queued`/`running` by a previous process → `failed` ("interrupted") |
| `deleteResearch(id)` | Delete (steps go via CASCADE) |

## 6. Daily limit

```sql
SELECT count(*) FROM research
WHERE created_at >= ?   -- start of the day in Europe/Madrid, converted to UTC ISO in Node
```
A retry does **not** count against the limit (only created rows count).

## 7. Lifecycle of a `research` row

| Event | Who | Changes |
|---|---|---|
| I press Research | `POST /api/research` | INSERT `status='queued'` |
| The agent starts | `agent/run.ts` | `status='running'`, `started_at`, `attempts+1` |
| Each tool used | agent | INSERT into `research_steps` |
| Valid brief | agent | `status='done'`, `report`, `company_name`, metrics, `finished_at` |
| Error | agent | `status='failed'`, `error`, `finished_at` |
| Retry | `POST /api/research/[id]/retry` | `resetForRetry` (only from `failed`) and relaunches the agent |
| Server restart | `getStore()` on startup | `queued`/`running` rows → `failed` with an "interrupted" error |
| Delete | `DELETE /api/research/[id]` | DELETE row + steps |

## 8. Backups

It's a single file: copying `data/radar.db` (with the app stopped) is a backup.
