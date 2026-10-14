import { after } from "next/server";
import { runResearchAgent } from "@/agent/run";
import { getStore } from "@/lib/db";

/**
 * Runs the agent after the response is sent. The agent records its own failures;
 * this catches the ones that happen before it can (e.g. a bad client setup),
 * so the research never stays queued forever.
 */
export function startResearchAgent(id: string): void {
  after(async () => {
    try {
      await runResearchAgent(id);
    } catch (error) {
      console.error(`[agent] research ${id} couldn't start`, error);
      getStore().markFailed(id, "The research couldn't start. Please retry.");
    }
  });
}
