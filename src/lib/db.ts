import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getEnv } from "@/lib/env";

// Data access for Radar — see docs/05-BACKEND-SCHEMA.md.

export type ResearchStatus = "queued" | "running" | "done" | "failed";
export type StepKind = "search" | "fetch" | "thinking" | "info";

export interface Research {
  id: string;
  query: string;
  context: string | null;
  status: ResearchStatus;
  /** Parsed brief JSON; validated by the agent before it is stored. */
  report: unknown;
  companyName: string | null;
  error: string | null;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  searches: number | null;
  pagesRead: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ResearchStep {
  id: number;
  researchId: string;
  kind: StepKind;
  label: string;
  createdAt: string;
}

export interface RunMetrics {
  companyName?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  searches?: number | null;
  pagesRead?: number | null;
}

const TIME_ZONE = "Europe/Madrid";
const SCHEMA_PATH = join(process.cwd(), "db", "schema.sql");

type Row = Record<string, string | number | null>;

function parseReport(value: Row[string]): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toResearch(row: Row): Research {
  return {
    id: row.id as string,
    query: row.query as string,
    context: row.context as string | null,
    status: row.status as ResearchStatus,
    report: parseReport(row.report),
    companyName: row.company_name as string | null,
    error: row.error as string | null,
    attempts: row.attempts as number,
    inputTokens: row.input_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    searches: row.searches as number | null,
    pagesRead: row.pages_read as number | null,
    startedAt: row.started_at as string | null,
    finishedAt: row.finished_at as string | null,
    createdAt: row.created_at as string,
  };
}

function toStep(row: Row): ResearchStep {
  return {
    id: row.id as number,
    researchId: row.research_id as string,
    kind: row.kind as StepKind,
    label: row.label as string,
    createdAt: row.created_at as string,
  };
}

/** Opens (and if needed creates) the database and applies the schema. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

function utcOffsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  // e.g. "GMT+02:00" → +120 minutes ("GMT" alone means UTC).
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

/** UTC ISO timestamp of the start of the current calendar day in `timeZone`. */
export function startOfDayUtc(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const localMidnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // The offset can differ between `now` and midnight on DST-change days: re-read it at midnight.
  const guess = localMidnightAsUtc - utcOffsetMinutes(now, timeZone) * 60_000;
  const offsetAtMidnight = utcOffsetMinutes(new Date(guess), timeZone);
  return new Date(localMidnightAsUtc - offsetAtMidnight * 60_000).toISOString();
}

const nowIso = () => new Date().toISOString();

export function createStore(db: DatabaseSync) {
  return {
    createResearch({ query, context }: { query: string; context?: string | null }): string {
      const id = randomUUID();
      db.prepare("INSERT INTO research (id, query, context) VALUES (?, ?, ?)").run(
        id,
        query,
        context ?? null,
      );
      return id;
    },

    getResearch(id: string): Research | null {
      const row = db.prepare("SELECT * FROM research WHERE id = ?").get(id) as Row | undefined;
      return row ? toResearch(row) : null;
    },

    listResearch(): Research[] {
      const rows = db
        .prepare("SELECT * FROM research ORDER BY created_at DESC, rowid DESC")
        .all() as Row[];
      return rows.map(toResearch);
    },

    countResearchSince(sinceIso: string): number {
      const row = db
        .prepare("SELECT count(*) AS n FROM research WHERE created_at >= ?")
        .get(sinceIso) as { n: number };
      return row.n;
    },

    countResearchToday(now: Date = new Date()): number {
      return this.countResearchSince(startOfDayUtc(now, TIME_ZONE));
    },

    /** Returns false if the research no longer exists (the agent should stop). */
    markRunning(id: string): boolean {
      return (
        db
          .prepare(
            "UPDATE research SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?",
          )
          .run(nowIso(), id).changes > 0
      );
    },

    markDone(id: string, report: unknown, metrics: RunMetrics = {}): boolean {
      return db.prepare(
        `UPDATE research
            SET status = 'done', report = ?, company_name = ?, error = NULL,
                input_tokens = ?, output_tokens = ?, searches = ?, pages_read = ?,
                finished_at = ?
          WHERE id = ?`,
      ).run(
        JSON.stringify(report),
        metrics.companyName ?? null,
        metrics.inputTokens ?? null,
        metrics.outputTokens ?? null,
        metrics.searches ?? null,
        metrics.pagesRead ?? null,
        nowIso(),
        id,
      ).changes > 0;
    },

    markFailed(id: string, error: string, metrics: RunMetrics = {}): boolean {
      return db.prepare(
        `UPDATE research
            SET status = 'failed', error = ?,
                input_tokens = ?, output_tokens = ?, searches = ?, pages_read = ?,
                finished_at = ?
          WHERE id = ?`,
      ).run(
        error,
        metrics.inputTokens ?? null,
        metrics.outputTokens ?? null,
        metrics.searches ?? null,
        metrics.pagesRead ?? null,
        nowIso(),
        id,
      ).changes > 0;
    },

    /** Returns false (instead of throwing) if the research was deleted mid-run. */
    addStep(researchId: string, kind: StepKind, label: string): boolean {
      return (
        db
          .prepare(
            `INSERT INTO research_steps (research_id, kind, label)
             SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM research WHERE id = ?)`,
          )
          .run(researchId, kind, label, researchId).changes > 0
      );
    },

    listSteps(researchId: string): ResearchStep[] {
      const rows = db
        .prepare("SELECT * FROM research_steps WHERE research_id = ? ORDER BY id")
        .all(researchId) as Row[];
      return rows.map(toStep);
    },

    /** Only failed research can be retried; returns false otherwise. */
    resetForRetry(id: string): boolean {
      db.exec("BEGIN");
      try {
        const { changes } = db
          .prepare(
            `UPDATE research
                SET status = 'queued', error = NULL, report = NULL, company_name = NULL,
                    input_tokens = NULL, output_tokens = NULL, searches = NULL, pages_read = NULL,
                    started_at = NULL, finished_at = NULL
              WHERE id = ? AND status = 'failed'`,
          )
          .run(id);
        if (changes > 0) db.prepare("DELETE FROM research_steps WHERE research_id = ?").run(id);
        db.exec("COMMIT");
        return changes > 0;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    /** Marks runs left queued/running by a previous server process as failed. */
    failInterruptedRuns(): number {
      return Number(
        db
          .prepare(
            `UPDATE research
                SET status = 'failed', error = 'The research was interrupted. Please retry.', finished_at = ?
              WHERE status IN ('queued', 'running')`,
          )
          .run(nowIso()).changes,
      );
    },

    deleteResearch(id: string): boolean {
      return db.prepare("DELETE FROM research WHERE id = ?").run(id).changes > 0;
    },
  };
}

export type Store = ReturnType<typeof createStore>;

// Cached on globalThis so dev hot-reload and separate Next.js bundles share one connection.
const globalForStore = globalThis as { __radarStore?: Store };

/** App-wide store backed by the file at DATABASE_PATH. */
export function getStore(): Store {
  if (!globalForStore.__radarStore) {
    const store = createStore(openDatabase(getEnv().DATABASE_PATH));
    // Background runs die with the process; don't leave them polling forever.
    store.failInterruptedRuns();
    globalForStore.__radarStore = store;
  }
  return globalForStore.__radarStore;
}
