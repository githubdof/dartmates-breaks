import type { BreakPhotos } from "@/domain/photos/queries";
import { attachPlates, type PlateData, type PrizePlace, type PrizesBlockNotice, type RemovedPlate, type placeRows } from "@/components/photos/prizes-model";
import type { ViewerPhoto } from "@/components/photos/viewer-model";
import { formatDateTime, formatShortDate } from "@/lib/time";
import { BUCKETS } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { photoSrc, type PhotoSrc } from "./urls";

export type PhotoAudience = "holder" | "host" | "other";
export type PagePhotos = {
  count: number; lead: PhotoSrc | null; viewer: ViewerPhoto[]; updated: boolean; unseen: boolean;
  places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: PrizesBlockNotice | null;
};

/**
 * A break's photos as the page shows them to `audience`, with every URL resolved. This is the privacy gate for the
 * page and the result page: only the host and holders get removed photos (signed for 10 minutes) and only the host
 * gets a photo still in the draft bucket; "other" gets public-bucket photos and the notice sentence, nothing else.
 */
export async function pagePhotos(
  storage: PhotoStorage, photos: BreakPhotos, rows: ReturnType<typeof placeRows>, o: { audience: PhotoAudience; tz: string },
): Promise<PagePhotos> {
  const { audience, tz } = o;
  const live = audience === "host" ? photos.live : photos.live.filter((p) => p.location === BUCKETS.public);
  const withRemoved = audience === "host" || audience === "holder";
  const captionOf = new Map(rows.map((r) => [r.key, `${r.captionWord}: ${r.name}`]));

  const [plates, viewerSrc, removed] = await Promise.all([
    Promise.all(live.map((p) => photoSrc(storage, p, 160))),
    Promise.all(live.map((p) => photoSrc(storage, p, 1600))),
    Promise.all((withRemoved ? photos.removed : []).map(async (r): Promise<RemovedPlate> => ({
      id: r.id, alt: r.alt,
      photo: r.prefix === null ? null : await photoSrc(storage, { location: r.location, prefix: r.prefix, width: r.width, height: r.height, alt: r.alt }, 160),
      removedIso: r.removedAt.toISOString(), removedFallback: formatShortDate(r.removedAt, tz),
    }))),
  ]);

  const { places, untagged } = attachPlates(rows, live.map((p, i) => ({ id: p.id, slot: p.slot, photo: plates[i] })));
  const notice = photos.notice
    ? { text: photos.notice.text, iso: photos.notice.at.toISOString(), fallback: formatDateTime(photos.notice.at, tz) }
    : null;
  const unseen = audience === "holder" && photos.unseen;
  return {
    count: live.length,
    lead: plates[0] ?? null,
    viewer: live.map((p, i) => ({ ...viewerSrc[i], caption: (p.slot && captionOf.get(p.slot)) || null })),
    updated: unseen && notice !== null,
    unseen,
    places, untagged, removed, notice,
  };
}
