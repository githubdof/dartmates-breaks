import { sql, eq, asc, and, inArray, isNull, isNotNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { awards, breakItems, breaks, draws, events, lines, users, hostProfiles } from "@/db/schema";
import { isOverdue } from "./rules";
import { buyerStatus, compareLedger, type BuyerStatus } from "./ledger";

export type MyLineState = "taken" | "sent" | "paid";
/**
 * `choice`: the rank was a set of items to choose from (no item fixed at draw time, and not a mini-break spot, whose
 * award also has no item). A choice is unanswered until `pickedAt` is set; `shippedAt` only drives the shipped state word.
 */
export type MyAward = { rank: number; itemName: string | null; choice: boolean; pickedAt: Date | null; shippedAt: Date | null };
export type MyBreak = {
  breakId: string; title: string; status: string; openedAt: Date | null; lineCount: number; linePriceCents: number;
  seedCommitment: string | null; paymentWindowHours: number; paymentInstructions: string;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } };
  lines: { number: number; state: MyLineState; bonus: boolean }[];
  unsent: number[]; sent: number[]; paid: number[];
  /** Unsent unpaid lines only: a sent line waits on the host and is not owed twice (design §5.4). */
  owedCents: number;
  /** First unsent claim plus the payment window; null when nothing is owed. */
  payBy: Date | null;
  late: boolean;
  /**
   * Every award the viewer holds on this break, by rank, from the active draw only (a voided draw's awards are gone).
   * A buyer can win several ranks unless the break sets one prize per person.
   */
  awards: MyAward[];
  ranAt: Date | null;
  /**
   * Ran or cancelled more than EARLIER_DAYS ago with nothing pending: listed under "Earlier" (design §5.8). Unpaid
   * lines (sent or not) and any unanswered choice win keep a break in the recent group whatever its age.
   */
  earlier: boolean;
};

export const EARLIER_DAYS = 7;

/** /me: the caller's lines grouped by break, most recently opened first. */
export async function myLines(tx: Tx, userId: string, now: Date): Promise<MyBreak[]> {
  const rows = await tx.select({
    breakId: breaks.id, title: breaks.title, status: breaks.status, openedAt: breaks.openedAt, createdAt: breaks.createdAt,
    lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, seedCommitment: breaks.seedCommitment,
    paymentWindowHours: breaks.paymentWindowHours, paymentInstructions: breaks.paymentInstructions,
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, paymentHandles: hostProfiles.paymentHandles,
    number: lines.number, claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents, isBonus: lines.isBonus,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(and(eq(lines.ownerId, userId), sql`${breaks.status} <> 'draft'`))
    .orderBy(sql`${breaks.openedAt} desc nulls last`, asc(breaks.id), asc(lines.number));
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.breakId))];
  const ran = await tx.select({ breakId: draws.breakId, ranAt: draws.createdAt }).from(draws)
    .where(and(inArray(draws.breakId, ids), isNull(draws.voidedAt)));
  // Written out rather than `${awards.breakId}`: inside a subquery the outer column must be qualified.
  const won = await tx.select({
    breakId: awards.breakId, rank: awards.rank, itemId: awards.itemId, itemName: breakItems.name, pickedAt: awards.pickedAt, shippedAt: awards.shippedAt,
    spot: sql<boolean>`exists (select 1 from prizes p where p.break_id = "awards"."break_id" and p.rank = "awards"."rank" and p.parent_break_id is not null)`,
  })
    .from(awards).innerJoin(draws, eq(draws.id, awards.drawId)).leftJoin(breakItems, eq(breakItems.id, awards.itemId))
    .where(and(eq(awards.winnerId, userId), isNull(draws.voidedAt), inArray(awards.breakId, ids))).orderBy(asc(awards.rank));
  // A cancelled break is dated by its latest cancel event; with none (no cancel command exists yet) it stays current.
  const cancels = await tx.select({ breakId: events.breakId, at: sql<Date>`max(${events.createdAt})`.mapWith(events.createdAt) }).from(events)
    .where(and(inArray(events.breakId, ids), eq(events.type, "break.cancelled"))).groupBy(events.breakId);
  const ranAt = new Map(ran.map((r) => [r.breakId, r.ranAt]));
  const cancelledAt = new Map(cancels.map((c) => [c.breakId, c.at]));
  const awardsOf = new Map<string, MyAward[]>();
  for (const a of won) {
    const list = awardsOf.get(a.breakId) ?? [];
    list.push({ rank: a.rank, itemName: a.itemName, choice: a.itemId === null && !a.spot, pickedAt: a.pickedAt, shippedAt: a.shippedAt });
    awardsOf.set(a.breakId, list);
  }
  const cutoff = now.getTime() - EARLIER_DAYS * 86_400_000;
  const groups = new Map<string, MyBreak & { firstUnsent: Date | null; endedAt: Date | null }>();
  for (const r of rows) {
    let g = groups.get(r.breakId);
    if (!g) {
      const ra = ranAt.get(r.breakId) ?? null;
      const endedAt = r.status === "drawn" ? (ra ?? r.openedAt ?? r.createdAt)
        : r.status === "cancelled" ? (cancelledAt.get(r.breakId) ?? null)
        : null;
      g = {
        breakId: r.breakId, title: r.title, status: r.status, openedAt: r.openedAt, lineCount: r.lineCount, linePriceCents: r.linePriceCents,
        seedCommitment: r.seedCommitment, paymentWindowHours: r.paymentWindowHours, paymentInstructions: r.paymentInstructions,
        host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, paymentHandles: r.paymentHandles ?? {} },
        lines: [], unsent: [], sent: [], paid: [], owedCents: 0, payBy: null, late: false,
        awards: awardsOf.get(r.breakId) ?? [], ranAt: ra, earlier: false, firstUnsent: null, endedAt,
      };
      groups.set(r.breakId, g);
    }
    const state: MyLineState = r.paidAt ? "paid" : r.sentAt ? "sent" : "taken";
    g.lines.push({ number: r.number, state, bonus: r.isBonus });
    if (state === "paid") g.paid.push(r.number);
    else if (state === "sent") g.sent.push(r.number);
    else {
      g.unsent.push(r.number);
      g.owedCents += r.priceCents ?? r.linePriceCents;
      if (r.claimedAt && (!g.firstUnsent || r.claimedAt < g.firstUnsent)) g.firstUnsent = r.claimedAt;
    }
  }
  return [...groups.values()].map(({ firstUnsent, endedAt, ...g }) => {
    const payBy = firstUnsent ? new Date(firstUnsent.getTime() + g.paymentWindowHours * 3_600_000) : null;
    // Something still to do here keeps the break in the recent group: unpaid lines, or a choice to name.
    const pending = g.unsent.length > 0 || g.sent.length > 0 || g.awards.some((a) => a.choice && a.pickedAt === null);
    const earlier = endedAt !== null && endedAt.getTime() < cutoff && !pending;
    return { ...g, payBy, late: payBy !== null && payBy.getTime() < now.getTime(), earlier };
  });
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

export type WaitingRow = {
  breakId: string; breakTitle: string; ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null;
  sent: number[]; sentCents: number; firstSentAt: Date;
};

/** "Sent, waiting for you" (design §5.5): sent, unpaid lines in the host's open and closed main breaks, per buyer per break, oldest first. */
export async function waitingOnHost(tx: Tx, hostId: string): Promise<WaitingRow[]> {
  const rows = await tx.select({
    breakId: breaks.id, breakTitle: breaks.title, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName, paymentName: users.paymentName,
    number: lines.number, sentAt: lines.sentAt, priceCents: lines.priceCents, linePriceCents: breaks.linePriceCents,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, lines.ownerId))
    .where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"), inArray(breaks.status, ["open", "filled"]), isNotNull(lines.sentAt), isNull(lines.paidAt)))
    .orderBy(asc(lines.number));
  const by = new Map<string, WaitingRow>();
  for (const r of rows) {
    const key = `${r.breakId}:${r.ownerId}`;
    const sentAt = r.sentAt!; // filtered: sent_at is not null
    const g = by.get(key) ?? {
      breakId: r.breakId, breakTitle: r.breakTitle, ownerId: r.ownerId!, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName,
      sent: [], sentCents: 0, firstSentAt: sentAt,
    };
    g.sent.push(r.number);
    g.sentCents += r.priceCents ?? r.linePriceCents;
    if (sentAt < g.firstSentAt) g.firstSentAt = sentAt;
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) =>
    a.firstSentAt.getTime() - b.firstSentAt.getTime() || a.breakId.localeCompare(b.breakId) || a.ownerId.localeCompare(b.ownerId));
}
