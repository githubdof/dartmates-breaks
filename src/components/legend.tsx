import { Cell } from "./grid/cell";
import type { CellData } from "./grid/cell-label";

const sample = (o: Partial<CellData>): CellData => ({ number: 0, state: "open", mine: false, overdue: false, bonus: false, ...o });
const ITEMS: { word: string; cell: CellData }[] = [
  { word: "open", cell: sample({}) },
  { word: "taken", cell: sample({ state: "taken" }) },
  { word: "sent", cell: sample({ state: "sent" }) },
  { word: "paid", cell: sample({ state: "paid" }) },
  { word: "yours", cell: sample({ mine: true }) },
];

/** Five swatches with words, no icons (design §4). */
export function Legend() {
  return (
    <ul aria-label="What the cells mean" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-ink-2">
      {ITEMS.map((i) => (
        <li key={i.word} className="flex items-center gap-1.5">
          <span aria-hidden className="block size-4"><Cell cell={i.cell} size="xs" boxed /></span>
          {i.word}
        </li>
      ))}
    </ul>
  );
}
