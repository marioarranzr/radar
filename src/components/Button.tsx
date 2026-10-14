import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "@/components/Icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-bg",
  ghost: "text-muted hover:bg-border/40 hover:text-text",
  destructive: "bg-danger text-accent-fg hover:opacity-90",
};

/** Class names for a button, also used to style links as buttons. */
export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  loading = false,
  loadingText,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
