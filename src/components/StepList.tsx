import { CheckIcon, Spinner } from "@/components/Icons";

/** Vertical list of agent steps; the last one spins while the research is active. */
export function StepList({ steps, active }: { steps: { id: number; label: string }[]; active: boolean }) {
  const latest = steps.at(-1)?.label ?? "Getting ready…";
  return (
    <>
      {/* Screen readers hear only the latest step, not the whole list on every poll. */}
      <p role="status" className="sr-only">
        {active ? latest : ""}
      </p>
      {steps.length === 0 ? (
        <p className="text-muted">Getting ready…</p>
      ) : (
        <StepItems steps={steps} active={active} />
      )}
    </>
  );
}

function StepItems({ steps, active }: { steps: { id: number; label: string }[]; active: boolean }) {
  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
      {steps.map((step, index) => {
        const current = active && index === steps.length - 1;
        return (
          <li key={step.id} className="relative animate-[step-in_200ms_ease-out]">
            <span className="absolute top-1 -left-[33px] flex size-4 items-center justify-center rounded-full bg-bg">
              {current ? <Spinner className="text-accent" /> : <CheckIcon className="text-success" />}
            </span>
            <span className={current ? "text-text" : "text-muted"}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
