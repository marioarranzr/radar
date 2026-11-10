"use client";

import { useState } from "react";
import { buttonClass } from "@/components/Button";
import { useToast } from "@/components/Toast";

/** Follows or unfollows the company of a research (docs/03-APP-FLOW.md). */
export function FollowButton({
  researchId,
  companyName,
  initialWatchId,
}: {
  researchId: string;
  companyName: string;
  initialWatchId: string | null;
}) {
  const toast = useToast();
  const [watchId, setWatchId] = useState(initialWatchId);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (watchId) {
        const response = await fetch(`/api/watchlist/${watchId}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error(String(response.status));
        setWatchId(null);
        toast(`Stopped following ${companyName}`);
      } else {
        const response = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ researchId }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const { watch } = await response.json();
        setWatchId(watch.id);
        toast(`Following ${companyName} — refreshed every ${watch.intervalDays} days`);
      }
    } catch {
      toast("Couldn't update the watchlist. Please retry.", "error");
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={watchId !== null}
      className={buttonClass("secondary", watchId ? "border-accent text-accent" : "")}
    >
      {watchId ? "Following" : "Follow"}
    </button>
  );
}
