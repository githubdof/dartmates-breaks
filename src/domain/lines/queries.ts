import { sql, eq, desc, asc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines, users, hostProfiles } from "@/db/schema";
import { isOverdue } from "./rules";
import { buyerStatus, compareLedger, type BuyerStatus } from "./ledger";

/** Lines a user holds across breaks, grouped per break for /me with amount owed. */
export async function myLines(tx: Tx, userId: string) {
  const rows = await tx.select({
    breakId: breaks.id, title: breaks.title, status: breaks.status, hostHandle: users.handle, paymentHandles: hostProfiles.paymentHandles,
    paymentInstructions: breaks.paymentInstructions, paymentWindowHours: breaks.paymentWindowHours,
    number: lines.number, claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(eq(lines.ownerId, userId)).orderBy(desc(breaks.openedAt), lines.number);
  const byBreak = new Map<string, { breakId: string; title: string; status: string; hostHandle: string | null; paymentHandles: { venmo?: string; paypal?: string }; paymentInstructions: string; paymentWindowHours: number; lines: typeof rows; owedCents: number }>();
  for (const r of rows) {
    const g = byBreak.get(r.breakId) ?? { ...r, paymentHandles: r.paymentHandles ?? {}, lines: [], owedCents: 0 };
    g.lines.push(r);
    if (!r.paidAt) g.owedCents += r.priceCents ?? 0;
    byBreak.set(r.breakId, g);
  }
  return [...byBreak.values()];
}

export type LedgerBuyer = {
  ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; firstClaimAt: Date; overdueSince: Date | null; status: BuyerStatus;
};

/** Host ledger: every buyer in the break (paid ones too), grouped, in the fixed ledger order. `now` decides overdue. */
export async function ledgerByBuyer(tx: Tx, breakId: string, now: Date): Promise<LedgerBuyer[]> {
  const [b] = await tx.select({ paymentWindowHours: breaks.paymentWindowHours }).from(breaks).where(eq(breaks.id, breakId));
  if (!b) return [];
  const rows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName, paymentName: users.paymentName,
    claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents, isBonus: lines.isBonus,
  }).from(lines).innerJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  const by = new Map<string, LedgerBuyer>();
  for (const r of rows) {
    const ownerId = r.ownerId!;
    const claimedAt = r.claimedAt!; // lines_owned_claimed_chk: owned lines always have claimed_at
    const g: LedgerBuyer = by.get(ownerId) ?? {
      ownerId, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [],
      owedCents: 0, firstClaimAt: claimedAt, overdueSince: null, status: "paid",
    };
    g.numbers.push(r.number);
    if (r.isBonus) g.bonus.push(r.number);
    if (r.paidAt) {
      g.paid.push(r.number);
    } else {
      g.unpaid.push(r.number);
      g.owedCents += r.priceCents ?? 0;
      if (r.sentAt) g.sent.push(r.number);
      if (isOverdue(r, b, now)) {
        g.overdue.push(r.number);
        const due = new Date(claimedAt.getTime() + b.paymentWindowHours * 3_600_000);
        if (!g.overdueSince || due < g.overdueSince) g.overdueSince = due;
      }
    }
    if (claimedAt < g.firstClaimAt) g.firstClaimAt = claimedAt;
    by.set(ownerId, g);
  }
  return [...by.values()].map((g) => ({ ...g, status: buyerStatus(g) })).sort(compareLedger);
}

/** Unpaid lines a buyer holds across every break (the platform-wide cap counts these). */
export async function globalUnpaidCount(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${userId} and ${lines.paidAt} is null`);
  return r.n;
}
