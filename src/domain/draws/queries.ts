import { sql, eq, asc, desc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { draws, drawRequests, awards, users, breakItems, breaks } from "@/db/schema";

export type DrawResult = {
  draw: typeof draws.$inferSelect;
  request: typeof drawRequests.$inferSelect;
  entries: { number: number; ownerId: string; handleAtDraw: string; isBonus: boolean }[];
  ranking: number[];
  awards: { rank: number; winnerHandle: string | null; itemName: string | null }[];
  voided: { createdAt: Date; voidReason: string | null }[];
  breakTitle: string;
  seedCommitment: string | null;
  hostHandle: string | null;
};

export async function getDrawResult(tx: Tx, breakId: string): Promise<DrawResult | null> {
  const [d] = await tx.select().from(draws).where(sql`${draws.breakId} = ${breakId} and ${draws.voidedAt} is null`);
  if (!d) return null;
  const [req] = await tx.select().from(drawRequests).where(eq(drawRequests.id, d.requestId));
  const [b] = await tx.select({ title: breaks.title, seedCommitment: breaks.seedCommitment, hostHandle: users.handle })
    .from(breaks).innerJoin(users, eq(users.id, breaks.hostId)).where(eq(breaks.id, breakId));
  const aw = await tx.select({ rank: awards.rank, winnerHandle: users.handle, itemName: breakItems.name })
    .from(awards).innerJoin(users, eq(users.id, awards.winnerId)).leftJoin(breakItems, eq(breakItems.id, awards.itemId))
    .where(eq(awards.drawId, d.id)).orderBy(asc(awards.rank));
  const voided = await tx.select({ createdAt: draws.createdAt, voidReason: draws.voidReason }).from(draws).where(sql`${draws.breakId} = ${breakId} and ${draws.voidedAt} is not null`).orderBy(desc(draws.createdAt));
  return { draw: d, request: req, entries: d.entriesSnapshot, ranking: d.ranking, awards: aw, voided, breakTitle: b.title, seedCommitment: b.seedCommitment, hostHandle: b.hostHandle };
}

/**
 * What the link preview reads of a ran break's active draw (Mosaic §6): the order, the prize ranks and when it ran. No
 * entry, handle, winner or item name is selected, so none can reach the image.
 */
export async function drawPlacesForPreview(tx: Tx, breakId: string): Promise<{ ranking: number[]; ranks: number[]; ranAt: Date } | null> {
  const [d] = await tx.select({ id: draws.id, ranking: draws.ranking, createdAt: draws.createdAt }).from(draws)
    .where(sql`${draws.breakId} = ${breakId} and ${draws.voidedAt} is null`);
  if (!d) return null;
  const aw = await tx.select({ rank: awards.rank }).from(awards).where(eq(awards.drawId, d.id)).orderBy(asc(awards.rank));
  return { ranking: d.ranking, ranks: aw.map((a) => a.rank), ranAt: d.createdAt };
}

export async function pendingRequestsReady(tx: Tx, currentRound: number) {
  return tx.select({ breakId: drawRequests.breakId }).from(drawRequests).where(sql`${drawRequests.status} = 'pending' and ${drawRequests.beaconRound} <= ${currentRound}`);
}
