"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { verifyInputs, type PublicInputs } from "@/crypto/verify";
import { Button } from "@/components/button";
import { CopyField } from "@/components/copy-field";

export function Verify({ inputs, seed, relayUrl }: { inputs: PublicInputs; seed: string; relayUrl: string }) {
  const [state, setState] = useState<null | { ok: boolean; reasons: string[] }>(null);
  useEffect(() => { setState(verifyInputs(inputs)); }, [inputs]); // check automatically on load

  const status = state === null
    ? "Checking the draw in your browser."
    : state.ok
      ? "Checked. Locked before opening, mixed with public randomness."
      : "Check failed. The published inputs do not reproduce this result.";

  return (
    <section className="mt-6 space-y-3">
      <p data-testid="verify-status" role="status" className={state && !state.ok ? "inline-block rounded-input bg-card px-2 font-semibold text-red" : "font-semibold text-[color:var(--board-text)]"}>{status}</p>
      <details className="rounded-card border border-wire bg-card text-ink">
        <summary data-testid="verify-fold" className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Check it yourself</summary>
        <div className="space-y-4 px-4 pb-4">
          <p className="max-w-[65ch] text-small text-ink-2">This recomputes the draw in your browser from the published inputs. Anyone can do the same with the verify script.</p>
          <Button variant="secondary" onClick={() => setState(verifyInputs(inputs))} data-testid="verify-run">Run the check again</Button>
          {state && !state.ok && <ul className="list-disc pl-5 text-small text-red">{state.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <CopyField label="Commitment, shown before the break opened" value={inputs.seedCommitment ?? ""} />
          <CopyField label={`Public randomness, drand quicknet round ${inputs.beaconRound}`} value={inputs.beaconRandomness} />
          <CopyField label="Seed" value={seed} />
          <CopyField label="Secret, revealed after the draw" value={inputs.secret} />
          <p className="text-small">
            <a className="underline underline-offset-4" href={relayUrl} target="_blank" rel="noreferrer">See this round on a public relay</a>.{" "}
            <a className="underline underline-offset-4" href={`/b/${inputs.breakId}/result.json`}>Download the inputs</a>.{" "}
            <Link className="underline underline-offset-4" href="/legal/draw">How draws work</Link>.
          </p>
        </div>
      </details>
    </section>
  );
}
