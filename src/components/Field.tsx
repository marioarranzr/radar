import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps {
  id: string;
  label: string;
  length: number;
  max: number;
  error?: string | null;
}

function FieldFrame({ id, label, length, max, error, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      <div className="flex justify-between gap-4 text-xs">
        <span id={`${id}-error`} className="text-danger" role="alert">
          {error}
        </span>
        <span className={`font-mono ${length > max ? "text-danger" : "text-muted"}`}>
          {length}/{max}
        </span>
      </div>
    </div>
  );
}

const control =
  "w-full rounded-lg border bg-surface px-3 text-text placeholder:text-muted focus-visible:border-accent";

export function Input({
  id,
  label,
  length,
  max,
  error,
  className = "",
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldFrame id={id} label={label} length={length} max={max} error={error}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
        className={`${control} ${error ? "border-danger" : "border-muted"} ${className}`}
        {...props}
      />
    </FieldFrame>
  );
}

export function Textarea({
  id,
  label,
  length,
  max,
  error,
  className = "",
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldFrame id={id} label={label} length={length} max={max} error={error}>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
        className={`${control} py-2 ${error ? "border-danger" : "border-muted"} ${className}`}
        {...props}
      />
    </FieldFrame>
  );
}
