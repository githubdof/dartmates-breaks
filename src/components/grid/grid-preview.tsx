import type { CellData } from "./cell-label";
import { PaperCell } from "./paper-cell";
import { thumbColumns } from "./layout";

/** Decorative mini grid: the photo fallback on the break page and the composer preview. */
export function GridPreview({ count, cells, size = 88 }: { count: number; cells?: CellData[]; size?: number }) {
  const list: CellData[] = (cells ?? Array.from({ length: count }, (_, i) => ({ number: i + 1, state: "open" as const, mine: false, overdue: false, bonus: false })))
    .filter((c) => !c.bonus)
    .map((c) => ({ ...c, overdue: false }));
  const cols = thumbColumns(list.length);
  return (
    <div aria-hidden className="shrink-0 overflow-hidden rounded-input border border-wire bg-card p-1" style={{ width: size, height: size }}>
      <div className="grid border-t border-l border-wire-strong" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {list.map((c) => <PaperCell key={c.number} cell={c} size="xs" />)}
      </div>
    </div>
  );
}
