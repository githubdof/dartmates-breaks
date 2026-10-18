import type { Flight, Kit } from "@/domain/flights";
import type { CellData } from "./grid/cell-label";
import { Cell, type BoardView } from "./grid/cell";
import { kitVars } from "./grid/grid";

const mini = (o: Partial<CellData>): CellData => ({ number: 0, state: "open", mine: false, overdue: false, bonus: false, flight: null, place: null, ...o });

/**
 * The legend as mini cells beside words, spaces between, no middle dots (Mosaic §5). Member view: open, taken, sent,
 * paid, yours, in the viewer's own flight. Paid has no single colour, and other people's sent lines read as taken, so
 * "sent" is drawn as yours, sent. Kit view: open, taken, paid, in the kit. `flight` is the viewer's own (their first
 * held flight, else their stored flight from Task 16); with no flight at all, a standard flight in the kit's dark colour
 * (recorded ruling 20).
 */
export function BoardLegend({ view, flight, kit }: { view: BoardView; flight: Flight | null; kit: Kit }) {
  const f: Flight = flight ?? { colour: kit.dark, shape: "standard" };
  const items: { word: string; cell: CellData }[] = view === "member"
    ? [
        { word: "open", cell: mini({}) },
        { word: "taken", cell: mini({ state: "taken", flight: f }) },
        { word: "sent", cell: mini({ state: "sent", mine: true, flight: f }) },
        { word: "paid", cell: mini({ state: "paid", flight: f }) },
        { word: "yours", cell: mini({ state: "taken", mine: true, flight: f }) },
      ]
    : [
        { word: "open", cell: mini({}) },
        { word: "taken", cell: mini({ state: "taken" }) },
        { word: "paid", cell: mini({ state: "paid" }) },
      ];
  return (
    <ul aria-label="What the cells mean" data-testid="legend" style={kitVars(kit)} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-[var(--board-text-2)]">
      {items.map((i) => (
        <li key={i.word} className="flex items-center gap-1.5">
          <span aria-hidden className="block size-4"><Cell cell={i.cell} view={view} size="xs" px={16} /></span>
          {i.word}
        </li>
      ))}
    </ul>
  );
}
