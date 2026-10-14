import type { ResearchStatus } from "@/lib/db";

const styles: Record<ResearchStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-warning/12 text-warning" },
  running: { label: "Researching", className: "bg-accent/12 text-accent animate-pulse" },
  done: { label: "Ready", className: "bg-success/12 text-success" },
  failed: { label: "Error", className: "bg-danger/12 text-danger" },
};

export function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ResearchStatus }) {
  const { label, className } = styles[status];
  return <Badge className={className}>{label}</Badge>;
}
