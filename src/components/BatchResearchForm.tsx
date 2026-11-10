"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Textarea } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { BATCH_MAX, BatchRequestSchema, parseCompanyList } from "@/lib/validation";

/** "Research several": one company per line, or the first column of a CSV (docs/03-APP-FLOW.md). */
export function BatchResearchForm({ remaining }: { remaining: number }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const companies = parseCompanyList(text);
  const left = Math.max(0, remaining);
  const tooMany = companies.length > left;

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setText(parseCompanyList(await file.text()).join("\n"));
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = BatchRequestSchema.safeParse({ queries: companies });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the list.");
      document.getElementById("companies")?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/research/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        toast(`Queued ${body.ids.length} ${body.ids.length === 1 ? "company" : "companies"}`);
        setText("");
        router.refresh();
      } else {
        setError(body.error ?? "Something went wrong. Please retry.");
      }
    } catch {
      toast("Couldn't reach Radar. Is the server running?", "error");
    }
    setSubmitting(false);
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Textarea
          id="companies"
          label="Companies (one per line)"
          placeholder={"Factorial HR\nHolded\nTypeform"}
          rows={6}
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          length={companies.length}
          max={BATCH_MAX}
          error={error}
        />
        <label className="self-start text-sm text-accent hover:underline">
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
          Upload CSV
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${tooMany ? "text-danger" : "text-muted"}`}>
            {companies.length} {companies.length === 1 ? "company" : "companies"} · {left} left today
          </p>
          <Button
            type="submit"
            loading={submitting}
            loadingText="Queuing…"
            disabled={companies.length === 0 || tooMany || companies.length > BATCH_MAX}
          >
            Research {companies.length || ""} {companies.length === 1 ? "company" : "companies"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
