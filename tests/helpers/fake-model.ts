import type OpenAI from "openai";
import type { AgentRequest, AgentStream } from "@/agent/loop";

// A scripted stand-in for the OpenAI Responses API: one canned response per request.

export type Item = OpenAI.Responses.ResponseOutputItem;
type Response = OpenAI.Responses.Response;

export const search = (query: string) =>
  ({ type: "web_search_call", id: `ws_${query}`, status: "completed", action: { type: "search", queries: [query] } }) as Item;
export const openPage = (url: string) =>
  ({ type: "web_search_call", id: `ws_${url}`, status: "completed", action: { type: "open_page", url } }) as Item;
export const functionCall = (name: string, args: unknown, callId = `call_${name}`) =>
  ({ type: "function_call", name, call_id: callId, arguments: JSON.stringify(args) }) as Item;
export const message = (text: string) =>
  ({ type: "message", id: "msg", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }) as Item;
export const refusal = () =>
  ({ type: "message", id: "msg", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No." }] }) as Item;

let responseCount = 0;
export function response(output: Item[], extra: Partial<Response> = {}): Response {
  return {
    id: `resp_${++responseCount}`,
    status: "completed",
    output,
    incomplete_details: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...extra,
  } as Response;
}

export function fakeModel(responses: Array<Response | Error>) {
  const requests: AgentRequest[] = [];
  const createStream = (params: AgentRequest): AgentStream => {
    requests.push(params);
    const next = responses.shift();
    if (!next) throw new Error("Fake model ran out of scripted responses");
    const listeners: Array<(event: { item: Item }) => void> = [];
    return {
      on: (_event, listener) => listeners.push(listener),
      finalResponse: async () => {
        if (next instanceof Error) throw next;
        for (const item of next.output) listeners.forEach((listener) => listener({ item }));
        return next;
      },
    };
  };
  return { createStream, requests };
}
