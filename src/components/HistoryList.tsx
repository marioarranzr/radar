"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TrashIcon } from "@/components/Icons";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import type { ResearchStatus } from "@/lib/db";
import { formatRelative } from "@/lib/format";

export interface HistoryItem {
  id: string;
  name: string;
  status: ResearchStatus;
  createdAt: string;
}

export function HistoryList({ items: initialItems }: { items: HistoryItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [pending, setPending] = useState<HistoryItem | null>(null);
  // Keeps the dialog title stable while it closes.
  const [dialogName, setDialogName] = useState("");

  async function confirmDelete() {
    const item = pending;
    if (!item) return;
    setPending(null);
    const index = items.findIndex((other) => other.id === item.id);
    setItems((current) => current.filter((other) => other.id !== item.id)); // optimistic
    document.getElementById("history-heading")?.focus(); // the focused trash button is gone
    try {
      const response = await fetch(`/api/research/${item.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
    } catch {
      // Put back only this row, where it was, without undoing other deletes.
      setItems((current) => [...current.slice(0, index), item, ...current.slice(index)]);
      toast(`Couldn't delete the research on ${item.name}.`, "error");
    }
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-muted">You haven&apos;t researched any company yet.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border border-y border-border">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-3">
            <Link
              href={`/research/${item.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 hover:text-accent"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{item.name}</span>
                <time
                  dateTime={item.createdAt}
                  suppressHydrationWarning
                  className="font-mono text-[13px] text-muted"
                >
                  {formatRelative(item.createdAt)}
                </time>
              </span>
              <StatusBadge status={item.status} />
            </Link>
            <button
              type="button"
              onClick={() => {
                setDialogName(item.name);
                setPending(item);
              }}
              aria-label={`Delete the research on ${item.name}`}
              className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100"
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title={`Delete the research on ${dialogName}?`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
