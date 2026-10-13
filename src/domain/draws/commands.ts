import { sql, eq, asc } from "drizzle-orm";
import { bytesToHex } from "@noble/hashes/utils";
import type { Tx } from "@/db/client";
import { breaks, breakSecrets, lines, users, prizes, drawRequests, draws, awards } from "@/db/schema";
import { assertHostOf, lockBreak, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { AlreadyDrawn, BeaconUnavailable, InvalidInput, NotAuthorized, NotFilled, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { decryptSecret } from "@/crypto/secrets";
import { computeRanking, ALGORITHM_VERSION } from "@/crypto/draw";
import { roundAfter, type BeaconSource } from "@/crypto/beacon";

export const BEACON_DELAY_SECONDS = 60;

export async function requestDraw(tx: Tx, caller: Caller, p: { breakId: string; onBehalfNote?: string }): Promise<{ requestId: string; beaconRound: number }> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (caller.role === "admin" && caller.id !== b.hostId && !p.onBehalfNote) throw new InvalidInput("Admins must record the host's request");
  if (b.status === "drawing") {
    const [pending] = await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id} and ${drawRequests.status} = 'pending'`);
    if (!pending) throw new NotOpen(b.status);
    return { requestId: pending.id, beaconRound: pending.beaconRound };
  }
  if (b.status === "drawn") throw new AlreadyDrawn();
  if (b.status !== "filled") throw new NotFilled();
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(drawRequests).where(eq(drawRequests.breakId, b.id));
  const requestedAt = new Date();
  const beaconRound = roundAfter(requestedAt, BEACON_DELAY_SECONDS);
  const [req] = await tx.insert(drawRequests).values({ breakId: b.id, attempt: n + 1, requestedBy: caller.id, requestedAt, beaconRound, onBehalfNote: p.onBehalfNote ?? null }).returning({ id: drawRequests.id });
  await tx.update(breaks).set({ status: "drawing" }).where(eq(breaks.id, b.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "draw.requested", payload: { attempt: n + 1, beaconRound } });
  return { requestId: req.id, beaconRound };
}

export type PrizeRef = { rank: number; itemId: string | null };
export function assignAwards(ranking: number[], entries: { number: number; ownerId: string }[], prizeRows: PrizeRef[], onePrizePerPerson: boolean): { rank: number; winnerId: string; itemId: string | null }[] {
  const ownerOf = new Map(entries.map((e) => [e.number, e.ownerId]));
  const ranks = [...new Set(prizeRows.map((p) => p.rank))].sort((a, b) => a - b);
  const out: { rank: number; winnerId: string; itemId: string | null }[] = [];
  const used = new Set<string>();
  let i = 0;
  for (const rank of ranks) {
    while (i < ranking.length && onePrizePerPerson && used.has(ownerOf.get(ranking[i])!)) i++;
    if (i >= ranking.length) break;
    const winnerId = ownerOf.get(ranking[i])!;
    const items = prizeRows.filter((p) => p.rank === rank);
    out.push({ rank, winnerId, itemId: items.length === 1 ? items[0].itemId : null });
    used.add(winnerId);
    i++;
  }
  return out;
}

const pendingRequest = async (tx: Tx, breakId: string) =>
  (await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${breakId} and ${drawRequests.status} = 'pending'`))[0];

export async function finaliseDraw(tx: Tx, caller: Caller, p: { breakId: string }, beacon: BeaconSource): Promise<{ drawId: string; ranking: number[] }> {
  assertOnboarded(caller);
  // Read the pending request and fetch the beacon BEFORE taking the row lock,
  // so relay timeouts (up to 4s per relay) never hold the breaks row lock.
  const pre = await pendingRequest(tx, p.breakId);
  const preBeacon = pre ? await beacon.fetch(pre.beaconRound) : null;

  const b = await lockBreak(tx, p.breakId);
  if (b.status === "drawn") {
    const [d] = await tx.select().from(draws).where(sql`${draws.breakId} = ${b.id} and ${draws.voidedAt} is null`);
    return { drawId: d.id, ranking: d.ranking };
  }
  if (b.status !== "drawing") throw new NotOpen(b.status);
  const isParty = caller.id === b.hostId || caller.role === "admin";
  if (!isParty) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id}`);
    if (n === 0) throw new NotAuthorized("Only the host or a participant can finalise");
  }
  // Re-read under the lock; if the pending request changed since the pre-read, fetch its beacon now.
  const req = await pendingRequest(tx, b.id);
  if (!req) throw new NotOpen(b.status);
  const bv = pre && pre.id === req.id && pre.beaconRound === req.beaconRound ? preBeacon : await beacon.fetch(req.beaconRound);
  if (!bv) throw new BeaconUnavailable();

  const entryRows = await tx.select({ number: lines.number, ownerId: lines.ownerId, handle: users.handle, isBonus: lines.isBonus })
    .from(lines).innerJoin(users, eq(users.id, lines.ownerId)).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is not null`).orderBy(asc(lines.number));
  const entries = entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId! }));
  const [sec] = await tx.select().from(breakSecrets).where(eq(breakSecrets.breakId, b.id));
  if (!sec) throw new InvalidInput("Draw secret unavailable; contact the admin");
  const secret = decryptSecret(sec.ciphertext, sec.keyId, b.id);
  const { seed, ranking, resultHash } = computeRanking({ version: ALGORITHM_VERSION, secret, beacon: bv.randomness, breakId: b.id, entries });

  const [d] = await tx.insert(draws).values({
    breakId: b.id, requestId: req.id, secret: Buffer.from(secret).toString("base64"), beaconRound: req.beaconRound,
    beaconRandomness: bytesToHex(bv.randomness), beaconSignature: bv.signature, seed: bytesToHex(seed), algorithmVersion: ALGORITHM_VERSION,
    entriesSnapshot: entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId!, handleAtDraw: e.handle ?? "", isBonus: e.isBonus })),
    ranking, resultHash, runBy: caller.id,
  }).returning({ id: draws.id });
  await tx.update(drawRequests).set({ status: "done" }).where(eq(drawRequests.id, req.id));
  const prizeRows = await tx.select({ rank: prizes.rank, itemId: prizes.itemId }).from(prizes).where(eq(prizes.breakId, b.id));
  const now = new Date();
  for (const a of assignAwards(ranking, entries, prizeRows, b.onePrizePerPerson)) {
    // A single-item prize is picked at draw time; a choice set (itemId null) waits for the winner's pick.
    await tx.insert(awards).values({ drawId: d.id, breakId: b.id, rank: a.rank, winnerId: a.winnerId, itemId: a.itemId, pickedAt: a.itemId ? now : null });
  }
  await tx.delete(breakSecrets).where(eq(breakSecrets.breakId, b.id));
  await tx.update(breaks).set({ status: "drawn" }).where(eq(breaks.id, b.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "draw.drawn", payload: { drawId: d.id, winnerLine: ranking[0] } });
  return { drawId: d.id, ranking };
}
