import { describe, expect, it } from "vitest";
import { ResearchRequestSchema } from "@/lib/validation";

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
