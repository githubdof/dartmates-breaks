import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, breaks, breakItems, breakSecrets, breakPhotos, photoUploads, prizes, lines, hostProfiles } from "@/db/schema";
import type { Flight, Kit } from "@/domain/flights";
import { commitment } from "@/crypto/commit";
import { encryptSecret } from "@/crypto/secrets";
import { FakeBeacon } from "@/crypto/beacon";
import type { ClaimMode, ItemCondition } from "@/domain/breaks/rules";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { SYSTEM, type Caller } from "@/domain/types";
import type { PhotoLocation } from "@/domain/photos/types";

// Random, not Date.now(): parallel vitest workers would collide on the same millisecond.
const uniq = () => randomBytes(6).toString("hex");

/** Flights from both ink tiers and a kit other than the default, for privacy and render tests (Mosaic §4, §6). */
export const YELLOW_KITE: Flight = { colour: "yellow", shape: "kite" };
export const BLUE_STANDARD: Flight = { colour: "blue", shape: "standard" };
export const PLUM_LIME: Kit = { dark: "plum", light: "lime" };

export async function makeUser(tx: Tx, opts: { role?: "member" | "host" | "admin"; handle?: string; flight?: Flight; kit?: Kit } = {}) {
  const id = randomUUID();
  const handle = opts.handle ?? `u${uniq()}`;
  await tx.insert(users).values({
    id, email: `${handle}@example.com`, handle, displayName: handle,
    role: opts.role ?? "member", ageConfirmedAt: new Date(),
    // Without a flight the column default draws a random one, as at a real first sign-in.
    ...(opts.flight ? { flightColour: opts.flight.colour, flightShape: opts.flight.shape } : {}),
  });
  if (opts.kit) {
    await tx.insert(hostProfiles).values({ userId: id, kitDark: opts.kit.dark, kitLight: opts.kit.light })
      .onConflictDoUpdate({ target: hostProfiles.userId, set: { kitDark: opts.kit.dark, kitLight: opts.kit.light } });
  }
  return { id, handle };
}

/** A composer prize: a fresh slot key unless given. */
export const prize = (name: string, condition: ItemCondition = "new_in_box", slotKey: string = randomUUID()) => ({ name, slotKey, condition });

/**
 * A break_photos row straight into the table (Task 5's commands are not needed to test slots and deletes).
 * bucket defaults to the one the break's status allows: "photos-draft" for a draft break, "photos" otherwise
 * (Task 2 refuses any other insert). path `${breakId}/${22 url-safe chars}`, width 1600, height 1200, alt "Darts".
 * Returns the row id.
 */
export async function photoRow(tx: Tx, o: { breakId: string; hostId: string; position: number; slot: string | null; bucket?: "photos-draft" | "photos" }): Promise<string> {
  const bucket = o.bucket ?? ((await tx.select({ status: breaks.status }).from(breaks).where(sql`${breaks.id} = ${o.breakId}`))[0].status === "draft" ? "photos-draft" : "photos");
  const [r] = await tx.insert(breakPhotos).values({
    breakId: o.breakId, position: o.position, prizeSlot: o.slot, path: `${o.breakId}/${randomBytes(16).toString("base64url")}`,
    bucket, width: 1600, height: 1200, alt: "Darts", createdBy: o.hostId,
  }).returning({ id: breakPhotos.id });
  return r.id;
}

/** A storage prefix as Task 6 makes it: `${breakId}/` + 22 url-safe base64 characters (128 bits). */
export function newPrefix(breakId: string): string {
  return `${breakId}/${randomBytes(16).toString("base64url")}`;
}

/**
 * A break_photos row in any state, straight into the table, so tests can build states the commands would refuse.
 * Defaults: slot null, bucket "photos", path newPrefix(breakId) (a string `path` is used as the prefix, null drops it
 * after the insert), width 1600, height 1200, alt "Darts". The guard only
 * inserts live rows in the bucket the break's status allows, so a removed or hidden row is inserted live (parked at
 * position -8, clear of the live index) and then removed or hidden, moving to `bucket` in that update.
 */
export async function makePhoto(tx: Tx, o: {
  breakId: string; createdBy: string; position: number; slot?: string | null;
  bucket?: PhotoLocation; removedAt?: Date; hiddenAt?: Date; path?: string | null; alt?: string;
}): Promise<{ id: string; prefix: string }> {
  const prefix = typeof o.path === "string" ? o.path : newPrefix(o.breakId);
  const gone = o.removedAt !== undefined || o.hiddenAt !== undefined;
  const [{ status }] = await tx.select({ status: breaks.status }).from(breaks).where(sql`${breaks.id} = ${o.breakId}`);
  const liveBucket = o.bucket && o.bucket !== "photo-archive" ? o.bucket : status === "draft" ? "photos-draft" : "photos";
  const [r] = await tx.insert(breakPhotos).values({
    breakId: o.breakId, position: gone ? -8 : o.position, prizeSlot: o.slot ?? null, path: prefix,
    bucket: gone ? liveBucket : (o.bucket ?? "photos"), width: 1600, height: 1200, alt: o.alt ?? "Darts", createdBy: o.createdBy,
  }).returning({ id: breakPhotos.id });
  if (gone) {
    await tx.update(breakPhotos).set({
      position: o.position, removedAt: o.removedAt ?? null, hiddenAt: o.hiddenAt ?? null, bucket: o.bucket ?? liveBucket,
    }).where(sql`${breakPhotos.id} = ${r.id}`);
  }
  // A path only ever changes to null (every copy gone), in an update of its own.
  if (o.path === null) await tx.update(breakPhotos).set({ path: null }).where(sql`${breakPhotos.id} = ${r.id}`);
  return { id: r.id, prefix };
}

/** A photo_uploads row (the grant a host gets before a photo is recorded), straight into the table. */
export async function makeTicket(tx: Tx, o: { hostId: string; breakId: string; expiresAt: Date; consumedAt?: Date }): Promise<{ id: string }> {
  const id = randomUUID();
  await tx.insert(photoUploads).values({
    id, hostId: o.hostId, breakId: o.breakId, incomingName: `${o.breakId}/${id}`, expiresAt: o.expiresAt, consumedAt: o.consumedAt ?? null,
  });
  return { id };
}

/** Adds an item and its prize at `rank`; returns the prize's slot key. */
export async function addPrize(tx: Tx, breakId: string, rank: number, name: string): Promise<string> {
  const [item] = await tx.insert(breakItems).values({ breakId, name }).returning();
  const [p] = await tx.insert(prizes).values({ breakId, rank, itemId: item.id }).returning({ slotKey: prizes.slotKey });
  return p.slotKey;
}

export async function makeBreak(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; status?: string; kind?: string; claimMode?: ClaimMode }) {
  const claimMode = opts.claimMode ?? "pick_or_random";
  const [b] = await tx.insert(breaks).values({
    hostId: opts.hostId, title: `Break ${uniq()}`, lineCount: opts.lineCount ?? 12,
    linePriceCents: opts.linePriceCents ?? 2000, status: opts.status ?? "draft", kind: opts.kind ?? "main",
    claimMode, allowRandomClaims: claimMode === "pick_or_random",
  }).returning();
  const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: "Darts" }).returning();
  await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  return b;
}

/** Shortcut for tests that need an open break with lines but don't test `breaks.open` itself. */
export async function openBreakWithLines(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; claimMode?: ClaimMode }) {
  const b = await makeBreak(tx, { ...opts, status: "draft" });
  const secret = randomBytes(32);
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${b.id}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${b.id}::uuid, generate_series(1, ${b.lineCount})`);
  return { ...b, status: "open", secret };
}

export async function lineRows(tx: Tx, breakId: string) {
  return tx.select().from(lines).where(sql`${lines.breakId} = ${breakId}`).orderBy(lines.number);
}

/** Ledger invariants that must hold after any interleaving. Called at the end of each concurrency test (Task 10). */
export async function assertInvariants(tx: Tx): Promise<void> {
  const ids = (rows: Record<string, unknown>[]) => rows.map((r) => Object.values(r).join(":")).join(", ");
  const paidUnowned = await tx.execute<{ break_id: string; number: number }>(sql`
    select break_id, number from lines where paid_at is not null and owner_id is null`);
  if (paidUnowned.length) throw new Error(`paid lines without owner: ${ids(paidUnowned)}`);
  const ownedUnclaimed = await tx.execute<{ break_id: string; number: number }>(sql`
    select break_id, number from lines where owner_id is not null and claimed_at is null`);
  if (ownedUnclaimed.length) throw new Error(`owned lines without claimed_at: ${ids(ownedUnclaimed)}`);
  const unpaidInFull = await tx.execute<{ break_id: string; number: number }>(sql`
    select l.break_id, l.number from lines l join breaks b on b.id = l.break_id
    where b.status in ('filled','drawing','drawn') and l.number <= b.line_count and l.paid_at is null`);
  if (unpaidInFull.length) throw new Error(`unpaid numbered lines in a filled/drawing/drawn break: ${ids(unpaidInFull)}`);
}

/**
 * A drawn break: every numbered line claimed by `buyerIds` in turn and paid, then the draw requested and finalised
 * with the fake beacon. `extraTopChoice` adds a second top-spot item before the draw, so the top prize is a choice.
 */
export async function drawnBreak(tx: Tx, opts: { hostId: string; buyerIds: string[]; lineCount?: number; extraTopChoice?: string }) {
  const b = await openBreakWithLines(tx, { hostId: opts.hostId, lineCount: opts.lineCount ?? 4 });
  const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
  await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
  if (opts.extraTopChoice) {
    const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: opts.extraTopChoice }).returning();
    await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  }
  const as = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });
  for (let n = 1; n <= b.lineCount; n++) {
    const owner = opts.buyerIds[(n - 1) % opts.buyerIds.length];
    await claimLines(tx, as(owner), { breakId: b.id, numbers: [n], batchId: randomUUID() });
    await markPaid(tx, as(opts.hostId, "host"), { breakId: b.id, number: n, expectedOwnerId: owner });
  }
  await requestDraw(tx, as(opts.hostId, "host"), { breakId: b.id });
  const { drawId, ranking } = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
  return { ...b, status: "drawn", drawId, ranking };
}
