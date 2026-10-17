export type CellMetrics = { glyph: number; inset: number; disc: number; num: number };

/**
 * Mosaic §5, for a cell of `px` pixels: the glyph box and its inset from the top-right corner and, on won cells, the
 * bull disc and the number size. Fluid board cells get the same values from container queries in globals.css; this
 * function is for cells drawn at a fixed size (the legend, /account previews, render tests).
 */
export function cellMetrics(px: number, o: { mine: boolean; place: 1 | 2 | 3 | null }): CellMetrics {
  if (o.place !== null) {
    if (px < 56) return { glyph: 10, inset: 2, disc: 26, num: o.place === 1 ? 14 : 16 };
    if (px < 68) return { glyph: 14, inset: 3, disc: 30, num: 18 };
    return { glyph: 20, inset: 3, disc: 30, num: 18 };
  }
  // Under 48 px (every phone) the yours ring, not the glyph size, says yours.
  if (px < 48) return { glyph: 14, inset: 2, disc: 0, num: 18 };
  if (px < 56) return { glyph: o.mine ? 16 : 14, inset: 3, disc: 0, num: 18 };
  return { glyph: 20, inset: 3, disc: 0, num: 18 };
}
