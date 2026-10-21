"use client";
import { useEffect, useRef, useState } from "react";
import { handleNote, looksLikeHandle, toCheck, type HandleCheck } from "./handle-field-copy";

/** What a value is until the server answers: checking when it has a handle's shape (the help text already gives the shape), else idle. */
const checkFor = (value: string): HandleCheck => (looksLikeHandle(value.trim()) ? { state: "checking" } : { state: "idle" });

/** The onboarding handle input with live availability (design §5.10). The submit still decides: this only informs. */
export function HandleField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  // Set with the value in the change handler; the effect below only brings the server's answer. Idle at first, on the
  // server too: a prefilled handle goes from idle to the answer, and without JavaScript the status never says "checking".
  const [check, setCheck] = useState<HandleCheck>({ state: "idle" });
  const seq = useRef(0);

  useEffect(() => {
    const v = value.trim();
    // Bump seq so a reply still in flight cannot land after the field went idle.
    if (!looksLikeHandle(v)) { seq.current++; return; }
    const n = ++seq.current;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/handle?h=${encodeURIComponent(v)}`, { signal: ctrl.signal, cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { state?: string; message?: string };
        if (n === seq.current) setCheck(toCheck(res.status, body));
      } catch {
        if (n === seq.current && !ctrl.signal.aborted) setCheck({ state: "unknown" });
      }
    }, 400);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [value]);

  const note = handleNote(check, value.normalize("NFKC").trim().toLowerCase());
  const bad = check.state === "taken" || check.state === "invalid";
  return (
    <div className="space-y-1">
      <label htmlFor="handle" className="block text-small font-semibold">Handle</label>
      <input id="handle" name="handle" required value={value} onChange={(e) => { setValue(e.target.value); setCheck(checkFor(e.target.value)); }} pattern="[A-Za-z0-9_]{3,20}"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-help handle-status" aria-invalid={bad || undefined}
        className="h-12 w-full rounded-input border border-wire-strong bg-card px-3" />
      <p id="handle-help" className="text-small text-ink-2">3 to 20 letters, numbers or underscores.</p>
      <p id="handle-status" role="status" aria-live="polite" data-testid="handle-status" className={`min-h-5 text-small ${note.tone === "bad" ? "text-red" : "text-ink"}`}>{note.text}</p>
    </div>
  );
}
