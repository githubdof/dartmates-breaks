import { eq } from "drizzle-orm";
import { inTransaction, type TxRunner } from "@/db/client";
import { breakPhotos } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { lockBreak } from "@/auth/authz";
import { NotFound } from "@/domain/errors";
import { appendEvent } from "@/domain/events";
import { hidePhoto } from "@/domain/photos/commands";
import { dropPhotoFiles } from "@/domain/photos/retention";
import { SYSTEM } from "@/domain/types";
import { isUuid } from "@/lib/is-uuid";
import { BUCKETS, VARIANT_WIDTHS, variantPath } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { PHOTO_BUCKETS, copyVariants, heldUnder, removeVariants } from "./variants";

// The admin's hide (photos spec §10), run by scripts/hide-photo.ts. No Storage call runs inside a transaction (ruling
// 28): the archive copy is made before the hide commits, and the other copies go after it.

export type HideArgs = { photoId: string; reason: string; purge: boolean };
export type HideOutcome = { status: "hidden" | "already-hidden" | "purged"; breakId: string };

/** `<photo id> <reason> [--purge]`, the flag anywhere; the reason is one argument (quote it). */
export function parseHideArgs(argv: readonly string[]): HideArgs | { error: string } {
  const flags = argv.filter((a) => a.startsWith("--"));
  const words = argv.filter((a) => !a.startsWith("--"));
  const unknown = flags.find((f) => f !== "--purge");
  if (unknown !== undefined) return { error: `Unknown option ${unknown}.` };
  if (words.length !== 2) return { error: "Give a photo id and a reason, and nothing else (quote a reason of several words)." };
  const [photoId, reason] = [words[0], words[1].trim()];
  if (!isUuid(photoId)) return { error: `Not a photo id: ${photoId}` };
  if (reason.length === 0) return { error: "Give a reason." };
  return { photoId, reason, purge: flags.includes("--purge") };
}

/**
 * Hides a photo from everyone, and with `purge` deletes every copy of its files (photos spec §10):
 * 1. a photo not yet hidden gets its variants copied to `photo-archive` (those not already there), then the hide
 *    commits (`hidePhoto` as SYSTEM, with its `photo.hidden` event), then its files leave the bucket it was in, unless
 *    that bucket is `photo-archive`: a photo removed after a claim keeps its only copy there (ruling 27);
 * 2. with `purge`, the variants go from every bucket, then the row loses its path and `photo.purged` is written.
 * Throws NotFound for an unknown id.
 */
export async function hidePhotoAndFiles(storage: PhotoStorage, p: HideArgs & { now: Date }, run: TxRunner = inTransaction): Promise<HideOutcome> {
  if (!isUuid(p.photoId)) throw new NotFound("Photo not found");
  const [row] = await run((tx) => tx.select({ path: breakPhotos.path, bucket: breakPhotos.bucket, hiddenAt: breakPhotos.hiddenAt, breakId: breakPhotos.breakId })
    .from(breakPhotos).where(eq(breakPhotos.id, p.photoId)));
  if (!row) throw new NotFound("Photo not found");
  const breakId = row.breakId;
  if (row.hiddenAt !== null && !p.purge) return { status: "already-hidden", breakId };

  if (row.hiddenAt === null) {
    if (row.path !== null) await copyToArchive(storage, row.path, row.bucket);
    const { prefix, from } = await run((tx) => hidePhoto(tx, SYSTEM, { photoId: p.photoId, reason: p.reason, now: p.now }));
    if (prefix !== null && from !== BUCKETS.archive) await removeVariants(storage, from, prefix);
  }
  if (!p.purge) return { status: "hidden", breakId };

  let buckets: string[] = [];
  if (row.path !== null) {
    const prefix = row.path;
    const held = await heldUnder(storage, breakId);
    buckets = PHOTO_BUCKETS.filter((b) => VARIANT_WIDTHS.some((w) => held.get(b)!.has(variantPath(prefix, w))));
    // The one deliberate removal from photo-archive: content that must not be kept.
    for (const b of Object.values(BUCKETS)) await removeVariants(storage, b, prefix);
  }
  await run(async (tx) => {
    await lockBreak(tx, breakId);
    await allowPhotoModeration(tx);
    await dropPhotoFiles(tx, [p.photoId]);
    await appendEvent(tx, { breakId, actorId: SYSTEM.id, type: "photo.purged", payload: { photoId: p.photoId, reason: p.reason, buckets } }, { processedAt: p.now });
  });
  return { status: "purged", breakId };
}

/**
 * Copies each variant `photo-archive` lacks, from the photo's bucket or, failing that, from any bucket that holds it.
 * A variant no bucket holds (an archive copy lost to a race in the removal) has nothing to copy, and is skipped.
 */
async function copyToArchive(storage: PhotoStorage, prefix: string, from: (typeof PHOTO_BUCKETS)[number]): Promise<void> {
  const held = await heldUnder(storage, prefix.slice(0, prefix.indexOf("/")));
  for (const w of VARIANT_WIDTHS) {
    const path = variantPath(prefix, w);
    if (held.get(BUCKETS.archive)!.has(path)) continue;
    const source = [from, ...PHOTO_BUCKETS].find((b) => b !== BUCKETS.archive && held.get(b)!.has(path));
    if (source !== undefined) await copyVariants(storage, prefix, source, BUCKETS.archive, [w]);
  }
}
