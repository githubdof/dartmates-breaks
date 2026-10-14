"use client";
import { useState, useTransition } from "react";
import { paidForBuyer, releaseBuyer } from "./actions";
import { formatMoney } from "@/lib/money";
import { requestDrawAction, finaliseDrawAction } from "./draw-actions";
import { openBreakAction } from "./host-actions";
import { releasePrompt } from "./release-prompt";
import type { ActionResult } from "@/lib/action";
import type { BuyerStatus } from "@/domain/lines/ledger";

export type HostRow = { ownerId: string; handle: string | null; unpaid: number[]; sent: number[]; overdue: number[]; owedCents: number; status: BuyerStatus };

export function HostPanel({ breakId, status, rows }: { breakId: string; status: string; rows: HostRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message); });
  const unpaid = rows.filter((u) => u.status !== "paid");
  const confirmRelease = (u: HostRow) => {
    if (!window.confirm(releasePrompt({ handle: u.handle, numbers: u.unpaid, sentNumbers: u.sent }))) return;
    const reason = u.overdue.length > 0 && u.overdue.length === u.unpaid.length ? "overdue" : "host_dropped";
    run(() => releaseBuyer(breakId, u.ownerId, u.unpaid, reason));
  };
  return (
    <section className="mt-4 space-y-2 rounded border border-black p-3">
      <h2 className="font-medium">Host</h2>
      {status === "draft" && (
        <>
          <p className="text-sm text-neutral-600">This break is a draft. Nobody can claim lines until you open it.</p>
          <button disabled={pending} onClick={() => run(() => openBreakAction(breakId))} className="w-full rounded bg-black p-3 text-white">Open for claims</button>
        </>
      )}
      {status === "open" && unpaid.length === 0 && <p className="text-sm text-neutral-600">No unpaid claims.</p>}
      {unpaid.map((u) => (
        <div key={u.ownerId} data-testid="ledger-row" data-status={u.status} className="flex items-center justify-between rounded bg-neutral-50 p-2 text-sm">
          <div><b>{u.handle ?? "?"}</b> · lines {u.unpaid.join(", ")} · {formatMoney(u.owedCents)} {u.status === "sent" && <span className="text-blue-700">· sent</span>}</div>
          <div className="flex gap-1">
            <button data-testid="ledger-paid" disabled={pending} onClick={() => run(() => paidForBuyer(breakId, u.ownerId, u.unpaid))} className="rounded bg-green-700 px-2 py-1 text-white">Paid</button>
            <button disabled={pending} onClick={() => confirmRelease(u)} className="rounded border px-2 py-1">Release</button>
          </div>
        </div>
      ))}
      {status === "filled" && <button data-testid="run-draw" disabled={pending} onClick={() => run(() => requestDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Run draw</button>}
      {status === "drawing" && <button data-testid="finish-draw" disabled={pending} onClick={() => run(() => finaliseDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Finish draw (beacon ready?)</button>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </section>
  );
}
