// Runs the verifier on the latest stored brief of each company and reports what it changed,
// its time and cost, and the judge's scores for the briefs it modified. Isolates the verifier's
// effect from research variance, since the briefs themselves stay the same.
// Usage: npm run agent:verify-eval -- ["Company A" "Company B" …]   (defaults to the eval set)

import { streamResponse } from "@/agent/openai-stream";
import { getOpenAI } from "@/agent/run";
import { ReportSchema } from "@/agent/schema";
import { applyVerification, verifyBrief } from "@/agent/verify";
import { EVAL_COMPANIES } from "@/eval/companies";
import { judgeBrief } from "@/eval/judge";
import { judgeModel, loadLocalEnv, saveResults } from "@/eval/runner";
import { estimateCost } from "@/eval/table";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";

async function main() {
  loadLocalEnv();
  const companies = process.argv.slice(2).length ? process.argv.slice(2) : EVAL_COMPANIES;
  const history = getStore().listResearch();
  const openai = getOpenAI();
  const createStream = (params: Parameters<typeof streamResponse>[1]) => streamResponse(openai, params);
  console.log(`Verifying the latest brief of ${companies.length} companies with ${getEnv().OPENAI_MODEL}…\n`);

  const rows: string[] = [];
  const results: unknown[] = [];
  let totalSeconds = 0;
  let totalCost = 0;
  for (const company of companies) {
    const research = history.find((r) => r.query === company && r.status === "done");
    const report = ReportSchema.safeParse(research?.report);
    if (!report.success) {
      console.log(`  ${company}: no finished brief, skipped`);
      continue;
    }

    const started = Date.now();
    const result = await verifyBrief(report.data, { createStream, model: getEnv().OPENAI_MODEL });
    const seconds = (Date.now() - started) / 1000;
    const cost = estimateCost(result.usage.inputTokens, result.usage.outputTokens);
    totalSeconds += seconds;
    totalCost += cost;
    if (result.status !== "ok") {
      rows.push(`| ${company} | ❌ ${result.status} | ${seconds.toFixed(0)} s | $${cost.toFixed(3)} | – | – | – |`);
      continue;
    }

    const applied = applyVerification(report.data, result.value);
    const changed = applied.summary.downgraded > 0 || applied.summary.removedSignals > 0;
    let judged = "unchanged";
    if (changed) {
      const judgement = await judgeBrief(applied.report, { createStream, model: judgeModel(), now: () => new Date() });
      judged = judgement.status === "ok" ? `grounded ${judgement.value.groundedness}` : judgement.status;
    }
    const { checked, downgraded, removedSignals } = applied.summary;
    rows.push(
      `| ${company} | ✅ | ${seconds.toFixed(0)} s | $${cost.toFixed(3)} | ${checked} | ${downgraded} / ${removedSignals} | ${judged} |`,
    );
    results.push({ company, seconds, cost, summary: applied.summary, verification: result.value });
    console.log(`  ${company}: ${checked} checked, ${downgraded} downgraded, ${removedSignals} signals removed`);
  }

  const n = rows.length || 1;
  console.log(
    [
      "",
      "| Company | Result | Time | Cost | Claims checked | Downgraded / signals removed | Judge after |",
      "|---|---|---|---|---|---|---|",
      ...rows,
      "",
      `avg verifier time ${(totalSeconds / n).toFixed(0)} s · avg verifier cost $${(totalCost / n).toFixed(3)}`,
    ].join("\n"),
  );
  console.log(`Full results: ${saveResults("verify", results)}`);
}

main();
