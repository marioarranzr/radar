import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runResearchAgent, type AgentDeps, type AgentStream } from "@/agent/run";
import { createStore, openDatabase, type Store } from "@/lib/db";
import { validReport } from "./fixtures/report";

type Block = Anthropic.Beta.BetaContentBlock;
type Message = Anthropic.Beta.BetaMessage;
type Params = Parameters<AgentDeps["createStream"]>[0];

const search = (query: string) =>
  ({ type: "server_tool_use", id: `srv_${query}`, name: "web_search", input: { query } }) as unknown as Block;
const fetchPage = (url: string) =>
  ({ type: "server_tool_use", id: `srv_${url}`, name: "web_fetch", input: { url } }) as unknown as Block;
const submit = (input: unknown, id = "toolu_submit") =>
  ({ type: "tool_use", id, name: "submit_report", input }) as Block;
const text = (value: string) => ({ type: "text", text: value, citations: null }) as Block;

function turn(content: Block[], stop_reason: Message["stop_reason"]): Message {
  return {
    content,
    stop_reason,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
  } as Message;
}

/** A fake Claude that plays back one scripted turn per request. */
function fakeClaude(turns: Array<Message | Error>) {
  const requests: Params[] = [];
  const createStream = (params: Params): AgentStream => {
    // Snapshot: the agent keeps appending to the same messages array.
    requests.push({ ...params, messages: [...params.messages] });
    const next = turns.shift();
    if (!next) throw new Error("Fake Claude ran out of scripted turns");
    const listeners: Array<(block: Block) => void> = [];
    return {
      on: (_event, listener) => listeners.push(listener),
      finalMessage: async () => {
        if (next instanceof Error) throw next;
        for (const block of next.content) listeners.forEach((listener) => listener(block));
        return next;
      },
    };
  };
  return { createStream, requests };
}

let store: Store;
let id: string;

function deps(createStream: AgentDeps["createStream"]): AgentDeps {
  return { store, model: "claude-test", createStream, now: () => new Date("2026-10-14T09:00:00Z") };
}

beforeEach(() => {
  store = createStore(openDatabase(":memory:"));
  id = store.createResearch({ query: "Acme Analytics", context: "Selling onboarding software" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runResearchAgent", () => {
  it("researches, records progress and stores a valid brief", async () => {
    const claude = fakeClaude([
      turn([search("acme analytics"), fetchPage("https://www.acme.example.com/about"), submit(validReport)], "tool_use"),
    ]);

    await runResearchAgent(id, deps(claude.createStream));

    expect(store.getResearch(id)).toMatchObject({
      status: "done",
      report: validReport,
      companyName: "Acme Analytics",
      inputTokens: 115,
      outputTokens: 50,
      searches: 1,
      pagesRead: 1,
      attempts: 1,
    });
    expect(store.listSteps(id).map((step) => step.label)).toEqual([
      "Starting the research",
      "Searching: “acme analytics”",
      "Reading: acme.example.com/about",
      "Writing the brief",
    ]);
  });

  it("sends the configured model, tools and the user's request", async () => {
    const claude = fakeClaude([turn([submit(validReport)], "tool_use")]);
    await runResearchAgent(id, deps(claude.createStream));

    const [request] = claude.requests;
    expect(request.model).toBe("claude-test");
    expect(request.tools?.map((tool) => ("name" in tool ? tool.name : tool.type))).toEqual(["web_search", "web_fetch", "submit_report"]);
    expect(request.tool_choice).toEqual({ type: "auto" });
    const firstMessage = request.messages[0].content as string;
    expect(firstMessage).toContain("<company>Acme Analytics</company>");
    expect(firstMessage).toContain("<context>Selling onboarding software</context>");
  });

  it("resumes after pause_turn by resending the paused assistant turn", async () => {
    const paused = turn([search("acme analytics")], "pause_turn");
    const claude = fakeClaude([paused, turn([submit(validReport)], "tool_use")]);

    await runResearchAgent(id, deps(claude.createStream));

    expect(store.getResearch(id)?.status).toBe("done");
    expect(claude.requests[1].messages.at(-1)).toEqual({ role: "assistant", content: paused.content });
  });

  it("reminds the model once when it ends without submitting", async () => {
    const claude = fakeClaude([
      turn([text("Here is what I found…")], "end_turn"),
      turn([submit(validReport)], "tool_use"),
    ]);

    await runResearchAgent(id, deps(claude.createStream));

    expect(store.getResearch(id)?.status).toBe("done");
    expect(claude.requests[1].messages.at(-1)?.role).toBe("user");
    expect(String(claude.requests[1].messages.at(-1)?.content)).toContain("submit_report");
  });

  it("fails if the model still doesn't submit after the reminder", async () => {
    const claude = fakeClaude([turn([text("…")], "end_turn"), turn([text("…")], "end_turn")]);
    await runResearchAgent(id, deps(claude.createStream));
    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/without producing a brief/) });
  });

  it("returns validation errors to the model and accepts the corrected brief", async () => {
    const invalid = { ...validReport, sources: validReport.sources.slice(0, 1) };
    const claude = fakeClaude([
      turn([submit(invalid, "toolu_bad")], "tool_use"),
      turn([submit(validReport)], "tool_use"),
    ]);

    await runResearchAgent(id, deps(claude.createStream));

    expect(store.getResearch(id)?.status).toBe("done");
    const correction = claude.requests[1].messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(correction[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_bad", is_error: true });
    expect(String(correction[0].content)).toContain("sources");
  });

  it("fails when the brief is invalid twice", async () => {
    const invalid = { ...validReport, sources: [] };
    const claude = fakeClaude([turn([submit(invalid)], "tool_use"), turn([submit(invalid)], "tool_use")]);
    await runResearchAgent(id, deps(claude.createStream));
    expect(store.getResearch(id)?.error).toMatch(/didn't pass validation/);
  });

  it("fails with a readable message when the model declines", async () => {
    const claude = fakeClaude([turn([], "refusal")]);
    await runResearchAgent(id, deps(claude.createStream));
    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/couldn't be completed/) });
  });

  it("explains an invalid API key without leaking API details", async () => {
    const apiError = new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers());
    const claude = fakeClaude([apiError]);

    await runResearchAgent(id, deps(claude.createStream));

    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/API key was rejected/) });
  });

  it("stops quietly if the research is deleted mid-run", async () => {
    const claude = fakeClaude([turn([search("acme analytics"), submit(validReport)], "tool_use")]);
    const createStream: AgentDeps["createStream"] = (params) => {
      store.deleteResearch(id);
      return claude.createStream(params);
    };

    await expect(runResearchAgent(id, deps(createStream))).resolves.toBeUndefined();
    expect(store.getResearch(id)).toBeNull();
  });

  it("does nothing for an unknown research id", async () => {
    const claude = fakeClaude([]);
    await runResearchAgent("missing", deps(claude.createStream));
    expect(claude.requests).toHaveLength(0);
  });
});
