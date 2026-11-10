import OpenAI from "openai";
import { runSubmitLoop, type CreateStream, type LoopResult, type Usage } from "@/agent/loop";
import { streamResponse } from "@/agent/openai-stream";
import { buildUserMessage, SUBMIT_REPORT_REMINDER, SYSTEM_PROMPT } from "@/agent/prompt";
import { ReportSchema, reportInputSchema, type Report } from "@/agent/schema";
import { stripCitationMarkers } from "@/agent/sanitize";
import { stepForItem } from "@/agent/steps";
import { applyVerification, verifyBrief } from "@/agent/verify";
import { getStore, type Store, type VerificationSummary } from "@/lib/db";
import { getEnv } from "@/lib/env";

// The research agent — see docs/02-TRD.md §3. After it, the verifier agent (§3.9) checks the brief.

export type { AgentRequest, AgentStream } from "@/agent/loop";

export interface AgentDeps {
  store: Store;
  model: string;
  createStream: CreateStream;
  now: () => Date;
  /** Run the verifier agent on the finished brief (VERIFY_BRIEFS). */
  verify: boolean;
  /** Web content returned per search (SEARCH_CONTEXT_SIZE); defaults to low. */
  searchContextSize?: "low" | "medium" | "high";
}

/** Readable message for the UI; never leaks raw API details. */
export function describeError(error: unknown): string {
  if (error instanceof OpenAI.AuthenticationError) {
    return "The OpenAI API key was rejected. Check OPENAI_API_KEY in .env.local.";
  }
  if (error instanceof OpenAI.RateLimitError) {
    return "Too many requests right now (or no API credit left). Try again in a minute.";
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return "Couldn't reach the OpenAI API. Check your internet connection and retry.";
  }
  if (error instanceof OpenAI.APIError) {
    return `The OpenAI API returned an error (${error.status ?? "unknown"}). Please retry.`;
  }
  return "Something went wrong while researching. Please retry.";
}

const FAILURE_MESSAGES: Record<Exclude<LoopResult<Report>["status"], "ok" | "aborted">, string> = {
  refused: "The research couldn't be completed for this company.",
  truncated: "The brief got too long to finish. Please retry.",
  invalid: "The brief didn't pass validation. Please retry.",
  no_submit: "The research finished without producing a brief. Please retry.",
  too_many_turns: "The research took too many steps. Please retry.",
};

export async function runResearchAgent(id: string, deps: AgentDeps = defaultDeps()): Promise<void> {
  const { store } = deps;
  const research = store.getResearch(id);
  if (!research || !store.markRunning(id)) return;

  const counts = { searches: 0, pagesRead: 0 };
  let usage = { inputTokens: 0, outputTokens: 0 };
  const metrics = () => ({ ...usage, ...counts });

  try {
    store.addStep(id, "info", "Starting the research");

    const result = await runSubmitLoop({
      createStream: deps.createStream,
      model: deps.model,
      instructions: SYSTEM_PROMPT,
      input: buildUserMessage({ query: research.query, context: research.context, today: deps.now() }),
      tools: [{ type: "web_search", search_context_size: deps.searchContextSize ?? "low" }],
      submit: {
        name: "submit_report",
        description:
          "Submit the finished company brief. Call this exactly once, at the end of the research.",
        schema: ReportSchema,
        parameters: reportInputSchema(),
        sanitize: stripCitationMarkers,
      },
      reminder: SUBMIT_REPORT_REMINDER,
      onItem: (item) => {
        const step = stepForItem(item);
        if (!step) return;
        if (step.kind === "search") counts.searches++;
        if (step.kind === "fetch") counts.pagesRead++;
        return store.addStep(id, step.kind, step.label); // false: deleted mid-run → abort
      },
    });
    usage = result.usage;

    if (result.status === "aborted") return; // the research was deleted mid-run
    if (result.status !== "ok") {
      store.markFailed(id, FAILURE_MESSAGES[result.status], metrics());
      return;
    }

    let report = result.value;
    let verification: VerificationSummary | null = null;
    if (deps.verify) {
      const verified = await verifyAndApply(id, report, deps, counts);
      usage = {
        inputTokens: usage.inputTokens + verified.usage.inputTokens,
        outputTokens: usage.outputTokens + verified.usage.outputTokens,
      };
      if (verified.aborted) return;
      report = verified.report;
      verification = verified.summary;
    }
    store.markDone(id, report, { ...metrics(), companyName: report.company_name, verification });
  } catch (error) {
    console.error(`[agent] research ${id} failed`, error);
    store.markFailed(id, describeError(error), metrics());
  }
}

/**
 * Runs the verifier on a finished brief. It never fails the research: on any problem the
 * researcher's brief is kept unchanged and the summary is null.
 */
async function verifyAndApply(
  id: string,
  report: Report,
  deps: AgentDeps,
  counts: { searches: number; pagesRead: number },
): Promise<{ report: Report; summary: VerificationSummary | null; usage: Usage; aborted: boolean }> {
  const unchanged = (usage: Usage = { inputTokens: 0, outputTokens: 0 }, aborted = false) => ({
    report,
    summary: null,
    usage,
    aborted,
  });
  if (!deps.store.addStep(id, "info", "Verifying the facts")) return unchanged(undefined, true);

  try {
    const result = await verifyBrief(report, {
      createStream: deps.createStream,
      model: deps.model,
      onItem: (item) => {
        const step = stepForItem(item);
        if (!step || step.kind === "info") return;
        if (step.kind === "search") counts.searches++;
        if (step.kind === "fetch") counts.pagesRead++;
        const label = step.label.replace(/^(Reading|Scanning): /, "Checking: ");
        return deps.store.addStep(id, step.kind, label);
      },
    });
    if (result.status === "aborted") return unchanged(result.usage, true);
    if (result.status !== "ok") {
      console.warn(`[agent] verifier for research ${id} ended with: ${result.status}; keeping the brief`);
      return unchanged(result.usage);
    }
    return { ...applyVerification(report, result.value), usage: result.usage, aborted: false };
  } catch (error) {
    console.error(`[agent] verifier for research ${id} failed; keeping the brief`, error);
    return unchanged();
  }
}

let client: OpenAI | undefined;

/** Shared OpenAI client for every agent (researcher, judge, verifier). */
export function getOpenAI(): OpenAI {
  client ??= new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  return client;
}

function defaultDeps(): AgentDeps {
  const openai = getOpenAI();
  return {
    store: getStore(),
    model: getEnv().OPENAI_MODEL,
    createStream: (params) => streamResponse(openai, params),
    now: () => new Date(),
    verify: getEnv().VERIFY_BRIEFS,
    searchContextSize: getEnv().SEARCH_CONTEXT_SIZE,
  };
}
