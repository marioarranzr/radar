import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { streamResponse } from "@/agent/openai-stream";
import { getOpenAI } from "@/agent/run";
import { ReportSchema } from "@/agent/schema";
import { judgeBrief } from "@/eval/judge";
import { estimateCost, researchSeconds, type EvalRow } from "@/eval/table";
import type { Research } from "@/lib/db";
import { getEnv } from "@/lib/env";

// Glue for the evaluation scripts: judge a stored research and save run results.

export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fall back to variables already set in the shell.
  }
}

export function judgeModel(): string {
  const env = getEnv();
  return env.JUDGE_MODEL ?? env.OPENAI_MODEL;
}

/** Builds a table row for a research, judging its brief unless `judge` is false. */
export async function evaluateResearch(research: Research, judge = true): Promise<EvalRow & { judgeCost: number }> {
  const report = ReportSchema.safeParse(research.report);
  const row: EvalRow & { judgeCost: number } = {
    company: research.query,
    status: research.status === "done" ? "✅ done" : `❌ ${research.error ?? research.status}`,
    seconds: researchSeconds(research),
    sources: report.success ? report.data.sources.length : null,
    researchCost: estimateCost(research.inputTokens ?? 0, research.outputTokens ?? 0, research.searches ?? 0),
    judgement: null,
    judgeCost: 0,
  };
  if (!judge || !report.success) return row;

  const openai = getOpenAI();
  const result = await judgeBrief(report.data, {
    createStream: (params) => streamResponse(openai, params),
    model: judgeModel(),
    now: () => new Date(),
  });
  row.judgeCost = estimateCost(result.usage.inputTokens, result.usage.outputTokens);
  if (result.status === "ok") row.judgement = result.value;
  else console.warn(`  (judge for ${research.query} ended with: ${result.status})`);
  return row;
}

/** Saves the full results (including every checked claim) to data/evals/, which git ignores. */
export function saveResults(label: string, rows: unknown): string {
  const dir = join(process.cwd(), "data", "evals");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 2));
  return file;
}
