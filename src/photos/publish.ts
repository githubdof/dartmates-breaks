import { sql } from "drizzle-orm";
import { db, inTransaction, type Tx } from "@/db/client";
import { deleteIfSafe } from "@/jobs/photo-cleanup";
import { breaks, breakPhotos } from "@/db/schema";
import { PhotosNotReady } from "@/domain/errors";
import { peekBreakStatus } from "@/domain/photos/peek";
import type { Caller } from "@/domain/types";
import type { ActionFailure } from "@/lib/action-result";
import { BUCKETS } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { copyVariants } from "./variants";

// Opening a break publishes its draft photos (photos spec §5.4): their variants are copied from `photos-draft` to
// `photos` before the open transaction (no Storage call under the break lock, plan ruling 28), openBreak moves the
// rows to `photos`, and the draft originals go only once the open is known to have committed.

const log = (what: string) => (e: unknown) => console.error(`publish: ${what}`, e);

const livePhotos = (breakId: string) =>
  sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`;

/**
 * Copies every live draft photo of the caller's draft to `photos` and returns their ids and prefixes. Reads in its own
 * short transaction, then copies with it committed. Anyone but the host (or an admin), or a break that is not a
 * draft, gets nothing, so openBreak gives its own refusal. A failed copy removes what was copied and throws
 * PhotosNotReady.
 */
export async function publishDraftPhotos(s: PhotoStorage, caller: Caller, breakId: string): Promise<{ ids: ReadonlySet<string>; prefixes: readonly string[] }> {
  const rows = await db.transaction(async (tx) => {
    const [b] = await tx.select({ hostId: breaks.hostId, status: breaks.status, deletedAt: breaks.deletedAt }).from(breaks)
      .where(sql`${breaks.id} = ${breakId}`);
    if (!b || b.deletedAt !== null || b.status !== "draft") return [];
    if (caller.banned || !caller.onboarded || (b.hostId !== caller.id && caller.role !== "admin")) return [];
    return tx.select({ id: breakPhotos.id, prefix: breakPhotos.path }).from(breakPhotos)
      .where(sql`${livePhotos(breakId)} and ${breakPhotos.bucket} = 'photos-draft' and ${breakPhotos.path} is not null`);
  });
  const photos = rows.flatMap((r) => (r.prefix === null ? [] : [{ id: r.id, prefix: r.prefix }]));
  const prefixes = photos.map((p) => p.prefix);
  const copies = await Promise.allSettled(prefixes.map((p) => copyVariants(s, p, BUCKETS.draft, BUCKETS.public)));
  const failed = copies.find((c) => c.status === "rejected");
  if (failed) {
    log("copying to photos")(failed.reason);
    await dropUnusedPublicCopies(s, prefixes);
    throw new PhotosNotReady();
  }
  return { ids: new Set(photos.map((p) => p.id)), prefixes };
}

/**
 * Inside the open transaction, after the break is locked: a live draft photo that was not copied (a finalise landed
 * between the copy and the lock) refuses the open with PhotosNotReady.
 */
export async function assertPhotosPublished(tx: Tx, breakId: string, copied: ReadonlySet<string>): Promise<void> {
  const rows = await tx.select({ id: breakPhotos.id }).from(breakPhotos)
    .where(sql`${livePhotos(breakId)} and ${breakPhotos.bucket} = 'photos-draft'`);
  if (rows.some((r) => !copied.has(r.id))) throw new PhotosNotReady();
}

/**
 * After the open transaction returns; resolves true when the open is known to have committed. No failure: the draft
 * originals go. A refusal (the transaction rolled back): the `photos` copies go. INTERNAL (the commit may have
 * landed): the break's status is re-read; still a draft (or gone), the `photos` copies go; anything else, the open
 * committed and the draft originals go; the re-read failing, nothing goes. Every removal goes through the cleanup
 * job's gate (deleteIfSafe), never unconditionally: a second open of the same draft shares these object keys, and a
 * refused one may have removed the `photos` copies just before this open committed; the gate then copies them back
 * from the draft originals and keeps those. Every removal logs and swallows its error (Task 11's cleanup is the
 * backstop).
 */
export async function settleOpenCopies(s: PhotoStorage, breakId: string, prefixes: readonly string[], failure: ActionFailure | null): Promise<boolean> {
  const dropDraftOriginals = () =>
    Promise.all(prefixes.map((p) => deleteIfSafe(s, inTransaction, BUCKETS.draft, p).catch(log("removing draft originals"))));
  if (failure === null) {
    await dropDraftOriginals();
    return true;
  }
  if (failure.code !== "INTERNAL") {
    await dropUnusedPublicCopies(s, prefixes);
    return false;
  }
  let status: string | null;
  try {
    status = await db.transaction((tx) => peekBreakStatus(tx, breakId));
  } catch (e) {
    log("re-reading the break")(e);
    return false;
  }
  if (status === null || status === "draft") {
    await dropUnusedPublicCopies(s, prefixes);
    return false;
  }
  await dropDraftOriginals();
  return true;
}

/**
 * Removes the `photos` copies of `prefixes` through the cleanup gate (deleteIfSafe), which re-reads each prefix's rows
 * in a fresh transaction. A refused open is usually a rolled-back one, but a second open of the same draft (a double
 * click, two tabs) can have committed in between: its rows name these copies, so they stay. The re-read failing
 * removes nothing.
 */
async function dropUnusedPublicCopies(s: PhotoStorage, prefixes: readonly string[]): Promise<void> {
  await Promise.all(prefixes.map((p) => deleteIfSafe(s, inTransaction, BUCKETS.public, p).catch(log("removing photos copies"))));
}
