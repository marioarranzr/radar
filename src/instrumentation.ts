// Runs once when the Next.js server starts: fail fast on a bad configuration, make sure the
// local database exists, and start the watchlist scheduler (docs/02-TRD.md §3.11).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    const { getStore } = await import("@/lib/db");
    const { enqueueResearch } = await import("@/agent/start");
    const { startWatchlistScheduler } = await import("@/agent/watchlist");
    getEnv();
    getStore();
    startWatchlistScheduler(() => ({
      store: getStore(),
      dailyLimit: getEnv().DAILY_RESEARCH_LIMIT,
      enqueue: enqueueResearch,
    }));
  }
}
