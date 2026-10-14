import type Anthropic from "@anthropic-ai/sdk";
import type { StepKind } from "@/lib/db";

// Turns what the agent does into human-readable progress steps — see docs/02-TRD.md §3.6.

export interface Step {
  kind: StepKind;
  label: string;
}

const MAX_LABEL = 80;

function truncate(text: string, max = MAX_LABEL): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** "https://www.acme.com/about/" → "acme.com/about" */
export function shortUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return truncate(host + path, MAX_LABEL - "Reading: ".length);
  } catch {
    return truncate(raw, MAX_LABEL - "Reading: ".length);
  }
}

function stringField(input: unknown, field: string): string | null {
  if (input && typeof input === "object" && field in input) {
    const value = (input as Record<string, unknown>)[field];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return null;
}

/** Returns the progress step for a finished content block, or null if it isn't one. */
export function stepForBlock(block: Anthropic.Beta.BetaContentBlock): Step | null {
  if (block.type === "server_tool_use") {
    if (block.name === "web_search") {
      const query = stringField(block.input, "query");
      return { kind: "search", label: query ? truncate(`Searching: “${query}”`) : "Searching the web" };
    }
    if (block.name === "web_fetch") {
      const url = stringField(block.input, "url");
      return { kind: "fetch", label: url ? `Reading: ${shortUrl(url)}` : "Reading a page" };
    }
    return null;
  }
  if (block.type === "tool_use" && block.name === "submit_report") {
    return { kind: "info", label: "Writing the brief" };
  }
  return null;
}
