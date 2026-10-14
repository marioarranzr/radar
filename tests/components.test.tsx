// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "@/components/HistoryList";
import { NewResearchForm } from "@/components/NewResearchForm";
import { ReportView } from "@/components/ReportView";
import { ResearchView } from "@/components/ResearchView";
import type { Research } from "@/lib/db";
import { validReport } from "./fixtures/report";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  push.mockReset();
});
afterEach(cleanup);

const research = (overrides: Partial<Research> = {}): Research => ({
  id: "r1",
  query: "Acme Analytics",
  context: null,
  status: "done",
  report: validReport,
  companyName: "Acme Analytics",
  error: null,
  attempts: 1,
  inputTokens: 1000,
  outputTokens: 500,
  searches: 3,
  pagesRead: 5,
  startedAt: "2026-10-14T10:00:00.000Z",
  finishedAt: "2026-10-14T10:01:14.000Z",
  createdAt: "2026-10-14T10:00:00.000Z",
  ...overrides,
});

describe("NewResearchForm", () => {
  it("validates before sending anything", async () => {
    render(<NewResearchForm remaining={5} limit={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter at least 2 characters.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the research and opens it", async () => {
    fetchMock.mockReturnValueOnce(json(200, { id: "abc" }));
    render(<NewResearchForm remaining={5} limit={10} />);

    fireEvent.change(screen.getByLabelText("Company or URL"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/research/abc"));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ query: "Acme", context: null });
  });

  it("disables the form once the daily limit is reached", async () => {
    fetchMock.mockReturnValueOnce(json(429, { error: "You've reached today's research limit." }));
    render(<NewResearchForm remaining={1} limit={10} />);

    fireEvent.change(screen.getByLabelText("Company or URL"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    expect(await screen.findByText(/reached today's limit/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Research" })).toHaveProperty("disabled", true);
  });
});

describe("HistoryList", () => {
  const items = [{ id: "r1", name: "Acme Analytics", status: "done" as const, createdAt: new Date().toISOString() }];

  it("shows an empty state", () => {
    render(<HistoryList items={[]} />);
    expect(screen.getByText(/haven't researched any company yet/)).toBeDefined();
  });

  it("deletes a research after confirmation", async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response(null, { status: 204 })));
    render(<HistoryList items={items} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete the research on Acme Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete", hidden: true }));

    await waitFor(() => expect(screen.queryByText("Acme Analytics")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/research/r1", { method: "DELETE" });
  });

  it("restores the row if the delete fails", async () => {
    fetchMock.mockReturnValueOnce(json(500, { error: "boom" }));
    render(<HistoryList items={items} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete the research on Acme Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete", hidden: true }));

    expect(await screen.findByText("Acme Analytics")).toBeDefined();
  });
});

describe("ReportView", () => {
  it("renders the brief with safe external links and unconfirmed facts", () => {
    render(<ReportView report={validReport} createdAt="2026-10-14T10:00:00Z" footer="Generated in 74 s" />);

    expect(screen.getByRole("heading", { level: 1, name: "Acme Analytics" })).toBeDefined();
    expect(screen.getByText("Unconfirmed")).toBeDefined();
    const source = screen.getByRole("link", { name: /^Acme — About\s?\(opens in a new tab\)$/ });
    expect(source.getAttribute("href")).toBe("https://acme.example.com/about");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(source.getAttribute("target")).toBe("_blank");
  });
});

describe("ResearchView", () => {
  it("shows the brief with run metrics when done", () => {
    render(<ResearchView initialResearch={research()} initialSteps={[]} />);
    expect(screen.getByText(/Generated in 1 min 14 s · 3 searches · 5 pages read/)).toBeDefined();
  });

  it("shows progress steps while running", () => {
    render(
      <ResearchView
        initialResearch={research({ status: "running", report: null, finishedAt: null })}
        initialSteps={[{ id: 1, researchId: "r1", kind: "search", label: "Searching: “acme”", createdAt: "" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Researching Acme Analytics" })).toBeDefined();
    expect(screen.getByRole("listitem").textContent).toBe("Searching: “acme”");
    // Screen readers get only the latest step, in a status region.
    expect(screen.getByRole("status").textContent).toBe("Searching: “acme”");
  });

  it("shows the error and retries", async () => {
    fetchMock.mockReturnValueOnce(json(200, { id: "r1" }));
    render(
      <ResearchView initialResearch={research({ status: "failed", report: null, error: "The search took too long." })} initialSteps={[]} />,
    );

    expect(screen.getByText("The search took too long.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Researching Acme Analytics" })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/research/r1/retry", { method: "POST" });
  });
});
