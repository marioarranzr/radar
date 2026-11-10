import { describe, expect, it } from "vitest";
import type { Report } from "@/agent/schema";
import { applyVerification, buildVerifierInput, verifyBrief, type Verification } from "@/agent/verify";
import { validReport } from "./fixtures/report";
import { fakeModel, functionCall, openPage, response } from "./helpers/fake-model";

const report: Report = {
  ...validReport,
  key_facts: [
    { label: "Employees", value: "120", confirmed: true },
    { label: "Founded", value: "2019", confirmed: false },
    { label: "Headquarters", value: "Barcelona", confirmed: true },
  ],
  recent_signals: [
    { date: "2026-05-02", title: "Raises Series A", url: "https://news.example.com/a" },
    { date: "2026-04-01", title: "Opens Berlin office", url: "https://news.example.com/b" },
  ],
};

const check = (index: number, verdict: "supported" | "unsupported" | "unverifiable") => ({ index, verdict, note: "" });

describe("applyVerification", () => {
  it("downgrades confirmed facts that aren't supported and keeps their values", () => {
    const { report: result, summary } = applyVerification(report, {
      facts: [check(0, "unsupported"), check(1, "unverifiable"), check(2, "supported")],
      signals: [check(0, "supported"), check(1, "supported")],
    });

    expect(result.key_facts).toEqual([
      { label: "Employees", value: "120", confirmed: false },
      { label: "Founded", value: "2019", confirmed: false },
      { label: "Headquarters", value: "Barcelona", confirmed: true },
    ]);
    expect(summary).toEqual({ checked: 5, downgraded: 1, removedSignals: 0 });
  });

  it("never upgrades an unconfirmed fact", () => {
    const { report: result } = applyVerification(report, { facts: [check(1, "supported")], signals: [] });
    expect(result.key_facts[1].confirmed).toBe(false);
  });

  it("removes only signals its source contradicts", () => {
    const { report: result, summary } = applyVerification(report, {
      facts: [],
      signals: [check(0, "unverifiable"), check(1, "unsupported")],
    });
    expect(result.recent_signals.map((s) => s.title)).toEqual(["Raises Series A"]);
    expect(summary.removedSignals).toBe(1);
  });

  it("ignores out-of-range indexes and leaves unchecked items untouched", () => {
    const { report: result, summary } = applyVerification(report, {
      facts: [check(7, "unsupported")],
      signals: [check(9, "unsupported")],
    });
    expect(result).toEqual(report);
    expect(summary).toEqual({ checked: 0, downgraded: 0, removedSignals: 0 });
  });

  it("doesn't touch the rest of the brief", () => {
    const { report: result } = applyVerification(report, { facts: [check(0, "unsupported")], signals: [] });
    expect({ ...result, key_facts: [], recent_signals: [] }).toEqual({ ...report, key_facts: [], recent_signals: [] });
  });
});

describe("verifyBrief", () => {
  const verification: Verification = { facts: [check(0, "supported")], signals: [check(0, "supported")] };

  it("checks cited pages and returns a validated verification", async () => {
    const model = fakeModel([
      response([openPage("https://news.example.com/a"), functionCall("submit_verification", verification)]),
    ]);
    const opened: string[] = [];

    const result = await verifyBrief(report, {
      createStream: model.createStream,
      model: "verifier-test",
      onItem: (item) => void (item.type === "web_search_call" && opened.push(item.id)),
    });

    expect(result).toMatchObject({ status: "ok", value: verification });
    expect(opened).toHaveLength(1);
    expect(model.requests[0].reasoning).toEqual({ effort: "low" });
  });

  it("numbers facts and signals in its input", () => {
    const input = buildVerifierInput(report);
    expect(input).toContain("0. Employees: 120");
    expect(input).toContain("1. 2026-04-01 — Opens Berlin office (https://news.example.com/b)");
    expect(input).toContain("- Acme — About: https://acme.example.com/about");
  });
});
