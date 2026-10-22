import { CONDITION_LABEL, type ItemCondition } from "@/domain/breaks/condition";
import { ordinal } from "@/lib/list";
import { orList } from "@/components/break/frame-copy";
import type { PhotoSrc } from "@/photos/urls";

/** A plate in the Prizes block; `index` is the photo's position in the live list, which is the viewer's index. */
export type PlateData = { id: string; index: number; photo: PhotoSrc };
export type PrizePlace = {
  key: string; word: string; captionWord: string; name: string; condition: string | null; variants: string | null; plates: PlateData[];
};
export type RemovedPlate = { id: string; photo: PhotoSrc | null; alt: string; removedIso: string; removedFallback: string };
export type PrizesBlockNotice = { text: string; iso: string; fallback: string };

/** At most this many plates sit on a place's row; the rest stay reachable in the viewer. */
const PLATES_PER_PLACE = 3;

/** `weight: 18g or 20g; tip: soft or steel`, or null when the item has no variants. */
export function variantText(schema: Record<string, string[]> | null): string | null {
  const parts = Object.entries(schema ?? {}).filter(([, values]) => values.length > 0).map(([key, values]) => `${key}: ${orList(values)}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

/** One row per prize in rank order: "Top spot" for the first rank-1 prize, "Or" for the other rank-1 prizes. */
export function placeRows(
  prizes: readonly { rank: number; itemId: string | null; slotKey: string }[],
  items: readonly { id: string; name: string; condition: ItemCondition | null; variantSchema: Record<string, string[]> | null }[],
): Omit<PrizePlace, "plates">[] {
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const rows: Omit<PrizePlace, "plates">[] = [];
  let topSeen = false;
  for (const p of [...prizes].sort((a, b) => a.rank - b.rank)) {
    const item = p.itemId ? itemOf.get(p.itemId) : undefined;
    if (!item) continue;
    const captionWord = p.rank === 1 ? "Top spot" : `${ordinal(p.rank)} place`;
    const word = p.rank === 1 && topSeen ? "Or" : captionWord;
    if (p.rank === 1) topSeen = true;
    rows.push({
      key: p.slotKey, word, captionWord, name: item.name,
      condition: item.condition ? CONDITION_LABEL[item.condition] : null, variants: variantText(item.variantSchema),
    });
  }
  return rows;
}

/** Puts each live photo on the place it is tagged to (up to three each, in live order); the rest go to `untagged`. */
export function attachPlates(
  rows: ReturnType<typeof placeRows>,
  live: readonly { id: string; slot: string | null; photo: PhotoSrc }[],
): { places: PrizePlace[]; untagged: PlateData[] } {
  const places: PrizePlace[] = rows.map((r) => ({ ...r, plates: [] }));
  const byKey = new Map(places.map((p) => [p.key, p]));
  const untagged: PlateData[] = [];
  live.forEach((l, index) => {
    const place = l.slot ? byKey.get(l.slot) : undefined;
    if (!place) untagged.push({ id: l.id, index, photo: l.photo });
    else if (place.plates.length < PLATES_PER_PLACE) place.plates.push({ id: l.id, index, photo: l.photo });
  });
  return { places, untagged };
}
