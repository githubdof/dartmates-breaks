"use client";
import { useEffect, useState } from "react";
import { clampStep, commitDraft, draftValue, stepState } from "./stepper-math";

export function Stepper({ value, min, max, onChange, label, name, testId }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; name?: string; testId?: string }) {
  const { canDec, canInc } = stepState(value, min, max);
  // The input keeps what was typed; a complete number commits at once, anything else waits for blur or Enter.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = commitDraft(draft, min, max, value);
    setDraft(String(v));
    if (v !== value) onChange(v);
  };
  const btn = "inline-flex size-11 items-center justify-center border border-wire-strong bg-card text-headline font-semibold disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center">
      <button type="button" aria-label={`Decrease ${label}`} disabled={!canDec} onClick={() => onChange(clampStep(value - 1, min, max))} className={`${btn} rounded-l-input`}>−</button>
      <input
        name={name}
        aria-label={label}
        data-testid={testId}
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = draftValue(e.target.value, min, max);
          if (v !== null && v !== value) onChange(v);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="h-11 w-14 border-y border-wire-strong bg-card text-center font-condensed text-grid font-semibold tabular"
      />
      <button type="button" aria-label={`Increase ${label}`} disabled={!canInc} onClick={() => onChange(clampStep(value + 1, min, max))} className={`${btn} rounded-r-input`}>+</button>
    </div>
  );
}
