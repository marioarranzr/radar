// Judges the latest finished brief of each company, without researching again.
// Usage: npm run agent:judge -- ["Company A" "Company B" …]   (defaults to the eval set)

import { EVAL_COMPANIES } from "@/eval/companies";
import { evaluateResearch, judgeModel, loadLocalEnv, saveResults } from "@/eval/runner";
import { formatRow, summarize, TABLE_HEADER } from "@/eval/table";
import { getStore } from "@/lib/db";

async function main() {
  loadLocalEnv();
  const companies = process.argv.slice(2).length ? process.argv.slice(2) : EVAL_COMPANIES;
  const history = getStore().listResearch(); // most recent first
  console.log(`Judging the latest brief of ${companies.length} companies with ${judgeModel()}…\n`);

  const rows = [];
  for (const company of companies) {
    const research = history.find((r) => r.query === company && r.status === "done");
    if (!research) {
      console.log(`  ${company}: no finished brief, skipped`);
      continue;
    }
    const row = await evaluateResearch(research);
    rows.push(row);
    console.log(`  ${company}: judged`);
  }

  console.log(["", ...TABLE_HEADER, ...rows.map(formatRow), "", summarize(rows)].join("\n"));
  console.log(`Judge cost: ~$${rows.reduce((sum, row) => sum + row.judgeCost, 0).toFixed(2)}`);
  console.log(`Full results: ${saveResults("judge", rows)}`);
}

main();
