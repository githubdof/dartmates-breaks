"use client";

export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-small font-medium ${on ? "border-ink bg-ink text-card" : "border-wire-strong bg-card text-ink"}`}>
            {o.label}{o.count !== undefined ? <span className="ml-1.5 tabular">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
