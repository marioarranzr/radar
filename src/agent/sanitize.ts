// OpenAI's web search can leak internal citation markers into generated text, e.g.
// "citeturn3view7". They are meaningless to readers, so strip them
// (and any other stray private-use characters) from every string in the brief.

const CITATION_MARKER = /\s*[^]*/g;
const PRIVATE_USE = /[-]/g;

export function stripCitationMarkers<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(CITATION_MARKER, "").replace(PRIVATE_USE, "").trim() as T;
  }
  if (Array.isArray(value)) return value.map(stripCitationMarkers) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, stripCitationMarkers(inner)]),
    ) as T;
  }
  return value;
}
