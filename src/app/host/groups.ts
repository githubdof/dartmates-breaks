import { statusWord } from "@/components/status-word";
import type { WaitingView } from "@/components/ledger/ledger-view";
import type { WaitingRow } from "@/domain/lines/queries";

const ORDER = ["open", "filled", "drawing", "drawn", "draft", "cancelled"] as const;

export type HostGroup<T> = { status: string; label: string; rows: T[] };

/** /host (design §5.5): Open, Closed, Running draw, Ran, Drafts, then Cancelled. Rows keep their order; empty groups go. */
export function groupHostBreaks<T extends { status: string }>(rows: readonly T[]): HostGroup<T>[] {
  return ORDER
    .map((s) => ({ status: s as string, label: s === "draft" ? "Drafts" : statusWord(s), rows: rows.filter((r) => r.status === s) }))
    .filter((g) => g.rows.length > 0);
}

/** "7 sent, waiting for you, across 3 breaks": one count per buyer per break (recorded ruling 3). */
export function waitingStripText(rows: readonly { breakId: string }[]): string | null {
  if (rows.length === 0) return null;
  const breaks = new Set(rows.map((r) => r.breakId)).size;
  return breaks > 1 ? `${rows.length} sent, waiting for you, across ${breaks} breaks` : `${rows.length} sent, waiting for you`;
}

/** A buyer's sent lines in one break, shaped as the per-break ledger's row so the merged ledger reuses LedgerRow. */
export function toWaitingView(w: WaitingRow): WaitingView {
  return {
    key: `${w.breakId}:${w.ownerId}`, breakId: w.breakId, breakTitle: w.breakTitle,
    row: {
      ownerId: w.ownerId, handle: w.handle, displayName: w.displayName, paymentName: w.paymentName,
      numbers: w.sent, unpaid: w.sent, sent: w.sent, overdue: [], paid: [], bonus: [], owedCents: w.sentCents, status: "sent", lateText: null,
    },
  };
}
