import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breakPhotos, photoUploads, prizes } from "@/db/schema";
import { assertHostOf, assertOnboarded, type BreakRow } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, NotFound, NotOpen, PhotosNotReady, UploadExpired, UploadNotFound, UploadUsed } from "@/domain/errors";
import { hitRateLimit } from "@/domain/rate-limit";
import type { Caller } from "@/domain/types";
import { isUuid } from "@/lib/is-uuid";
import { plural } from "@/lib/list";
import { PREFIX_PATTERN, VARIANT_WIDTHS } from "@/storage/buckets";
import { ALT_MAX, MAX_OPEN_TICKETS, MAX_PHOTOS, PHOTO_RATE, TICKET_SECONDS, rateBucket, type PhotoLocation } from "./types";

// The photo commands (photos spec §4–§6, §10). Each locks the break row first (lockBreak or assertHostOf), so a
// finalise cannot slip past requestDraw and two finalises cannot both take the last place; the status guard of
// migration 0005 reads the break FOR SHARE behind that lock. No command here touches Storage (Task 6 moves files).

const CAP = `A break can have up to ${MAX_PHOTOS} photos.`;
const SLOT = "Pick one of this break's prizes, or no tag.";
const ALT = `Describe the photo in 1 to ${ALT_MAX} characters.`;
/** The largest variant's long edge: a recorded photo's width and height are of that variant. */
const MAX_SIDE = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];

/** "Too many photos for now. Try again in 10 minutes." Minutes up to an hour, then hours. */
export function photoRateMessage(retryAfter: number): string {
  const wait = retryAfter <= 3600
    ? `${Math.ceil(retryAfter / 60)} ${plural(Math.ceil(retryAfter / 60), "minute", "minutes")}`
    : `${Math.ceil(retryAfter / 3600)} ${plural(Math.ceil(retryAfter / 3600), "hour", "hours")}`;
  return `Too many photos for now. Try again in ${wait}.`;
}

/** Photo rows change while the break is a draft, open or filled; from the draw request on they are frozen (§4). */
function assertEditable(b: BreakRow): void {
  if (b.status !== "draft" && b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
}

/** Rows holding a live position: what the live index, the cap and the 0..n−1 rule count (migration 0005). */
const placed = sql`${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`;

async function placedRows(tx: Tx, breakId: string) {
  return tx.select({ id: breakPhotos.id, position: breakPhotos.position }).from(breakPhotos)
    .where(sql`${breakPhotos.breakId} = ${breakId} and ${placed}`).orderBy(breakPhotos.position);
}

/** Records one hit in each window; the first window over its limit refuses with the wait. */
async function checkRate(tx: Tx, step: "issue" | "record", userId: string, now: Date): Promise<void> {
  for (const [window, seconds] of [["hour", 3600], ["day", 86_400]] as const) {
    const r = await hitRateLimit(tx, { bucket: rateBucket(step, window, userId), limit: PHOTO_RATE[window], windowSeconds: seconds, now });
    if (!r.allowed) throw new InvalidInput(photoRateMessage(r.retryAfter));
  }
}

/** Null (no tag) or one of this break's prize slot keys, as stored. */
async function slotOf(tx: Tx, breakId: string, slot: string | null): Promise<string | null> {
  if (slot === null) return null;
  if (typeof slot !== "string" || !isUuid(slot)) throw new InvalidInput(SLOT);
  const [p] = await tx.select({ slotKey: prizes.slotKey }).from(prizes)
    .where(sql`${prizes.breakId} = ${breakId} and ${prizes.slotKey} = ${slot}::uuid`);
  if (!p) throw new InvalidInput(SLOT);
  return p.slotKey;
}

/** Alt text trimmed, 1 to 120 characters as Postgres counts them (code points). */
function parseAlt(alt: string): string {
  const a = typeof alt === "string" ? alt.trim() : "";
  const n = [...a].length;
  if (n < 1 || n > ALT_MAX) throw new InvalidInput(ALT);
  return a;
}

/**
 * Grants the host one upload into `incoming` (spec §5.2): 5 minutes, consumed once by recordProcessedPhoto. Live
 * photos and this break's unconsumed, unexpired uploads count against the 8; the caller may hold at most 8 such
 * uploads across breaks, under the issue rate limits.
 */
export async function issueUploadTicket(tx: Tx, caller: Caller, p: { breakId: string; now: Date }): Promise<{ ticketId: string; incomingName: string }> {
  assertOnboarded(caller);
  if (typeof p.breakId !== "string" || !isUuid(p.breakId)) throw new NotFound("Break not found");
  const b = await assertHostOf(tx, caller, p.breakId);
  assertEditable(b);
  if (b.kind === "mini") throw new InvalidInput("A mini shows its parent break's photos.");
  const open = sql`${photoUploads.consumedAt} is null and ${photoUploads.expiresAt} > ${p.now.toISOString()}::timestamptz`;
  const [{ pending }] = await tx.select({ pending: sql<number>`count(*)::int` }).from(photoUploads)
    .where(sql`${photoUploads.breakId} = ${b.id} and ${open}`);
  if ((await placedRows(tx, b.id)).length + pending >= MAX_PHOTOS) throw new InvalidInput(CAP);
  // Serialises one caller's issues across breaks (lock order: break row, then the user, as the claims do).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"user:" + caller.id}))`);
  const [{ mine }] = await tx.select({ mine: sql<number>`count(*)::int` }).from(photoUploads)
    .where(sql`${photoUploads.hostId} = ${caller.id} and ${open}`);
  if (mine >= MAX_OPEN_TICKETS) throw new InvalidInput("Wait for the photos already uploading to finish.");
  await checkRate(tx, "issue", caller.id, p.now);
  const id = randomUUID();
  const incomingName = `${b.id}/${id}`;
  await tx.insert(photoUploads).values({ id, hostId: caller.id, breakId: b.id, incomingName, expiresAt: new Date(p.now.getTime() + TICKET_SECONDS * 1000) });
  return { ticketId: id, incomingName };
}

/**
 * Records a processed photo (spec §5.3 step 5): consumes the caller's upload and adds the photo last, with its event,
 * in one transaction. `location` is the bucket the variants were written to; it must be the one the break's status
 * allows now, or PhotosNotReady leaves the upload unconsumed for one retry (ruling 7).
 */
export async function recordProcessedPhoto(tx: Tx, caller: Caller, p: {
  ticketId: string; prefix: string; location: "photos-draft" | "photos"; width: number; height: number; slot: string | null; alt: string; now: Date;
}): Promise<{ photoId: string; location: PhotoLocation }> {
  assertOnboarded(caller);
  if (typeof p.ticketId !== "string" || !isUuid(p.ticketId)) throw new UploadNotFound();
  const [found] = await tx.select({ hostId: photoUploads.hostId, breakId: photoUploads.breakId }).from(photoUploads).where(eq(photoUploads.id, p.ticketId));
  // Another caller's upload, an admin's included, reads as missing: the reply never says it exists.
  if (!found || found.hostId !== caller.id) throw new UploadNotFound();
  const b = await assertHostOf(tx, caller, found.breakId);
  const [upload] = await tx.select().from(photoUploads).where(eq(photoUploads.id, p.ticketId)).for("update");
  if (upload.consumedAt !== null) throw new UploadUsed();
  if (p.now.getTime() >= upload.expiresAt.getTime()) throw new UploadExpired();
  assertEditable(b);
  if (p.location !== (b.status === "draft" ? "photos-draft" : "photos")) throw new PhotosNotReady();
  if (typeof p.prefix !== "string" || !PREFIX_PATTERN.test(p.prefix) || !p.prefix.startsWith(`${b.id}/`)) throw new InvalidInput("Bad photo path");
  const side = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE;
  if (!side(p.width) || !side(p.height)) throw new InvalidInput("Bad photo size");
  const slot = await slotOf(tx, b.id, p.slot);
  const alt = parseAlt(p.alt);
  const position = (await placedRows(tx, b.id)).length;
  if (position >= MAX_PHOTOS) throw new InvalidInput(CAP);
  await checkRate(tx, "record", caller.id, p.now);
  const [row] = await tx.insert(breakPhotos).values({
    breakId: b.id, position, prizeSlot: slot, path: p.prefix, bucket: p.location, width: p.width, height: p.height, alt, createdBy: caller.id,
  }).returning({ id: breakPhotos.id });
  await tx.update(photoUploads).set({ consumedAt: p.now }).where(eq(photoUploads.id, upload.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "photo.added", payload: { photoId: row.id, position, slot, location: p.location } }, { processedAt: p.now });
  return { photoId: row.id, location: p.location };
}
