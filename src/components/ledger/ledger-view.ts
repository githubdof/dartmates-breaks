import type { BuyerStatus } from "@/domain/lines/ledger";
import type { CellData } from "@/components/grid/cell-label";
import { formatMoney } from "@/lib/money";
import { joinAnd, plural } from "@/lib/list";

/** One buyer as the host ledger shows it; dates already turned into strings on the server. */
export type LedgerRowView = {
  ownerId: string; handle: string | null; displayName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; status: BuyerStatus; lateText: string | null;
};
export type LedgerFilter = "all" | "sent" | "unpaid" | "overdue";

export function matchesFilter(r: LedgerRowView, f: LedgerFilter): boolean {
  switch (f) {
    case "all": return true;
    case "sent": return r.sent.length > 0;
    case "unpaid": return r.unpaid.length > 0;
    case "overdue": return r.overdue.length > 0;
  }
}

/** "Name, handle or amount": a Venmo notice says "$10 from Alice Smith". */
export function matchesQuery(r: LedgerRowView, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/^@/, "");
  if (!s) return true;
  const money = s.replace(/^\$/, "").replace(/,/g, "");
  if (/^\d+(\.\d{1,2})?$/.test(money) && Math.round(Number(money) * 100) === r.owedCents) return true;
  return [r.handle, r.displayName].some((v) => v?.toLowerCase().includes(s) ?? false);
}

export const freezeOrder = (rows: readonly LedgerRowView[]) => rows.map((r) => r.ownerId);

/** Rows keep the order frozen when the ledger opened; buyers who appear later go to the end. */
export function applyOrder(rows: readonly LedgerRowView[], order: readonly string[]): LedgerRowView[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((r, i) => ({ r, k: pos.get(r.ownerId) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
}

/** What the ledger lists, frozen when it opens and when the host changes the filter. */
export type LedgerView = { filter: LedgerFilter; order: string[]; visible: string[] };

export function freezeView(rows: readonly LedgerRowView[], filter: LedgerFilter): LedgerView {
  return { filter, order: freezeOrder(rows), visible: rows.filter((r) => matchesFilter(r, filter)).map((r) => r.ownerId) };
}

/**
 * Rows listed in the frozen order with their current data. A row frozen in stays listed even after it stops
 * matching the filter, a row frozen out stays out, and only buyers who appear later are filtered live (and go to
 * the end). Search text always filters live, because the host is typing it.
 */
export function applyView(view: LedgerView, rows: readonly LedgerRowView[], search: string): LedgerRowView[] {
  const known = new Set(view.order);
  const shown = new Set(view.visible);
  return applyOrder(rows, view.order)
    .filter((r) => (known.has(r.ownerId) ? shown.has(r.ownerId) : matchesFilter(r, view.filter)))
    .filter((r) => matchesQuery(r, search));
}

export function chipCounts(rows: readonly LedgerRowView[]): Record<LedgerFilter, number> {
  return {
    all: rows.length,
    sent: rows.filter((r) => matchesFilter(r, "sent")).length,
    unpaid: rows.filter((r) => matchesFilter(r, "unpaid")).length,
    overdue: rows.filter((r) => matchesFilter(r, "overdue")).length,
  };
}

const who = (r: Pick<LedgerRowView, "handle" | "displayName">) => (r.handle ? `@${r.handle}` : r.displayName ?? "this buyer");
const linesPhrase = (numbers: readonly number[]) => (numbers.length === 1 ? `line ${numbers[0]}` : `lines ${joinAnd(numbers)}`);

/** The visible button says "Paid" (design §5.5); its accessible name says what it does (design §6 "Mark paid"). */
export function markPaidLabel(r: Pick<LedgerRowView, "handle" | "displayName" | "owedCents">): string {
  const name = r.displayName ?? (r.handle ? `@${r.handle}` : "this buyer");
  return `Mark ${name} paid, ${formatMoney(r.owedCents)}`;
}

export function paidToast(r: Pick<LedgerRowView, "handle" | "displayName">, numbers: readonly number[], cents: number): string {
  return `Marked ${who(r)} paid (${numbers.length} ${plural(numbers.length, "line", "lines")}, ${formatMoney(cents)}).`;
}

export function releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent">, numbers: readonly number[]): { text: string; confirm: string; warning: string | null } {
  const sentAmong = r.sent.filter((n) => numbers.includes(n));
  return {
    text: `Release ${linesPhrase(numbers)} from ${who(r)}? ${numbers.length === 1 ? "It reopens" : "They reopen"} now.`,
    confirm: `Release ${numbers.length} ${plural(numbers.length, "line", "lines")}`,
    warning: sentAmong.length ? `${who(r)} marked ${linesPhrase(sentAmong)} as sent. Check your payments before releasing.` : null,
  };
}

export const releaseReason = (r: Pick<LedgerRowView, "unpaid" | "overdue">): "overdue" | "host_dropped" =>
  r.overdue.length > 0 && r.overdue.length === r.unpaid.length ? "overdue" : "host_dropped";

export const bonusText = (used: number, max: number) => `${Math.max(0, max - used)} of ${max} bonus ${plural(max, "line", "lines")} left`;

const WORD: Record<BuyerStatus, string> = { sent: "Sent", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" };
export const rowStateWord = (r: Pick<LedgerRowView, "status">) => WORD[r.status];

export function rowCells(r: LedgerRowView): CellData[] {
  return r.numbers.map((n): CellData => ({
    number: n,
    state: r.paid.includes(n) ? "paid" : r.sent.includes(n) ? "sent" : "taken",
    mine: false,
    overdue: r.overdue.includes(n),
    bonus: r.bonus.includes(n),
  }));
}

/** The running-draw wait in the ledger's bottom action (design §5.4). */
export const drawingText = (hostName: string) => `${hostName} started the draw. The result is in about a minute.`;
