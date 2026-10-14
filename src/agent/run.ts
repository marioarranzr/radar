import Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, SUBMIT_REPORT_REMINDER, SYSTEM_PROMPT } from "@/agent/prompt";
import { ReportSchema, reportInputSchema } from "@/agent/schema";
import { stepForBlock } from "@/agent/steps";
import { getStore, type Store } from "@/lib/db";
import { getEnv } from "@/lib/env";

// The research agent loop — see docs/02-TRD.md §3.

type MessageParam = Anthropic.Beta.BetaMessageParam;
type StreamParams = Anthropic.Beta.MessageCreateParamsStreaming;

/** The slice of the SDK stream the agent uses (lets tests inject a fake). */
export interface AgentStream {
  on(event: "contentBlock", listener: (block: Anthropic.Beta.BetaContentBlock) => void): unknown;
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
}

export interface AgentDeps {
  store: Store;
  model: string;
  createStream: (params: Omit<StreamParams, "stream">) => AgentStream;
  now: () => Date;
}

const MAX_TURNS = 8;
const SUBMIT_TOOL = "submit_report";

function requestParams(model: string, messages: MessageParam[]): Omit<StreamParams, "stream"> {
  return {
    model,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01", "task-budgets-2026-03-13"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", task_budget: { type: "tokens", total: 60000 } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: 6 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 8000 },
      {
        name: SUBMIT_TOOL,
        description:
          "Submit the finished company brief. Call this exactly once, at the end of the research.",
        strict: true,
        input_schema: reportInputSchema(),
      },
    ],
    tool_choice: { type: "auto" },
    messages,
  };
}

/** Readable message for the UI; never leaks raw API details. */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Too many requests right now. Try again in a minute.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the Anthropic API. Check your internet connection and retry.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The Anthropic API returned an error (${error.status ?? "unknown"}). Please retry.`;
  }
  return "Something went wrong while researching. Please retry.";
}

class Aborted extends Error {}

export async function runResearchAgent(id: string, deps: AgentDeps = defaultDeps()): Promise<void> {
  const { store } = deps;
  const research = store.getResearch(id);
  if (!research || !store.markRunning(id)) return;

  const metrics: Record<"inputTokens" | "outputTokens" | "searches" | "pagesRead", number> = {
    inputTokens: 0,
    outputTokens: 0,
    searches: 0,
    pagesRead: 0,
  };
  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage({ query: research.query, context: research.context, today: deps.now() }),
    },
  ];
  let reminded = false;
  let corrected = false;
  const fail = (error: string) => store.markFailed(id, error, metrics);

  try {
    store.addStep(id, "info", "Starting the research");

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = deps.createStream(requestParams(deps.model, messages));
      let deleted = false;
      stream.on("contentBlock", (block) => {
        const step = stepForBlock(block);
        if (!step || deleted) return;
        if (step.kind === "search") metrics.searches++;
        if (step.kind === "fetch") metrics.pagesRead++;
        if (!store.addStep(id, step.kind, step.label)) deleted = true;
      });

      const message = await stream.finalMessage();
      const { usage } = message;
      metrics.inputTokens +=
        usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      metrics.outputTokens += usage.output_tokens;
      if (deleted) throw new Aborted();

      if (message.stop_reason === "refusal") {
        fail("The research couldn't be completed for this company.");
        return;
      }
      if (message.stop_reason === "max_tokens") {
        fail("The brief got too long to finish. Please retry.");
        return;
      }
      if (message.stop_reason === "pause_turn") {
        // Server tools hit their iteration limit: resend so the server resumes.
        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      const submit = message.content.find(
        (block): block is Anthropic.Beta.BetaToolUseBlock =>
          block.type === "tool_use" && block.name === SUBMIT_TOOL,
      );

      if (submit) {
        const parsed = ReportSchema.safeParse(submit.input);
        if (parsed.success) {
          const saved = store.markDone(id, parsed.data, {
            ...metrics,
            companyName: parsed.data.company_name,
          });
          if (!saved) throw new Aborted();
          return;
        }
        if (corrected) {
          fail("The brief didn't pass validation. Please retry.");
          return;
        }
        corrected = true;
        messages.push(
          { role: "assistant", content: message.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: submit.id,
                is_error: true,
                content: `The brief is invalid. Fix these problems and call ${SUBMIT_TOOL} again:\n${parsed.error.issues
                  .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("\n")}`,
              },
            ],
          },
        );
        continue;
      }

      if (reminded) {
        fail("The research finished without producing a brief. Please retry.");
        return;
      }
      reminded = true;
      messages.push(
        { role: "assistant", content: message.content },
        { role: "user", content: SUBMIT_REPORT_REMINDER },
      );
    }

    fail("The research took too many steps. Please retry.");
  } catch (error) {
    if (error instanceof Aborted) return; // the research was deleted mid-run
    console.error(`[agent] research ${id} failed`, error);
    fail(describeError(error));
  }
}

let client: Anthropic | undefined;

function defaultDeps(): AgentDeps {
  const env = getEnv();
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const anthropic = client;
  return {
    store: getStore(),
    model: env.ANTHROPIC_MODEL,
    createStream: (params) => anthropic.beta.messages.stream(params),
    now: () => new Date(),
  };
}
