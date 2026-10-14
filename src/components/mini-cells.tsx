import { Cell } from "./grid/cell";
import type { CellData } from "./grid/cell-label";

/** A row of small cells (claim sheet, ledger rows). Interactive ones are 44 pt targets. */
export function MiniCells({ cells, onPress, labelFor, label }: { cells: CellData[]; onPress?: (n: number) => void; labelFor?: (c: CellData) => string; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {cells.map((c) => (
        <li key={c.number} className={onPress ? "w-11" : "w-7"}>
          <Cell cell={c} size="sm" boxed onPress={onPress} label={labelFor?.(c)} testId={onPress ? `mini-${c.number}` : undefined} />
        </li>
      ))}
    </ul>
  );
}
