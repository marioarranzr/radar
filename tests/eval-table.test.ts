import { describe, expect, it } from "vitest";
import type { Judgement } from "@/eval/judge";
import { estimateCost, formatRow, median, summarize, type EvalRow } from "@/eval/table";

const judgement = (score: number, supported: number): Judgement => ({
  checked_claims: Array.from({ length: 4 }, (_, i) => ({
    claim: `claim ${i}`,
    source_url: null,
    verdict: i < supported ? "supported" : "unverifiable",
    note: "",
  })),
  groundedness: score,
  completeness: score,
  relevance: score,
  recency: score,
  summary: "",
});

const row = (seconds: number, cost: number, j: Judgement | null): EvalRow => ({
  company: "Acme",
  status: "✅ done",
  seconds,
  sources: 10,
  researchCost: cost,
  judgement: j,
});

describe("eval table", () => {
  it("estimates cost from tokens and searches", () => {
    expect(estimateCost("gpt-6.1-sol", 50_000, 2_000, 3)).toBeCloseTo(0.1 + 0.02 + 0.03);
    expect(estimateCost("gpt-6-luna", 50_000, 2_000, 0)).toBeCloseTo(0.005 + 0.001);
    expect(estimateCost("unknown-model", 50_000, 2_000)).toBeCloseTo(0.12);
  });

  it("computes the median", () => {
    expect(median([70, 60, 96, 61])).toBe(65.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBe(0);
  });

  it("formats a judged row and an unjudged one", () => {
    expect(formatRow(row(61.4, 0.158, judgement(4, 3)))).toBe(
      "| Acme | ✅ done | 61 s | 10 | $0.158 | 4 | 4 | 4 | 4 | 3/4 |",
    );
    expect(formatRow(row(61, 0.1, null))).toContain("| – | – | – | – | – |");
  });

  it("summarizes success, time, cost and judge scores", () => {
    const summary = summarize([row(60, 0.1, judgement(4, 4)), row(80, 0.2, judgement(5, 2))]);
    expect(summary).toBe(
      "2/2 briefs · median 70 s · avg research cost $0.150 · grounded 4.5 · complete 4.5 · relevant 4.5 · recent 4.5 · claims supported 75%",
    );
  });
});
