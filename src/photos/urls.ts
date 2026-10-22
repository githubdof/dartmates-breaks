import { BUCKETS, VARIANT_WIDTHS, publicVariantUrl, variantPath, type VariantWidth } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import type { PhotoLocation } from "@/domain/photos/types";

/** What an `<img>` needs for one photo: `src` at the asked size, a `srcset` over the variants (photos spec §5.5). */
export type PhotoSrc = { src: string; srcSet: string; width: number; height: number; alt: string };

/** A private photo's read URLs live 10 minutes (photos spec §5.5, §6). */
export const SIGNED_READ_SECONDS = 600;

/**
 * The variants worth listing, with their real widths. `width`/`height` are the largest variant's size; a variant
 * labelled `w` is `min(w, L)` on its long edge (no upscaling, ruling 4), so its real width is
 * `round(width × min(w, L) / L)`. A variant as wide as the one before it is the same picture and is skipped.
 */
function listed(width: number, height: number): { label: VariantWidth; real: number }[] {
  const long = Math.max(width, height);
  const out: { label: VariantWidth; real: number }[] = [];
  for (const label of VARIANT_WIDTHS) {
    const real = Math.round((width * Math.min(label, long)) / long);
    if (out.length > 0 && out[out.length - 1].real === real) continue;
    out.push({ label, real });
  }
  return out;
}

/**
 * A photo's URLs: plain public URLs in `photos`; anywhere else (a draft, the archive) URLs signed for 10 minutes,
 * one per variant used, signed in parallel. A private photo never gets a public URL.
 */
export async function photoSrc(
  storage: PhotoStorage,
  v: { location: PhotoLocation; prefix: string; width: number; height: number; alt: string },
  size: VariantWidth,
): Promise<PhotoSrc> {
  const variants = listed(v.width, v.height);
  const needed = VARIANT_WIDTHS.filter((w) => w === size || variants.some((x) => x.label === w));
  const urls = new Map<VariantWidth, string>(
    v.location === BUCKETS.public
      ? needed.map((w) => [w, publicVariantUrl(v.prefix, w)])
      : await Promise.all(needed.map(async (w) => [w, await storage.signedReadUrl(v.location, variantPath(v.prefix, w), SIGNED_READ_SECONDS)] as const)),
  );
  return {
    src: urls.get(size)!,
    srcSet: variants.map((x) => `${urls.get(x.label)} ${x.real}w`).join(", "),
    width: v.width,
    height: v.height,
    alt: v.alt,
  };
}
