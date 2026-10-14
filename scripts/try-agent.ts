// Runs the research agent from the terminal, without the UI.
// Usage: npm run agent:try -- "Company name" ["Optional context"]

import { runResearchAgent } from "@/agent/run";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";

// Rough list prices (USD) for the cost estimate printed at the end; not used by the app.
const USD_PER_INPUT_TOKEN = 4 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 20 / 1_000_000;
const USD_PER_WEB_SEARCH = 10 / 1_000;

async function main() {
  const [query, context] = process.argv.slice(2);
  if (!query) {
    console.error('Usage: npm run agent:try -- "Company name" ["Optional context"]');
    process.exit(1);
  }

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fall back to variables already set in the shell.
  }
  const env = getEnv();
  const store = getStore();
  const id = store.createResearch({ query, context });
  console.log(`Researching "${query}" with ${env.ANTHROPIC_MODEL} (id ${id})…\n`);

  const startedAt = Date.now();
  let printed = 0;
  const ticker = setInterval(() => {
    for (const step of store.listSteps(id).slice(printed)) console.log(`  • ${step.label}`);
    printed = store.listSteps(id).length;
  }, 500);

  await runResearchAgent(id);
  clearInterval(ticker);
  for (const step of store.listSteps(id).slice(printed)) console.log(`  • ${step.label}`);

  const research = store.getResearch(id);
  if (!research) throw new Error("The research row disappeared.");
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  const cost =
    (research.inputTokens ?? 0) * USD_PER_INPUT_TOKEN +
    (research.outputTokens ?? 0) * USD_PER_OUTPUT_TOKEN +
    (research.searches ?? 0) * USD_PER_WEB_SEARCH;

  console.log(`\nStatus: ${research.status} in ${seconds} s`);
  console.log(
    `Tokens: ${research.inputTokens} in / ${research.outputTokens} out · ` +
      `${research.searches} searches · ${research.pagesRead} pages · ~$${cost.toFixed(3)} (upper bound)`,
  );
  if (research.status === "done") {
    console.log("\n" + JSON.stringify(research.report, null, 2));
  } else {
    console.log(`Error: ${research.error}`);
    process.exitCode = 1;
  }
}

main();
