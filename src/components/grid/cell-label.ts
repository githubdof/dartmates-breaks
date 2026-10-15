import type { GridCell } from "@/domain/breaks/grid";
import type { Flight } from "@/domain/flights";

export type CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus"> & {
  /** Member view only: shapeGrid sets it exactly where it sets holder (Mosaic §6). Palette keys, never hex. */
  flight?: Flight | null;
  /** Result page only: the place is public there (Mosaic §5 accessibility). */
  place?: 1 | 2 | 3 | null;
  /** The break page's optimistic mark while the viewer's claim is in flight: hatched, but no yours ring until it lands (§7). */
  optimistic?: boolean;
};

const STATE_WORD: Record<CellData["state"], string> = {
  open: "open", taken: "taken", sent: "sent", paid: "paid", reserved: "reserved for a mini",
};
const PLACE_WORD: Record<1 | 2 | 3, string> = { 1: "top spot", 2: "2nd place", 3: "3rd place" };

/**
 * "yours, paid", "taken, overdue": the words a cell's shape already says. `foldSent` is the board's rule (Mosaic §5):
 * other people's sent lines read "taken", because the board does not tell them apart. Paper keeps "sent".
 */
export function cellStateWord(c: CellData, o: { struck?: boolean; foldSent?: boolean } = {}): string {
  if (o.struck) return "just taken";
  // A won line is named by its place alone, yours included (Mosaic §5: "Line 23, top spot"): the result never changes
  // with the viewer's holdings (recorded ruling 19).
  if (c.place) return PLACE_WORD[c.place];
  const parts: string[] = [];
  if (c.mine) parts.push("yours");
  if (c.bonus) parts.push("bonus");
  parts.push(o.foldSent && c.state === "sent" && !c.mine ? "taken" : STATE_WORD[c.state]);
  if (c.overdue) parts.push("overdue");
  return parts.join(", ");
}

/** Accessible name. Never a handle and never a flight, for any viewer (Mosaic §5). */
export function cellLabel(c: CellData, o: { struck?: boolean; foldSent?: boolean } = {}): string {
  return `Line ${c.number}, ${cellStateWord(c, o)}`;
}
