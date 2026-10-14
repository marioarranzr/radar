import { describe, expect, it } from "vitest";
import { stripCitationMarkers } from "@/agent/sanitize";

const marker = "citeturn1view0turn3view7";

describe("stripCitationMarkers", () => {
  it("removes citation markers and the space before them", () => {
    expect(stripCitationMarkers(`Hiring across markets. ${marker}`)).toBe("Hiring across markets.");
    expect(stripCitationMarkers(`A ${marker} and B`)).toBe("A and B");
  });

  it("cleans nested objects and arrays without touching other values", () => {
    const input = { title: `Series D ${marker}`, items: [`x${marker}`, "y"], confirmed: true, count: 3, none: null };
    expect(stripCitationMarkers(input)).toEqual({ title: "Series D", items: ["x", "y"], confirmed: true, count: 3, none: null });
  });

  it("drops stray private-use characters", () => {
    expect(stripCitationMarkers("Acme Corp")).toBe("Acme Corp");
  });
});
