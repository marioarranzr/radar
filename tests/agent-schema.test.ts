import { describe, expect, it } from "vitest";
import { ReportSchema, reportInputSchema } from "@/agent/schema";
import { validReport } from "./fixtures/report";

describe("ReportSchema", () => {
  it("accepts a complete brief", () => {
    expect(ReportSchema.safeParse(validReport).success).toBe(true);
  });

  it("rejects a brief with fewer than 3 sources", () => {
    const report = { ...validReport, sources: validReport.sources.slice(0, 2) };
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects more than 5 recent signals", () => {
    const signal = validReport.recent_signals[0];
    const report = { ...validReport, recent_signals: Array(6).fill(signal) };
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects too few discovery questions", () => {
    const report = { ...validReport, discovery_questions: ["Only one?"] };
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects non-http source URLs", () => {
    const sources = [...validReport.sources];
    sources[0] = { title: "Bad", url: "javascript:alert(1)" };
    expect(ReportSchema.safeParse({ ...validReport, sources }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(ReportSchema.safeParse({ ...validReport, extra: true }).success).toBe(false);
  });
});

describe("reportInputSchema", () => {
  const schema = reportInputSchema();
  const json = JSON.stringify(schema);

  it("is a closed object requiring every field", () => {
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(ReportSchema.shape));
  });

  it("drops keywords strict tool use does not support", () => {
    for (const keyword of ["minItems", "maxItems", "minLength", "$schema", "pattern"]) {
      expect(json).not.toContain(`"${keyword}"`);
    }
  });

  it("keeps field descriptions to guide the model", () => {
    expect(json).toContain("At least 3 sources actually used.");
  });
});
