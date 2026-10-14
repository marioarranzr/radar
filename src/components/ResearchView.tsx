"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReportSchema, type Report } from "@/agent/schema";
import { Button, buttonClass } from "@/components/Button";
import { AlertIcon } from "@/components/Icons";
import { ReportView } from "@/components/ReportView";
import { StepList } from "@/components/StepList";
import { useToast } from "@/components/Toast";
import type { Research, ResearchStep } from "@/lib/db";
import { formatDuration, plural } from "@/lib/format";

const POLL_MS = 2000;

const isActive = (research: Research) => research.status === "queued" || research.status === "running";

function parseReport(value: unknown): Report | null {
  const parsed = ReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function secondsBetween(startIso: string, end: Date | string) {
  return (new Date(end).getTime() - new Date(startIso).getTime()) / 1000;
}

/** /research/[id]: progress → brief or error, polling the API while the agent works. */
export function ResearchView({
  initialResearch,
  initialSteps,
}: {
  initialResearch: Research;
  initialSteps: ResearchStep[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [research, setResearch] = useState(initialResearch);
  const [steps, setSteps] = useState(initialSteps);
  const [now, setNow] = useState(() => new Date());
  const [retrying, setRetrying] = useState(false);
  const active = isActive(research);
  const container = useRef<HTMLDivElement>(null);
  const wasActive = useRef(active);

  // When a run finishes, move focus to the new heading so screen readers announce the result.
  useEffect(() => {
    if (wasActive.current && !active) {
      container.current?.querySelector<HTMLElement>("[data-focus-on-ready]")?.focus();
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return; // never overlap a slow request
      inFlight = true;
      try {
        const response = await fetch(`/api/research/${research.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) {
          clearInterval(pollTimer);
          router.refresh(); // deleted elsewhere → the server renders the 404 page
          return;
        }
        if (!response.ok) return;
        const body: { research: Research; steps: ResearchStep[] } = await response.json();
        if (!controller.signal.aborted) {
          setResearch(body.research);
          setSteps(body.steps);
        }
      } catch {
        // Aborted on unmount, or a transient network error: the next tick retries.
      } finally {
        inFlight = false;
      }
    };
    const pollTimer = setInterval(poll, POLL_MS);
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      controller.abort();
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [active, research.id, router]);

  async function retry() {
    setRetrying(true);
    try {
      const response = await fetch(`/api/research/${research.id}/retry`, { method: "POST" });
      if (response.ok) {
        // Restart the clock from now until the next poll brings the real startedAt.
        const restartedAt = new Date().toISOString();
        setResearch((current) => ({
          ...current,
          status: "queued",
          error: null,
          startedAt: restartedAt,
          finishedAt: null,
        }));
        setSteps([]);
        setNow(new Date());
      } else {
        const body = await response.json().catch(() => ({}));
        toast(body.error ?? "Couldn't retry. Please try again.", "error");
      }
    } catch {
      toast("Couldn't reach Radar. Is the server running?", "error");
    }
    setRetrying(false);
  }

  if (active) {
    const elapsed = secondsBetween(research.startedAt ?? research.createdAt, now);
    return (
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-[28px] leading-tight font-semibold">Researching {research.query}</h1>
          <span
            role="timer"
            aria-label="Elapsed time"
            className="font-mono text-[13px] text-muted"
            suppressHydrationWarning
          >
            {formatDuration(elapsed)}
          </span>
        </div>
        <div className="mt-8">
          <StepList steps={steps} active />
        </div>
        <p className="mt-8 text-sm text-muted">
          You can close this page; it will be waiting in your history.
        </p>
        <Link href="/" className={buttonClass("secondary", "mt-4")}>
          Back to home
        </Link>
      </div>
    );
  }

  const report = research.status === "done" ? parseReport(research.report) : null;

  if (report) {
    const duration =
      research.startedAt && research.finishedAt
        ? `Generated in ${formatDuration(secondsBetween(research.startedAt, research.finishedAt))}`
        : "Generated";
    const searches = research.searches ?? 0;
    const footer = [
      duration,
      `${searches} ${searches === 1 ? "search" : "searches"}`,
      `${plural(research.pagesRead ?? 0, "page")} read`,
    ].join(" · ");
    return (
      <div ref={container}>
        <ReportView report={report} createdAt={research.createdAt} footer={footer} />
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col items-start gap-4">
      <AlertIcon className="size-8 text-danger" />
      <h1 tabIndex={-1} data-focus-on-ready className="text-[28px] leading-tight font-semibold">
        We couldn&apos;t complete the research
      </h1>
      <p className="text-muted">
        {research.error ?? "The brief we received was incomplete. Please retry."}
      </p>
      <div className="flex gap-2">
        <Button onClick={retry} loading={retrying}>
          Retry
        </Button>
        <Link href="/" className={buttonClass("ghost")}>
          Back
        </Link>
      </div>
    </div>
  );
}
