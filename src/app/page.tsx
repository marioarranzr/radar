import { AutoRefresh } from "@/components/AutoRefresh";
import { HistoryList, type HistoryItem } from "@/components/HistoryList";
import { ResearchForms } from "@/components/ResearchForms";
import { WatchList, type WatchItem } from "@/components/WatchList";
import { ReportSchema } from "@/agent/schema";
import { newSignalIndexes } from "@/lib/signals";
import { getStore } from "@/lib/db";
import { getEnv } from "@/lib/env";

// Always read fresh data from SQLite.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const store = getStore();
  const limit = getEnv().DAILY_RESEARCH_LIMIT;
  const remaining = limit - store.countResearchToday();
  const history: HistoryItem[] = store.listResearch().map((research) => ({
    id: research.id,
    name: research.companyName ?? research.query,
    status: research.status,
    createdAt: research.createdAt,
  }));
  const following: WatchItem[] = store.listWatchlist().map((watch) => {
    const last = watch.lastResearchId ? store.getResearch(watch.lastResearchId) : null;
    const previous = last?.previousId ? store.getResearch(last.previousId) : null;
    const lastReport = ReportSchema.safeParse(last?.report);
    const previousReport = ReportSchema.safeParse(previous?.report);
    return {
      id: watch.id,
      name: last?.companyName ?? watch.query,
      lastResearchId: last?.id ?? null,
      status: last?.status ?? null,
      updatedAt: last?.finishedAt ?? last?.createdAt ?? null,
      newSignals:
        lastReport.success && previousReport.success
          ? newSignalIndexes(lastReport.data, previousReport.data).size
          : null,
    };
  });
  const inProgress = history.some((item) => item.status === "queued" || item.status === "running");
  // Remount the list when ids or statuses change so it picks up the refreshed data.
  const historyKey = history.map((item) => `${item.id}:${item.status}`).join(",");

  return (
    <>
      <AutoRefresh active={inProgress} />
      <h1 className="text-[28px] leading-tight font-semibold">Which company should we research?</h1>
      <div className="mt-6">
        <ResearchForms remaining={remaining} limit={limit} />
      </div>
      {following.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xl font-semibold">Following</h2>
          <WatchList items={following} />
        </section>
      )}
      <section className="mt-12">
        <h2 id="history-heading" tabIndex={-1} className="mb-3 text-xl font-semibold">
          History
        </h2>
        <HistoryList key={historyKey} items={history} />
      </section>
    </>
  );
}
