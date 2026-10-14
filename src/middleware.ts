import { NextResponse, type NextRequest } from "next/server";

// Radar is a localhost-only tool with no auth. Block requests that could come from
// elsewhere: other hosts (DNS rebinding) and cross-site browser requests (CSRF).

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocal(hostWithPort: string | null): boolean {
  if (!hostWithPort) return false;
  const hostname = hostWithPort.startsWith("[")
    ? hostWithPort.slice(0, hostWithPort.indexOf("]") + 1)
    : hostWithPort.split(":")[0];
  return LOCAL_HOSTNAMES.has(hostname);
}

export function middleware(request: NextRequest) {
  if (!isLocal(request.headers.get("host"))) {
    return NextResponse.json({ error: "Radar only accepts local requests." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin !== null) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // "null" or a malformed origin: treat as cross-site.
    }
    if (!isLocal(originHost)) {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
