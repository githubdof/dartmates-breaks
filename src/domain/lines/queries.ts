import { sql, eq, desc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines, users, hostProfiles } from "@/db/schema";

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

/** Host view: unpaid lines grouped per buyer for one-tap Paid. `oldest_claim` is an ISO-8601 UTC string (raw execute returns timestamps as non-ISO text). */
export async function unpaidByBuyer(tx: Tx, breakId: string) {
  return tx.execute<{ owner_id: string; handle: string | null; numbers: number[]; sent: boolean; sent_numbers: number[]; amount_cents: number; oldest_claim: string }>(sql`
    select l.owner_id, u.handle, array_agg(l.number order by l.number) as numbers, bool_and(l.sent_at is not null) as sent,
           coalesce(array_agg(l.number order by l.number) filter (where l.sent_at is not null), '{}') as sent_numbers,
           sum(l.price_cents)::int as amount_cents, to_char(min(l.claimed_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as oldest_claim
    from lines l join users u on u.id = l.owner_id
    where l.break_id = ${breakId} and l.paid_at is null and l.owner_id is not null
    group by l.owner_id, u.handle order by min(l.claimed_at)`);
}

/** Unpaid lines a buyer holds across every break (the platform-wide cap counts these). */
export async function globalUnpaidCount(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${userId} and ${lines.paidAt} is null`);
  return r.n;
}
