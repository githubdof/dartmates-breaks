"use client";
import { useEffect, useState } from "react";
import { verifyInputs, type PublicInputs } from "@/crypto/verify";

export function Verify({ inputs }: { inputs: PublicInputs }) {
  const [state, setState] = useState<null | { ok: boolean; reasons: string[] }>(null);
  useEffect(() => { setState(verifyInputs(inputs)); }, [inputs]); // check automatically on load
  return (
    <div className="mt-3 rounded border p-3 text-sm">
      <div data-testid="verify-status">🔒 Locked before opening · {state ? (state.ok ? "Checked ✓" : "Check failed") : "checking…"}</div>
      <button data-testid="verify-run" onClick={() => setState(verifyInputs(inputs))} className="mt-2 rounded border px-3 py-1">Check it yourself</button>
      {state && !state.ok && (
        <ul className="mt-2 list-disc pl-5 text-red-700">{state.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      <p className="mt-2 text-xs text-neutral-600">
        This recomputes the draw in your browser from the published inputs. The beacon value can be confirmed on a public drand relay (link under technical details).
      </p>
    </div>
  );
}
