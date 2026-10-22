import type { PhotoView } from "@/domain/photos/queries";
import type { StripPhoto } from "@/components/photos/strip-state";
import type { StripPrize } from "@/components/photos/photo-strip";
import type { BreakPage } from "@/domain/breaks/queries";
import { ordinal } from "@/lib/list";
import { photoSrc } from "./urls";
import type { PhotoStorage } from "@/storage/photo-storage";

/** A break's live photos as the strip shows them: the 160 px variant (signed for a draft's photos), in live order. */
export function toStripPhotos(storage: PhotoStorage, live: readonly PhotoView[]): Promise<StripPhoto[]> {
  return Promise.all(live.map(async (v): Promise<StripPhoto> => ({
    photoId: v.id, src: await photoSrc(storage, v, 160), slot: v.slot, alt: v.alt,
  })));
}

/** One tag choice per prize row in rank order: its slot, and its item's name as the label (else the place). */
export function prizeStripPrizes(page: BreakPage): StripPrize[] {
  const nameOf = new Map(page.items.map((i) => [i.id, i.name]));
  return [...page.prizes].sort((a, b) => a.rank - b.rank).map((p) => {
    const itemName = (p.itemId ? nameOf.get(p.itemId) : undefined) ?? null;
    return { slot: p.slotKey, label: itemName ?? (p.rank === 1 ? "Top spot" : `${ordinal(p.rank)} place`), itemName };
  });
}
