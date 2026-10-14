import { describe, expect, it } from "vitest";
import { formatDuration, formatRelative, hostname, isSafeUrl } from "@/lib/format";

const now = new Date("2026-10-14T12:00:00Z");

describe("format helpers", () => {
  it("formats relative times", () => {
    expect(formatRelative("2026-10-14T11:59:50Z", now)).toBe("just now");
    expect(formatRelative("2026-10-14T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-10-13T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelative("2026-09-01T12:00:00Z", now)).toBe("Sep 1, 2026");
  });

  it("formats durations", () => {
    expect(formatDuration(74)).toBe("1 min 14 s");
    expect(formatDuration(42.4)).toBe("42 s");
    expect(formatDuration(120)).toBe("2 min");
  });

  it("shortens hostnames and only trusts http(s) links", () => {
    expect(hostname("https://www.acme.com/about")).toBe("acme.com");
    expect(isSafeUrl("https://acme.com")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });
});
