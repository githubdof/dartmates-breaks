"use client";
import { useState, useTransition } from "react";
import { paidForBuyer, release } from "./actions";
import { formatCents } from "@/lib/money";
import { requestDrawAction, finaliseDrawAction } from "./draw-actions";
import type { ActionResult } from "@/lib/action";

type U = { ownerId: string; handle: string | null; numbers: number[]; sent: boolean; amountCents: number };
export function HostPanel({ breakId, status, unpaid }: { breakId: string; status: string; unpaid: U[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message); });
  const releaseAll = async (numbers: number[]): Promise<ActionResult<unknown>> => {
    for (const n of numbers) { const r = await release(breakId, n, "host_dropped"); if (!r.ok) return r; }
    return { ok: true, data: null };
  };
  return (
    <section className="mt-4 space-y-2 rounded border border-black p-3">
      <h2 className="font-medium">Host</h2>
      {status === "open" && unpaid.length === 0 && <p className="text-sm text-neutral-600">No unpaid claims.</p>}
      {unpaid.map((u) => (
        <div key={u.ownerId} className="flex items-center justify-between rounded bg-neutral-50 p-2 text-sm">
          <div><b>{u.handle ?? "?"}</b> · lines {u.numbers.join(", ")} · {formatCents(u.amountCents)} {u.sent && <span className="text-blue-700">· sent</span>}</div>
          <div className="flex gap-1">
            <button disabled={pending} onClick={() => run(() => paidForBuyer(breakId, u.ownerId, u.numbers))} className="rounded bg-green-700 px-2 py-1 text-white">Paid</button>
            <button disabled={pending} onClick={() => run(() => releaseAll(u.numbers))} className="rounded border px-2 py-1">Release</button>
          </div>
        </div>
      ))}
      {status === "filled" && <button disabled={pending} onClick={() => run(() => requestDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Run draw</button>}
      {status === "drawing" && <button disabled={pending} onClick={() => run(() => finaliseDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Finish draw (beacon ready?)</button>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </section>
  );
}
