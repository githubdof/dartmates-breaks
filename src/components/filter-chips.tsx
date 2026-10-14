"use client";
import { radioKeyDown, radioTabIndex } from "./radio-group";

export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const values = options.map((o) => o.value);
  const anyOn = values.includes(value);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={(e) => radioKeyDown(e, values, value, onChange)} className="-mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={radioTabIndex(on, i, anyOn)} onClick={() => onChange(o.value)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-small font-medium ${on ? "border-ink bg-ink text-card" : "border-wire-strong bg-card text-ink"}`}>
            {o.label}{o.count !== undefined ? <span className="ml-1.5 tabular">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
