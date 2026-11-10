import { NextResponse } from "next/server";
import { startResearchAgent } from "@/agent/start";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { BatchRequestSchema } from "@/lib/validation";

// POST /api/research/batch — queue several companies at once (docs/02-TRD.md §4).
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse(415, "Send the request as JSON.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "The request body must be JSON.");
  }

  const parsed = BatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const store = getStore();
  const remaining = getEnv().DAILY_RESEARCH_LIMIT - store.countResearchToday();
  const queries = parsed.data.queries;
  if (queries.length > remaining) {
    const left = Math.max(0, remaining);
    return errorResponse(429, `Only ${left} research${left === 1 ? "" : "es"} left today; you sent ${queries.length}.`);
  }

  // node:sqlite is synchronous, so the check above and these inserts can't interleave with another request.
  const ids = queries.map((query) => store.createResearch({ query }));
  for (const id of ids) startResearchAgent(id);
  return NextResponse.json({ ids });
}
