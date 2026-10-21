import { ordinal } from "@/lib/list";
import type { PhotoChange } from "./types";

/**
 * How a notice names a prize slot (plan ruling 3): "Top spot", "2nd place", "3rd place"; a rank with two or more items
 * (an "or" choice) names each by its item, since they share the rank. An unknown slot reads "A prize".
 */
export function placeWords(prizes: readonly { slotKey: string; rank: number; itemName: string }[]): (slot: string | null) => string {
  const perRank = new Map<number, number>();
  for (const p of prizes) perRank.set(p.rank, (perRank.get(p.rank) ?? 0) + 1);
  const words = new Map<string, string>();
  for (const p of prizes) {
    const place = p.rank === 1 ? "Top spot" : `${ordinal(p.rank)} place`;
    words.set(p.slotKey.toLowerCase(), (perRank.get(p.rank) ?? 0) > 1 && p.itemName.trim() !== "" ? p.itemName.trim() : place);
  }
  return (slot) => (slot === null ? undefined : words.get(slot.toLowerCase())) ?? "A prize";
}

type Counting = { kind: "removed" | "lead" | "retagged"; sentence: string };
/** "Top spot" → "Top-spot", "2nd place" → "2nd-place"; item names stay as typed (ruling 3). */
const compound = (place: string) => (/^(Top spot|\d+(st|nd|rd|th) place)$/.test(place) ? place.replace(" ", "-") : place);

/** The spec §6 sentence for one committed action, or null when nothing in it counts. Pure. */
export function noticeFor(changes: readonly PhotoChange[], placeOf: (slot: string | null) => string): string | null {
  const newLead = changes.some((c) => c.kind === "lead");
  const counting: Counting[] = [];
  for (const c of changes) {
    if (c.kind === "removed") {
      // Ruling 1: removing the lead while another photo takes position 0 is the "lead" change already in the list.
      if (c.wasLead && newLead) continue;
      counting.push({ kind: "removed", sentence: c.slot === null ? "Photo removed" : `${compound(placeOf(c.slot))} photo removed` });
    } else if (c.kind === "lead") {
      counting.push({ kind: "lead", sentence: "Lead photo replaced" });
    } else if (c.kind === "retagged" && c.from !== null && c.from !== c.to) {
      counting.push({
        kind: "retagged",
        sentence: c.to === null ? `${compound(placeOf(c.from))} photo untagged` : `A photo moved from ${placeOf(c.from)} to ${placeOf(c.to)}`,
      });
    }
  }
  if (counting.length === 0) return null;
  // Ruling 2: one kind reads as its own sentence; two or more kinds in one action read "Photos changed".
  return new Set(counting.map((c) => c.kind)).size > 1 ? "Photos changed" : counting[counting.length - 1].sentence;
}
