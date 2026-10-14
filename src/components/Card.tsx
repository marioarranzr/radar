import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ${className}`}
      {...props}
    />
  );
}
