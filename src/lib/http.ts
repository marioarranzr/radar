import { NextResponse } from "next/server";

/** JSON error body shared by every API route: { error: string }. */
export function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
