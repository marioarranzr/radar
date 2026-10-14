import { HistoryList, type HistoryItem } from "@/components/HistoryList";
import { NewResearchForm } from "@/components/NewResearchForm";
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

  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold">Which company should we research?</h1>
      <div className="mt-6">
        <NewResearchForm remaining={remaining} limit={limit} />
      </div>
      <section className="mt-12">
        <h2 id="history-heading" tabIndex={-1} className="mb-3 text-xl font-semibold">
          History
        </h2>
        <HistoryList items={history} />
      </section>
    </>
  );
}
