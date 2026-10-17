import type { HeatStep, Kit } from "@/domain/flights";
import { kitVars } from "@/components/grid/grid";
import { lampLayer } from "@/components/grid/lamp";
import { thumbColumns } from "@/components/grid/layout";
import { discPercent, ringWidth, thumbFillers, type ThumbTone } from "./kit-thumb-model";

const FACE: Record<ThumbTone["tone"], string> = {
  open: "var(--board-cream)",
  taken: "var(--board-cream)",
  paid: "var(--kit-dark)",
  reserved: "var(--board-cream-2)",
  won: "var(--board-ring)",
};
/** The place is the ring shape (Mosaic §5): double red for the top spot, single green for 2nd, dashed green for 3rd. */
const RING: Record<1 | 2 | 3, { style: "double" | "solid" | "dashed"; colour: string }> = {
  1: { style: "double", colour: "var(--red)" },
  2: { style: "solid", colour: "var(--green)" },
  3: { style: "dashed", colour: "var(--green)" },
};
/** Each cell's own wire; the gaps and the empty slots stay --board-wall-2 (spec §5: "not wire"), as .thumb-frame > .bc does. */
const WIRE = "0 0 0 1px var(--board-steel)";

/**
 * The board in the host's kit at thumbnail size, under the lamp at the break's step (Mosaic §8): the feed card, the
 * landing hero and the host profile. It shares the board's pieces: kitVars, the .thumb-frame class and lampLayer (the
 * lamp is an opacity layer, so a step change can crossfade). Decorative: the caption beside it carries the words.
 * Solid faces as the link preview draws them (no hatch, no glyph, no number), and never a flight.
 */
export function KitThumb({ cells, kit, heat, size }: { cells: readonly ThumbTone[]; kit: Kit; heat: HeatStep; size: number }) {
  const cols = thumbColumns(cells.length);
  const cellPx = size / cols;
  return (
    <span aria-hidden data-testid="thumb" className="relative block shrink-0 p-1.5" style={{ ...kitVars(kit), width: size + 12 }}>
      <span className="board-lamp thumb-lamp" style={lampLayer(heat)} />
      <span className="thumb-frame relative grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <span key={c.number} data-tone={c.tone} data-place={c.place ?? undefined} className="relative flex aspect-square items-center justify-center overflow-hidden" style={{ background: FACE[c.tone], boxShadow: WIRE }}>
            {c.tone === "taken" && <span className="absolute inset-x-0 bottom-0 h-[18%]" style={{ background: "var(--kit-light)", borderTop: "1px solid var(--board-ink)" }} />}
            {c.tone === "reserved" && <span className="absolute inset-0 border border-[var(--board-steel)]" />}
            {c.place !== null && (
              <span className="block aspect-square rounded-full" style={{ width: `${discPercent(cellPx)}%`, background: "var(--board-cream)", border: `${ringWidth(c.place, cellPx)}px ${RING[c.place].style} ${RING[c.place].colour}` }} />
            )}
          </span>
        ))}
        {Array.from({ length: thumbFillers(cells.length, cols) }, (_, i) => (
          <span key={`slot-${i}`} data-slot className="aspect-square" style={{ background: "var(--board-wall-2)" }} />
        ))}
      </span>
    </span>
  );
}
