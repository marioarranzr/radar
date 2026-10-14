import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

function request(method: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/research", { method, headers });
}

describe("middleware", () => {
  it("lets local requests through", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect(middleware(request("GET", { host })).status).toBe(200);
    }
  });

  it("allows same-origin writes from the app", () => {
    const response = middleware(request("POST", { host: "localhost:3000", origin: "http://localhost:3000" }));
    expect(response.status).toBe(200);
  });

  it("blocks requests addressed to another host (DNS rebinding)", () => {
    expect(middleware(request("GET", { host: "evil.example.com" })).status).toBe(403);
    expect(middleware(request("GET", { host: "192.168.1.20:3000" })).status).toBe(403);
  });

  it("blocks cross-site writes (CSRF)", () => {
    for (const origin of ["https://evil.example.com", "null"]) {
      const response = middleware(request("POST", { host: "localhost:3000", origin }));
      expect(response.status).toBe(403);
    }
  });
});
