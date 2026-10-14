import { NextResponse } from "next/server";
import { startResearchAgent } from "@/agent/start";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

/** Retries don't count against the daily limit, so cap them per research. */
const MAX_ATTEMPTS = 3;

// POST /api/research/[id]/retry — relaunch a failed research.
export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const store = getStore();
  const research = store.getResearch(id);
  if (!research) return errorResponse(404, "We couldn't find this research.");
  if (research.attempts >= MAX_ATTEMPTS) {
    return errorResponse(409, "This research was retried too many times. Start a new one.");
  }
  if (!store.resetForRetry(id)) return errorResponse(409, "Only failed research can be retried.");

  startResearchAgent(id);
  return NextResponse.json({ id });
}
