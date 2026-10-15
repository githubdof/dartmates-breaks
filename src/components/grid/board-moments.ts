import type { GridCell } from "@/domain/breaks/grid";
import { MOTION } from "@/lib/motion";
import { joinAnd } from "@/lib/list";
import { cellMoments, cellViews, MAX_MOVING, MOMENT_CAPS, type CellMoment } from "./cell-moments";
import { GHOSTED_MOMENTS } from "./moment-attrs";

import type { BoardView } from "./cell";

/** Member view: the viewer sees holders and flights. Kit view: everyone else (spec §6). Task 7 defines it on Cell. */
export type { BoardView };
/**
 * What one render of the board showed; moments are the diff between two of these. `selected` is the lines the viewer
 * wanted in that render: the selection on screen plus the one snapshotted when the claim in flight went out (finish()
 * clears the selection, so the strike cannot read it later). `struck` is the island's strike (Cell draws it).
 */
export type BoardSnap = { cells: readonly GridCell[]; view: BoardView; struck: readonly number[]; selected: readonly number[] };
/**
 * A claim this viewer sent, recorded before the action is called (recorded ruling 34). `numbers` is what was asked for
 * (a selection, "Take the last N"), or null for a random claim, whose numbers only the server knows.
 */
export type PendingClaim = { numbers: readonly number[] | null };

export const DROP_CAP = 5;
/** Line sniped and the viewer's own release: at most 8 at once (§7); cells past a cap set still. */
export const SNIPED_CAP = MOMENT_CAPS.sniped;
export const OWN_RELEASE_CAP = MOMENT_CAPS.release;
/** The pay sheet never waits longer than this for the flights to land (§7 Claim commits). */
export const PAY_SHEET_MAX_MS = 400;
/** data-moment, will-change and the ghosts go once every moment has finished (longestMoment, pinned by a test). */
export const MOMENT_CLEAR_MS = 1000;

/** cellMoments gets no selection and no strike: boardMoments decides the strike itself (it needs the claim's order). */
const NO_SET: ReadonlySet<number> = new Set();
const claimedByOther = (c: GridCell | undefined) => !!c && !c.mine && (c.state === "taken" || c.state === "sent" || c.state === "paid");

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
 * kit → member switch. cellMoments also plays the viewer's own release across the member → kit switch (§6); the hold
 * that lets it be seen is stepMoments' (`held`).
 *
 * The one moment it cannot see is the strike, because the selection is client-only. A line strikes in the diff where
 * the server first shows it claimed by someone else while the viewer wanted it: selected on screen or when the claim
 * went out, or named taken by the claim's answer (`struck`). That is the same diff that drops the claim's own lines,
 * whichever renders first, the refreshed props or the answer, so the strike never cuts a drop (recorded ruling 34);
 * a struck array arriving on its own moves nothing. At most SNIPED_CAP at once, MAX_MOVING in all; past a cap the
 * strike shows at once (Cell draws `struck` itself).
 */
export function boardMoments(prev: BoardSnap, next: BoardSnap, claimed: readonly number[]): Map<number, CellMoment> {
  const out = new Map<number, CellMoment>(
    cellMoments(cellViews(prev.cells, NO_SET, NO_SET), cellViews(next.cells, NO_SET, NO_SET), { view: next.view, prevView: prev.view, mine: claimed }),
  );
  if (prev.cells.length === 0 || prev.cells.length !== next.cells.length) return out;
  const wanted = new Set([...prev.selected, ...next.selected, ...next.struck]);
  if (wanted.size === 0) return out;
  const was = new Map(prev.cells.map((c) => [c.number, c]));
  let moving = [...out.values()].filter((m) => m !== "still").length;
  let struck = 0;
  for (const c of [...next.cells].sort((a, b) => a.number - b.number)) {
    const p = was.get(c.number);
    if (!wanted.has(c.number) || !p || p.state !== "open" || p.mine || p.bonus !== c.bonus || !claimedByOther(c)) continue;
    const before = out.get(c.number) ?? "still";
    // Over the strike's cap, or no room left on the board: the strike shows at once, and the cell sets still.
    if (struck >= SNIPED_CAP || (before === "still" && moving >= MAX_MOVING)) { if (before !== "still") moving--; out.set(c.number, "still"); continue; }
    if (before === "still") moving++;
    struck++;
    out.set(c.number, "sniped");
  }
  return out;
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

/**
 * The board shown while the viewer's own last lines drain (spec §7 Release, recorded ruling 21): the previous member-view
 * cells, with each released cell already open (its ghost drains over it). Only after --dur-release does the board
 * re-render in the kit view, still.
 */
export function drainCells(prev: readonly GridCell[], moments: ReadonlyMap<number, CellMoment>): GridCell[] {
  return prev.map((c): GridCell => (moments.get(c.number) === "release" ? { ...c, state: "open", mine: false, holder: null, flight: null } : c));
}

/**
 * useBoardMoments' state: the last board this viewer saw, the moments of the change into it, the claim lines it
 * landed, and the held member-view board while the viewer's own last lines drain (else null).
 */
export type MomentState = {
  snap: BoardSnap;
  moments: ReadonlyMap<number, CellMoment>;
  from: ReadonlyMap<number, GridCell>;
  landed: readonly number[];
  /** The map as the last moving diff produced it: the island keys the landing count on it, so a kept map never restarts it. */
  played: ReadonlyMap<number, CellMoment>;
  /** The member-view board drawn while the viewer's own last lines drain (drainCells); null otherwise. */
  held: BoardSnap | null;
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
 * With nothing in play it only takes the new snap: no map, so the hook arms no timer. A moving diff replaces the map
 * and starts a new run (`played`).
 */
export function stepMoments(state: MomentState, next: BoardSnap, claim: PendingClaim | null): MomentState {
  if (state.snap.cells === next.cells && state.snap.view === next.view && state.snap.struck === next.struck && state.snap.selected === next.selected) return state;
  const landed = landedClaim(state.snap.cells, next.cells, claim);
  const moments = boardMoments(state.snap, next, landed);
  const moves = (m: ReadonlyMap<number, CellMoment>) => [...m.values()].some((x) => x !== "still");
  if (!moves(moments)) {
    if (!moves(state.moments)) return { ...state, snap: next, landed };
    if (state.snap.view !== next.view) return { snap: next, moments: NO_MOMENTS, from: NO_GHOSTS, landed, played: NO_MOMENTS, held: null }; // a view switch shows the final state still
    const was = new Map(state.snap.cells.map((c) => [c.number, c]));
    const changed = next.cells.filter((c) => { const p = was.get(c.number); return !p || !sameCell(p, c); }).map((c) => c.number);
    if (changed.length === 0) return { ...state, snap: next, landed };
    const kept = new Map(state.moments);
    for (const n of changed) kept.set(n, "still");
    return { ...state, snap: next, moments: kept, landed };
  }
  // The viewer's own last lines went (member → kit): hold the member view while they drain (spec §7 Release).
  const draining = state.snap.view === "member" && next.view === "kit" && [...moments.values()].includes("release");
  const held: BoardSnap | null = draining ? { cells: drainCells(state.snap.cells, moments), view: "member", struck: next.struck, selected: next.selected } : null;
  return { snap: next, moments, from: ghostsFrom(state.snap.cells, moments), landed, played: moments, held };
}

const NO_MOMENTS: ReadonlyMap<number, CellMoment> = new Map();
const NO_GHOSTS: ReadonlyMap<number, GridCell> = new Map();

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
