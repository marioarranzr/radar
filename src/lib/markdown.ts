import type { Report } from "@/agent/schema";
import { isSafeUrl } from "@/lib/format";

// "Copy Markdown" export of a brief (docs/01-PRD.md F4.1).

/** Collapses newlines so a value can't start a new heading or list item. */
const line = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();
const escapeLinkText = (text: string) => line(text).replaceAll("[", "\\[").replaceAll("]", "\\]");
const link = (text: string, url: string) =>
  isSafeUrl(url) ? `[${escapeLinkText(text)}](${url.replaceAll(" ", "%20").replaceAll(")", "%29")})` : line(text);

export function reportToMarkdown(report: Report): string {
  const lines: string[] = [`# ${line(report.company_name)}`];
  if (report.website && isSafeUrl(report.website)) lines.push("", report.website);

  lines.push("", "## Summary", "", report.summary);
  lines.push("", "## What they sell and to whom", "", report.offering);
  lines.push("", "## Business model", "", report.business_model);

  if (report.key_facts.length) {
    lines.push("", "## Size and key facts", "");
    for (const fact of report.key_facts) {
      lines.push(`- **${line(fact.label)}:** ${line(fact.value)}${fact.confirmed ? "" : " _(unconfirmed)_"}`);
    }
  }
  if (report.recent_signals.length) {
    lines.push("", "## Recent signals", "");
    for (const signal of report.recent_signals) {
      lines.push(`- ${line(signal.date)} — ${link(signal.title, signal.url)}`);
    }
  }
  if (report.pains_opportunities.length) {
    lines.push("", "## Likely pains / opportunities", "");
    for (const item of report.pains_opportunities) lines.push(`- ${line(item)}`);
  }
  lines.push("", "## Questions for a first call", "");
  report.discovery_questions.forEach((question, i) => lines.push(`${i + 1}. ${line(question)}`));
  lines.push("", "## Sources", "");
  report.sources.forEach((source, i) => lines.push(`${i + 1}. ${link(source.title, source.url)}`));

  return lines.join("\n") + "\n";
}
