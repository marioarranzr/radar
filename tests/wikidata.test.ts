import { describe, expect, it, vi } from "vitest";
import { formatTime, lookupCompanyFacts, lookupCompanyFactsTool } from "@/agent/tools/wikidata";
import entity from "./fixtures/wikidata/entity-typeform.json";
import labels from "./fixtures/wikidata/labels-typeform.json";
import search from "./fixtures/wikidata/search-typeform.json";

// Recorded Wikidata API responses for "Typeform" (no network in tests).
function recordedFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    void init; // part of the fetch signature; the test reads it from mock.calls
    const params = new URL(url).searchParams;
    const body =
      params.get("action") === "wbsearchentities" ? search : params.get("props") === "labels" ? labels : entity;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe("lookupCompanyFacts", () => {
  it("returns labelled facts and a citable URL, skipping disambiguation pages", async () => {
    const fetchMock = recordedFetch();

    const [typeform, ...rest] = await lookupCompanyFacts("Typeform", fetchMock);

    expect(typeform).toEqual({
      id: "Q24910393",
      label: "Typeform.com",
      description: "online form and survey building website",
      url: "https://www.wikidata.org/wiki/Q24910393",
      facts: {
        founded: "2012",
        country: "Spain",
        headquarters: "Barcelona",
        website: "http://typeform.com",
        industry: "software industry",
      },
    });
    expect(rest).toEqual([]); // the other search hit isn't in the recorded entities
    const entityRequest = new URL(fetchMock.mock.calls[1][0]).searchParams;
    expect(entityRequest.get("ids")).toBe("Q24910393|Q139009067"); // no disambiguation page
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "user-agent": expect.stringContaining("Radar") });
  });

  it("returns nothing when the search finds nothing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ search: [] })));
    expect(await lookupCompanyFacts("Nonexistent Co", fetchMock)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails on an HTTP error (the loop turns it into a message for the model)", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    await expect(lookupCompanyFacts("Acme", fetchMock)).rejects.toThrow("Wikidata returned 503");
  });
});

describe("formatTime", () => {
  it("respects Wikidata's precision", () => {
    expect(formatTime({ time: "+2012-01-01T00:00:00Z", precision: 9 })).toBe("2012");
    expect(formatTime({ time: "+2012-03-01T00:00:00Z", precision: 10 })).toBe("2012-03");
    expect(formatTime({ time: "+2012-03-15T00:00:00Z", precision: 11 })).toBe("2012-03-15");
  });
});

describe("lookupCompanyFactsTool", () => {
  it("rejects calls without a name", async () => {
    expect(await lookupCompanyFactsTool.run({})).toBe("Error: pass the company name as { name }.");
  });

  it("hands the model a ready-made sources entry for each result", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = recordedFetch() as unknown as typeof fetch;
    try {
      const output = JSON.parse(await lookupCompanyFactsTool.run({ name: "Typeform" }));
      expect(output.results[0].cite_as).toEqual({
        title: "Wikidata — Typeform.com",
        url: "https://www.wikidata.org/wiki/Q24910393",
      });
      expect(output.instructions).toContain("add that result's cite_as entry to sources");
    } finally {
      globalThis.fetch = original;
    }
  });
});
