import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

// GET /api/research/[id] — the research and its progress steps (used by polling).
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const store = getStore();
  const research = store.getResearch(id);
  if (!research) return errorResponse(404, "We couldn't find this research.");
  return NextResponse.json({ research, steps: store.listSteps(id) });
}

// DELETE /api/research/[id]
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!getStore().deleteResearch(id)) {
    return errorResponse(404, "We couldn't find this research.");
  }
  return new Response(null, { status: 204 });
}
