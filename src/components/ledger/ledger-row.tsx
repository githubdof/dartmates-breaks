"use client";
import { useState } from "react";
import { Button } from "@/components/button";
import { MiniCells } from "@/components/mini-cells";
import { cellLabel } from "@/components/grid/cell-label";
import { formatMoney } from "@/lib/money";
import { bonusText, markPaidLabel, releaseConfirm, rowCells, rowStateWord, type LedgerRowView } from "./ledger-view";

type Props = {
  row: LedgerRowView;
  /** Paid, Undo, per-line marking, Release and bonus lines only while the break is open or filled. */
  actionable: boolean;
  recentlyPaid: boolean;
  pending: boolean;
  expanded: boolean;
  bonusUsed: number;
  bonusMax: number;
  onToggle: () => void;
  onPaid: () => void;
  onUndo: () => void;
  onMarkLine: (n: number) => void;
  onUnmarkLine: (n: number) => void;
  onRelease: () => void;
  onBonus: () => void;
};

/** Columns of the ledger table above 640 (design §5: the ledger widens and becomes a table). Shared with the header row. */
export const LEDGER_COLS = "sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_5rem_7rem] sm:items-center";

/**
 * One buyer, at least 56 pt tall. Paid sits on the right; Release lives only in the expanded row. On phones the
 * row is two stacked columns; above 640 `sm:contents` flattens it into the table's five cells:
 * name | lines | state | owed | action.
 */
export function LedgerRow(p: Props) {
  const r = p.row;
  const [confirm, setConfirm] = useState<{ kind: "release" } | { kind: "unmark"; n: number } | null>(null);
  const name = r.displayName ?? (r.handle ? `@${r.handle}` : "Buyer");
  // The confirm names exactly the lines Release sends, in order; with nothing unpaid there is no Release at all.
  const releasing = [...r.unpaid].sort((a, b) => a - b);
  const release = releasing.length > 0 ? releaseConfirm(r, releasing) : null;
  const cells = rowCells(r);
  const pressLine = (n: number) => {
    if (r.bonus.includes(n)) return;
    if (r.paid.includes(n)) setConfirm({ kind: "unmark", n });
    else p.onMarkLine(n);
  };

  return (
    <li data-testid="ledger-row" data-status={r.status} className="border-b border-wire bg-card">
      <div className={`flex min-h-14 gap-3 px-4 py-2 ${LEDGER_COLS}`}>
        <div className="min-w-0 flex-1 sm:contents">
          <button type="button" onClick={p.onToggle} aria-expanded={p.expanded} className="flex min-h-11 w-full min-w-0 items-baseline gap-2 text-left">
            <span className="truncate font-semibold">{name}</span>
            {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
            {r.paymentName && <span className="truncate text-small text-ink-2" data-testid="pays-as">pays as {r.paymentName}</span>}
          </button>
          <div className="flex flex-wrap items-center gap-2 text-small sm:contents">
            <MiniCells cells={cells} />
            <span className="flex items-center gap-2 text-small">
              <span>{rowStateWord(r)}</span>
              {r.lateText && <span className="font-semibold text-red">{r.lateText}</span>}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-1 sm:contents">
          {r.owedCents > 0
            ? <span className="font-condensed text-[20px] leading-6 font-semibold tabular sm:text-right">{formatMoney(r.owedCents)}</span>
            : <span aria-hidden className="hidden sm:block" />}
          <div className="sm:justify-self-end">
            {p.recentlyPaid && p.actionable ? (
              <span className="flex items-center gap-1">
                <span className="text-small font-semibold text-green">Paid</span>
                <Button variant="text" onClick={p.onUndo} disabled={p.pending} data-testid="ledger-undo">Undo</Button>
              </span>
            ) : r.unpaid.length > 0 ? (p.actionable &&
              <Button onClick={p.onPaid} disabled={p.pending} aria-label={markPaidLabel(r)} data-testid="ledger-paid">Paid</Button>
            ) : (
              <span className="inline-flex min-h-11 items-center text-small font-semibold text-green">Paid</span>
            )}
          </div>
        </div>
      </div>

      {p.expanded && (
        <div className="space-y-3 border-t border-wire-2 px-4 py-3">
          {p.actionable ? (
            <>
              <p className="text-small text-ink-2">Tap a line to mark it paid. Tap a paid line to un-mark it.</p>
              <MiniCells cells={cells} onPress={pressLine} labelFor={(c) => (c.bonus ? cellLabel(c) : `${cellLabel(c)}. ${c.state === "paid" ? "Un-mark paid" : "Mark paid"}`)} />
            </>
          ) : (
            <MiniCells cells={cells} label={`Lines held by ${name}`} />
          )}
          {p.actionable && confirm?.kind === "unmark" && (
            <div className="space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">Un-mark line {confirm.n} as paid? It is logged, and the line stays with {name}.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { p.onUnmarkLine(confirm.n); setConfirm(null); }} disabled={p.pending}>Un-mark</Button>
                <Button variant="text" onClick={() => setConfirm(null)}>Keep</Button>
              </div>
            </div>
          )}
          {p.actionable && release && (confirm?.kind === "release" ? (
            <div className="space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">{release.text}</p>
              {release.warning && <p className="text-small text-red">{release.warning}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setConfirm(null); p.onRelease(); }} disabled={p.pending} data-testid="ledger-release-confirm">{release.confirm}</Button>
                <Button variant="text" onClick={() => setConfirm(null)}>Keep</Button>
              </div>
            </div>
          ) : (
            <Button variant="text" onClick={() => setConfirm({ kind: "release" })} data-testid="ledger-release">Release</Button>
          ))}
          {p.actionable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="text" onClick={p.onBonus} disabled={p.pending || p.bonusUsed >= p.bonusMax} data-testid="ledger-bonus">Add a bonus line</Button>
              <span className="text-small text-ink-2">{bonusText(p.bonusUsed, p.bonusMax)}</span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
