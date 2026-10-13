import { sql, eq, asc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, lines, users, hostProfiles } from "@/db/schema";

export type BreakPage = {
  break: typeof breaks.$inferSelect;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } };
  items: (typeof breakItems.$inferSelect)[];
  prizes: (typeof prizes.$inferSelect)[];
  lines: { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; reservedForMiniId: string | null; isBonus: boolean }[];
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
    paidAt: lines.paidAt, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  return { break: b, host: { ...host, paymentHandles: host.paymentHandles ?? {} }, items, prizes: prizeRows, lines: lineRows };
}

export async function listOpenBreaks(tx: Tx, limit = 50) {
  return tx.select({ id: breaks.id, title: breaks.title, lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, status: breaks.status, openedAt: breaks.openedAt,
    openLines: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is null and l.reserved_for_mini_id is null)`,
    hostHandle: users.handle })
    .from(breaks).innerJoin(users, eq(users.id, breaks.hostId))
    .where(sql`${breaks.status} in ('open','filled','drawing')`).orderBy(sql`${breaks.openedAt} desc`).limit(limit);
}
