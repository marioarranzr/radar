import type { Research } from "@/lib/db";
import { supportedRatio, type Judgement } from "@/eval/judge";

// Results table shared by `npm run agent:eval` and `npm run agent:judge`.

// Rough list prices (USD, gpt-6.1-sol); check https://openai.com/api/pricing.
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const USD_PER_WEB_SEARCH = 10 / 1_000;

export function estimateCost(tokensIn: number, tokensOut: number, searches = 0): number {
  return tokensIn * USD_PER_INPUT_TOKEN + tokensOut * USD_PER_OUTPUT_TOKEN + searches * USD_PER_WEB_SEARCH;
}

export function researchSeconds(research: Research): number {
  if (!research.startedAt || !research.finishedAt) return 0;
  return (new Date(research.finishedAt).getTime() - new Date(research.startedAt).getTime()) / 1000;
}

export interface EvalRow {
  company: string;
  status: string;
  seconds: number;
  sources: number | null;
  researchCost: number;
  judgement: Judgement | null;
}

export const TABLE_HEADER = [
  "| Company | Result | Time | Sources | Cost | Grounded | Complete | Relevant | Recent | Claims supported |",
  "|---|---|---|---|---|---|---|---|---|---|",
];

export function formatRow(row: EvalRow): string {
  const j = row.judgement;
  const cells = [
    row.company,
    row.status,
    `${row.seconds.toFixed(0)} s`,
    row.sources === null ? "–" : String(row.sources),
    `$${row.researchCost.toFixed(3)}`,
    j ? String(j.groundedness) : "–",
    j ? String(j.completeness) : "–",
    j ? String(j.relevance) : "–",
    j ? String(j.recency) : "–",
    j ? `${j.checked_claims.filter((c) => c.verdict === "supported").length}/${j.checked_claims.length}` : "–",
  ];
  return `| ${cells.join(" | ")} |`;
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One-line summary: success rate, median time, average cost and average judge scores. */
export function summarize(rows: EvalRow[]): string {
  const judged = rows.map((row) => row.judgement).filter((j): j is Judgement => j !== null);
  const parts = [
    `${rows.filter((row) => row.sources !== null).length}/${rows.length} briefs`,
    `median ${median(rows.map((row) => row.seconds)).toFixed(0)} s`,
    `avg research cost $${average(rows.map((row) => row.researchCost)).toFixed(3)}`,
  ];
  if (judged.length) {
    const avg = (key: "groundedness" | "completeness" | "relevance" | "recency") =>
      average(judged.map((j) => j[key])).toFixed(1);
    parts.push(
      `grounded ${avg("groundedness")}`,
      `complete ${avg("completeness")}`,
      `relevant ${avg("relevance")}`,
      `recent ${avg("recency")}`,
      `claims supported ${Math.round(average(judged.map(supportedRatio)) * 100)}%`,
    );
  }
  return parts.join(" · ");
}
