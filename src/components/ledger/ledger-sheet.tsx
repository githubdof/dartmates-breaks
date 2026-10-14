"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NETWORK_NOTE } from "@/lib/network-note";
import { Sheet } from "@/components/sheet";
import { FillBar } from "@/components/fill-bar";
import { FilterChips } from "@/components/filter-chips";
import { Toast } from "@/components/toast";
import { useMeasuredVar } from "@/components/use-measured-var";
import { Button, ButtonLink } from "@/components/button";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { addBonus, paidForBuyer, releaseBuyer, unpaidForBuyer } from "@/app/b/[id]/actions";
import { finaliseDrawAction, requestDrawAction } from "@/app/b/[id]/draw-actions";
import { openBreakAction } from "@/app/b/[id]/host-actions";
import { LEDGER_COLS, LedgerRow } from "./ledger-row";
import { applyView, chipCounts, drawingText, freezeView, paidToast, releaseReason, type LedgerFilter, type LedgerRowView } from "./ledger-view";

export type LedgerSheetProps = {
  open: boolean;
  onClose: () => void;
  breakId: string;
  status: BreakStatus;
  rows: LedgerRowView[];
  counts: { paid: number; taken: number; total: number };
  bonus: { used: number; max: number };
  /** Who started the draw, for the running-draw wait (design §5.4). */
  hostName: string;
  /** The viewer is the host (an admin is not): "You started the draw." */
  selfIsHost?: boolean;
};

const UNDO_MS = 8000;

export function LedgerSheet(p: LedgerSheetProps) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [query, setQuery] = useState("");
  // The server sends rows in the ledger order (compareLedger); freezeView records it with the rows that match.
  const [view, setView] = useState(() => freezeView(p.rows, "all"));
  const [wasOpen, setWasOpen] = useState(p.open);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recent, setRecent] = useState<Record<string, { numbers: number[]; until: number }>>({});
  const [toast, setToast] = useState<{ ownerId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  // The snackbar sits above the bottom action as it really is (it grows with an error or the draft note).
  const actionRef = useRef<HTMLDivElement>(null);
  useMeasuredVar(actionRef, "--sheet-action-h");

  // Order and listed rows are fixed when the ledger opens and when the host changes the filter, so rows never
  // move or vanish under the thumb while auto-refresh updates them. Adjusted during render (not in an effect)
  // so the reopened sheet never paints the stale view first.
  if (p.open !== wasOpen) {
    setWasOpen(p.open);
    if (p.open) {
      setView(freezeView(p.rows, filter));
      setError(null);
    }
  }
  const changeFilter = (f: LedgerFilter) => {
    setFilter(f);
    setView(freezeView(p.rows, f));
  };

  // Marking and Undo only make sense while lines can still change hands; once the draw starts, Undo goes.
  const actionable = p.status === "open" || p.status === "filled";
  if (!actionable && (Object.keys(recent).length > 0 || toast)) {
    setRecent({});
    setToast(null);
  }

  // Undo lasts 8 s per row; the snackbar goes with the row it speaks about.
  useEffect(() => {
    const ids = Object.keys(recent);
    if (ids.length === 0) return;
    const soonest = Math.min(...ids.map((id) => recent[id].until));
    const t = window.setTimeout(() => {
      const now = Date.now();
      const live = Object.fromEntries(Object.entries(recent).filter(([, v]) => v.until > now));
      setRecent(live);
      setToast((cur) => (cur && live[cur.ownerId] ? cur : null));
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(t);
  }, [recent]);

  // Failures refresh the rows at once (actions revalidate only on success; an OWNER_CHANGED row would otherwise stay
  // stale for up to 20 s) and show in the sticky bottom action, where the host can see them from any row.
  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setError(null);
      let r: ActionResult<unknown>;
      try {
        r = await fn();
      } catch {
        router.refresh();
        setError(NETWORK_NOTE);
        return;
      }
      if (r.ok) { onOk?.(); return; }
      router.refresh();
      setError(r.message);
    });

  const markPaid = (row: LedgerRowView) => {
    const numbers = row.unpaid;
    const cents = row.owedCents;
    if (numbers.length === 0) return;
    run(() => paidForBuyer(p.breakId, row.ownerId, numbers), () => {
      setRecent((cur) => ({ ...cur, [row.ownerId]: { numbers, until: Date.now() + UNDO_MS } }));
      setToast({ ownerId: row.ownerId, text: paidToast(row, numbers, cents) });
    });
  };
  const undo = (ownerId: string) => {
    const r = recent[ownerId];
    if (!r) return;
    run(() => unpaidForBuyer(p.breakId, r.numbers), () => {
      setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => id !== ownerId)));
      setToast((cur) => (cur?.ownerId === ownerId ? null : cur));
    });
  };
  const release = (row: LedgerRowView) => {
    const numbers = [...row.unpaid].sort((a, b) => a - b);
    if (numbers.length === 0) return;
    run(() => releaseBuyer(p.breakId, row.ownerId, numbers, releaseReason(row)));
  };

  const visible = applyView(view, p.rows, query);
  const chips = chipCounts(p.rows);

  return (
    <Sheet full open={p.open} onClose={p.onClose} title="Host tools" testId="ledger">
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="font-condensed text-headline font-semibold tabular" data-testid="paid-count">{p.counts.paid} of {p.counts.total} paid</p>
          <FillBar total={p.counts.total} paid={p.counts.paid} taken={p.counts.taken} />
        </div>
        <label className="block">
          <span className="sr-only">Search buyers</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, handle or amount" className="h-11 w-full rounded-input border border-wire-strong bg-card px-3" />
        </label>
        <FilterChips label="Show" value={filter} onChange={changeFilter} options={[
          { value: "all", label: "All", count: chips.all },
          { value: "sent", label: "Sent", count: chips.sent },
          { value: "unpaid", label: "Unpaid", count: chips.unpaid },
          { value: "overdue", label: "Overdue", count: chips.overdue },
        ]} />
        {/* Column names over the table above 640 only. Visual: each row already names its parts, and a header inside
            the list would be counted as one more buyer by a screen reader. */}
        <div aria-hidden className={`-mx-4 hidden gap-3 px-4 py-2 text-micro font-medium text-ink-2 ${LEDGER_COLS}`}>
          <span>Buyer</span><span>Lines</span><span>State</span><span className="sm:text-right">Owed</span><span className="sm:text-right">Action</span>
        </div>
        <ul aria-label="Buyers" className="-mx-4 border-t border-wire">
          {visible.map((r) => (
            <LedgerRow
              key={r.ownerId}
              row={r}
              actionable={actionable}
              recentlyPaid={!!recent[r.ownerId]}
              pending={pending}
              expanded={expanded === r.ownerId}
              bonusUsed={p.bonus.used}
              bonusMax={p.bonus.max}
              onToggle={() => setExpanded((cur) => (cur === r.ownerId ? null : r.ownerId))}
              onPaid={() => markPaid(r)}
              onUndo={() => undo(r.ownerId)}
              onMarkLine={(n) => run(() => paidForBuyer(p.breakId, r.ownerId, [n]))}
              onUnmarkLine={(n) => run(() => unpaidForBuyer(p.breakId, [n]))}
              onRelease={() => release(r)}
              onBonus={() => run(() => addBonus(p.breakId, r.ownerId))}
            />
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-small text-ink-2">{p.rows.length === 0 ? "No claims yet. Share the break to get it moving." : "Nobody matches."}</li>
          )}
        </ul>
        {/* The bottom action stays in reach: a host with 30 buyers should not scroll to the end to draw. */}
        <div ref={actionRef} className="sticky bottom-0 -mx-4 space-y-2 border-t border-wire bg-paper px-4 pt-3 pb-safe">
          {error && <p role="alert" className="text-small text-red" data-testid="ledger-error">{error}</p>}
          {p.status === "draft" && (
            <>
              <p className="text-small text-ink-2">This break is a draft. Only you can see it.</p>
              <Button full onClick={() => run(() => openBreakAction(p.breakId))} disabled={pending} data-testid="open-break">Open break</Button>
            </>
          )}
          {p.status === "open" && <p className="text-small text-ink-2">Run draw unlocks when every line is paid.</p>}
          {p.status === "filled" && <Button full onClick={() => run(() => requestDrawAction(p.breakId))} disabled={pending} data-testid="run-draw">Run draw</Button>}
          {p.status === "drawing" && (
            <>
              <p className="text-small">{drawingText(p.hostName, p.selfIsHost)}</p>
              <Button variant="secondary" full onClick={() => run(() => finaliseDrawAction(p.breakId))} disabled={pending} data-testid="finish-draw">Check for the result</Button>
            </>
          )}
          {p.status === "drawn" && <ButtonLink href={`/b/${p.breakId}/result`} full data-testid="ledger-result">See the result</ButtonLink>}
        </div>
      </div>
      <Toast message={toast?.text ?? null} offset="sheet-action" />
    </Sheet>
  );
}
