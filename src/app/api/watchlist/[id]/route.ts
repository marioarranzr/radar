import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

// DELETE /api/watchlist/[id] — unfollow.
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!getStore().unfollow(id)) return errorResponse(404, "This company isn't followed.");
  return new Response(null, { status: 204 });
}
