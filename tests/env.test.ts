import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const validKey = "sk-ant-test-0000000000";

describe("parseEnv", () => {
  it("applies defaults when only the API key is set", () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: validKey })).toEqual({
      ANTHROPIC_API_KEY: validKey,
      ANTHROPIC_MODEL: "claude-opus-5-5",
      DAILY_RESEARCH_LIMIT: 10,
      DATABASE_PATH: "./data/radar.db",
    });
  });

  it("coerces the daily limit from a string", () => {
    const env = parseEnv({ ANTHROPIC_API_KEY: validKey, DAILY_RESEARCH_LIMIT: "3" });
    expect(env.DAILY_RESEARCH_LIMIT).toBe(3);
  });

  it("fails with a helpful message when the API key is missing", () => {
    expect(() => parseEnv({})).toThrow(/ANTHROPIC_API_KEY is missing/);
  });

  it("rejects a value that is not an Anthropic key", () => {
    expect(() => parseEnv({ ANTHROPIC_API_KEY: "not-a-key" })).toThrow(/does not look like/);
  });

  it("rejects a non-positive daily limit", () => {
    expect(() => parseEnv({ ANTHROPIC_API_KEY: validKey, DAILY_RESEARCH_LIMIT: "0" })).toThrow(
      /DAILY_RESEARCH_LIMIT/,
    );
  });
});
