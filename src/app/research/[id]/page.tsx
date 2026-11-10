import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchView } from "@/components/ResearchView";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const research = getStore().getResearch((await params).id);
  return { title: research ? `${research.companyName ?? research.query} · Radar` : "Not found · Radar" };
}

export default async function ResearchPage({ params }: Props) {
  const { id } = await params;
  const store = getStore();
  const research = store.getResearch(id);
  if (!research) notFound();

  const previous = research.previousId ? store.getResearch(research.previousId) : null;
  return (
    <ResearchView
      key={id}
      initialResearch={research}
      initialSteps={store.listSteps(id)}
      initialWatchId={store.getWatchByQuery(research.query)?.id ?? null}
      previous={previous?.status === "done" ? { report: previous.report, createdAt: previous.createdAt } : null}
    />
  );
}
