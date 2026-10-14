"use client";
import { useId } from "react";
import { CopyButton } from "./copy-button";

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-small text-ink-2">{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-input border border-wire-strong bg-card px-3 font-mono text-small" />
        <CopyButton value={value} />
      </div>
    </div>
  );
}
