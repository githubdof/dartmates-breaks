export function Banner({ tone = "neutral", role, children }: { tone?: "neutral" | "success" | "error"; role?: "status" | "alert"; children: React.ReactNode }) {
  const tones = { neutral: "border-wire text-ink", success: "border-green text-green", error: "border-red text-red" } as const;
  return <div role={role} className={`rounded-card border bg-card px-4 py-3 text-small ${tones[tone]}`}>{children}</div>;
}
