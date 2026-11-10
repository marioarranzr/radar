import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runSubmitLoop, type ClientFunction } from "@/agent/loop";
import { fakeModel, functionCall, response } from "./helpers/fake-model";

const Answer = z.strictObject({ answer: z.string() });

function options(createStream: ReturnType<typeof fakeModel>["createStream"], fn: ClientFunction) {
  return {
    createStream,
    model: "test",
    instructions: "Answer.",
    input: "Question?",
    tools: [],
    functions: [fn],
    submit: {
      name: "submit_answer",
      description: "Submit.",
      schema: Answer,
      parameters: { type: "object" as const, properties: { answer: { type: "string" } } },
    },
    reminder: "Submit now.",
  };
}

describe("runSubmitLoop with client functions", () => {
  it("runs a client function, returns its output and continues to the submission", async () => {
    const lookup: ClientFunction = {
      name: "lookup",
      description: "Look something up.",
      parameters: { type: "object", properties: { name: { type: "string" } } },
      run: vi.fn(async (args) => `facts about ${(args as { name: string }).name}`),
    };
    const first = response([functionCall("lookup", { name: "Acme" }, "call_1")]);
    const model = fakeModel([first, response([functionCall("submit_answer", { answer: "42" })])]);

    const result = await runSubmitLoop(options(model.createStream, lookup));

    expect(result).toMatchObject({ status: "ok", value: { answer: "42" } });
    expect(lookup.run).toHaveBeenCalledWith({ name: "Acme" });
    expect(model.requests[0].tools?.map((tool) => ("name" in tool ? tool.name : tool.type))).toEqual([
      "lookup",
      "submit_answer",
    ]);
    expect(model.requests[1].previous_response_id).toBe(first.id);
    expect(model.requests[1].input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: "facts about Acme" },
    ]);
  });

  it("returns a failing function's error to the model instead of failing the run", async () => {
    const broken: ClientFunction = {
      name: "lookup",
      description: "",
      parameters: { type: "object" },
      run: async () => {
        throw new Error("timeout");
      },
    };
    const model = fakeModel([
      response([functionCall("lookup", {}, "call_1")]),
      response([functionCall("submit_answer", { answer: "anyway" })]),
    ]);

    const result = await runSubmitLoop(options(model.createStream, broken));

    expect(result.status).toBe("ok");
    expect(JSON.stringify(model.requests[1].input)).toContain("lookup failed (timeout)");
  });
});
