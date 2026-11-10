"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import type { ResearchStatus } from "@/lib/db";
import { formatRelative, plural } from "@/lib/format";

export interface WatchItem {
  id: string;
  name: string;
  lastResearchId: string | null;
  status: ResearchStatus | null;
  updatedAt: string | null;
  newSignals: number | null;
}

/** "Following" on the home page: followed companies with refresh and unfollow (docs/03-APP-FLOW.md). */
export function WatchList({ items }: { items: WatchItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function act(item: WatchItem, action: "refresh" | "unfollow") {
    setPending(item.id);
    try {
      const response =
        action === "refresh"
          ? await fetch(`/api/watchlist/${item.id}/refresh`, { method: "POST" })
          : await fetch(`/api/watchlist/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast(body.error ?? "Something went wrong. Please retry.", "error");
      }
      router.refresh();
    } catch {
      toast("Couldn't reach Radar. Is the server running?", "error");
    }
    setPending(null);
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => {
        const active = item.status === "queued" || item.status === "running";
        return (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              {item.lastResearchId ? (
                <Link href={`/research/${item.lastResearchId}`} className="block truncate font-semibold hover:text-accent">
                  {item.name}
                </Link>
              ) : (
                <span className="block truncate font-semibold">{item.name}</span>
              )}
              <span className="font-mono text-[13px] text-muted" suppressHydrationWarning>
                {item.updatedAt ? `Updated ${formatRelative(item.updatedAt)}` : "Not researched yet"}
                {item.newSignals ? ` · ${plural(item.newSignals, "new signal")}` : ""}
              </span>
            </div>
            {active && item.status && <StatusBadge status={item.status} />}
            <button
              type="button"
              disabled={active || pending === item.id}
              onClick={() => act(item, "refresh")}
              className={buttonClass("ghost", "h-8 px-3 text-sm")}
            >
              Refresh now
            </button>
            <button
              type="button"
              disabled={pending === item.id}
              onClick={() => act(item, "unfollow")}
              aria-label={`Unfollow ${item.name}`}
              className={buttonClass("ghost", "h-8 px-3 text-sm")}
            >
              Unfollow
            </button>
          </li>
        );
      })}
    </ul>
  );
}
