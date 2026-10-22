import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakPhotos, photoUploads } from "@/db/schema";
import { assertOnboarded } from "@/auth/authz";
import { UploadNotFound } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { isUuid } from "@/lib/is-uuid";
import type { PhotoLocation } from "./types";

// Unlocked reads the photo pipeline makes before or after a Storage call (plan ruling 28: no Storage call runs inside
// a transaction or under a break lock). Each is a hint for which files to touch; the commands re-check under the lock.

/**
 * The caller's own upload, read without a lock. Missing, or another user's (an admin's included: an upload is
 * personal), reads as UploadNotFound. Expired and used uploads are reported, never refused, so the finalise route can
 * still remove the caller's own incoming file.
 */
export async function peekUploadTicket(tx: Tx, caller: Caller, p: { ticketId: string; now: Date }): Promise<{
  breakId: string; incomingName: string; expired: boolean; consumed: boolean; breakStatus: string;
}> {
  assertOnboarded(caller);
  if (typeof p.ticketId !== "string" || !isUuid(p.ticketId)) throw new UploadNotFound();
  const [row] = await tx.select({
    hostId: photoUploads.hostId, breakId: photoUploads.breakId, incomingName: photoUploads.incomingName,
    expiresAt: photoUploads.expiresAt, consumedAt: photoUploads.consumedAt, status: breaks.status,
  }).from(photoUploads).innerJoin(breaks, eq(breaks.id, photoUploads.breakId)).where(eq(photoUploads.id, p.ticketId));
  if (!row || row.hostId !== caller.id) throw new UploadNotFound();
  return {
    breakId: row.breakId,
    incomingName: row.incomingName,
    expired: p.now.getTime() >= row.expiresAt.getTime(),
    consumed: row.consumedAt !== null,
    breakStatus: row.status,
  };
}

/**
 * A photo row and its break, read without a lock: `live` is placed (not removed, not hidden) with its files in
 * `photos-draft` or `photos`; `claimed` is whether any line of the break was ever claimed. Null when no such row.
 * `prefix` is null only once every copy is gone (never for a live photo).
 */
export async function peekPhoto(tx: Tx, photoId: string): Promise<{
  breakId: string; hostId: string; prefix: string | null; location: PhotoLocation; live: boolean; claimed: boolean;
} | null> {
  if (typeof photoId !== "string" || !isUuid(photoId)) return null;
  const [row] = await tx.select({
    breakId: breakPhotos.breakId, hostId: breaks.hostId, prefix: breakPhotos.path, location: breakPhotos.bucket,
    removedAt: breakPhotos.removedAt, hiddenAt: breakPhotos.hiddenAt, firstClaimedAt: breaks.firstClaimedAt,
  }).from(breakPhotos).innerJoin(breaks, eq(breaks.id, breakPhotos.breakId)).where(eq(breakPhotos.id, photoId));
  if (!row) return null;
  return {
    breakId: row.breakId,
    hostId: row.hostId,
    prefix: row.prefix,
    location: row.location,
    live: row.removedAt === null && row.hiddenAt === null && row.prefix !== null && row.location !== "photo-archive",
    claimed: row.firstClaimedAt !== null,
  };
}

/** The break's status, or null for a missing or deleted break. */
export async function peekBreakStatus(tx: Tx, breakId: string): Promise<string | null> {
  if (typeof breakId !== "string" || !isUuid(breakId)) return null;
  const [row] = await tx.select({ status: breaks.status, deletedAt: breaks.deletedAt }).from(breaks).where(eq(breaks.id, breakId));
  return row && row.deletedAt === null ? row.status : null;
}

/**
 * Deletes the caller's own unused upload (its signed URL could not be made). No break lock: one row, and deleting
 * only lowers the count the cap reads.
 */
export async function dropUploadTicket(tx: Tx, caller: Caller, ticketId: string): Promise<void> {
  if (typeof ticketId !== "string" || !isUuid(ticketId)) return;
  await tx.delete(photoUploads)
    .where(and(eq(photoUploads.id, ticketId), eq(photoUploads.hostId, caller.id), isNull(photoUploads.consumedAt)));
}
