import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, breakPhotos, photoNoticesSeen, photoUploads, prizes, lines } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { assertAdmin, assertHostOf, assertOnboarded, lockBreak, type BreakRow } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, NotFound, NotOpen, PhotosNotReady, UploadExpired, UploadNotFound, UploadUsed } from "@/domain/errors";
import { hitRateLimit } from "@/domain/rate-limit";
import type { Caller } from "@/domain/types";
import { isUuid } from "@/lib/is-uuid";
import { plural } from "@/lib/list";
import { PREFIX_PATTERN, VARIANT_WIDTHS } from "@/storage/buckets";
import { noticeFor, placeWords } from "./notice";
import { ALT_MAX, MAX_OPEN_TICKETS, MAX_PHOTOS, PHOTO_RATE, TICKET_SECONDS, rateBucket, type PhotoChange, type PhotoLocation } from "./types";

// The photo commands (photos spec §4–§6, §10). Each locks the break row first (lockBreak or assertHostOf), so a
// finalise cannot slip past requestDraw and two finalises cannot both take the last place; the status guard of
// migration 0005 reads the break FOR SHARE behind that lock. No command here touches Storage (Task 6 moves files).

const CAP = `A break can have up to ${MAX_PHOTOS} photos.`;
const SLOT = "Pick one of this break's prizes, or no tag.";
const ALT = `Describe the photo in 1 to ${ALT_MAX} characters.`;
const STALE = "The photos just changed. Try again.";
const PHOTO_NOT_FOUND = "Photo not found";
/** The largest variant's long edge: a recorded photo's width and height are of that variant. */
const MAX_SIDE = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
const FROZEN = ["drawing", "drawn", "cancelled"];

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
 * Renumbers the break's placed photos to 0..n−1 (ruling 5): every position first to a distinct negative, clear of
 * 0..7, then to its final place, so the live unique index (not deferrable) never sees a duplicate mid-update. With
 * `order` the photos take its order (ids already checked against the placed rows); without, the old order with the
 * gap closed.
 */
async function compact(tx: Tx, breakId: string, order?: readonly string[]): Promise<void> {
  const live = sql`break_id = ${breakId}::uuid and removed_at is null and hidden_at is null`;
  await tx.execute(sql`update break_photos set position = -1 - position where ${live}`);
  await tx.execute(order
    // postgres-js with prepare:false cannot bind a JS array inside raw SQL: a uuid[] literal, of checked ids only.
    ? sql`update break_photos set position = array_position(${`{${order.join(",")}}`}::uuid[], id) - 1 where ${live}`
    // Old 0 is now -1, the highest: descending order is the old order.
    : sql`update break_photos bp set position = o.rn - 1
          from (select id, row_number() over (order by position desc) as rn from break_photos where ${live}) o
          where bp.id = o.id`);
}

/** Once a line was ever claimed, a change that counts (§6) sets the break's notice in the same transaction. */
async function noteChange(tx: Tx, b: BreakRow, changes: readonly PhotoChange[], now: Date): Promise<void> {
  if (b.firstClaimedAt === null || noticeFor(changes, () => "") === null) return;
  const rows = await tx.select({ slotKey: prizes.slotKey, rank: prizes.rank, itemName: sql<string>`coalesce(${breakItems.name}, '')` })
    .from(prizes).leftJoin(breakItems, eq(breakItems.id, prizes.itemId)).where(eq(prizes.breakId, b.id));
  const sentence = noticeFor(changes, placeWords(rows));
  if (sentence === null) return;
  await tx.update(breaks).set({ photosUpdatedAt: now, photosUpdatedNote: sentence }).where(eq(breaks.id, b.id));
}

type PhotoRow = typeof breakPhotos.$inferSelect;
type LivePhoto = PhotoRow & { path: string; bucket: "photos-draft" | "photos" };

/**
 * Finds a live photo for its break's host (or an admin): the break row is locked before the photo row is read for
 * update. A removed, hidden or expired photo is not found.
 */
async function lockPhoto(tx: Tx, caller: Caller, photoId: string): Promise<{ b: BreakRow; row: LivePhoto }> {
  if (typeof photoId !== "string" || !isUuid(photoId)) throw new NotFound(PHOTO_NOT_FOUND);
  const [ref] = await tx.select({ breakId: breakPhotos.breakId }).from(breakPhotos).where(eq(breakPhotos.id, photoId));
  if (!ref) throw new NotFound(PHOTO_NOT_FOUND);
  const b = await assertHostOf(tx, caller, ref.breakId);
  const [row] = await tx.select().from(breakPhotos)
    .where(sql`${breakPhotos.id} = ${photoId} and ${placed} and ${breakPhotos.path} is not null and ${breakPhotos.bucket} <> 'photo-archive'`)
    .for("update");
  if (!row) throw new NotFound(PHOTO_NOT_FOUND);
  return { b, row: row as LivePhoto };
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

/**
 * Removes a live photo (spec §6). Before any line was ever claimed the row goes; after, it is kept as removed and
 * moves to `photo-archive` (its files must be there before this commits, ruling 24), for the break's holders.
 */
export async function removePhoto(tx: Tx, caller: Caller, p: { photoId: string; now: Date }): Promise<{ prefix: string; from: PhotoLocation; archive: boolean }> {
  assertOnboarded(caller);
  const { b, row } = await lockPhoto(tx, caller, p.photoId);
  assertEditable(b);
  const before = await placedRows(tx, b.id);
  const archive = b.firstClaimedAt !== null;
  if (archive) await tx.update(breakPhotos).set({ removedAt: p.now, bucket: "photo-archive" }).where(eq(breakPhotos.id, row.id));
  else await tx.delete(breakPhotos).where(eq(breakPhotos.id, row.id));
  await compact(tx, b.id);
  const wasLead = row.position === 0;
  await appendEvent(tx, {
    breakId: b.id, actorId: caller.id, type: "photo.removed",
    payload: { photoId: row.id, position: row.position, slot: row.prizeSlot, wasLead, archived: archive, previousLead: before[0]?.id ?? null },
  }, { processedAt: p.now });
  // Ruling 1: the lead's removal is a new lead only when another photo takes position 0.
  const changes: PhotoChange[] = [{ kind: "removed", slot: row.prizeSlot, wasLead }];
  if (wasLead && before.length > 1) changes.push({ kind: "lead" });
  await noteChange(tx, b, changes, p.now);
  return { prefix: row.path, from: row.bucket, archive };
}

/** Puts the live photos in `order` (the lead is order[0]); `order` must be exactly the live photos. */
export async function reorderPhotos(tx: Tx, caller: Caller, p: { breakId: string; order: string[]; now: Date }): Promise<void> {
  assertOnboarded(caller);
  if (typeof p.breakId !== "string" || !isUuid(p.breakId)) throw new NotFound("Break not found");
  const b = await assertHostOf(tx, caller, p.breakId);
  assertEditable(b);
  const ids = (await placedRows(tx, b.id)).map((r) => r.id);
  const order = p.order;
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== order.length || !order.every((id) => ids.includes(id))) {
    throw new InvalidInput(STALE);
  }
  if (order.every((id, i) => id === ids[i])) return;
  await compact(tx, b.id, order);
  const previousLead = ids[0];
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "photo.reordered", payload: { order, previousLead } }, { processedAt: p.now });
  await noteChange(tx, b, [{ kind: order[0] === previousLead ? "reordered" : "lead" }], p.now);
}

/** Tags a live photo with one of this break's prizes, or with none. */
export async function retagPhoto(tx: Tx, caller: Caller, p: { photoId: string; slot: string | null; now: Date }): Promise<void> {
  assertOnboarded(caller);
  const { b, row } = await lockPhoto(tx, caller, p.photoId);
  assertEditable(b);
  const to = await slotOf(tx, b.id, p.slot);
  const from = row.prizeSlot;
  if (to === from) return;
  await tx.update(breakPhotos).set({ prizeSlot: to }).where(eq(breakPhotos.id, row.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "photo.retagged", payload: { photoId: row.id, from, to } }, { processedAt: p.now });
  await noteChange(tx, b, [{ kind: "retagged", from, to }], p.now);
}

/** Sets a live photo's alt text (no event: describing is not in the spec's audit list). */
export async function describePhoto(tx: Tx, caller: Caller, p: { photoId: string; alt: string }): Promise<void> {
  assertOnboarded(caller);
  const { b, row } = await lockPhoto(tx, caller, p.photoId);
  assertEditable(b);
  await tx.update(breakPhotos).set({ alt: parseAlt(p.alt) }).where(eq(breakPhotos.id, row.id));
}

/**
 * Hides a photo from everyone (spec §10): admins and SYSTEM, at any status, live or removed. On a frozen break it
 * runs under allowPhotoModeration (ruling 10), which lets only the hide, the renumber and the bucket move through.
 * Moderation is not the host's change, so the notice is never set. Hiding twice writes nothing.
 */
export async function hidePhoto(tx: Tx, caller: Caller, p: { photoId: string; reason: string; now: Date }): Promise<{ prefix: string | null; from: PhotoLocation }> {
  assertAdmin(caller);
  const reason = typeof p.reason === "string" ? p.reason.trim() : "";
  if (reason.length < 1 || [...reason].length > 500) throw new InvalidInput("Give a reason for hiding the photo.");
  if (typeof p.photoId !== "string" || !isUuid(p.photoId)) throw new NotFound(PHOTO_NOT_FOUND);
  const [ref] = await tx.select({ breakId: breakPhotos.breakId }).from(breakPhotos).where(eq(breakPhotos.id, p.photoId));
  if (!ref) throw new NotFound(PHOTO_NOT_FOUND);
  const b = await lockBreak(tx, ref.breakId);
  const [row] = await tx.select().from(breakPhotos).where(eq(breakPhotos.id, p.photoId)).for("update");
  const result = { prefix: row.path, from: row.bucket };
  if (row.hiddenAt !== null) return result;
  if (FROZEN.includes(b.status)) await allowPhotoModeration(tx);
  const before = await placedRows(tx, b.id);
  const wasPlaced = row.removedAt === null;
  await tx.update(breakPhotos).set({ hiddenAt: p.now, bucket: "photo-archive" }).where(eq(breakPhotos.id, row.id));
  if (wasPlaced) await compact(tx, b.id);
  await appendEvent(tx, {
    breakId: b.id, actorId: caller.id, type: "photo.hidden",
    payload: { photoId: row.id, reason, slot: row.prizeSlot, position: wasPlaced ? row.position : null, previousLead: before[0]?.id ?? null },
  }, { processedAt: p.now });
  return result;
}

/**
 * Records that a holder saw the break's latest photo change (spec §4, §6). Any caller may fire it; it writes only for
 * someone who holds a line, and only when their last view is older than the change. No break lock: a holder's page
 * view must not queue behind claims.
 */
export async function markPhotoNoticeSeen(tx: Tx, caller: Caller, p: { breakId: string; now: Date }): Promise<void> {
  if (typeof p.breakId !== "string" || !isUuid(p.breakId)) return;
  const [b] = await tx.select({ at: breaks.photosUpdatedAt }).from(breaks).where(eq(breaks.id, p.breakId));
  if (!b?.at) return;
  const [held] = await tx.select({ n: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${p.breakId} and ${lines.ownerId} = ${caller.id}`).limit(1);
  if (!held) return;
  await tx.insert(photoNoticesSeen).values({ userId: caller.id, breakId: p.breakId, seenAt: p.now })
    .onConflictDoUpdate({
      target: [photoNoticesSeen.userId, photoNoticesSeen.breakId], set: { seenAt: p.now },
      setWhere: sql`${photoNoticesSeen.seenAt} < (select photos_updated_at from breaks where id = ${p.breakId}::uuid)`,
    });
}
