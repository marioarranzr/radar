import { describe, expect, it } from "vitest";
import { reportToMarkdown } from "@/lib/markdown";
import { validReport } from "./fixtures/report";

describe("reportToMarkdown", () => {
  const markdown = reportToMarkdown(validReport);

  it("includes every section in order", () => {
    const headings = markdown.split("\n").filter((line) => line.startsWith("#"));
    expect(headings).toEqual([
      "# Acme Analytics",
      "## Summary",
      "## What they sell and to whom",
      "## Business model",
      "## Size and key facts",
      "## Recent signals",
      "## Likely pains / opportunities",
      "## Questions for a first call",
      "## Sources",
    ]);
  });

  it("marks unconfirmed facts and links sources", () => {
    expect(markdown).toContain("- **Founded:** 2019 _(unconfirmed)_");
    expect(markdown).toContain("- **Employees:** 120\n");
    expect(markdown).toContain("1. [Acme — About](https://acme.example.com/about)");
  });

  it("escapes brackets in link text", () => {
    const report = { ...validReport, sources: [{ title: "A [beta] page", url: "https://a.example.com" }] };
    expect(reportToMarkdown(report)).toContain("[A \\[beta\\] page](https://a.example.com)");
  });
});

describe("reportToMarkdown safety", () => {
  it("drops unsafe links and keeps values on one line", () => {
    const report = {
      ...validReport,
      company_name: "Acme\n# Injected heading",
      sources: [{ title: "Bad", url: "javascript:alert(1)" }],
    };
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain("# Acme # Injected heading\n");
    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("1. Bad");
  });
});
