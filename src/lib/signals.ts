import type { Report } from "@/agent/schema";

// "New since last time" for watchlist refreshes — docs/02-TRD.md §3.11.

/** Comparable form of a URL: host without www, path without trailing slash, no query or hash. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

const normalizeTitle = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

/** Indexes of the signals in `current` that don't appear (by URL or title) in `previous`. */
export function newSignalIndexes(current: Report, previous: Report | null): Set<number> {
  if (!previous) return new Set();
  const seenUrls = new Set(previous.recent_signals.map((signal) => normalizeUrl(signal.url)));
  const seenTitles = new Set(previous.recent_signals.map((signal) => normalizeTitle(signal.title)));
  const fresh = new Set<number>();
  current.recent_signals.forEach((signal, index) => {
    if (!seenUrls.has(normalizeUrl(signal.url)) && !seenTitles.has(normalizeTitle(signal.title))) {
      fresh.add(index);
    }
  });
  return fresh;
}
