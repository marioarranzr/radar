import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { shortUrl, stepForItem } from "@/agent/steps";

type Item = OpenAI.Responses.ResponseOutputItem;

const webSearch = (action: unknown) =>
  ({ type: "web_search_call", id: "ws_1", status: "completed", action }) as Item;

describe("stepForItem", () => {
  it("describes a web search with its query", () => {
    expect(stepForItem(webSearch({ type: "search", queries: ["acme pricing"] }))).toEqual({
      kind: "search",
      label: "Searching: “acme pricing”",
    });
    expect(stepForItem(webSearch({ type: "search", query: "acme team" }))?.label).toBe(
      "Searching: “acme team”",
    );
  });

  it("describes opening a page with a short URL", () => {
    expect(stepForItem(webSearch({ type: "open_page", url: "https://www.acme.com/about/" }))).toEqual({
      kind: "fetch",
      label: "Reading: acme.com/about",
    });
  });

  it("describes searching inside a page", () => {
    const item = webSearch({ type: "find_in_page", url: "https://acme.com/pricing", pattern: "seat" });
    expect(stepForItem(item)).toEqual({ kind: "fetch", label: "Scanning: acme.com/pricing" });
  });

  it("falls back to generic labels when details are missing", () => {
    expect(stepForItem(webSearch({ type: "search" }))?.label).toBe("Searching the web");
    expect(stepForItem(webSearch({ type: "open_page", url: null }))?.label).toBe("Reading a page");
  });

  it("truncates very long search queries", () => {
    const step = stepForItem(webSearch({ type: "search", queries: ["x".repeat(200)] }));
    expect(step?.label.length).toBeLessThanOrEqual(80);
    expect(step?.label.endsWith("…")).toBe(true);
  });

  it("announces the brief when submit_report is called", () => {
    const item = { type: "function_call", name: "submit_report", arguments: "{}", call_id: "c1" } as Item;
    expect(stepForItem(item)).toEqual({ kind: "info", label: "Writing the brief" });
  });

  it("ignores messages and reasoning items", () => {
    expect(stepForItem({ type: "message", id: "m", role: "assistant", status: "completed", content: [] } as Item)).toBeNull();
    expect(stepForItem({ type: "reasoning", id: "r", summary: [] } as Item)).toBeNull();
  });
});

describe("shortUrl", () => {
  it("keeps invalid URLs readable", () => {
    expect(shortUrl("not a url")).toBe("not a url");
  });
});
