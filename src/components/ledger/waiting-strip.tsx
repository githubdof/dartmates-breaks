"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paidForBuyer, unpaidForBuyer } from "@/app/b/[id]/actions";
import { Sheet } from "@/components/sheet";
import { Toast } from "@/components/toast";
import type { ActionResult } from "@/lib/action";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { LedgerRow } from "./ledger-row";
import { markedPaid, paidToast, type LedgerRowView, type WaitingView } from "./ledger-view";

const UNDO_MS = 8000;
const noop = () => {};

/**
 * The /host strip and its merged ledger (design §5.5): sent lines across the host's breaks, one LedgerRow per buyer
 * per break with the break title above it. As in the per-break ledger, Paid turns the row "Paid" in place with Undo
 * beside it for 8 s and a polite snackbar, and rows never move under the thumb: the list is frozen when the sheet
 * opens (paid rows are patched in place) and refreshed from the server when it closes. The sheet stays mounted when
 * the last row is paid, so the host is never thrown out of it.
 */
export function WaitingStrip({ text, rows }: { text: string | null; rows: WaitingView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState<WaitingView[]>(rows);
  // Rows marked paid in this sheet: the row as it was (Undo puts it back) and until when Undo shows.
  const [recent, setRecent] = useState<Record<string, { before: LedgerRowView; until: number }>>({});
  const [toast, setToast] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Undo lasts 8 s per row; the snackbar goes with the row it speaks about (the per-break ledger's timer).
  useEffect(() => {
    const keys = Object.keys(recent);
    if (keys.length === 0) return;
    const soonest = Math.min(...keys.map((k) => recent[k].until));
    const t = window.setTimeout(() => {
      const now = Date.now();
      const live = Object.fromEntries(Object.entries(recent).filter(([, v]) => v.until > now));
      setRecent(live);
      setToast((cur) => (cur && live[cur.key] ? cur : null));
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(t);
  }, [recent]);

  const show = () => { setFrozen(rows); setRecent({}); setToast(null); setError(null); setOpen(true); };
  const close = () => { setOpen(false); setRecent({}); setToast(null); router.refresh(); };
  const patch = (key: string, row: LedgerRowView) => setFrozen((cur) => cur.map((w) => (w.key === key ? { ...w, row } : w)));

  const run = (fn: () => Promise<ActionResult<unknown>>, onOk: () => void) =>
    start(async () => {
      setError(null);
      let r: ActionResult<unknown>;
      try {
        r = await fn();
      } catch {
        // The action may have committed: refresh the props (the frozen list keeps its rows) unless fully offline.
        if (canRefresh()) {
          router.refresh();
          setError(NETWORK_NOTE);
        } else {
          setError(OFFLINE_NOTE);
        }
        return;
      }
      if (r.ok) { onOk(); return; }
      setError(r.message);
    });

  const markPaid = (w: WaitingView) => {
    const before = w.row;
    const numbers = before.unpaid;
    if (numbers.length === 0) return;
    run(() => paidForBuyer(w.breakId, before.ownerId, numbers), () => {
      patch(w.key, markedPaid(before));
      setRecent((cur) => ({ ...cur, [w.key]: { before, until: Date.now() + UNDO_MS } }));
      setToast({ key: w.key, text: paidToast(before, numbers, before.owedCents) });
    });
  };
  const undo = (w: WaitingView) => {
    const r = recent[w.key];
    if (!r) return;
    run(() => unpaidForBuyer(w.breakId, r.before.unpaid), () => {
      patch(w.key, r.before);
      setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== w.key)));
      setToast((cur) => (cur?.key === w.key ? null : cur));
    });
  };

  return (
    <>
      {text && (
        <button type="button" onClick={show} data-testid="waiting-strip" aria-label={`${text}. Review`}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card border border-ink bg-card px-4 py-3 text-left font-semibold">
          <span>{text}</span>
          {/* Says what happens; never a state word ("Open" sits right above the Open group). */}
          <span className="shrink-0 text-small underline underline-offset-4">Review</span>
        </button>
      )}
      <Sheet full open={open} onClose={close} title="Sent, waiting for you" testId="waiting-sheet">
        <ul aria-label="Buyers" className="-mx-4 border-t border-wire">
          {frozen.map((w) => (
            <LedgerRow
              key={w.key}
              title={w.breakTitle}
              row={w.row}
              actionable
              recentlyPaid={!!recent[w.key]}
              pending={pending}
              expanded={false}
              bonusUsed={0}
              bonusMax={0}
              onPaid={() => markPaid(w)}
              onUndo={() => undo(w)}
              onMarkLine={noop}
              onUnmarkLine={noop}
              onRelease={noop}
              onBonus={noop}
            />
          ))}
        </ul>
        {error && <p role="alert" className="mt-3 text-small text-red">{error}</p>}
        <Toast message={toast?.text ?? null} offset="none" />
      </Sheet>
    </>
  );
}
