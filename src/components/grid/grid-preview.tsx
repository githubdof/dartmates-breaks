import { DEFAULT_KIT, type HeatStep, type Kit } from "@/domain/flights";
import type { CellData } from "./cell-label";
import { Cell } from "./cell";
import { kitVars } from "./grid";
import { lampLayer } from "./lamp";
import { thumbColumns } from "./layout";

/** What a thumbnail needs: line state only (feedThumbs selects no owner), plus the place on a ran break. */
export type PreviewCell = Pick<CellData, "number" | "state" | "bonus"> & { place?: 1 | 2 | 3 | null };

/**
 * The board in the host's kit, small (Mosaic §8): a 6 px frame (1 px steel, 4 px kit dark, 1 px kit light) drawn inside
 * `size`, and the lamp at the break's step behind it when given. Always the kit view: whatever the caller passes, only
 * number, state and place reach the cells. Decorative; the card's text says the count.
 */
export function GridPreview({ count, cells, size = 88, kit = DEFAULT_KIT, heat = null }: { count: number; cells?: PreviewCell[]; size?: number; kit?: Kit; heat?: HeatStep | null }) {
  const list: CellData[] = (cells ?? Array.from({ length: count }, (_, i): PreviewCell => ({ number: i + 1, state: "open", bonus: false })))
    .filter((c) => !c.bonus)
    .map((c) => ({ number: c.number, state: c.state, bonus: false, mine: false, overdue: false, flight: null, place: c.place ?? null }));
  const cols = thumbColumns(list.length);
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size, ...kitVars(kit) }}>
      {heat !== null && <span className="board-lamp thumb-lamp" style={lampLayer(heat)} />}
      <div className="thumb-frame relative m-1.5 grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {list.map((c) => <Cell key={c.number} cell={c} view="kit" size="thumb" />)}
      </div>
    </div>
  );
}
