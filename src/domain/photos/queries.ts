import { sql, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakPhotos as photoRows, photoNoticesSeen } from "@/db/schema";
import type { PhotoLocation } from "./types";

/** A live photo: the lead is position 0. `prefix` names its variants in `location`. */
export type PhotoView = { id: string; position: number; slot: string | null; alt: string; width: number; height: number; location: PhotoLocation; prefix: string };
/** A photo removed after the first claim, kept for the break's host and holders; prefix null once the archive dropped it. */
export type RemovedPhotoView = { id: string; slot: string | null; alt: string; width: number; height: number; removedAt: Date; location: "photo-archive"; prefix: string | null };
export type BreakPhotos = { live: PhotoView[]; removed: RemovedPhotoView[]; notice: { text: string; at: Date } | null; unseen: boolean };

type Row = typeof photoRows.$inferSelect;
const view = (r: Row): PhotoView => ({
  id: r.id, position: r.position, slot: r.prizeSlot, alt: r.alt, width: r.width, height: r.height, location: r.bucket, prefix: r.path as string,
});

/**
 * A break's photos as `viewer` may see them (photos spec §5.5, §6, decision 14). Live photos, in order: everyone, but
 * a draft's, and any row still in photos-draft, only for its host and admins. Removed photos: the host, holders and admins, never strangers. Hidden
 * photos: nobody. A row whose files expired (photo-archive, no path, neither removed nor hidden; ruling 26) is
 * neither live nor removed. The notice is everyone's; `unseen` is a holder's who has not seen the latest change.
 */
export async function breakPhotos(tx: Tx, breakId: string, viewer: { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null): Promise<BreakPhotos> {
  const [b] = await tx.select({ status: breaks.status, at: breaks.photosUpdatedAt, note: breaks.photosUpdatedNote }).from(breaks).where(eq(breaks.id, breakId));
  if (!b) return { live: [], removed: [], notice: null, unseen: false };
  const privileged = !!viewer && (viewer.isHost || viewer.isAdmin);
  const seesLive = b.status !== "draft" || privileged;
  const seesRemoved = privileged || !!viewer?.isHolder;
  // Everyone but the host and admins gets the public bucket only, as leadPhotos does: a row still in photos-draft on
  // an open break (a step that slipped) never reaches them.
  const liveBucket = privileged ? sql`${photoRows.bucket} in ('photos-draft', 'photos')` : sql`${photoRows.bucket} = 'photos'`;
  const rows = await tx.select().from(photoRows).where(sql`${photoRows.breakId} = ${breakId} and ${photoRows.hiddenAt} is null
      and ((${photoRows.removedAt} is null and ${photoRows.path} is not null and ${liveBucket} and ${seesLive}::boolean)
        or (${photoRows.removedAt} is not null and ${seesRemoved}::boolean))`)
    .orderBy(sql`${photoRows.removedAt} nulls first`, photoRows.position);
  const notice = b.at && b.note ? { text: b.note, at: b.at } : null;
  let unseen = false;
  if (notice && viewer?.isHolder) {
    const [s] = await tx.select({ seenAt: photoNoticesSeen.seenAt }).from(photoNoticesSeen)
      .where(sql`${photoNoticesSeen.userId} = ${viewer.id} and ${photoNoticesSeen.breakId} = ${breakId}`);
    unseen = !s || s.seenAt < notice.at;
  }
  const live: PhotoView[] = [];
  const removed: RemovedPhotoView[] = [];
  for (const r of rows) {
    if (r.removedAt === null) live.push(view(r));
    else removed.push({ id: r.id, slot: r.prizeSlot, alt: r.alt, width: r.width, height: r.height, removedAt: r.removedAt, location: "photo-archive", prefix: r.path });
  }
  return { live, removed, notice, unseen };
}

/**
 * Each break's lead photo (live, position 0) from the public bucket only: for the feed, /me, /host, the host profile
 * and the link preview, which never show a draft, removed, hidden or expired photo. Breaks without one are absent.
 */
export async function leadPhotos(tx: Tx, breakIds: readonly string[]): Promise<Map<string, PhotoView>> {
  const out = new Map<string, PhotoView>();
  if (breakIds.length === 0) return out;
  const rows = await tx.select().from(photoRows).where(sql`${inArray(photoRows.breakId, [...breakIds])} and ${photoRows.position} = 0
      and ${photoRows.removedAt} is null and ${photoRows.hiddenAt} is null and ${photoRows.path} is not null and ${photoRows.bucket} = 'photos'`);
  for (const r of rows) out.set(r.breakId, view(r));
  return out;
}
