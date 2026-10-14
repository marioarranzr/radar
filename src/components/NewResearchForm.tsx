"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Textarea } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { CONTEXT_MAX, QUERY_MAX, ResearchRequestSchema } from "@/lib/validation";

export function NewResearchForm({ remaining, limit }: { remaining: number; limit: number }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [limitReached, setLimitReached] = useState(remaining <= 0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = ResearchRequestSchema.safeParse({ query, context });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      document.getElementById("query")?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        router.push(`/research/${body.id}`);
        return;
      }
      if (response.status === 429) setLimitReached(true);
      toast(body.error ?? "Something went wrong. Please retry.", "error");
    } catch {
      toast("Couldn't reach Radar. Is the server running?", "error");
    }
    setSubmitting(false);
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          id="query"
          label="Company or URL"
          placeholder="e.g. Factorial HR or factorialhr.com"
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          length={query.length}
          max={QUERY_MAX}
          error={error}
          className="h-12 text-[17px]"
        />

        {showContext ? (
          <Textarea
            id="context"
            label="Context (optional)"
            placeholder="Why are you researching it? e.g. I want to sell them sales training"
            rows={3}
            autoFocus
            value={context}
            onChange={(event) => setContext(event.target.value)}
            length={context.length}
            max={CONTEXT_MAX}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowContext(true)}
            className="self-start py-1 text-sm text-accent hover:underline"
          >
            + Add context
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {limitReached
              ? "You've reached today's limit. Come back tomorrow."
              : `${Math.max(0, remaining)} of ${limit} left today`}
          </p>
          <Button type="submit" loading={submitting} loadingText="Researching…" disabled={limitReached}>
            Research
          </Button>
        </div>
      </form>
    </Card>
  );
}
