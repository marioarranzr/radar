import { describe, expect, it } from "vitest";
import { buildJudgeInput, judgeBrief, supportedRatio, type Judgement } from "@/eval/judge";
import { validReport } from "./fixtures/report";
import { fakeModel, functionCall, message, openPage, response } from "./helpers/fake-model";

const judgement: Judgement = {
  checked_claims: [
    { claim: "Raised a Series A", source_url: "https://news.example.com/acme-series-a", verdict: "supported", note: "Stated in the headline." },
    { claim: "120 employees", source_url: "https://acme.example.com/about", verdict: "unverifiable", note: "Not on the page." },
    { claim: "Founded in 2019", source_url: null, verdict: "unsupported", note: "The about page says 2018." },
  ],
  groundedness: 3,
  completeness: 4,
  relevance: 4,
  recency: 5,
  summary: "Useful and recent, but one key fact is wrong.",
};

const deps = (createStream: ReturnType<typeof fakeModel>["createStream"]) => ({
  createStream,
  model: "judge-test",
  now: () => new Date("2026-11-10T09:00:00Z"),
});

describe("judgeBrief", () => {
  it("opens sources and returns a validated judgement", async () => {
    const model = fakeModel([
      response([openPage("https://news.example.com/acme-series-a"), functionCall("submit_judgement", judgement)]),
    ]);

    const result = await judgeBrief(validReport, deps(model.createStream));

    expect(result).toMatchObject({ status: "ok", value: judgement });
    const [request] = model.requests;
    expect(request.model).toBe("judge-test");
    expect(request.tools?.map((tool) => tool.type)).toEqual(["web_search", "function"]);
    expect(String(request.input)).toContain('"company_name": "Acme Analytics"');
  });

  it("rejects scores outside 1-5 and asks once for a correction", async () => {
    const model = fakeModel([
      response([functionCall("submit_judgement", { ...judgement, groundedness: 9 })]),
      response([functionCall("submit_judgement", judgement)]),
    ]);

    const result = await judgeBrief(validReport, deps(model.createStream));

    expect(result.status).toBe("ok");
    expect(JSON.stringify(model.requests[1].input)).toContain("groundedness");
  });

  it("reports when the judge never submits", async () => {
    const model = fakeModel([response([message("Looks fine.")]), response([message("Really.")])]);
    expect((await judgeBrief(validReport, deps(model.createStream))).status).toBe("no_submit");
  });
});

describe("judge helpers", () => {
  it("embeds the brief as data and dates the review", () => {
    const input = buildJudgeInput(validReport, new Date("2026-11-10T09:00:00Z"));
    expect(input).toContain("Today's date: 2026-11-10");
    expect(input).toMatch(/<brief>[\s\S]*Acme Analytics[\s\S]*<\/brief>/);
  });

  it("computes the share of supported claims", () => {
    expect(supportedRatio(judgement)).toBeCloseTo(1 / 3);
  });
});
