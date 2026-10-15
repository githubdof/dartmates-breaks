import type { CellState, GridCell } from "@/domain/breaks/grid";
import type { Flight } from "@/domain/flights";

export type CellMoment = "drop" | "others-in" | "sent" | "paid" | "paid-undo" | "release" | "sniped" | "still";
type Moving = Exclude<CellMoment, "still">;

/** One cell as the viewer saw it: the server's cell plus the client's selection and strike. No holder: moments never need one. */
export type CellView = {
  number: number; state: CellState; mine: boolean; bonus: boolean; overdue: boolean;
  flight: Flight | null; place: 1 | 2 | 3 | null;
  selected: boolean; struck: boolean;
};

export function cellViews(cells: readonly (GridCell & { place?: 1 | 2 | 3 | null })[], selected: ReadonlySet<number>, struck: ReadonlySet<number>): CellView[] {
  return cells.map((c) => ({
    number: c.number, state: c.state, mine: c.mine, bonus: c.bonus, overdue: c.overdue, flight: c.flight, place: c.place ?? null,
    selected: selected.has(c.number), struck: struck.has(c.number),
  }));
}

/** Mosaic §7, the moment table: cells past a cap set still. */
export const MOMENT_CAPS: Record<Moving, number> = { drop: 5, sent: 5, "others-in": 8, paid: 8, "paid-undo": 8, release: 8, sniped: 8 };
/** "At most 8 cells animate at once outside the reveal" (§7, Implementation). */
export const MAX_MOVING = 8;

const claimed = (s: CellState) => s === "taken" || s === "sent";

/** The §7 transitions. Anything not listed is null, and null sets still. */
function transition(p: CellView, c: CellView, justClaimed: boolean): Moving | null {
  // The reveal owns the won state; a bonus flag never changes on a line.
  if (p.place !== c.place || p.bonus !== c.bonus) return null;
  if (c.struck && !p.struck && p.selected && claimed(c.state) && !c.mine) return "sniped";
  // Claim commits: from open, or from the optimistic mark the island drew before the server answered (taken and mine,
  // but no flight yet: only the server knows it). A repeat diff over the same server cells therefore never drops twice.
  if (justClaimed && c.mine && c.state === "taken" && (p.state === "open" || (p.state === "taken" && p.mine && !p.flight && !!c.flight))) return "drop";
  if (p.state === "open" && claimed(c.state) && !c.mine) return "others-in";
  if (p.mine && c.mine && p.state === "taken" && c.state === "sent") return "sent";
  if (claimed(p.state) && c.state === "paid" && p.mine === c.mine) return "paid";
  if (p.state === "paid" && claimed(c.state) && p.mine === c.mine) return "paid-undo";
  if ((claimed(p.state) || p.state === "paid") && c.state === "open") return "release";
  return null;
}

/**
 * Which cells play a moment between two renders of the same viewer's board (Mosaic §3, §7). Pure. First paint, a
 * line-count change and every unlisted transition set still. Across a view change (§6), only the viewer's own claim
 * (kit → member) and own release (member → kit) play. Caps are per moment and MAX_MOVING in all: the viewer's own
 * cells first, then everyone else's, each in line order. `o.mine` is the numbers the viewer's claim just committed.
 */
export function cellMoments(
  prev: readonly CellView[],
  next: readonly CellView[],
  o: { view: "member" | "kit"; prevView: "member" | "kit"; mine: readonly number[] },
): Map<number, CellMoment> {
  const out = new Map<number, CellMoment>(next.map((c) => [c.number, "still"]));
  if (prev.length === 0 || prev.length !== next.length) return out;
  const before = new Map(prev.map((c) => [c.number, c]));
  const viewChanged = o.view !== o.prevView;
  const justMine = new Set(o.mine);
  const own: { n: number; m: Moving }[] = [];
  const theirs: { n: number; m: Moving }[] = [];
  for (const c of [...next].sort((a, b) => a.number - b.number)) {
    const p = before.get(c.number);
    if (!p) continue;
    const m = transition(p, c, justMine.has(c.number));
    if (!m) continue;
    if (viewChanged && !(m === "drop" || (m === "release" && p.mine))) continue;
    (p.mine || c.mine ? own : theirs).push({ n: c.number, m });
  }
  const used = new Map<Moving, number>();
  let total = 0;
  for (const w of [...own, ...theirs]) {
    const k = used.get(w.m) ?? 0;
    if (k >= MOMENT_CAPS[w.m] || total >= MAX_MOVING) continue;
    used.set(w.m, k + 1);
    total += 1;
    out.set(w.n, w.m);
  }
  return out;
}
