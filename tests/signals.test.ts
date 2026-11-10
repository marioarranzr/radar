import { describe, expect, it } from "vitest";
import { newSignalIndexes, normalizeUrl } from "@/lib/signals";
import { validReport } from "./fixtures/report";

const withSignals = (signals: { title: string; url: string }[]) => ({
  ...validReport,
  recent_signals: signals.map((signal) => ({ date: "2026-11-01", ...signal })),
});

describe("newSignalIndexes", () => {
  it("flags signals whose URL and title weren't in the previous brief", () => {
    const previous = withSignals([{ title: "Raises Series A", url: "https://news.example.com/a" }]);
    const current = withSignals([
      { title: "Opens Berlin office", url: "https://news.example.com/b" },
      { title: "Raises Series A", url: "https://www.news.example.com/a/?utm_source=x" },
      { title: "raises  series a", url: "https://other.example.com/a" },
    ]);
    expect([...newSignalIndexes(current, previous)]).toEqual([0]);
  });

  it("flags nothing without a previous brief", () => {
    expect(newSignalIndexes(validReport, null).size).toBe(0);
  });
});

describe("normalizeUrl", () => {
  it("ignores www, trailing slashes, query strings and hashes", () => {
    expect(normalizeUrl("https://www.Acme.com/news/?ref=1#top")).toBe("acme.com/news");
  });
});
