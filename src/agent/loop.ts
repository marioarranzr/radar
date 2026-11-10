import type OpenAI from "openai";
import type { z } from "zod";

// The agent loop shared by every agent in Radar — see docs/02-TRD.md §3.7.
// Stream a request, report finished items, and finish when the model calls the submit
// function with arguments that pass its schema. API errors propagate to the caller.

type OutputItem = OpenAI.Responses.ResponseOutputItem;
type InputItem = OpenAI.Responses.ResponseInputItem;
export type AgentRequest = Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "stream">;
export type HostedTool = Exclude<OpenAI.Responses.Tool, OpenAI.Responses.FunctionTool>;

/** The slice of a streamed response the loop uses (lets tests inject a fake). */
export interface AgentStream {
  on(event: "response.output_item.done", listener: (event: { item: OutputItem }) => void): unknown;
  finalResponse(): Promise<OpenAI.Responses.Response>;
}

export type CreateStream = (params: AgentRequest) => AgentStream;

export interface SubmitFunction<T> {
  name: string;
  description: string;
  /** Validates (and types) the arguments; enforces what strict mode can't. */
  schema: z.ZodType<T>;
  /** JSON Schema sent to the model (strict-mode compatible). */
  parameters: { type: "object"; [key: string]: unknown };
  /** Optional clean-up applied to the raw arguments before validation. */
  sanitize?: (raw: unknown) => unknown;
}

export interface LoopOptions<T> {
  createStream: CreateStream;
  model: string;
  instructions: string;
  input: string;
  tools: HostedTool[];
  submit: SubmitFunction<T>;
  /** Sent once if the model stops without calling the submit function. */
  reminder: string;
  effort?: "low" | "medium" | "high";
  maxTurns?: number;
  maxOutputTokens?: number;
  /** Called for each finished output item; return false to abort the run. */
  onItem?: (item: OutputItem) => boolean | void;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type LoopResult<T> =
  | { status: "ok"; value: T; usage: Usage }
  | {
      status: "refused" | "truncated" | "invalid" | "no_submit" | "too_many_turns" | "aborted";
      usage: Usage;
    };

const hasRefusal = (output: OutputItem[]) =>
  output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function runSubmitLoop<T>(options: LoopOptions<T>): Promise<LoopResult<T>> {
  const { submit } = options;
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let input: string | InputItem[] = options.input;
  let previousResponseId: string | null = null;
  let reminded = false;
  let corrected = false;

  for (let turn = 0; turn < (options.maxTurns ?? 8); turn++) {
    const stream = options.createStream({
      model: options.model,
      instructions: options.instructions,
      input,
      previous_response_id: previousResponseId,
      reasoning: { effort: options.effort ?? "medium" },
      max_output_tokens: options.maxOutputTokens ?? 32000,
      tools: [
        ...options.tools,
        {
          type: "function",
          name: submit.name,
          description: submit.description,
          strict: true,
          parameters: submit.parameters,
        },
      ],
      tool_choice: "auto",
    });

    let aborted = false;
    stream.on("response.output_item.done", ({ item }) => {
      if (aborted || !options.onItem) return;
      try {
        if (options.onItem(item) === false) aborted = true;
      } catch (error) {
        // Progress reporting must never fail a run.
        console.error("[agent] onItem failed; continuing", error);
      }
    });

    const response = await stream.finalResponse();
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;
    if (aborted) return { status: "aborted", usage };

    if (hasRefusal(response.output) || response.incomplete_details?.reason === "content_filter") {
      return { status: "refused", usage };
    }
    if (response.status === "incomplete") return { status: "truncated", usage };

    const call = response.output.find(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call" && item.name === submit.name,
    );
    previousResponseId = response.id;

    if (call) {
      const raw = parseArguments(call.arguments);
      const parsed = submit.schema.safeParse(submit.sanitize ? submit.sanitize(raw) : raw);
      if (parsed.success) return { status: "ok", value: parsed.data, usage };
      if (corrected) return { status: "invalid", usage };
      corrected = true;
      input = [
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: `The arguments are invalid. Fix these problems and call ${submit.name} again:\n${parsed.error.issues
            .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("\n")}`,
        },
      ];
      continue;
    }

    if (reminded) return { status: "no_submit", usage };
    reminded = true;
    input = [{ role: "user", content: options.reminder }];
  }

  return { status: "too_many_turns", usage };
}
