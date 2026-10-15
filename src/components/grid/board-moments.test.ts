import { describe, it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import { MOTION } from "@/lib/motion";
import {
  boardMoments, countMoment, ghostsFrom, landedClaim, landingTimes, longestMoment, MOMENT_CLEAR_MS, momentAnnouncements, momentOrder,
  paySheetDelay, stepMoments, type BoardSnap, type MomentState,
} from "./board-moments";
import type { CellMoment } from "./cell-moments";
import { momentAttrs } from "./moment-attrs";

const BLUE_KITE = { colour: "blue", shape: "kite" } as const;
const LIME = { colour: "lime", shape: "standard" } as const;
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
const board = (n: number, f: (c: GridCell) => Partial<GridCell> = () => ({})) => Array.from({ length: n }, (_, i) => { const c = cell(i + 1); return { ...c, ...f(c) }; });
const snap = (cells: readonly GridCell[], o: Partial<BoardSnap> = {}): BoardSnap => ({ cells, view: "member", struck: [], ...o });
const fresh = (s: BoardSnap): MomentState => { const none = new Map<number, CellMoment>(); return { snap: s, moments: none, from: new Map(), landed: [], played: none }; };
const moving = (m: ReadonlyMap<number, CellMoment>) => [...m].filter(([, x]) => x !== "still").sort(([a], [b]) => a - b);

describe("boardMoments: cellMoments over the server's cells", () => {
  it("wraps GridCell[] with cellViews, so the first claim as a stranger drops exactly the claimed cells (Review Focus 2)", () => {
    const others = new Set([2, 5, 8]);
    const prev = board(10, (c) => (others.has(c.number) ? { state: "taken" } : {}));
    const next = board(10, (c) => (c.number === 3 || c.number === 7 ? { state: "taken", mine: true, holder: "me", flight: BLUE_KITE } : others.has(c.number) ? { state: "taken", holder: "liz", flight: LIME } : {}));
    expect(moving(boardMoments(snap(prev, { view: "kit" }), snap(next), [3, 7]))).toEqual([[3, "drop"], [7, "drop"]]);
  });
  it("keeps the old cell only for the moments that draw it", () => {
    const prev = board(4, () => ({ state: "taken", holder: "liz" }));
    const moments = new Map<number, CellMoment>([[1, "paid"], [2, "others-in"], [3, "release"], [4, "still"]]);
    expect([...ghostsFrom(prev, moments).keys()]).toEqual([1]); // release draws its ghost from Task 11b on
    expect(momentAttrs("drop", 2)).toEqual({ moment: "drop", style: { "--i": 2 }, glint: true, ghost: false });
    expect(momentAttrs("still")).toEqual({ moment: undefined, style: {}, glint: false, ghost: false });
    expect(momentAttrs(undefined).moment).toBeUndefined();
  });
  it("staggers each kind in line order, from 0", () => {
    const order = momentOrder(new Map<number, CellMoment>([[9, "others-in"], [2, "others-in"], [4, "drop"], [7, "still"], [5, "others-in"]]));
    expect(Object.fromEntries(order)).toEqual({ 2: 0, 4: 0, 5: 1, 9: 2 });
    expect(momentOrder(undefined).size).toBe(0);
    // The island counts the drops to time the per-landing count.
    expect(countMoment(new Map<number, CellMoment>([[1, "drop"], [2, "drop"], [3, "still"], [4, "others-in"]]), "drop")).toBe(2);
  });
});

describe("the pending claim: the drop never depends on render order (recorded ruling 34)", () => {
  const before = snap(board(6), { view: "kit" });
  const after = snap(board(6, (c) => (c.number === 2 || c.number === 4 ? { state: "taken", mine: true, holder: "me", flight: BLUE_KITE } : {})));
  it("lands the cells that turn the viewer's, limited to the claim's numbers when they are known", () => {
    expect(landedClaim(before.cells, after.cells, { numbers: [2, 4] })).toEqual([2, 4]);
    expect(landedClaim(before.cells, after.cells, { numbers: [2] })).toEqual([2]);
    expect(landedClaim(before.cells, after.cells, { numbers: null })).toEqual([2, 4]); // a random claim: numbers unknown in advance
    expect(landedClaim(before.cells, after.cells, null)).toEqual([]);
  });
  it("props first: the refreshed board lands while the claim is pending; the answer that follows re-renders nothing new", () => {
    const s1 = stepMoments(fresh(before), after, { numbers: null });
    expect(moving(s1.moments)).toEqual([[2, "drop"], [4, "drop"]]);
    expect(s1.landed).toEqual([2, 4]);
    // The island clears the claim once its lines landed; the same props rendered again change nothing.
    expect(stepMoments(s1, after, null)).toBe(s1);
  });
  it("answer first: the claim is still pending when the refreshed board lands", () => {
    const s0 = stepMoments(fresh(before), before, { numbers: [2, 4] }); // the answer re-renders the old props
    expect(s0.moments.size).toBe(0);
    const s1 = stepMoments(s0, after, { numbers: [2, 4] });
    expect(moving(s1.moments)).toEqual([[2, "drop"], [4, "drop"]]);
  });
  it("a re-render that moves nothing (the answer's new strike array, an unchanged refresh) never cuts the drop in play", () => {
    const s1 = stepMoments(fresh(before), after, { numbers: [2, 4] });
    const struckOnly = stepMoments(s1, { ...after, struck: [] }, null); // finish() sets a fresh struck array
    expect(struckOnly.moments).toBe(s1.moments);
    const sameCells = stepMoments(s1, { ...after, cells: after.cells.map((c) => ({ ...c })) }, null); // router.refresh, no change
    expect(sameCells.moments).toBe(s1.moments);
    // A cell that did change, in a way that plays nothing, snaps to its final state; the rest play on.
    const overdue = stepMoments(s1, { ...after, cells: after.cells.map((c) => (c.number === 4 ? { ...c, overdue: true } : c)) }, null);
    expect(moving(overdue.moments)).toEqual([[2, "drop"]]);
    // A change that does move replaces the map, as before.
    const released = stepMoments(s1, { ...after, cells: after.cells.map((c) => (c.number === 4 ? cell(4) : c)) }, null);
    expect(moving(released.moments)).toEqual([[4, "release"]]);
  });
  it("an unchanged refresh with nothing in play builds no map (so the hook arms no timer)", () => {
    const s0 = fresh(before);
    const s1 = stepMoments(s0, { ...before, cells: before.cells.map((c) => ({ ...c })) }, null);
    expect(s1.moments).toBe(s0.moments);
    expect(s1.played).toBe(s0.played);
    expect(s1.snap.cells).not.toBe(before.cells); // the new snap is kept for the next diff
  });
  it("`played` is the map the moving diff produced: the guard keeps it, so the landing count never restarts", () => {
    const s1 = stepMoments(fresh(before), after, { numbers: [2, 4] });
    expect(s1.played).toBe(s1.moments);
    const overdue = stepMoments(s1, { ...after, cells: after.cells.map((c) => (c.number === 6 ? { ...c, overdue: true } : c)) }, null);
    expect(overdue.moments).not.toBe(s1.moments); // cell 6 snapped to still in a new map
    expect(overdue.played).toBe(s1.played);
    const released = stepMoments(s1, { ...after, cells: after.cells.map((c) => (c.number === 4 ? cell(4) : c)) }, null);
    expect(released.played).toBe(released.moments); // a moving diff starts a new run
  });
  it("with no claim pending, cells that turn the viewer's play nothing", () => {
    expect(moving(stepMoments(fresh(before), after, null).moments)).toEqual([]);
  });
});

describe("the claim's timing (§7 Claim commits)", () => {
  it("lands the flights 50 ms apart, at most 5, each at the end of its drop", () => {
    expect(landingTimes(3)).toEqual([160, 210, 260]);
    expect(landingTimes(9)).toEqual([160, 210, 260, 310, 360]);
    expect(landingTimes(0)).toEqual([]);
  });
  it("opens the pay sheet at the last landing or at 400 ms, whichever comes first; at once under reduced motion", () => {
    expect(paySheetDelay(1, false)).toBe(160);
    expect(paySheetDelay(5, false)).toBe(360);
    expect(paySheetDelay(12, false)).toBe(360);
    expect(paySheetDelay(0, false)).toBe(0);
    expect(paySheetDelay(4, true)).toBe(0);
    for (let n = 0; n < 60; n++) expect(paySheetDelay(n, false)).toBeLessThanOrEqual(400);
  });
  it("clears data-moment only after the longest moment has finished", () => {
    expect(longestMoment()).toBe(4 * MOTION.staggerOwn + MOTION.drop + MOTION.glint); // 580: the fifth glint
    expect(MOMENT_CLEAR_MS).toBeGreaterThanOrEqual(longestMoment());
  });
});

describe("momentAnnouncements (§7, Announced)", () => {
  it("tells the buyer about their own lines only, and everyone about lines open again", () => {
    const prev = [
      cell(4, { state: "sent", mine: true }), cell(11, { state: "sent", mine: true }), cell(12, { state: "paid", mine: true }),
      cell(20, { state: "taken", mine: true }), cell(30, { state: "taken" }), cell(31, { state: "paid" }), cell(40, { state: "taken" }),
    ];
    const next = [
      cell(4, { state: "paid", mine: true }), cell(11, { state: "paid", mine: true }), cell(12, { state: "sent", mine: true }),
      cell(20), cell(30), cell(31), cell(40, { state: "paid" }),
    ];
    expect(momentAnnouncements(prev, next, "Jim", [])).toBe(
      "Jim ticked you paid: lines 4 and 11. Jim marked line 12 not paid yet. Jim released line 20. Lines 30 and 31 are open again.",
    );
  });
  it("says a give-back as the buyer's own act, and says nothing when nothing moved", () => {
    const prev = [cell(4, { state: "taken", mine: true }), cell(11, { state: "taken", mine: true })];
    expect(momentAnnouncements(prev, [cell(4), cell(11)], "Jim", [4, 11])).toBe("You gave back lines 4 and 11.");
    expect(momentAnnouncements(prev, [cell(4), cell(11, { state: "taken", mine: true })], "Jim", [4])).toBe("You gave back line 4.");
    expect(momentAnnouncements(prev, prev, "Jim", [])).toBe("");
    expect(momentAnnouncements([cell(7, { state: "taken" })], [cell(7)], "Jim", [])).toBe("Line 7 is open again.");
  });
});
