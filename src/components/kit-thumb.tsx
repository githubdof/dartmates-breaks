import type { CSSProperties } from "react";
import { FLIGHT_COLOURS, LAMP, type HeatStep, type Kit } from "@/domain/flights";
import { thumbColumns } from "@/components/grid/layout";
import { thumbFillers, type ThumbTone } from "./kit-thumb-model";

const FACE: Record<ThumbTone["tone"], string> = {
  open: "var(--board-cream)",
  taken: "var(--board-cream)",
  paid: "var(--kit-dark)",
  reserved: "var(--board-cream-2)",
  won: "var(--board-ring)",
};
/** The place is the ring shape (Mosaic §5): double red for the top spot, single green for 2nd, dashed green for 3rd. */
// 3 px for the double ring: a 2 px CSS double border renders solid, and the top spot would read as 2nd.
const RING: Record<1 | 2 | 3, string> = { 1: "3px double var(--red)", 2: "1.5px solid var(--green)", 3: "1.5px dashed var(--green)" };
/** 1 px steel, 4 px kit dark, 1 px kit light: the 6 px thumbnail frame (Mosaic §8), spread, never border or padding. */
const FRAME = "0 0 0 1px var(--board-steel), 0 0 0 5px var(--kit-dark), 0 0 0 6px var(--kit-light)";

/**
 * The board in the host's kit at thumbnail size, under the lamp at the break's step (Mosaic §8): the feed card, the
 * landing hero and the host profile. Decorative: the caption beside it carries the words. Solid faces as the link
 * preview draws them (no hatch, no glyph, no number), and never a flight.
 */
export function KitThumb({ cells, kit, heat, size }: { cells: readonly ThumbTone[]; kit: Kit; heat: HeatStep; size: number }) {
  const cols = thumbColumns(cells.length);
  const vars = { "--kit-dark": FLIGHT_COLOURS[kit.dark].face, "--kit-light": FLIGHT_COLOURS[kit.light].face } as CSSProperties;
  return (
    <span aria-hidden data-testid="thumb" className="relative block shrink-0 p-1.5" style={{ ...vars, width: size + 12 }}>
      <span className="pointer-events-none absolute -inset-3" style={{ background: `radial-gradient(ellipse at center, ${LAMP[heat]}, transparent 70%)` }} />
      <span className="relative grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, background: "var(--board-steel)", boxShadow: FRAME }}>
        {cells.map((c) => (
          <span key={c.number} data-tone={c.tone} data-place={c.place ?? undefined} className="relative flex aspect-square items-center justify-center overflow-hidden" style={{ background: FACE[c.tone] }}>
            {c.tone === "taken" && <span className="absolute inset-x-0 bottom-0 h-[18%] border-t border-[var(--board-ink)]" style={{ background: "var(--kit-light)" }} />}
            {c.tone === "reserved" && <span className="absolute inset-0 border border-[var(--board-steel)]" />}
            {c.place !== null && <span className="block aspect-square w-[48%] rounded-full" style={{ background: "var(--board-cream)", border: RING[c.place] }} />}
          </span>
        ))}
        {Array.from({ length: thumbFillers(cells.length, cols) }, (_, i) => (
          <span key={`slot-${i}`} className="aspect-square" style={{ background: "var(--board-wall-2)" }} />
        ))}
      </span>
    </span>
  );
}
