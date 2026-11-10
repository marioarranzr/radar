// Researches a list of companies, judges each brief and prints a Markdown results table.
// Usage: npm run agent:eval -- [--no-judge] ["Company A" "Company B" …]   (defaults to the eval set)

import { runResearchAgent } from "@/agent/run";
import { EVAL_COMPANIES } from "@/eval/companies";
import { evaluateResearch, judgeModel, loadLocalEnv, saveResults } from "@/eval/runner";
import { formatRow, summarize, TABLE_HEADER } from "@/eval/table";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const judge = !args.includes("--no-judge");
  const named = args.filter((arg) => arg !== "--no-judge");
  const companies = named.length ? named : EVAL_COMPANIES;
  const store = getStore();
  console.log(
    `Evaluating ${companies.length} companies with ${getEnv().OPENAI_MODEL}` +
      (judge ? `, judged by ${judgeModel()}` : "") +
      "…\n",
  );

  const rows = [];
  for (const company of companies) {
    const id = store.createResearch({ query: company });
    await runResearchAgent(id);
    const row = await evaluateResearch(store.getResearch(id)!, judge);
    rows.push(row);
    console.log(`  ${company}: ${row.status} in ${row.seconds.toFixed(0)} s`);
  }

  console.log(["", ...TABLE_HEADER, ...rows.map(formatRow), "", summarize(rows)].join("\n"));
  const judgeCost = rows.reduce((sum, row) => sum + row.judgeCost, 0);
  if (judge) console.log(`Judge cost: ~$${judgeCost.toFixed(2)}`);
  console.log(`Full results: ${saveResults("eval", rows)}`);
}

main();
