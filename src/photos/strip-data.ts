import type { PhotoView } from "@/domain/photos/queries";
import type { StripPhoto } from "@/components/photos/strip-state";
import type { StripPrize } from "@/components/photos/photo-strip";
import type { BreakPage } from "@/domain/breaks/queries";
import { ordinal } from "@/lib/list";
import { photoSrcOrNull } from "./urls";
import type { PhotoStorage } from "@/storage/photo-storage";

/**
 * A break's live photos as the strip shows them: the 160 px variant (signed for a draft's photos), in live order.
 * A photo whose signing fails drops out rather than throwing the page.
 */
export async function toStripPhotos(storage: PhotoStorage, live: readonly PhotoView[]): Promise<StripPhoto[]> {
  const out = await Promise.all(live.map(async (v): Promise<StripPhoto | null> => {
    const src = await photoSrcOrNull(storage, v, 160);
    return src && { photoId: v.id, src, slot: v.slot, alt: v.alt };
  }));
  return out.filter((p) => p !== null);
}

/** One tag choice per prize row in rank order: its slot, and its item's name as the label (else the place). */
export function prizeStripPrizes(page: BreakPage): StripPrize[] {
  const nameOf = new Map(page.items.map((i) => [i.id, i.name]));
  return [...page.prizes].sort((a, b) => a.rank - b.rank).map((p) => {
    const itemName = (p.itemId ? nameOf.get(p.itemId) : undefined) ?? null;
    return { slot: p.slotKey, label: itemName ?? (p.rank === 1 ? "Top spot" : `${ordinal(p.rank)} place`), itemName };
  });
}
