import type { GridCell } from "@/domain/breaks/grid";
import type { Place } from "@/domain/draws/places";

/** A result-page cell: the viewer's view of the line plus its public place (§5 accessibility: "result page only"). */
export type ResultCell = GridCell & { place: Place | null };

/** Each place from placesOf (Task 6) goes on its line; every other line gets null. */
export function withPlaces(cells: readonly GridCell[], placed: readonly { number: number; place: Place }[]): ResultCell[] {
  const at = new Map(placed.map((p) => [p.number, p.place]));
  return cells.map((c) => ({ ...c, place: at.get(c.number) ?? null }));
}
