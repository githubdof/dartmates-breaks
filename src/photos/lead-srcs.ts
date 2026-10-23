import type { PhotoView } from "@/domain/photos/queries";
import type { VariantWidth } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { photoSrc, type PhotoSrc } from "./urls";

/**
 * Lead photos (from `leadPhotos`) as URLs for the card surfaces: the feed, the landing page, the host profile and
 * /host. These are public by construction, so a view outside the public bucket is a bug and throws.
 */
export async function leadSrcs(storage: PhotoStorage, leads: ReadonlyMap<string, PhotoView>, size: VariantWidth): Promise<Map<string, PhotoSrc>> {
  const out = new Map<string, PhotoSrc>();
  for (const [breakId, v] of leads) {
    if (v.location !== "photos") throw new Error("lead photos are public only");
    out.set(breakId, await photoSrc(storage, v, size));
  }
  return out;
}
