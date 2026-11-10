import { describe, expect, it } from "vitest";
import { BatchRequestSchema, parseCompanyList, ResearchRequestSchema } from "@/lib/validation";

describe("ResearchRequestSchema", () => {
  it("trims the query and turns an empty context into null", () => {
    expect(ResearchRequestSchema.parse({ query: "  Acme  ", context: "  " })).toEqual({
      query: "Acme",
      context: null,
    });
  });

  it("accepts a missing context", () => {
    expect(ResearchRequestSchema.parse({ query: "Acme" })).toEqual({ query: "Acme", context: null });
  });

  it("explains a missing or non-text query", () => {
    const issue = (input: unknown) => ResearchRequestSchema.safeParse(input).error?.issues[0]?.message;
    expect(issue({})).toBe("Enter a company name or URL.");
    expect(issue({ query: 42 })).toBe("Enter a company name or URL.");
    expect(issue(null)).toBe("Invalid request.");
  });

  it("enforces the length limits", () => {
    expect(ResearchRequestSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
    expect(ResearchRequestSchema.safeParse({ query: "Acme", context: "x".repeat(301) }).success).toBe(false);
  });
});

describe("parseCompanyList", () => {
  it("reads one company per line, skipping blanks and duplicates", () => {
    expect(parseCompanyList("Acme\n\n  Globex \nacme\r\nInitech\n")).toEqual(["Acme", "Globex", "Initech"]);
  });

  it("takes the first CSV column and skips a header row", () => {
    expect(parseCompanyList('company,website\n"Acme, Inc.",acme.com\nGlobex,globex.com')).toEqual([
      "Acme, Inc.",
      "Globex",
    ]);
  });
});

describe("BatchRequestSchema", () => {
  it("cleans the list before validating it", () => {
    expect(BatchRequestSchema.parse({ queries: ["Acme", " ", "acme", "Globex"] })).toEqual({
      queries: ["Acme", "Globex"],
    });
  });

  it("enforces between 1 and 20 valid companies", () => {
    const issue = (queries: string[]) => BatchRequestSchema.safeParse({ queries }).error?.issues[0]?.message;
    expect(issue([" "])).toBe("Add at least one company.");
    expect(issue(Array.from({ length: 21 }, (_, i) => `Company ${i}`))).toBe("Add at most 20 companies at a time.");
    expect(issue(["A"])).toBe("Each company needs at least 2 characters.");
  });
});
