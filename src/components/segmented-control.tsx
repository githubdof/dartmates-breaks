"use client";
import { radioKeyDown, radioTabIndex } from "./radio-group";

export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const values = options.map((o) => o.value);
  const anyOn = values.includes(value);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={(e) => radioKeyDown(e, values, value, onChange)} className="inline-flex rounded-input border border-wire-strong bg-card p-0.5">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={radioTabIndex(on, i, anyOn)} onClick={() => onChange(o.value)}
            className={`min-h-11 min-w-11 rounded-[3px] px-4 text-small font-semibold ${on ? "bg-ink text-card" : "text-ink underline-offset-4 hover:underline"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
