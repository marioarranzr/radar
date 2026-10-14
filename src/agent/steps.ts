import type OpenAI from "openai";
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
  const max = MAX_LABEL - "Reading: ".length;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return truncate(host + path, max);
  } catch {
    return truncate(raw, max);
  }
}

/** Returns the progress step for a finished output item, or null if it isn't one. */
export function stepForItem(item: OpenAI.Responses.ResponseOutputItem): Step | null {
  if (item.type === "web_search_call") {
    const { action } = item;
    if (action.type === "search") {
      const query = (action.queries?.[0] ?? action.query)?.trim();
      return { kind: "search", label: query ? truncate(`Searching: “${query}”`) : "Searching the web" };
    }
    if (action.type === "open_page") {
      return { kind: "fetch", label: action.url ? `Reading: ${shortUrl(action.url)}` : "Reading a page" };
    }
    if (action.type === "find_in_page") {
      return { kind: "fetch", label: `Scanning: ${shortUrl(action.url)}` };
    }
    return null;
  }
  if (item.type === "function_call" && item.name === "submit_report") {
    return { kind: "info", label: "Writing the brief" };
  }
  return null;
}
