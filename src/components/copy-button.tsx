"use client";
import { useState } from "react";
import { Button, type ButtonVariant } from "./button";

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", variant = "secondary", full = false, testId, onFail }: { value: string; label?: string; copiedLabel?: string; variant?: ButtonVariant; full?: boolean; testId?: string; onFail?: () => void }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed"); // clipboard blocked (some in-app browsers): the caller can show the value selected
      onFail?.();
    }
    window.setTimeout(() => setState("idle"), 2000);
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
