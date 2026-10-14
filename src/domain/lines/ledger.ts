export type BuyerStatus = "sent" | "unpaid" | "overdue" | "paid";

/** Fixed ledger order (design §5.5): Sent first, then unpaid by claim time, then overdue, then paid at the bottom. */
export const LEDGER_ORDER: Record<BuyerStatus, number> = { sent: 0, unpaid: 1, overdue: 2, paid: 3 };

export function buyerStatus(b: { unpaid: readonly number[]; sent: readonly number[]; overdue: readonly number[] }): BuyerStatus {
  if (b.unpaid.length === 0) return "paid";
  if (b.overdue.length > 0) return "overdue";
  if (b.sent.length === b.unpaid.length) return "sent";
  return "unpaid";
}

export function compareLedger(a: { status: BuyerStatus; firstClaimAt: Date }, b: { status: BuyerStatus; firstClaimAt: Date }): number {
  return LEDGER_ORDER[a.status] - LEDGER_ORDER[b.status] || a.firstClaimAt.getTime() - b.firstClaimAt.getTime();
}
