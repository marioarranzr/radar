import type OpenAI from "openai";
import type { AgentRequest, AgentStream } from "@/agent/run";

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

/**
 * Streams a response from raw server events instead of the SDK's ResponseStream helper,
 * whose accumulator rejects some valid item sequences (e.g. a message followed by a
 * function call). The final response comes from the terminal event itself.
 */
export function streamFromEvents(start: () => Promise<AsyncIterable<StreamEvent>>): AgentStream {
  const listeners: Array<(event: { item: OpenAI.Responses.ResponseOutputItem }) => void> = [];
  return {
    on: (_event, listener) => listeners.push(listener),
    async finalResponse() {
      for await (const event of await start()) {
        switch (event.type) {
          case "response.output_item.done":
            for (const listener of listeners) listener({ item: event.item });
            break;
          case "response.completed":
          case "response.incomplete":
            return event.response;
          case "response.failed":
            throw new Error(`The response failed: ${event.response.error?.message ?? "unknown error"}`);
          case "error":
            throw new Error(`The response stream reported an error: ${event.message}`);
        }
      }
      throw new Error("The response stream ended without a final response.");
    },
  };
}

export function streamResponse(client: OpenAI, params: AgentRequest): AgentStream {
  return streamFromEvents(() => client.responses.create({ ...params, stream: true }));
}
