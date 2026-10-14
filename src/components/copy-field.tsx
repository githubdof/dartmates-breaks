"use client";
import { useId, useRef } from "react";
import { CopyButton } from "./copy-button";

/** A read-only value with a Copy button. If the clipboard is blocked, the value is selected so a long press copies it. */
export function CopyField({ label, value, copyLabel }: { label: string; value: string; copyLabel?: string }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-small text-ink-2">{label}</label>
      <div className="flex gap-2">
        {/* 16 px: iOS zooms into any focused input smaller than that. */}
        <input ref={ref} id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-input border border-wire-strong bg-card px-3 font-mono text-body" />
        <CopyButton value={value} label={copyLabel} onFail={() => { ref.current?.focus(); ref.current?.select(); }} />
      </div>
    </div>
  );
}
