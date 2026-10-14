"use client";

import Link from "next/link";
import type { Report } from "@/agent/schema";
import { buttonClass } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyIcon } from "@/components/Icons";
import { Badge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import { formatDate, hostname, isSafeUrl } from "@/lib/format";
import { reportToMarkdown } from "@/lib/markdown";

// Every report string is rendered as plain React text — never as HTML (docs/02-TRD.md §7).

function ExternalLink({ url, children }: { url: string; children: React.ReactNode }) {
  if (!isSafeUrl(url)) return <span>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 font-serif text-base leading-relaxed">{children}</div>
    </section>
  );
}

export function ReportView({
  report,
  createdAt,
  footer,
}: {
  report: Report;
  createdAt: string;
  footer: string;
}) {
  const toast = useToast();

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report));
      toast("Copied");
    } catch {
      toast("Couldn't copy to the clipboard.", "error");
    }
  }

  return (
    <Card className="sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            tabIndex={-1}
            data-focus-on-ready
            className="text-[28px] leading-tight font-semibold focus:outline-none"
          >
            {report.company_name}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[13px] text-muted">
            {report.website && <ExternalLink url={report.website}>{hostname(report.website)}</ExternalLink>}
            <span>{formatDate(createdAt)}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={copyMarkdown} className={buttonClass("secondary")}>
            <CopyIcon /> Copy Markdown
          </button>
          <Link href="/" className={buttonClass("primary")}>
            New research
          </Link>
        </div>
      </div>

      <Section title="Summary">
        <p>{report.summary}</p>
      </Section>
      <Section title="What they sell and to whom">
        <p>{report.offering}</p>
      </Section>
      <Section title="Business model">
        <p>{report.business_model}</p>
      </Section>

      {report.key_facts.length > 0 && (
        <Section title="Size and key facts">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            {report.key_facts.map((fact, index) => (
              <div key={index} className="contents">
                <dt className="font-sans text-sm font-medium text-muted sm:pt-0.5">{fact.label}</dt>
                <dd className="mb-2 sm:mb-0">
                  {fact.value}{" "}
                  {!fact.confirmed && (
                    <Badge className="bg-warning/12 font-sans text-warning">Unconfirmed</Badge>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {report.recent_signals.length > 0 && (
        <Section title="Recent signals">
          <ul className="flex flex-col gap-2">
            {report.recent_signals.map((signal, index) => (
              <li key={index}>
                <span className="font-mono text-[13px] text-muted">{signal.date}</span>{" "}
                <ExternalLink url={signal.url}>{signal.title}</ExternalLink>{" "}
                <span className="font-mono text-[13px] text-muted">({hostname(signal.url)})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.pains_opportunities.length > 0 && (
        <Section title="Likely pains / opportunities">
          <ul className="list-disc pl-5">
            {report.pains_opportunities.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Questions for a first call">
        <ol className="list-decimal pl-5">
          {report.discovery_questions.map((question, index) => (
            <li key={index}>{question}</li>
          ))}
        </ol>
      </Section>

      <Section title="Sources">
        <ol className="flex list-decimal flex-col gap-1 pl-5 font-mono text-[13px]">
          {report.sources.map((source, index) => (
            <li key={index}>
              <ExternalLink url={source.url}>{source.title}</ExternalLink>{" "}
              <span className="text-muted">({hostname(source.url)})</span>
            </li>
          ))}
        </ol>
      </Section>

      <p className="mt-8 border-t border-border pt-4 text-sm text-muted">
        {footer} · AI-generated from public web sources — verify before relying on it.
      </p>
    </Card>
  );
}
