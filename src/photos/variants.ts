import { randomBytes } from "node:crypto";
import { BUCKETS, VARIANT_WIDTHS, variantPath, type BucketName, type VariantWidth } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import type { Processed } from "./process";

// The only code that writes, copies or removes a photo's variants (plan ruling 11); Tasks 10 and 11 reuse it.

/** The buckets a photo's variants live in (`incoming` holds uploads only). */
export const PHOTO_BUCKETS = [BUCKETS.public, BUCKETS.draft, BUCKETS.archive] as const;

/** A new photo's storage prefix: the break id and 128 random bits, url-safe (photos spec §5.3, `PREFIX_PATTERN`). */
export function newPhotoPrefix(breakId: string): string {
  return `${breakId}/${randomBytes(16).toString("base64url")}`;
}

/** Waits for every operation, then throws the first failure: a caller cleaning up never races a write still in flight. */
async function settled(ops: Promise<void>[]): Promise<void> {
  const failed = (await Promise.allSettled(ops)).find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

/** Writes the three re-encoded variants of one photo into `bucket`. */
export async function putVariants(s: PhotoStorage, bucket: BucketName, prefix: string, variants: Processed["variants"]): Promise<void> {
  await settled(variants.map((v) => s.put(bucket, variantPath(prefix, v.width), v.body, "image/webp")));
}

/** Copies one photo's variants (all three unless `widths` says) from one bucket to another (idempotent: an existing
 *  copy is re-put). */
export async function copyVariants(s: PhotoStorage, prefix: string, from: BucketName, to: BucketName, widths: readonly VariantWidth[] = VARIANT_WIDTHS): Promise<void> {
  await settled(widths.map((w) => s.copy({ bucket: from, path: variantPath(prefix, w) }, { bucket: to, path: variantPath(prefix, w) })));
}

/** Removes one photo's variants (all three unless `widths` says) from `bucket`, in one call; missing ones are not an
 *  error. */
export async function removeVariants(s: PhotoStorage, bucket: BucketName, prefix: string, widths: readonly VariantWidth[] = VARIANT_WIDTHS): Promise<void> {
  await s.remove(bucket, widths.map((w) => variantPath(prefix, w)));
}

/** Every object each photo bucket holds under one break's folder now, by full path. */
export async function heldUnder(s: PhotoStorage, breakId: string): Promise<Map<BucketName, Set<string>>> {
  const out = new Map<BucketName, Set<string>>();
  for (const b of PHOTO_BUCKETS) out.set(b, new Set((await s.list(b, breakId)).map((o) => o.name)));
  return out;
}
