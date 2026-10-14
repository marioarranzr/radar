import { NextResponse } from "next/server";
import { startResearchAgent } from "@/agent/start";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { ResearchRequestSchema } from "@/lib/validation";

// POST /api/research — start a new research run (docs/02-TRD.md §4).
export async function POST(request: Request) {
  // Requiring JSON forces a CORS preflight for cross-site browsers, which they can't pass.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse(415, "Send the request as JSON.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "The request body must be JSON.");
  }

  const parsed = ResearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const store = getStore();
  if (store.countResearchToday() >= getEnv().DAILY_RESEARCH_LIMIT) {
    return errorResponse(429, "You've reached today's research limit. Try again tomorrow.");
  }

  const id = store.createResearch(parsed.data);
  startResearchAgent(id);
  return NextResponse.json({ id });
}
