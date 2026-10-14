"use client";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button";

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", variant = "secondary", full = false, testId, onFail }: { value: string; label?: string; copiedLabel?: string; variant?: ButtonVariant; full?: boolean; testId?: string; onFail?: () => void }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  // One reset timer at a time: a second tap restarts the 2 s instead of being cut short by the first tap's timer.
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed"); // clipboard blocked (some in-app browsers): the caller can show the value selected
      onFail?.();
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; setState("idle"); }, 2000);
  }
  return (
    <>
      <Button variant={variant} full={full} onClick={copy} data-testid={testId}>
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed. Select it instead." : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">{state === "copied" ? `${copiedLabel}.` : state === "failed" ? "Copy failed. Select it instead." : ""}</span>
    </>
  );
}
