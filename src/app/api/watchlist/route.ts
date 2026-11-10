import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";

const FollowSchema = z.object({ researchId: z.string().min(1) }, { error: "Invalid request." });

// POST /api/watchlist — follow the company of a research (docs/02-TRD.md §4).
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse(415, "Send the request as JSON.");
  }
  const parsed = FollowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "Invalid request.");

  const watch = getStore().follow(parsed.data.researchId);
  if (!watch) return errorResponse(404, "We couldn't find this research.");
  return NextResponse.json({ watch });
}
