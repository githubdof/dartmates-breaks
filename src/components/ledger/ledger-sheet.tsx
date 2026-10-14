"use client";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { FillBar } from "@/components/fill-bar";
import { FilterChips } from "@/components/filter-chips";
import { Toast } from "@/components/toast";
import { Button, ButtonLink } from "@/components/button";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { addBonus, paidForBuyer, releaseBuyer, unpaidForBuyer } from "@/app/b/[id]/actions";
import { finaliseDrawAction, requestDrawAction } from "@/app/b/[id]/draw-actions";
import { openBreakAction } from "@/app/b/[id]/host-actions";
import { LEDGER_COLS, LedgerRow } from "./ledger-row";
import { applyOrder, chipCounts, freezeOrder, matchesFilter, matchesQuery, paidToast, releaseReason, type LedgerFilter, type LedgerRowView } from "./ledger-view";

export type LedgerSheetProps = {
  open: boolean;
  onClose: () => void;
  breakId: string;
  status: BreakStatus;
  rows: LedgerRowView[];
  counts: { paid: number; taken: number; total: number };
  bonus: { used: number; max: number };
};

const UNDO_MS = 8000;

export function LedgerSheet(p: LedgerSheetProps) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [query, setQuery] = useState("");
  // The server sends rows in the ledger order (compareLedger); freezeOrder records it.
  const [order, setOrder] = useState<string[]>(() => freezeOrder(p.rows));
  const [wasOpen, setWasOpen] = useState(p.open);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recent, setRecent] = useState<Record<string, { numbers: number[]; until: number }>>({});
  const [toast, setToast] = useState<{ ownerId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Order is fixed when the ledger opens and when the host changes the filter; rows never move under the thumb.
  // Adjusted during render (not in an effect) so the reopened sheet never paints the stale order first.
  if (p.open !== wasOpen) {
    setWasOpen(p.open);
    if (p.open) {
      setOrder(freezeOrder(p.rows));
      setError(null);
    }
  }
  const changeFilter = (f: LedgerFilter) => {
    setFilter(f);
    setOrder(freezeOrder(p.rows));
  };

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

  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onOk?.();
      else setError(r.message);
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

  const visible = applyOrder(p.rows, order).filter((r) => recent[r.ownerId] || (matchesFilter(r, filter) && matchesQuery(r, query)));
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
        {error && <p role="alert" className="text-small text-red">{error}</p>}
        <ul className="-mx-4 border-t border-wire">
          {/* Column names: screen readers always, sighted users only where the rows become a table (above 640). */}
          <li className={`sr-only gap-3 text-micro font-medium text-ink-2 sm:not-sr-only sm:px-4 sm:py-2 ${LEDGER_COLS}`}>
            <span>Buyer</span><span>Lines</span><span>State</span><span className="sm:text-right">Owed</span><span className="sm:text-right">Action</span>
          </li>
          {visible.map((r) => (
            <LedgerRow
              key={r.ownerId}
              row={r}
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
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-wire bg-paper px-4 pt-3 pb-safe">
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
              <p className="text-small">Running draw. The result is in about a minute.</p>
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
