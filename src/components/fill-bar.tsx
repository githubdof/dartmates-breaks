/** Two-tone fill: paid in ink, taken (claimed, unpaid) in hatch. One component for "19 of 50 left" and "19 of 50 paid". */
export function FillBar({ total, paid, taken, label }: { total: number; paid: number; taken: number; label?: string }) {
  const pct = (n: number) => `${total > 0 ? Math.min(100, (n / total) * 100) : 0}%`;
  return (
    <div role="img" aria-label={label ?? `${paid} of ${total} paid, ${taken} taken`} className="flex h-2 w-full overflow-hidden rounded-full border border-wire-strong bg-card">
      <span className="h-full bg-ink" style={{ width: pct(paid) }} />
      <span className="h-full bg-hatch" style={{ width: pct(taken) }} />
    </div>
  );
}
