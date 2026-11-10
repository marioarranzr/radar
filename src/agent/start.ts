import { after } from "next/server";
import { createRunQueue, type RunQueue } from "@/agent/queue";
import { runResearchAgent } from "@/agent/run";
import { getStore } from "@/lib/db";

/**
 * Runs one research through the queue. The agent records its own failures; this catches
 * the ones that happen before it can (e.g. a bad client setup), so a research never
 * stays queued forever.
 */
async function runSafely(id: string): Promise<void> {
  try {
    await runResearchAgent(id);
  } catch (error) {
    console.error(`[agent] research ${id} couldn't start`, error);
    getStore().markFailed(id, "The research couldn't start. Please retry.");
  }
}

// One queue per server process, kept across dev hot reloads.
const globalForQueue = globalThis as { __radarQueue?: RunQueue };

function getRunQueue(): RunQueue {
  globalForQueue.__radarQueue ??= createRunQueue(runSafely);
  return globalForQueue.__radarQueue;
}

/** Queues a research right away (for callers outside a request, e.g. the scheduler). */
export function enqueueResearch(id: string): void {
  void getRunQueue().enqueue(id);
}

/** Queues the research after the response is sent (at most 2 run at once). */
export function startResearchAgent(id: string): void {
  after(() => getRunQueue().enqueue(id));
}
