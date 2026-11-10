// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchResearchForm } from "@/components/BatchResearchForm";
import { HistoryList } from "@/components/HistoryList";
import { NewResearchForm } from "@/components/NewResearchForm";
import { ReportView } from "@/components/ReportView";
import { ResearchView } from "@/components/ResearchView";
import type { Research } from "@/lib/db";
import { validReport } from "./fixtures/report";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
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
  verification: null,
  previousId: null,
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

describe("BatchResearchForm", () => {
  it("counts the companies and queues them", async () => {
    fetchMock.mockReturnValueOnce(json(200, { ids: ["a", "b"] }));
    render(<BatchResearchForm remaining={5} />);

    fireEvent.change(screen.getByLabelText("Companies (one per line)"), { target: { value: "Acme\nGlobex\nacme" } });
    expect(screen.getByText("2 companies · 5 left today")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Research 2 companies" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/research/batch");
    expect(JSON.parse(init.body)).toEqual({ queries: ["Acme", "Globex"] });
  });

  it("won't submit more companies than are left today", () => {
    render(<BatchResearchForm remaining={1} />);
    fireEvent.change(screen.getByLabelText("Companies (one per line)"), { target: { value: "Acme\nGlobex" } });
    expect(screen.getByRole("button", { name: "Research 2 companies" })).toHaveProperty("disabled", true);
  });

  it("fills the list from a CSV file", async () => {
    render(<BatchResearchForm remaining={5} />);
    const file = new File(["company,website\nAcme,acme.com\nGlobex,globex.com"], "list.csv", { type: "text/csv" });

    fireEvent.change(screen.getByLabelText("Upload CSV"), { target: { files: [file] } });

    await waitFor(() =>
      expect((screen.getByLabelText("Companies (one per line)") as HTMLTextAreaElement).value).toBe("Acme\nGlobex"),
    );
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

  it("downloads the brief as a Markdown file and opens the print dialog", () => {
    const createObjectURL = vi.fn(() => "blob:brief");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<ReportView report={validReport} createdAt="2026-10-14T10:00:00Z" footer="" />);

    fireEvent.click(screen.getByRole("button", { name: "Download .md" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("acme-analytics.md");

    fireEvent.click(screen.getByRole("button", { name: "Print / PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });
});

describe("ResearchView", () => {
  it("shows the brief with run metrics when done", () => {
    render(<ResearchView initialResearch={research()} initialSteps={[]} />);
    expect(screen.getByText(/Generated in 1 min 14 s · 3 searches · 5 pages read · AI-generated/)).toBeDefined();
  });

  it("adds the verifier's outcome to the footer", () => {
    const verified = research({ verification: { checked: 8, downgraded: 1, removedSignals: 0 } });
    render(<ResearchView initialResearch={verified} initialSteps={[]} />);
    expect(screen.getByText(/5 pages read · 8 claims verified, 1 downgraded/)).toBeDefined();
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
