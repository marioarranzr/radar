import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runResearchAgent, type AgentDeps } from "@/agent/run";
import { createStore, openDatabase, type Store } from "@/lib/db";
import { validReport } from "./fixtures/report";
import {
  fakeModel,
  functionCall,
  message,
  openPage,
  refusal,
  response,
  search,
  type Item,
} from "./helpers/fake-model";

const submit = (report: unknown, callId = "call_submit") => functionCall("submit_report", report, callId);

let store: Store;
let id: string;

function deps(createStream: AgentDeps["createStream"]): AgentDeps {
  return { store, model: "gpt-test", createStream, now: () => new Date("2026-10-14T09:00:00Z") };
}

beforeEach(() => {
  store = createStore(openDatabase(":memory:"));
  id = store.createResearch({ query: "Acme Analytics", context: "Selling onboarding software" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runResearchAgent", () => {
  it("researches, records progress and stores a valid brief", async () => {
    const model = fakeModel([
      response([search("acme analytics"), openPage("https://www.acme.example.com/about"), submit(validReport)]),
    ]);

    await runResearchAgent(id, deps(model.createStream));

    expect(store.getResearch(id)).toMatchObject({
      status: "done",
      report: validReport,
      companyName: "Acme Analytics",
      inputTokens: 100,
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
    const model = fakeModel([response([submit(validReport)])]);
    await runResearchAgent(id, deps(model.createStream));

    const [request] = model.requests;
    expect(request.model).toBe("gpt-test");
    expect(request.previous_response_id).toBeNull();
    expect(request.tools?.map((tool) => tool.type)).toEqual(["web_search", "function"]);
    expect(request.tool_choice).toBe("auto");
    expect(request.input).toContain("<company>Acme Analytics</company>");
    expect(request.input).toContain("<context>Selling onboarding software</context>");
  });

  it("reminds the model once, chaining on the previous response", async () => {
    const first = response([message("Here is what I found…")]);
    const model = fakeModel([first, response([submit(validReport)])]);

    await runResearchAgent(id, deps(model.createStream));

    expect(store.getResearch(id)?.status).toBe("done");
    expect(model.requests[1].previous_response_id).toBe(first.id);
    expect(JSON.stringify(model.requests[1].input)).toContain("submit_report");
  });

  it("fails if the model still doesn't submit after the reminder", async () => {
    const model = fakeModel([response([message("…")]), response([message("…")])]);
    await runResearchAgent(id, deps(model.createStream));
    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/without producing a brief/) });
  });

  it("returns validation errors to the model and accepts the corrected brief", async () => {
    const invalid = { ...validReport, sources: validReport.sources.slice(0, 1) };
    const model = fakeModel([response([submit(invalid, "call_bad")]), response([submit(validReport)])]);

    await runResearchAgent(id, deps(model.createStream));

    expect(store.getResearch(id)?.status).toBe("done");
    const [correction] = model.requests[1].input as OpenAI.Responses.ResponseInputItem.FunctionCallOutput[];
    expect(correction).toMatchObject({ type: "function_call_output", call_id: "call_bad" });
    expect(String(correction.output)).toContain("sources");
  });

  it("strips citation markers from the stored brief", async () => {
    const marked = { ...validReport, summary: `${validReport.summary} \uE200cite\uE202turn0search1\uE201` };
    const model = fakeModel([response([submit(marked)])]);
    await runResearchAgent(id, deps(model.createStream));
    expect(store.getResearch(id)?.report).toEqual(validReport);
  });

  it("treats unparseable arguments as an invalid brief", async () => {
    const broken = { type: "function_call", name: "submit_report", call_id: "c", arguments: "{oops" } as Item;
    const model = fakeModel([response([broken]), response([broken])]);
    await runResearchAgent(id, deps(model.createStream));
    expect(store.getResearch(id)?.error).toMatch(/didn't pass validation/);
  });

  it("fails with a readable message when the model refuses", async () => {
    const model = fakeModel([response([refusal()])]);
    await runResearchAgent(id, deps(model.createStream));
    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/couldn't be completed/) });
  });

  it("fails when the response is cut off", async () => {
    const model = fakeModel([
      response([search("acme")], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
    ]);
    await runResearchAgent(id, deps(model.createStream));
    expect(store.getResearch(id)?.error).toMatch(/too long to finish/);
  });

  it("explains an invalid API key without leaking API details", async () => {
    const apiError = new OpenAI.AuthenticationError(401, undefined, "Incorrect API key", new Headers());
    const model = fakeModel([apiError]);

    await runResearchAgent(id, deps(model.createStream));

    expect(store.getResearch(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/API key was rejected/) });
  });

  it("stops quietly if the research is deleted mid-run", async () => {
    const model = fakeModel([response([search("acme analytics"), submit(validReport)])]);
    const createStream: AgentDeps["createStream"] = (params) => {
      store.deleteResearch(id);
      return model.createStream(params);
    };

    await expect(runResearchAgent(id, deps(createStream))).resolves.toBeUndefined();
    expect(store.getResearch(id)).toBeNull();
  });

  it("does nothing for an unknown research id", async () => {
    const model = fakeModel([]);
    await runResearchAgent("missing", deps(model.createStream));
    expect(model.requests).toHaveLength(0);
  });
});
