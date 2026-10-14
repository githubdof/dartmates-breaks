/** The signed-in person's initial; decorative (the header gives the name to screen readers). */
export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-full bg-ink font-condensed font-semibold text-card" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      {initial}
    </span>
  );
}
