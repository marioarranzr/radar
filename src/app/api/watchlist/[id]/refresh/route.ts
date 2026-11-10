import { NextResponse } from "next/server";
import { startResearchAgent } from "@/agent/start";
import { refreshWatch } from "@/agent/watchlist";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

// POST /api/watchlist/[id]/refresh — refresh a followed company now.
export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const store = getStore();
  const watch = store.getWatch(id);
  if (!watch) return errorResponse(404, "This company isn't followed.");

  const outcome = refreshWatch(watch, {
    store,
    dailyLimit: getEnv().DAILY_RESEARCH_LIMIT,
    enqueue: startResearchAgent,
  });
  if (outcome.status === "busy") return errorResponse(409, "A refresh is already in progress.");
  if (outcome.status === "limit") return errorResponse(429, "You've reached today's research limit. Try again tomorrow.");
  return NextResponse.json({ id: outcome.id });
}
