import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "text";

// Horizontal padding lives in each variant, never in BASE: two px-* classes on one element win by CSS order, not intent.
const BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-input text-body font-semibold transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50";
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink px-4 text-card hover:bg-ink/85",
  secondary: "border border-wire-strong bg-card px-4 text-ink hover:bg-wire-2",
  text: "px-1 text-ink underline underline-offset-4 hover:no-underline",
};

/** Primary: ink on paper. Secondary: outlined in wire-strong. Text: ink underlined. Red is never a button background. */
export function buttonClass(variant: ButtonVariant = "primary", full = false, extra = ""): string {
  return [BASE, VARIANT[variant], full ? "w-full" : "", extra].filter(Boolean).join(" ");
}

export function Button({ variant = "primary", full = false, className = "", type = "button", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }) {
  return <button type={type} className={buttonClass(variant, full, className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", full = false, className = "", ...rest }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; full?: boolean }) {
  return <Link className={buttonClass(variant, full, className)} {...rest} />;
}
