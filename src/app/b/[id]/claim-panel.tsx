"use client";
import { useState, useTransition } from "react";
import { claim, claimRandomAction, claimRest, sent } from "./actions";
import { formatCents } from "@/lib/money";
import { payLinks } from "@/lib/pay-links";
import type { ActionResult } from "@/lib/action";

type Mine = { number: number; sentAt: Date | null; paidAt: Date | null };
type ClaimData = { got: number[]; taken?: number[] };

export function ClaimPanel(p: { breakId: string; openNumbers: number[]; allowRandom: boolean; mine: Mine[]; priceCents: number; paymentHandles: { venmo?: string; paypal?: string }; paymentInstructions: string; seedCommitment: string | null }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [count, setCount] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const unpaidMine = p.mine.filter((m) => !m.paidAt);
  const unsentMine = unpaidMine.filter((m) => !m.sentAt);
  const owed = unpaidMine.length * p.priceCents;
  const links = payLinks(p.paymentHandles, owed);
  const lock = p.seedCommitment ? ` · Draw locked before opening: ${p.seedCommitment.slice(0, 16)}…` : "";

  const runClaim = (fn: () => Promise<ActionResult<ClaimData>>) => start(async () => {
    const r = await fn();
    if (r.ok) {
      const { got, taken = [] } = r.data;
      const parts = [got.length ? `Got ${got.join(", ")}` : "Got none"];
      if (taken.length) parts.push(`${taken.join(", ")} ${taken.length === 1 ? "was" : "were"} taken`);
      setMsg(parts.join("; ") + (got.length ? lock : ""));
      setPicked([]); setBatchId(crypto.randomUUID());
    } else setMsg(r.message);
  });
  const runSent = (numbers: number[]) => start(async () => {
    const r = await sent(p.breakId, numbers);
    setMsg(r.ok ? "Marked as sent. The host will confirm once it arrives." : r.message);
  });
  const toggle = (n: number) => setPicked((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  return (
    <section className="mt-4 space-y-3 rounded border p-3">
      <h2 className="font-medium">Claim lines</h2>
      <div className="flex flex-wrap gap-1">{p.openNumbers.map((n) => <button key={n} onClick={() => toggle(n)} className={`rounded border px-2 py-1 text-sm ${picked.includes(n) ? "bg-black text-white" : ""}`}>{n}</button>)}</div>
      <div className="flex gap-2">
        <button disabled={pending || picked.length === 0} onClick={() => runClaim(() => claim(p.breakId, picked, batchId))} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40">Claim {picked.length || ""}</button>
        {p.allowRandom && <>
          <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Math.floor(+e.target.value || 1)))} className="w-16 rounded border p-1 text-sm" />
          <button disabled={pending || p.openNumbers.length === 0} onClick={() => runClaim(() => claimRandomAction(p.breakId, count, batchId))} className="rounded border px-3 py-2 text-sm">Random</button>
        </>}
        <button disabled={pending || p.openNumbers.length === 0} onClick={() => runClaim(() => claimRest(p.breakId, batchId))} className="rounded border px-3 py-2 text-sm">Take the rest</button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {unpaidMine.length > 0 && (
        <div className="rounded bg-neutral-50 p-3 text-sm">
          <p>You owe <b>{formatCents(owed)}</b> for lines {unpaidMine.map((m) => m.number).join(", ")}.</p>
          <p className="whitespace-pre-line text-neutral-700">{p.paymentInstructions}</p>
          <p className="text-xs text-neutral-600">Leave the payment note blank.</p>
          <div className="mt-2 flex gap-2">
            {links.venmo && <a href={links.venmo} className="rounded bg-blue-600 px-3 py-2 text-white">Open Venmo</a>}
            {links.paypal && <a href={links.paypal} target="_blank" rel="noreferrer" className="rounded bg-yellow-500 px-3 py-2">Open PayPal</a>}
            {p.paymentHandles.venmo && <button onClick={() => navigator.clipboard.writeText(p.paymentHandles.venmo!)} className="rounded border px-3 py-2">Copy handle</button>}
          </div>
          {unsentMine.length > 0 && <button disabled={pending} onClick={() => runSent(unsentMine.map((m) => m.number))} className="mt-2 w-full rounded bg-green-700 p-2 text-white">I&apos;ve sent payment</button>}
        </div>
      )}
    </section>
  );
}
