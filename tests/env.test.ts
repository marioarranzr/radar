import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const validKey = "sk-test-0000000000";

describe("parseEnv", () => {
  it("applies defaults when only the API key is set", () => {
    expect(parseEnv({ OPENAI_API_KEY: validKey })).toEqual({
      OPENAI_API_KEY: validKey,
      OPENAI_MODEL: "gpt-6.1-sol",
      VERIFY_BRIEFS: true,
      DAILY_RESEARCH_LIMIT: 10,
      DATABASE_PATH: "./data/radar.db",
    });
  });

  it("turns the verifier off with false-like values only", () => {
    for (const value of ["false", "0", "no", "OFF"]) {
      expect(parseEnv({ OPENAI_API_KEY: validKey, VERIFY_BRIEFS: value }).VERIFY_BRIEFS).toBe(false);
    }
    for (const value of ["true", "1", "", undefined]) {
      expect(parseEnv({ OPENAI_API_KEY: validKey, VERIFY_BRIEFS: value }).VERIFY_BRIEFS).toBe(true);
    }
  });

  it("treats an empty JUDGE_MODEL as unset", () => {
    expect(parseEnv({ OPENAI_API_KEY: validKey, JUDGE_MODEL: "" }).JUDGE_MODEL).toBeUndefined();
    expect(parseEnv({ OPENAI_API_KEY: validKey, JUDGE_MODEL: "gpt-6-astra" }).JUDGE_MODEL).toBe("gpt-6-astra");
  });

  it("coerces the daily limit from a string", () => {
    const env = parseEnv({ OPENAI_API_KEY: validKey, DAILY_RESEARCH_LIMIT: "3" });
    expect(env.DAILY_RESEARCH_LIMIT).toBe(3);
  });

  it("fails with a helpful message when the API key is missing", () => {
    expect(() => parseEnv({})).toThrow(/OPENAI_API_KEY is missing/);
  });

  it("rejects a value that is not an OpenAI key", () => {
    expect(() => parseEnv({ OPENAI_API_KEY: "not-a-key" })).toThrow(/does not look like/);
  });

  it("rejects a non-positive daily limit", () => {
    expect(() => parseEnv({ OPENAI_API_KEY: validKey, DAILY_RESEARCH_LIMIT: "0" })).toThrow(
      /DAILY_RESEARCH_LIMIT/,
    );
  });
});
