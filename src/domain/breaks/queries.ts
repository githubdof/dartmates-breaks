import { sql, eq, asc, desc, and } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, lines, users, hostProfiles } from "@/db/schema";
import type { ClaimMode } from "./rules";

export type BreakPage = {
  break: typeof breaks.$inferSelect;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } };
  items: (typeof breakItems.$inferSelect)[];
  prizes: (typeof prizes.$inferSelect)[];
  lines: { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; priceCents: number | null; reservedForMiniId: string | null; isBonus: boolean }[];
};

export async function getBreakPage(tx: Tx, breakId: string): Promise<BreakPage | null> {
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
  if (!b) return null;
  const [host] = await tx.select({ id: users.id, handle: users.handle, displayName: users.displayName, paymentHandles: hostProfiles.paymentHandles })
    .from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, b.hostId));
  const items = await tx.select().from(breakItems).where(eq(breakItems.breakId, breakId)).orderBy(asc(breakItems.createdAt));
  const prizeRows = await tx.select().from(prizes).where(eq(prizes.breakId, breakId)).orderBy(asc(prizes.rank));
  const lineRows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, ownerHandle: users.handle, claimedAt: lines.claimedAt, sentAt: lines.sentAt,
    paidAt: lines.paidAt, priceCents: lines.priceCents, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  return { break: b, host: { ...host, paymentHandles: host.paymentHandles ?? {} }, items, prizes: prizeRows, lines: lineRows };
}

/** Interim trust figures (the reputation plan replaces them): drawn breaks and member-since. */
export async function hostTrust(tx: Tx, hostId: string): Promise<{ breaksRun: number; since: Date }> {
  const [r] = await tx.select({
    since: users.createdAt,
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${hostId}::uuid and b.status = 'drawn')`,
  }).from(users).where(eq(users.id, hostId));
  return { breaksRun: r?.breaksRun ?? 0, since: r?.since ?? new Date(0) };
}

export type LastBreakDefaults = {
  lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null;
  claimMode: ClaimMode; paymentInstructions: string;
};

/** The host's most recent main break: the composer starts from it (design §5.6, hosts run several a week). */
export async function lastBreakDefaults(tx: Tx, hostId: string): Promise<LastBreakDefaults | null> {
  const [r] = await tx.select({
    lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, paymentWindowHours: breaks.paymentWindowHours,
    maxLinesPerUser: breaks.maxLinesPerUser, claimMode: breaks.claimMode, paymentInstructions: breaks.paymentInstructions,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id)).limit(1);
  if (!r) return null;
  // Instructions built from handles ("Venmo @x. Leave the note blank.") go stale when a handle changes: carry only typed ones.
  const generated = /^(Venmo \S+\. )?(PayPal paypal\.me\/\S+\. )?Leave the note blank\.$/.test(r.paymentInstructions.trim());
  return { ...r, paymentInstructions: generated ? "" : r.paymentInstructions };
}

export async function hostPaymentHandles(tx: Tx, hostId: string): Promise<{ venmo?: string; paypal?: string }> {
  const [r] = await tx.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, hostId));
  return r?.paymentHandles ?? {};
}

export type HostBreakRow = { id: string; title: string; status: string; lineCount: number; openedAt: Date | null; paid: number; taken: number };

/** The host's main breaks for /host, newest first (minis wait for their own UI). Paid and taken count numbered lines only. */
export async function listHostBreaks(tx: Tx, hostId: string): Promise<HostBreakRow[]> {
  return tx.select({
    id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount, openedAt: breaks.openedAt,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`,
    taken: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id));
}
