import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { shortUrl, stepForBlock } from "@/agent/steps";

type Block = Anthropic.Beta.BetaContentBlock;

const serverToolUse = (name: string, input: unknown) =>
  ({ type: "server_tool_use", id: "srvtoolu_1", name, input }) as unknown as Block;

describe("stepForBlock", () => {
  it("describes a web search with its query", () => {
    expect(stepForBlock(serverToolUse("web_search", { query: "acme pricing" }))).toEqual({
      kind: "search",
      label: "Searching: “acme pricing”",
    });
  });

  it("describes a web fetch with a short URL", () => {
    expect(
      stepForBlock(serverToolUse("web_fetch", { url: "https://www.acme.com/about/" })),
    ).toEqual({ kind: "fetch", label: "Reading: acme.com/about" });
  });

  it("falls back to a generic label when the input is missing", () => {
    expect(stepForBlock(serverToolUse("web_search", {}))?.label).toBe("Searching the web");
    expect(stepForBlock(serverToolUse("web_fetch", null))?.label).toBe("Reading a page");
  });

  it("truncates very long search queries", () => {
    const step = stepForBlock(serverToolUse("web_search", { query: "x".repeat(200) }));
    expect(step?.label.length).toBeLessThanOrEqual(80);
    expect(step?.label.endsWith("…")).toBe(true);
  });

  it("announces the brief when submit_report is called", () => {
    const block = { type: "tool_use", id: "toolu_1", name: "submit_report", input: {} } as Block;
    expect(stepForBlock(block)).toEqual({ kind: "info", label: "Writing the brief" });
  });

  it("ignores text, thinking and tool result blocks", () => {
    expect(stepForBlock({ type: "text", text: "hi", citations: null } as Block)).toBeNull();
    expect(stepForBlock({ type: "thinking", thinking: "", signature: "s" } as Block)).toBeNull();
    expect(
      stepForBlock({ type: "web_search_tool_result", tool_use_id: "x", content: [] } as unknown as Block),
    ).toBeNull();
  });
});

describe("shortUrl", () => {
  it("keeps invalid URLs readable", () => {
    expect(shortUrl("not a url")).toBe("not a url");
  });
});
