import { describe, it, expect } from "vitest";
import type { Flight } from "@/domain/flights";
import { cellMoments, cellViews, MAX_MOVING, MOMENT_CAPS, type CellMoment, type CellView } from "./cell-moments";

const LIME: Flight = { colour: "lime", shape: "kite" };
const BLUE: Flight = { colour: "blue", shape: "standard" };
const v = (number: number, o: Partial<CellView> = {}): CellView =>
  ({ number, state: "open", mine: false, bonus: false, overdue: false, flight: null, place: null, selected: false, struck: false, ...o });
const board = (f: (n: number) => Partial<CellView> = () => ({}), count = 50) => Array.from({ length: count }, (_, i) => v(i + 1, f(i + 1)));
const moving = (m: Map<number, CellMoment>) => [...m].filter(([, x]) => x !== "still").sort(([a], [b]) => a - b);
const MEMBER = { view: "member", prevView: "member", mine: [] } as const;
const KIT = { view: "kit", prevView: "kit", mine: [] } as const;
// Twelve lines other people hold on a part-filled board.
const OTHERS = new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]);
const othersKit = (n: number): Partial<CellView> => (OTHERS.has(n) ? { state: "taken" } : {});
const othersMember = (n: number): Partial<CellView> => (OTHERS.has(n) ? { state: "taken", flight: LIME } : {});

describe("cellMoments: nothing animates on mount or on a view switch (Review Focus 2)", () => {
  it("the first claim as a stranger: a drop for exactly the two claimed cells, still for every other, the twelve new flight faces included", () => {
    const prev = board(othersKit); // kit view: no flights
    const next = board((n) => (n === 3 || n === 40 ? { state: "taken", mine: true, flight: BLUE } : othersMember(n)));
    const m = cellMoments(prev, next, { view: "member", prevView: "kit", mine: [3, 40] });
    expect(m.size).toBe(50);
    expect(moving(m)).toEqual([[3, "drop"], [40, "drop"]]);
    for (const n of OTHERS) expect(m.get(n)).toBe("still");
  });

  it("a refresh with four new third-party claims: four others-in and nothing else, in both views", () => {
    const fresh = [41, 42, 45, 50];
    const prev = board(othersMember);
    const next = board((n) => (fresh.includes(n) ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual(fresh.map((n) => [n, "others-in"]));
    const prevKit = board(othersKit);
    const nextKit = board((n) => (fresh.includes(n) ? { state: "taken" } : othersKit(n)));
    expect(moving(cellMoments(prevKit, nextKit, KIT))).toEqual(fresh.map((n) => [n, "others-in"]));
  });

  it("a refresh with nine: eight others-in and one still (the cap), in line order", () => {
    const fresh = [40, 41, 42, 43, 44, 45, 46, 47, 48];
    const prev = board(othersMember);
    const next = board((n) => (fresh.includes(n) ? { state: "taken", flight: LIME } : othersMember(n)));
    const m = cellMoments(prev, next, MEMBER);
    expect(moving(m)).toEqual(fresh.slice(0, 8).map((n) => [n, "others-in"]));
    expect(m.get(48)).toBe("still");
  });

  it("first paint: no previous cells, everything still", () => {
    const m = cellMoments([], board(othersMember), MEMBER);
    expect(m.size).toBe(50);
    expect(moving(m)).toEqual([]);
  });

  it("a view switch without a claim of one's own: everything still, new claims included", () => {
    const prev = board(othersKit);
    const next = board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(prev, next, { view: "member", prevView: "kit", mine: [] }))).toEqual([]);
  });

  it("the viewer's last line released: their release plays, then the kit view is still", () => {
    const prev = board((n) => (n === 3 ? { state: "taken", mine: true, flight: BLUE } : othersMember(n)));
    const next = board((n) => (n === 44 ? { state: "taken" } : othersKit(n)));
    expect(moving(cellMoments(prev, next, { view: "kit", prevView: "member", mine: [] }))).toEqual([[3, "release"]]);
  });

  it("a line-count change (a bonus line added) sets everything still", () => {
    const prev = board(othersMember);
    const next = [...board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n))), v(51, { state: "paid", bonus: true, mine: true, flight: BLUE })];
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([]);
  });

  it("a refresh that lands mid-animation diffs against the last render: a repeat is all still, so the cell snaps", () => {
    const next = board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(next, next, MEMBER))).toEqual([]);
  });
});

describe("cellMoments: the §7 transitions", () => {
  it("drop: the viewer's own claim, from open or from the optimistic mark, never twice over the same server cells", () => {
    const prev = board((n) => (n === 4 ? { state: "taken", mine: true } : {})); // 4: the optimistic mark (no flight yet); 7: still open
    const next = board((n) => (n === 4 || n === 7 ? { state: "taken", mine: true, flight: BLUE } : {}));
    expect(moving(cellMoments(prev, next, { ...MEMBER, mine: [4, 7] }))).toEqual([[4, "drop"], [7, "drop"]]);
    expect(moving(cellMoments(next, next, { ...MEMBER, mine: [4, 7] }))).toEqual([]);
  });
  it("sent, paid, paid undone, release and sniped", () => {
    const prev = board((n) => ({
      1: { state: "taken", mine: true, flight: BLUE }, 2: { state: "sent", flight: LIME }, 3: { state: "paid", flight: LIME },
      4: { state: "taken", flight: LIME }, 5: { selected: true },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    const next = board((n) => ({
      1: { state: "sent", mine: true, flight: BLUE }, 2: { state: "paid", flight: LIME }, 3: { state: "sent", flight: LIME },
      4: { state: "open" }, 5: { state: "taken", flight: LIME, struck: true },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([[1, "sent"], [2, "paid"], [3, "paid-undo"], [4, "release"], [5, "sniped"]]);
  });
  it("every unlisted transition sets still", () => {
    const prev = board((n) => ({
      1: {}, 2: { state: "reserved" }, 3: { state: "taken", flight: LIME }, 4: { state: "taken", flight: LIME },
      5: { state: "taken", flight: LIME }, 6: { state: "paid", flight: LIME }, 7: { state: "sent", mine: true, flight: BLUE },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    const next = board((n) => ({
      1: { state: "paid", flight: LIME }, // open → paid between refreshes
      2: { state: "open" }, // a mini's reservation lifted
      3: { state: "sent", flight: LIME }, // someone else marked sent: the board shows taken either way
      4: { state: "taken", flight: { colour: "lime", shape: "slim" } }, // the collision rule moved a shape
      5: { state: "taken", flight: LIME, overdue: true }, // the overdue flag
      6: { state: "paid", flight: LIME, place: 1 }, // the reveal owns the won state
      7: { state: "taken", mine: true, flight: BLUE }, // sent undone
    } as Record<number, Partial<CellView>>)[n] ?? {});
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([]);
  });
});

describe("cellMoments: the caps (Mosaic §7)", () => {
  it("pins the caps", () => {
    expect(MOMENT_CAPS).toEqual({ drop: 5, sent: 5, "others-in": 8, paid: 8, "paid-undo": 8, release: 8, sniped: 8 });
    expect(MAX_MOVING).toBe(8);
  });
  it("at most 5 drops; the sixth sets still", () => {
    const mine = [1, 2, 3, 4, 5, 6];
    const next = board((n) => (mine.includes(n) ? { state: "taken", mine: true, flight: BLUE } : {}));
    const m = cellMoments(board(), next, { ...MEMBER, mine });
    expect(moving(m)).toEqual(mine.slice(0, 5).map((n) => [n, "drop"]));
    expect(m.get(6)).toBe("still");
  });
  it("at most 8 paid and 5 sent per diff", () => {
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const paid = cellMoments(board((n) => (ten.includes(n) ? { state: "sent", flight: LIME } : {})), board((n) => (ten.includes(n) ? { state: "paid", flight: LIME } : {})), MEMBER);
    expect(moving(paid).map(([n]) => n)).toEqual(ten.slice(0, 8));
    const sent = cellMoments(board((n) => (ten.includes(n) ? { state: "taken", mine: true, flight: BLUE } : {})), board((n) => (ten.includes(n) ? { state: "sent", mine: true, flight: BLUE } : {})), MEMBER);
    expect(moving(sent).map(([n]) => n)).toEqual(ten.slice(0, 5));
  });
  it("at most 8 cells in all; the viewer's own moments go first (recorded ruling 21)", () => {
    const own = [40, 41, 42, 43, 44];
    const theirs = [1, 2, 3, 4, 5, 6];
    const next = board((n) => (own.includes(n) ? { state: "taken", mine: true, flight: BLUE } : theirs.includes(n) ? { state: "taken", flight: LIME } : {}));
    const m = cellMoments(board(), next, { ...MEMBER, mine: own });
    expect(moving(m)).toEqual([[1, "others-in"], [2, "others-in"], [3, "others-in"], ...own.map((n) => [n, "drop"] as [number, CellMoment])]);
    expect(moving(m)).toHaveLength(8);
  });
});

describe("cellViews", () => {
  it("adds the client's selection and strike to the server's cells", () => {
    const views = cellViews(
      [{ number: 1, state: "open", mine: false, overdue: false, bonus: false, holder: "x", flight: null }, { number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null, flight: LIME, place: null }],
      new Set([1]), new Set([2]),
    );
    expect(views).toEqual([v(1, { selected: true }), v(2, { state: "taken", flight: LIME, struck: true })]);
    expect(JSON.stringify(views)).not.toContain('"x"'); // the holder's handle is not part of a cell's view
  });
});
