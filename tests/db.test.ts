import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createStore, migrate, openDatabase, startOfDayUtc, type Store } from "@/lib/db";

let store: Store;

beforeEach(() => {
  store = createStore(openDatabase(":memory:"));
});

describe("research store", () => {
  it("creates a queued research and reads it back", () => {
    const id = store.createResearch({ query: "Acme Corp", context: "Selling HR software" });
    const research = store.getResearch(id);

    expect(research).toMatchObject({
      id,
      query: "Acme Corp",
      context: "Selling HR software",
      status: "queued",
      attempts: 0,
      report: null,
    });
    expect(research?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stores a missing context as null", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    expect(store.getResearch(id)?.context).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(store.getResearch("does-not-exist")).toBeNull();
  });

  it("rejects queries outside the allowed length", () => {
    expect(() => store.createResearch({ query: "A" })).toThrow();
  });

  it("lists research most recent first", () => {
    const first = store.createResearch({ query: "First Co" });
    const second = store.createResearch({ query: "Second Co" });
    expect(store.listResearch().map((r) => r.id)).toEqual([second, first]);
  });

  it("tracks a run from running to done with its report and metrics", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    expect(store.getResearch(id)).toMatchObject({ status: "running", attempts: 1 });

    const report = { company_name: "Acme Corporation" };
    store.markDone(id, report, {
      companyName: "Acme Corporation",
      inputTokens: 1200,
      outputTokens: 800,
      searches: 3,
      pagesRead: 5,
    });

    expect(store.getResearch(id)).toMatchObject({
      status: "done",
      report,
      companyName: "Acme Corporation",
      inputTokens: 1200,
      outputTokens: 800,
      searches: 3,
      pagesRead: 5,
      error: null,
    });
    expect(store.getResearch(id)?.finishedAt).not.toBeNull();
  });

  it("stores the verification summary with the brief and clears it on retry", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    store.markDone(id, {}, { verification: { checked: 8, downgraded: 1, removedSignals: 0 } });
    expect(store.getResearch(id)?.verification).toEqual({ checked: 8, downgraded: 1, removedSignals: 0 });

    const other = store.createResearch({ query: "Other Co" });
    store.markRunning(other);
    store.markDone(other, {});
    expect(store.getResearch(other)?.verification).toBeNull();
  });

  it("records a failure with a readable error", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    store.markFailed(id, "The search took too long.");
    expect(store.getResearch(id)).toMatchObject({
      status: "failed",
      error: "The search took too long.",
    });
  });

  it("appends and lists progress steps in order", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.addStep(id, "search", "Searching: acme corp");
    store.addStep(id, "fetch", "Reading: acme.com");
    expect(store.listSteps(id).map((s) => [s.kind, s.label])).toEqual([
      ["search", "Searching: acme corp"],
      ["fetch", "Reading: acme.com"],
    ]);
  });

  it("resets a failed research for retry, clearing the previous attempt", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    store.addStep(id, "search", "Searching: acme corp");
    store.markFailed(id, "Boom", { inputTokens: 500, searches: 2 });

    expect(store.resetForRetry(id)).toBe(true);

    expect(store.getResearch(id)).toMatchObject({
      status: "queued",
      error: null,
      attempts: 1,
      inputTokens: null,
      searches: null,
    });
    expect(store.listSteps(id)).toEqual([]);
  });

  it("refuses to retry research that has not failed", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    store.addStep(id, "search", "Searching: acme corp");

    expect(store.resetForRetry(id)).toBe(false);
    expect(store.getResearch(id)?.status).toBe("running");
    expect(store.listSteps(id)).toHaveLength(1);
  });

  it("tells the agent when its research was deleted mid-run", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.markRunning(id);
    store.deleteResearch(id);

    expect(store.addStep(id, "search", "Searching: acme corp")).toBe(false);
    expect(store.markDone(id, { company_name: "Acme" })).toBe(false);
    expect(store.markFailed(id, "Boom")).toBe(false);
  });

  it("marks runs interrupted by a restart as failed", () => {
    const queued = store.createResearch({ query: "Queued Co" });
    const running = store.createResearch({ query: "Running Co" });
    store.markRunning(running);
    const done = store.createResearch({ query: "Done Co" });
    store.markDone(done, {});

    expect(store.failInterruptedRuns()).toBe(2);
    expect(store.getResearch(queued)?.status).toBe("failed");
    expect(store.getResearch(running)?.error).toMatch(/interrupted/);
    expect(store.getResearch(done)?.status).toBe("done");
  });

  it("deletes a research together with its steps", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    store.addStep(id, "info", "Starting");

    expect(store.deleteResearch(id)).toBe(true);
    expect(store.getResearch(id)).toBeNull();
    expect(store.listSteps(id)).toEqual([]);
    expect(store.deleteResearch(id)).toBe(false);
  });

  it("counts research created at or after a given instant", () => {
    store.createResearch({ query: "Today Co" });
    store.createResearch({ query: "Today Too" });
    expect(store.countResearchSince("2000-01-01T00:00:00.000Z")).toBe(2);
    expect(store.countResearchSince("2999-01-01T00:00:00.000Z")).toBe(0);
  });

  it("counts research created today", () => {
    store.createResearch({ query: "Today Co" });
    expect(store.countResearchToday()).toBe(1);
    expect(store.countResearchToday(new Date("2999-01-01T12:00:00Z"))).toBe(0);
  });
});

describe("startOfDayUtc", () => {
  it("returns Madrid midnight in UTC during summer time (UTC+2)", () => {
    expect(startOfDayUtc(new Date("2026-07-15T10:00:00Z"), "Europe/Madrid")).toBe(
      "2026-07-14T22:00:00.000Z",
    );
  });

  it("returns Madrid midnight in UTC during winter time (UTC+1)", () => {
    expect(startOfDayUtc(new Date("2026-01-15T10:00:00Z"), "Europe/Madrid")).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("handles the day summer time ends (midnight was UTC+2, noon is UTC+1)", () => {
    expect(startOfDayUtc(new Date("2026-10-25T12:00:00Z"), "Europe/Madrid")).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });

  it("handles the day summer time starts (midnight was UTC+1, noon is UTC+2)", () => {
    expect(startOfDayUtc(new Date("2026-03-29T12:00:00Z"), "Europe/Madrid")).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });

  it("uses the Madrid calendar day, not the UTC one, just after local midnight", () => {
    // 23:30 UTC on Jan 14 is already 00:30 on Jan 15 in Madrid.
    expect(startOfDayUtc(new Date("2026-01-14T23:30:00Z"), "Europe/Madrid")).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });
});

describe("migrate", () => {
  it("adds columns introduced after the first release to an older database", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE research (id TEXT PRIMARY KEY, query TEXT NOT NULL)");
    db.exec("INSERT INTO research (id, query) VALUES ('r1', 'Acme')");

    migrate(db);
    migrate(db); // idempotent

    const columns = (db.prepare("PRAGMA table_info(research)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain("verification");
    expect(db.prepare("SELECT query FROM research").get()).toEqual({ query: "Acme" });
  });
});

describe("watchlist", () => {
  it("follows a company once, case-insensitively, keeping its context", () => {
    const first = store.createResearch({ query: "Acme Corp", context: "Selling HR software" });
    const second = store.createResearch({ query: "acme corp" });

    const watch = store.follow(first);
    expect(store.follow(second)?.id).toBe(watch?.id);
    expect(store.listWatchlist()).toHaveLength(1);
    expect(watch).toMatchObject({ query: "Acme Corp", context: "Selling HR software", lastResearchId: first, intervalDays: 7 });
    expect(store.follow("missing")).toBeNull();
  });

  it("links a refresh to the previous research", () => {
    const first = store.createResearch({ query: "Acme Corp" });
    const refresh = store.createResearch({ query: "Acme Corp", previousId: first });
    expect(store.getResearch(refresh)?.previousId).toBe(first);
    expect(store.getResearch(first)?.previousId).toBeNull();
  });

  it("is due when the last research finished more than the interval ago", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    const watch = store.follow(id)!;
    const createdAt = new Date(store.getResearch(id)!.createdAt);
    const inEightDays = new Date(createdAt.getTime() + 8 * 86_400_000);

    expect(store.dueWatches(inEightDays)).toHaveLength(0); // still queued
    store.markRunning(id);
    store.markDone(id, {});
    expect(store.dueWatches(new Date(createdAt.getTime() + 86_400_000))).toHaveLength(0);
    expect(store.dueWatches(inEightDays).map((w) => w.id)).toEqual([watch.id]);
  });

  it("is due right away when its last research was deleted, and unfollows", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    const watch = store.follow(id)!;
    store.deleteResearch(id);

    expect(store.getWatch(watch.id)?.lastResearchId).toBeNull();
    expect(store.dueWatches()).toHaveLength(1);
    expect(store.unfollow(watch.id)).toBe(true);
    expect(store.listWatchlist()).toHaveLength(0);
  });

  it("records the newest research of a watch", () => {
    const first = store.createResearch({ query: "Acme Corp" });
    const watch = store.follow(first)!;
    const second = store.createResearch({ query: "Acme Corp", previousId: first });
    store.recordRefresh(watch.id, second);
    expect(store.getWatch(watch.id)?.lastResearchId).toBe(second);
  });
});

