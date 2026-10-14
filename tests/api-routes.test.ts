import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, openDatabase, type Store } from "@/lib/db";

// Real routes and store; the agent, Next's after() and the env are replaced.
const mocks = vi.hoisted(() => ({
  store: undefined as unknown as Store,
  runResearchAgent: vi.fn(async () => {}),
  // Captures the background task instead of running it; tests call it explicitly.
  after: vi.fn((task: () => unknown) => void task),
}));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getStore: () => mocks.store,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ DAILY_RESEARCH_LIMIT: 2 }),
}));
vi.mock("@/agent/run", () => ({ runResearchAgent: mocks.runResearchAgent }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));

const { POST: createResearch } = await import("@/app/api/research/route");
const { GET: getResearch, DELETE: deleteResearch } = await import("@/app/api/research/[id]/route");
const { POST: retryResearch } = await import("@/app/api/research/[id]/retry/route");

const post = (body: unknown, contentType = "application/json") =>
  new Request("http://localhost/api/research", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const empty = new Request("http://localhost");

beforeEach(() => {
  mocks.store = createStore(openDatabase(":memory:"));
  vi.clearAllMocks();
});

describe("POST /api/research", () => {
  it("creates a queued research and starts the agent after responding", async () => {
    const response = await createResearch(post({ query: "  Acme Corp ", context: "" }));

    expect(response.status).toBe(200);
    const { id } = await response.json();
    expect(mocks.store.getResearch(id)).toMatchObject({ query: "Acme Corp", context: null, status: "queued" });
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runResearchAgent).toHaveBeenCalledWith(id);
  });

  it("rejects invalid input with a readable message", async () => {
    const response = await createResearch(post({ query: "A" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Enter at least 2 characters." });
    expect(mocks.store.listResearch()).toHaveLength(0);
  });

  it("rejects a body that isn't JSON", async () => {
    expect((await createResearch(post("not json"))).status).toBe(400);
  });

  it("requires a JSON content type (forces a CORS preflight)", async () => {
    expect((await createResearch(post({ query: "Acme" }, "text/plain"))).status).toBe(415);
  });

  it("explains a missing company name", async () => {
    const response = await createResearch(post({}));
    expect(await response.json()).toEqual({ error: "Enter a company name or URL." });
  });

  it("rejects a body that isn't an object", async () => {
    const response = await createResearch(post([]));
    expect(await response.json()).toEqual({ error: "Invalid request." });
  });

  it("marks the research failed if the agent can't even start", async () => {
    mocks.runResearchAgent.mockRejectedValueOnce(new Error("bad client setup"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id } = await (await createResearch(post({ query: "Acme Corp" }))).json();

    await mocks.after.mock.calls[0][0]();

    expect(mocks.store.getResearch(id)).toMatchObject({
      status: "failed",
      error: "The research couldn't start. Please retry.",
    });
  });

  it("enforces the daily limit", async () => {
    await createResearch(post({ query: "First Co" }));
    await createResearch(post({ query: "Second Co" }));

    const response = await createResearch(post({ query: "Third Co" }));

    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/today's research limit/);
    expect(mocks.store.listResearch()).toHaveLength(2);
  });
});

describe("GET /api/research/[id]", () => {
  it("returns the research with its steps", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    mocks.store.addStep(id, "search", "Searching: “acme”");

    const response = await getResearch(empty, ctx(id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.research).toMatchObject({ id, status: "queued" });
    expect(body.steps.map((step: { label: string }) => step.label)).toEqual(["Searching: “acme”"]);
  });

  it("returns 404 for an unknown id", async () => {
    expect((await getResearch(empty, ctx("missing"))).status).toBe(404);
  });
});

describe("DELETE /api/research/[id]", () => {
  it("deletes the research", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    expect((await deleteResearch(empty, ctx(id))).status).toBe(204);
    expect(mocks.store.getResearch(id)).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    expect((await deleteResearch(empty, ctx("missing"))).status).toBe(404);
  });
});

describe("POST /api/research/[id]/retry", () => {
  it("requeues a failed research and relaunches the agent", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    mocks.store.markRunning(id);
    mocks.store.markFailed(id, "Boom");

    const response = await retryResearch(empty, ctx(id));

    expect(response.status).toBe(200);
    expect(mocks.store.getResearch(id)?.status).toBe("queued");
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runResearchAgent).toHaveBeenCalledWith(id);
  });

  it("caps retries per research", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    for (let attempt = 0; attempt < 3; attempt++) {
      mocks.store.markRunning(id);
      mocks.store.markFailed(id, "Boom");
      mocks.store.resetForRetry(id);
    }
    mocks.store.markRunning(id);
    mocks.store.markFailed(id, "Boom");

    const response = await retryResearch(empty, ctx(id));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/too many times/);
  });

  it("refuses to retry research that hasn't failed", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    const response = await retryResearch(empty, ctx(id));
    expect(response.status).toBe(409);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    expect((await retryResearch(empty, ctx("missing"))).status).toBe(404);
  });

  it("doesn't count retries against the daily limit", async () => {
    const id = mocks.store.createResearch({ query: "Acme Corp" });
    mocks.store.markRunning(id);
    mocks.store.markFailed(id, "Boom");
    await retryResearch(empty, ctx(id));
    expect(mocks.store.countResearchToday()).toBe(1);
  });
});
