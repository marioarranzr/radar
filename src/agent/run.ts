import OpenAI from "openai";
import { streamResponse } from "@/agent/openai-stream";
import { buildUserMessage, SUBMIT_REPORT_REMINDER, SYSTEM_PROMPT } from "@/agent/prompt";
import { ReportSchema, reportInputSchema } from "@/agent/schema";
import { stripCitationMarkers } from "@/agent/sanitize";
import { stepForItem } from "@/agent/steps";
import { getStore, type Store } from "@/lib/db";
import { getEnv } from "@/lib/env";

// The research agent loop — see docs/02-TRD.md §3.

type OutputItem = OpenAI.Responses.ResponseOutputItem;
type InputItem = OpenAI.Responses.ResponseInputItem;
export type AgentRequest = Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "stream">;

/** The slice of the SDK stream the agent uses (lets tests inject a fake). */
export interface AgentStream {
  on(event: "response.output_item.done", listener: (event: { item: OutputItem }) => void): unknown;
  finalResponse(): Promise<OpenAI.Responses.Response>;
}

export interface AgentDeps {
  store: Store;
  model: string;
  createStream: (params: AgentRequest) => AgentStream;
  now: () => Date;
}

const MAX_TURNS = 8;
const SUBMIT_TOOL = "submit_report";

function requestParams(
  model: string,
  input: string | InputItem[],
  previousResponseId: string | null,
): AgentRequest {
  return {
    model,
    instructions: SYSTEM_PROMPT,
    input,
    previous_response_id: previousResponseId,
    reasoning: { effort: "medium" },
    max_output_tokens: 32000,
    tools: [
      { type: "web_search", search_context_size: "medium" },
      {
        type: "function",
        name: SUBMIT_TOOL,
        description:
          "Submit the finished company brief. Call this exactly once, at the end of the research.",
        strict: true,
        parameters: reportInputSchema(),
      },
    ],
    tool_choice: "auto",
  };
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

const hasRefusal = (output: OutputItem[]) =>
  output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

class Aborted extends Error {}

export async function runResearchAgent(id: string, deps: AgentDeps = defaultDeps()): Promise<void> {
  const { store } = deps;
  const research = store.getResearch(id);
  if (!research || !store.markRunning(id)) return;

  const metrics = { inputTokens: 0, outputTokens: 0, searches: 0, pagesRead: 0 };
  let input: string | InputItem[] = buildUserMessage({
    query: research.query,
    context: research.context,
    today: deps.now(),
  });
  let previousResponseId: string | null = null;
  let reminded = false;
  let corrected = false;
  const fail = (error: string) => store.markFailed(id, error, metrics);

  try {
    store.addStep(id, "info", "Starting the research");

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = deps.createStream(requestParams(deps.model, input, previousResponseId));
      let deleted = false;
      stream.on("response.output_item.done", ({ item }) => {
        const step = stepForItem(item);
        if (!step || deleted) return;
        if (step.kind === "search") metrics.searches++;
        if (step.kind === "fetch") metrics.pagesRead++;
        if (!store.addStep(id, step.kind, step.label)) deleted = true;
      });

      const response = await stream.finalResponse();
      metrics.inputTokens += response.usage?.input_tokens ?? 0;
      metrics.outputTokens += response.usage?.output_tokens ?? 0;
      if (deleted) throw new Aborted();

      if (hasRefusal(response.output) || response.incomplete_details?.reason === "content_filter") {
        fail("The research couldn't be completed for this company.");
        return;
      }
      if (response.status === "incomplete") {
        fail("The brief got too long to finish. Please retry.");
        return;
      }

      const submit = response.output.find(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call" && item.name === SUBMIT_TOOL,
      );
      previousResponseId = response.id;

      if (submit) {
        const parsed = ReportSchema.safeParse(stripCitationMarkers(parseArguments(submit.arguments)));
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
        input = [
          {
            type: "function_call_output",
            call_id: submit.call_id,
            output: `The brief is invalid. Fix these problems and call ${SUBMIT_TOOL} again:\n${parsed.error.issues
              .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
              .join("\n")}`,
          },
        ];
        continue;
      }

      if (reminded) {
        fail("The research finished without producing a brief. Please retry.");
        return;
      }
      reminded = true;
      input = [{ role: "user", content: SUBMIT_REPORT_REMINDER }];
    }

    fail("The research took too many steps. Please retry.");
  } catch (error) {
    if (error instanceof Aborted) return; // the research was deleted mid-run
    console.error(`[agent] research ${id} failed`, error);
    fail(describeError(error));
  }
}

let client: OpenAI | undefined;

function defaultDeps(): AgentDeps {
  const env = getEnv();
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const openai = client;
  return {
    store: getStore(),
    model: env.OPENAI_MODEL,
    createStream: (params) => streamResponse(openai, params),
    now: () => new Date(),
  };
}
