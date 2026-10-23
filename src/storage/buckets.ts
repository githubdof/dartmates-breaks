import { env } from "@/lib/env";

/** The four photo buckets (photos spec §5.5). */
export const BUCKETS = { incoming: "incoming", draft: "photos-draft", public: "photos", archive: "photo-archive" } as const;
/** A photo bucket's name (photos spec §5.5). */
export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/** The widths every photo is re-encoded to (photos spec §5.3). */
export const VARIANT_WIDTHS = [160, 640, 1600] as const;
/** One of the variant widths (photos spec §5.3). */
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/** A photo's storage prefix is `${breakId}/${random}`, 22 url-safe base64 characters, 128 bits (photos spec §5.3). */
export const PREFIX_PATTERN = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{22}$/;

/** A variant's path in any bucket, `${prefix}-${w}.webp`; refuses anything but a photo prefix (photos spec §5.3). */
export function variantPath(prefix: string, w: VariantWidth): string {
  if (!PREFIX_PATTERN.test(prefix)) throw new Error("not a photo prefix");
  return `${prefix}-${w}.webp`;
}

/** A variant's public URL, from the `photos` bucket only (photos spec §5.5). */
export function publicVariantUrl(prefix: string, w: VariantWidth): string {
  return `${env().SUPABASE_URL}/storage/v1/object/public/${BUCKETS.public}/${variantPath(prefix, w)}`;
}

/** A bucket's settings, as Storage takes them (photos spec §5.5). */
export type BucketSettings = { public: boolean; fileSizeLimit: number; allowedMimeTypes: readonly string[] };

/** One mebibyte (photos spec §5.5's "5 MB" is 5 MiB, as Storage counts it). */
export const MIB = 1024 * 1024;

/** Each bucket's settings; supabase/config.toml and scripts/create-buckets.ts follow these (photos spec §5.5). Only
 *  `incoming` takes camera formats; the other three hold server re-encoded WebP variants only. */
export const BUCKET_SETTINGS: Record<BucketName, BucketSettings> = {
  incoming: { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  "photos-draft": { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] },
  photos: { public: true, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] },
  "photo-archive": { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] },
};
