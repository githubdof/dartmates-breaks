import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breakPhotos } from "@/db/schema";
import { appendEvent } from "@/domain/events";

// Row changes for when a photo's files go for good (photos spec §5.6, §6, §10). Both expect the caller to have locked
// the break and called allowPhotoModeration(tx) (ruling 10); the caller removes the files after the commit.

/** A uuid[] literal: postgres-js with prepare:false cannot bind a JS array inside raw SQL. Ids only. */
const uuids = (ids: readonly string[]) => `{${ids.join(",")}}`;

/**
 * Sets `path` to null on these rows, those already in `photo-archive` only: the row stays (a Removed mark with no
 * image, spec §6) and nothing names the files any more. Used by archive retention and the purge.
 */
export async function dropPhotoFiles(tx: Tx, photoIds: readonly string[]): Promise<void> {
  if (photoIds.length === 0) return;
  await tx.update(breakPhotos).set({ path: null })
    .where(sql`${breakPhotos.id} = any(${uuids(photoIds)}::uuid[]) and ${breakPhotos.bucket} = 'photo-archive' and ${breakPhotos.path} is not null`);
}

/**
 * Expires a cancelled break's photos (ruling 26): every row of the break that still has a path, live ones included,
 * moves to `photo-archive` with no path, and one audit-only `photo.expired` event records them. Returns what changed,
 * so the caller removes those prefixes' files; nothing to expire writes nothing.
 */
export async function expirePhotos(tx: Tx, breakId: string, now: Date): Promise<{ photoIds: string[]; prefixes: string[] }> {
  const rows = await tx.select({ id: breakPhotos.id, path: breakPhotos.path }).from(breakPhotos)
    .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.path} is not null`).orderBy(breakPhotos.id).for("update");
  if (rows.length === 0) return { photoIds: [], prefixes: [] };
  const photoIds = rows.map((r) => r.id);
  await tx.update(breakPhotos).set({ bucket: "photo-archive", path: null }).where(sql`${breakPhotos.id} = any(${uuids(photoIds)}::uuid[])`);
  await appendEvent(tx, { breakId, type: "photo.expired", payload: { photoIds, reason: "retention" } }, { processedAt: now });
  return { photoIds, prefixes: [...new Set(rows.map((r) => r.path as string))] };
}
