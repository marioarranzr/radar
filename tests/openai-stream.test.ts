import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { streamFromEvents } from "@/agent/openai-stream";

type Event = OpenAI.Responses.ResponseStreamEvent;

const events = (...list: unknown[]) => async () =>
  (async function* () {
    for (const event of list) yield event as Event;
  })();

const item = { type: "web_search_call", id: "ws", status: "completed", action: { type: "search" } };
const finalResponse = { id: "resp_1", status: "completed", output: [item] };

describe("streamFromEvents", () => {
  it("reports finished items and returns the completed response", async () => {
    const stream = streamFromEvents(
      events(
        { type: "response.created" },
        { type: "response.output_item.done", item },
        { type: "response.completed", response: finalResponse },
      ),
    );
    const seen: unknown[] = [];
    stream.on("response.output_item.done", ({ item }) => seen.push(item));

    await expect(stream.finalResponse()).resolves.toBe(finalResponse);
    expect(seen).toEqual([item]);
  });

  it("returns incomplete responses for the caller to handle", async () => {
    const incomplete = { ...finalResponse, status: "incomplete" };
    const stream = streamFromEvents(events({ type: "response.incomplete", response: incomplete }));
    await expect(stream.finalResponse()).resolves.toBe(incomplete);
  });

  it("throws on failed responses and stream errors", async () => {
    const failed = streamFromEvents(
      events({ type: "response.failed", response: { error: { message: "server error" } } }),
    );
    await expect(failed.finalResponse()).rejects.toThrow(/server error/);
    await expect(streamFromEvents(events({ type: "error", message: "boom" })).finalResponse()).rejects.toThrow(/boom/);
  });

  it("throws if the stream ends without a final response", async () => {
    await expect(streamFromEvents(events({ type: "response.created" })).finalResponse()).rejects.toThrow(
      /without a final response/,
    );
  });
});
