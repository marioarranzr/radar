// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "@/app/page";

afterEach(cleanup);

describe("HomePage", () => {
  it("asks which company to research", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /which company should we research/i }),
    ).toBeDefined();
  });
});
