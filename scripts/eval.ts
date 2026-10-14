// Runs the agent on a list of companies and prints a Markdown table of the results.
// Usage: npm run agent:eval -- ["Company A" "Company B" …]   (defaults to the list below)

import { runResearchAgent } from "@/agent/run";
import { ReportSchema } from "@/agent/schema";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";

const DEFAULT_COMPANIES = [
  "Typeform",
  "Glovo",
  "Wallapop",
  "Personio",
  "Mercadona",
  "Seedtag",
  "Clarity AI",
  "TravelPerk",
  "Idealista",
  "Notion",
];

// Rough list prices (USD, gpt-6.1-sol); check https://openai.com/api/pricing.
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const USD_PER_WEB_SEARCH = 10 / 1_000;

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fall back to variables already set in the shell.
  }
  const companies = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_COMPANIES;
  const store = getStore();
  console.log(`Evaluating ${companies.length} companies with ${getEnv().OPENAI_MODEL}…\n`);

  const rows: string[] = [];
  for (const company of companies) {
    const id = store.createResearch({ query: company });
    await runResearchAgent(id);
    const research = store.getResearch(id)!;
    const report = ReportSchema.safeParse(research.report);
    const seconds =
      research.startedAt && research.finishedAt
        ? (new Date(research.finishedAt).getTime() - new Date(research.startedAt).getTime()) / 1000
        : 0;
    const cost =
      (research.inputTokens ?? 0) * USD_PER_INPUT_TOKEN +
      (research.outputTokens ?? 0) * USD_PER_OUTPUT_TOKEN +
      (research.searches ?? 0) * USD_PER_WEB_SEARCH;
    const unconfirmed = report.success ? report.data.key_facts.filter((f) => !f.confirmed).length : 0;
    const row = [
      company,
      research.status === "done" ? "✅ done" : `❌ ${research.error}`,
      `${seconds.toFixed(0)} s`,
      report.success ? String(report.data.sources.length) : "–",
      report.success ? String(unconfirmed) : "–",
      `${research.searches ?? 0} / ${research.pagesRead ?? 0}`,
      `${Math.round((research.inputTokens ?? 0) / 1000)}k / ${Math.round((research.outputTokens ?? 0) / 1000)}k`,
      `$${cost.toFixed(3)}`,
      "",
    ];
    rows.push(`| ${row.join(" | ")} |`);
    console.log(`  ${company}: ${research.status} in ${seconds.toFixed(0)} s, ~$${cost.toFixed(3)}`);
  }

  console.log("\n| Company | Result | Time | Sources | Unconfirmed facts | Searches / pages | Tokens in / out | Cost | Useful? |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) console.log(row);
}

main();
