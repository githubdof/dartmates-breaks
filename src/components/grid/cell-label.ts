import type { GridCell } from "@/domain/breaks/grid";

export type CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus">;

const STATE_WORD: Record<CellData["state"], string> = {
  open: "open", taken: "taken", sent: "sent", paid: "paid", reserved: "reserved for a mini",
};

/** "yours, paid", "taken, overdue": the words a cell's shape already says. */
export function cellStateWord(c: CellData): string {
  const parts: string[] = [];
  if (c.mine) parts.push("yours");
  if (c.bonus) parts.push("bonus");
  parts.push(STATE_WORD[c.state]);
  if (c.overdue) parts.push("overdue");
  return parts.join(", ");
}

/** Accessible name. Buyer-side names never include another buyer's handle (design §4). */
export function cellLabel(c: CellData): string {
  return `Line ${c.number}, ${cellStateWord(c)}`;
}
