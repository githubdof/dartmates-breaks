import type { GridCell } from "@/domain/breaks/grid";
import { MOTION } from "@/lib/motion";
import { joinAnd } from "@/lib/list";
import { cellMoments, cellViews, type CellMoment } from "./cell-moments";
import { GHOSTED_MOMENTS } from "./moment-attrs";

import type { BoardView } from "./cell";

/** Member view: the viewer sees holders and flights. Kit view: everyone else (spec §6). Task 7 defines it on Cell. */
export type { BoardView };
/** What one render of the board showed; moments are the diff between two of these. */
export type BoardSnap = { cells: readonly GridCell[]; view: BoardView; struck: readonly number[] };
/**
 * A claim this viewer sent, recorded before the action is called (recorded ruling 34). `numbers` is what was asked for
 * (a selection, "Take the last N"), or null for a random claim, whose numbers only the server knows.
 */
export type PendingClaim = { numbers: readonly number[] | null };

export const DROP_CAP = 5;
/** The pay sheet never waits longer than this for the flights to land (§7 Claim commits). */
export const PAY_SHEET_MAX_MS = 400;
/** data-moment, will-change and the ghosts go once every moment has finished (longestMoment, pinned by a test). */
export const MOMENT_CLEAR_MS = 1000;

/** No selection and no strike: boardMoments diffs the server's cells; the strike is the island's own (Task 11b). */
const NO_SET: ReadonlySet<number> = new Set();

/**
 * The lines a pending claim landed in this diff: cells that turn the viewer's between `prev` and `next`, limited to the
 * claim's numbers when they are known. No claim pending: none. Only the viewer's own claim makes a cell theirs.
 */
export function landedClaim(prev: readonly GridCell[], next: readonly GridCell[], claim: PendingClaim | null): number[] {
  if (!claim) return [];
  const was = new Map(prev.map((c) => [c.number, c.mine]));
  const asked = claim.numbers ? new Set(claim.numbers) : null;
  return next.filter((c) => c.mine && was.get(c.number) === false && (!asked || asked.has(c.number))).map((c) => c.number);
}

/**
 * cellMoments (Task 9) over the server's cells, wrapped with cellViews so the diff gets the CellView it is typed for
 * (recorded ruling 34). `claimed` is the lines this viewer's claim just landed: their flights drop even across the
 * kit → member switch. Task 11b adds the two moments cellMoments cannot see.
 */
export function boardMoments(prev: BoardSnap, next: BoardSnap, claimed: readonly number[]): Map<number, CellMoment> {
  return new Map<number, CellMoment>(
    cellMoments(cellViews(prev.cells, NO_SET, NO_SET), cellViews(next.cells, NO_SET, NO_SET), { view: next.view, prevView: prev.view, mine: claimed }),
  );
}

/** The cells as they were, for the moments that draw them (GHOSTED_MOMENTS). */
export function ghostsFrom(prev: readonly GridCell[], moments: ReadonlyMap<number, CellMoment>): Map<number, GridCell> {
  const out = new Map<number, GridCell>();
  for (const c of prev) {
    const m = moments.get(c.number);
    if (m && GHOSTED_MOMENTS.has(m)) out.set(c.number, c);
  }
  return out;
}

/** useBoardMoments' state: the last board this viewer saw, the moments of the change into it, and the claim lines it landed. */
export type MomentState = {
  snap: BoardSnap;
  moments: ReadonlyMap<number, CellMoment>;
  from: ReadonlyMap<number, GridCell>;
  landed: readonly number[];
};

/** Whether a cell looks the same in two renders (everything a moment or the cell's drawing reads). */
const sameCell = (a: GridCell, b: GridCell) =>
  a.state === b.state && a.mine === b.mine && a.overdue === b.overdue && a.bonus === b.bonus &&
  a.flight?.colour === b.flight?.colour && a.flight?.shape === b.flight?.shape;

/**
 * One render of the board against the last (the hook's pure step, so tests can drive both orders a claim lands in).
 * The same props return the same state; changed props diff, with the pending claim's landed lines as `claimed`.
 * A diff that moves nothing (a fresh struck array from the claim's answer, a refresh with no change) keeps the moments
 * in play, so the drop never depends on which of the two renders first; a cell that did change snaps to still (§3).
 */
export function stepMoments(state: MomentState, next: BoardSnap, claim: PendingClaim | null): MomentState {
  if (state.snap.cells === next.cells && state.snap.view === next.view && state.snap.struck === next.struck) return state;
  const landed = landedClaim(state.snap.cells, next.cells, claim);
  const moments = boardMoments(state.snap, next, landed);
  if (state.snap.view === next.view && ![...moments.values()].some((m) => m !== "still") && [...state.moments.values()].some((m) => m !== "still")) {
    const was = new Map(state.snap.cells.map((c) => [c.number, c]));
    const changed = next.cells.filter((c) => { const p = was.get(c.number); return !p || !sameCell(p, c); }).map((c) => c.number);
    if (changed.length === 0) return { ...state, snap: next, landed };
    const kept = new Map(state.moments);
    for (const n of changed) kept.set(n, "still");
    return { ...state, snap: next, moments: kept, landed };
  }
  return { snap: next, moments, from: ghostsFrom(state.snap.cells, moments), landed };
}

/** Each cell's place in its moment's stagger, in line order, counted per kind ("--stagger-others in line order"). */
export function momentOrder(moments: ReadonlyMap<number, CellMoment> | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!moments) return out;
  const seen = new Map<CellMoment, number>();
  for (const n of [...moments.keys()].sort((a, b) => a - b)) {
    const m = moments.get(n)!;
    if (m === "still") continue;
    const i = seen.get(m) ?? 0;
    out.set(n, i);
    seen.set(m, i + 1);
  }
  return out;
}

export const countMoment = (moments: ReadonlyMap<number, CellMoment>, kind: CellMoment): number =>
  [...moments.values()].filter((m) => m === kind).length;

/** When each dropping flight lands: the end of its drop, 50 ms apart, at most 5 (cells past the cap set still). */
export function landingTimes(dropping: number): number[] {
  return Array.from({ length: Math.min(Math.max(0, dropping), DROP_CAP) }, (_, i) => i * MOTION.staggerOwn + MOTION.drop);
}

/** The pay sheet opens at the last landing or at 400 ms, whichever comes first; at once with nothing to land or reduced motion. */
export function paySheetDelay(dropping: number, reduced: boolean): number {
  const t = landingTimes(dropping);
  return reduced || t.length === 0 ? 0 : Math.min(PAY_SHEET_MAX_MS, t[t.length - 1]);
}

/** The longest any claim moment runs, stagger included (the fifth drop's glint). */
export function longestMoment(): number {
  const own = (DROP_CAP - 1) * MOTION.staggerOwn;
  const others = 7 * MOTION.staggerOthers;
  return Math.max(
    own + MOTION.drop + MOTION.glint, own + MOTION.drop + MOTION.squash + MOTION.settle, own + MOTION.sent,
    others + MOTION.set + MOTION.seat, others + MOTION.others, MOTION.release, MOTION.strike,
  );
}

const lines = (ns: readonly number[]) => (ns.length === 1 ? `line ${ns[0]}` : `lines ${joinAnd(ns)}`);

/**
 * The polite announcements of a refresh (§7): paid, paid undone and released for the buyer's own lines; a give-back
 * in the buyer's own words; "open again" to everyone. Claims by others are never announced. "" when nothing moved.
 */
export function momentAnnouncements(prev: readonly GridCell[], next: readonly GridCell[], hostName: string, gaveBack: readonly number[]): string {
  const was = new Map(prev.map((c) => [c.number, c]));
  const paid: number[] = [], unpaid: number[] = [], released: number[] = [], gave: number[] = [], reopened: number[] = [];
  for (const c of [...next].sort((a, b) => a.number - b.number)) {
    const p = was.get(c.number);
    if (!p) continue;
    if (p.mine && c.mine) {
      if (p.state !== "paid" && c.state === "paid") paid.push(c.number);
      else if (p.state === "paid" && c.state !== "paid") unpaid.push(c.number);
    } else if (p.mine && c.state === "open") {
      (gaveBack.includes(c.number) ? gave : released).push(c.number);
    } else if (!p.mine && (p.state === "taken" || p.state === "sent" || p.state === "paid") && c.state === "open") {
      reopened.push(c.number);
    }
  }
  const said: string[] = [];
  if (paid.length) said.push(`${hostName} ticked you paid: ${lines(paid)}.`);
  if (unpaid.length) said.push(`${hostName} marked ${lines(unpaid)} not paid yet.`);
  if (released.length) said.push(`${hostName} released ${lines(released)}.`);
  if (gave.length) said.push(`You gave back ${lines(gave)}.`);
  if (reopened.length) said.push(reopened.length === 1 ? `Line ${reopened[0]} is open again.` : `Lines ${joinAnd(reopened)} are open again.`);
  return said.join(" ");
}
