import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshWatch, runDueRefreshes } from "@/agent/watchlist";
import { createStore, openDatabase, type Store } from "@/lib/db";

let store: Store;
let enqueue: ReturnType<typeof vi.fn<(id: string) => void>>;

const finished = (query: string) => {
  const id = store.createResearch({ query, context: "Selling HR software" });
  store.markRunning(id);
  store.markDone(id, {});
  return id;
};
const deps = (dailyLimit = 10) => ({ store, dailyLimit, enqueue });

beforeEach(() => {
  store = createStore(openDatabase(":memory:"));
  enqueue = vi.fn();
});

describe("refreshWatch", () => {
  it("creates a linked research with the same query and context and queues it", () => {
    const first = finished("Acme Corp");
    const watch = store.follow(first)!;

    const outcome = refreshWatch(watch, deps());

    expect(outcome.status).toBe("started");
    const id = (outcome as { id: string }).id;
    expect(store.getResearch(id)).toMatchObject({ query: "Acme Corp", context: "Selling HR software", previousId: first });
    expect(store.getWatch(watch.id)?.lastResearchId).toBe(id);
    expect(enqueue).toHaveBeenCalledWith(id);
  });

  it("refuses while the last research is still running", () => {
    const id = store.createResearch({ query: "Acme Corp" });
    const watch = store.follow(id)!;
    expect(refreshWatch(watch, deps())).toEqual({ status: "busy" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("respects the daily limit", () => {
    const watch = store.follow(finished("Acme Corp"))!;
    expect(refreshWatch(watch, deps(1))).toEqual({ status: "limit" });
  });
});

describe("runDueRefreshes", () => {
  it("refreshes due watches and stops at the daily limit", () => {
    for (const company of ["Acme", "Globex", "Initech"]) store.follow(finished(company));
    const inEightDays = new Date(Date.now() + 8 * 86_400_000);

    // 3 created today, limit 4: one refresh fits.
    expect(runDueRefreshes({ ...deps(4), now: inEightDays })).toBe(1);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("does nothing when no watch is due", () => {
    store.follow(finished("Acme"));
    expect(runDueRefreshes(deps())).toBe(0);
  });
});
