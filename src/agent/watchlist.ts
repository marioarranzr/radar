import type { Store, Watch } from "@/lib/db";

// Watchlist refreshes — see docs/02-TRD.md §3.11.

export type RefreshOutcome =
  | { status: "started"; id: string }
  | { status: "busy" } // the last research is still queued or running
  | { status: "limit" }; // no research left today

export interface RefreshDeps {
  store: Store;
  dailyLimit: number;
  /** Hands a new research to the run queue. */
  enqueue: (id: string) => void;
}

/** Starts a refresh of a followed company, linked to its previous research. */
export function refreshWatch(watch: Watch, deps: RefreshDeps): RefreshOutcome {
  const { store } = deps;
  const last = watch.lastResearchId ? store.getResearch(watch.lastResearchId) : null;
  if (last && (last.status === "queued" || last.status === "running")) return { status: "busy" };
  if (store.countResearchToday() >= deps.dailyLimit) return { status: "limit" };

  const id = store.createResearch({ query: watch.query, context: watch.context, previousId: last?.id ?? null });
  store.recordRefresh(watch.id, id);
  deps.enqueue(id);
  return { status: "started", id };
}

/** Refreshes every due watch until the daily limit is reached; returns how many started. */
export function runDueRefreshes(deps: RefreshDeps & { now?: Date }): number {
  let started = 0;
  for (const watch of deps.store.dueWatches(deps.now)) {
    const outcome = refreshWatch(watch, deps);
    if (outcome.status === "limit") break;
    if (outcome.status === "started") started++;
  }
  return started;
}

export const SCHEDULER_INTERVAL_MS = 10 * 60 * 1000;

const globalForScheduler = globalThis as { __radarScheduler?: ReturnType<typeof setInterval> };

/** Checks for due refreshes now and every 10 minutes while the server runs (once per process). */
export function startWatchlistScheduler(getDeps: () => RefreshDeps): void {
  if (globalForScheduler.__radarScheduler) return;
  const tick = () => {
    try {
      const started = runDueRefreshes(getDeps());
      if (started) console.log(`[watchlist] started ${started} refresh(es)`);
    } catch (error) {
      console.error("[watchlist] scheduler tick failed", error);
    }
  };
  globalForScheduler.__radarScheduler = setInterval(tick, SCHEDULER_INTERVAL_MS);
  globalForScheduler.__radarScheduler.unref?.();
  setTimeout(tick, 5_000).unref?.();
}
