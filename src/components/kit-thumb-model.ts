import type { OgTone } from "@/domain/breaks/og";
import type { ThumbCell } from "@/domain/breaks/feed";
import type { Place } from "@/domain/draws/places";

/** One thumbnail cell in the kit view (Mosaic §6, §8). */
export type ThumbTone = { number: number; tone: OgTone; place: 1 | 2 | 3 | null };

/**
 * A thumbnail's cells: numbered lines, plus a bonus line only when it placed; sent folds into taken; a placed line is
 * won. Built from line state alone (a ThumbCell has no owner), so nothing about a holder can reach a card.
 */
export function kitThumbCells(cells: readonly ThumbCell[], places: readonly { number: number; place: Place }[] = []): ThumbTone[] {
  const placeOf = (n: number): Place | null => places.find((p) => p.number === n)?.place ?? null;
  return cells.filter((c) => !c.bonus || placeOf(c.number) !== null).map((c) => {
    const place = placeOf(c.number);
    const tone: OgTone = place !== null ? "won" : c.state === "sent" ? "taken" : c.state;
    return { number: c.number, tone, place };
  });
}

/** Empty slots that complete the last row, drawn in --board-wall-2 and never as wire (Mosaic §5). */
export const thumbFillers = (n: number, cols: number) => (n % cols === 0 ? 0 : cols - (n % cols));

/**
 * The place ring's width: 0.05 x the cell (spec 6), floored. A feed cell is about 11 px, where 0.05 x would be a
 * sub-pixel line; the double ring needs 3 px to draw two bands at all (a 2 px CSS double renders solid), and the single
 * and dashed rings keep a 1 px hairline.
 */
export const ringWidth = (place: 1 | 2 | 3, cellPx: number) =>
  Math.max(place === 1 ? 3 : 1, Math.round(cellPx * 0.05 * 100) / 100);
