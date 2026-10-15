import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import { DEFAULT_KIT } from "@/domain/flights";
import { CallerBanner } from "@/components/break/caller-banner";
import { FlightGlyph } from "@/components/flight-glyph";
import type { CellMoment } from "./cell-moments";
import { Cell } from "./cell";
import { Grid } from "./grid";

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el);
const BLUE_KITE = { colour: "blue", shape: "kite" } as const;
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
/** The markup of one cell button: the board renders cells in line order. */
const buttonOf = (h: string, n: number) => h.split("<button").find((b) => b.includes(`data-cell="${n}"`)) ?? "";

describe("a cell plays only the moment it is given (§3: animate on change, never on mount)", () => {
  it("renders no moment, glint or ghost by default, nor for still", () => {
    for (const moment of [undefined, "still"] as const) {
      const h = html(createElement(Cell, { cell: cell(1, { state: "taken", holder: "liz", flight: BLUE_KITE }), onPress: noop, moment }));
      expect(h).not.toContain("data-moment");
      expect(h).not.toContain("bc-glint");
      expect(h).not.toContain("bc-ghost");
    }
  });
  it("drop: the moment, its stagger index and one glint, no ghost", () => {
    const h = html(createElement(Cell, { cell: cell(4, { state: "taken", mine: true, flight: BLUE_KITE }), onPress: noop, moment: "drop", order: 2 }));
    expect(h).toContain('data-moment="drop"');
    expect(h).toContain("--i:2");
    expect(h.match(/class="bc-glint"/g)).toHaveLength(1);
    expect(h).not.toContain("bc-ghost");
  });
  it("others-in and sniped: the moment only (no squash or glint is ever given to the crowd)", () => {
    for (const moment of ["others-in", "sniped"] as const) {
      const h = html(createElement(Cell, { cell: cell(7, { state: "taken" }), onPress: noop, moment, struck: moment === "sniped" }));
      expect(h).toContain(`data-moment="${moment}"`);
      expect(h).not.toContain("bc-glint");
      expect(h).not.toContain("bc-ghost");
    }
  });
  it("sent, paid and paid undone draw the cell as it was, hidden from assistive tech; the name is the new state's", () => {
    const was = cell(9, { state: "taken", mine: true, flight: BLUE_KITE });
    const cases: [CellMoment, GridCell][] = [
      ["sent", cell(9, { state: "sent", mine: true, flight: BLUE_KITE })],
      ["paid", cell(9, { state: "paid", mine: true, flight: BLUE_KITE })],
      ["paid-undo", cell(9, { state: "taken", mine: true, flight: BLUE_KITE })],
    ];
    for (const [moment, now] of cases) {
      const h = html(createElement(Cell, { cell: now, onPress: noop, moment, from: was }));
      expect(h).toContain(`data-moment="${moment}"`);
      expect(h).toContain('<span aria-hidden="true" class="bc-ghost">');
      // The ghost is a nameless, attribute-free copy: no role, no name, no data-cell, no data-flight.
      const ghost = h.slice(h.indexOf('class="bc-ghost"'));
      expect(ghost).not.toMatch(/role="img"|aria-label=|data-cell=|data-flight=/);
      expect(buttonOf(h, 9).indexOf("aria-label=")).toBeGreaterThan(-1);
    }
  });
});

describe("the yours ring appears at landing, never before (§7 Claim commits)", () => {
  it("an optimistic mark (the claim in flight) draws the hatch but no ring; the landed cell draws it", () => {
    const optimistic = html(createElement(Cell, { cell: { ...cell(4, { state: "taken", mine: true }), optimistic: true }, onPress: noop }));
    expect(optimistic).toContain('class="bc-hatch"');
    expect(optimistic).not.toContain('data-mark="ring"');
    const landed = html(createElement(Cell, { cell: cell(4, { state: "taken", mine: true, flight: BLUE_KITE }), onPress: noop, moment: "drop" }));
    expect(landed).toContain('data-mark="ring"');
  });
  it("Grid passes the optimistic flag through to the cell", () => {
    const cells = [{ ...cell(1, { state: "taken", mine: true }), optimistic: true }, cell(2, { state: "taken", mine: true, flight: BLUE_KITE })];
    const h = html(createElement(Grid, { cells, lineCount: 2, label: "Lines, 0 to go", kit: DEFAULT_KIT, onPress: noop }));
    expect(buttonOf(h, 1)).not.toContain('data-mark="ring"');
    expect(buttonOf(h, 2)).toContain('data-mark="ring"');
  });
});

describe("Grid hands each cell its moment and its place in the stagger", () => {
  it("staggers the cells of one kind in line order and leaves the rest still", () => {
    const cells = [cell(1), cell(2, { state: "taken" }), cell(3), cell(4, { state: "taken" })];
    const moments = new Map<number, CellMoment>([[2, "others-in"], [4, "others-in"], [3, "still"]]);
    const h = html(createElement(Grid, { cells, lineCount: 4, label: "Lines, 2 to go", kit: DEFAULT_KIT, onPress: noop, moments }));
    expect(buttonOf(h, 2)).toContain("--i:0");
    expect(buttonOf(h, 4)).toContain("--i:1");
    expect(buttonOf(h, 1)).not.toContain("data-moment");
    expect(buttonOf(h, 3)).not.toContain("data-moment");
  });
});

describe("release draws the cell as it was and drains it", () => {
  it("renders the ghost, hidden from assistive tech, under the open cell's own name", () => {
    const was = cell(9, { state: "taken", mine: true, flight: BLUE_KITE });
    const h = html(createElement(Cell, { cell: cell(9), onPress: noop, moment: "release", from: was }));
    expect(h).toContain('data-moment="release"');
    expect(h).toContain('<span aria-hidden="true" class="bc-ghost">');
    expect(h).toContain('aria-label="Line 9, open"');
    expect(h.slice(h.indexOf('class="bc-ghost"'))).not.toMatch(/role="img"|aria-label=|data-cell=|data-flight=/);
  });
});

describe("the lamp steps back down after a release (Mosaic §4 Heat)", () => {
  it("is the same layer at a lower opacity, so the change is the one --dur-lamp opacity transition", () => {
    const up = html(createElement(Grid, { cells: [cell(1, { state: "taken" }), cell(2)], lineCount: 2, label: "L", kit: DEFAULT_KIT, heat: 3 }));
    const down = html(createElement(Grid, { cells: [cell(1), cell(2)], lineCount: 2, label: "L", kit: DEFAULT_KIT, heat: 2 }));
    expect(up).toMatch(/data-testid="lamp"[^>]*opacity:0.165/);
    expect(down).toMatch(/data-testid="lamp"[^>]*opacity:0.13/);
    const bg = (h: string) => /data-testid="lamp"[^>]*background-image:([^;"]+)/.exec(h)?.[1];
    expect(bg(down)).toBeDefined();
    expect(bg(down)).toBe(bg(up)); // one colour: only the layer's opacity steps
  });
});

describe("the caller banner", () => {
  // The lamp's opacity step is Task 8's (lampLayer in Grid, pinned in render.test.ts).
  it("is decorative text with a rule, a glyph only when given a flight, and plays only when told", () => {
    const still = html(createElement(CallerBanner, { text: "Board's full. Game on.", rule: "var(--kit-dark)" }));
    expect(still).toContain('data-testid="caller"');
    expect(still).toContain('aria-hidden="true"');
    expect(still).toContain("Board&#x27;s full. Game on.");
    expect(still).not.toContain("<svg");
    expect(still).not.toContain("data-play");
    const call = html(createElement(CallerBanner, { text: "Line 23. @mike takes the top spot.", rule: "#2340C4", flight: BLUE_KITE, play: true }));
    expect(call).toContain("<svg");
    expect(call).toContain("data-play");
    expect(call).not.toContain("data-flight");
  });
  it("draws a flight outside a cell as one filled, keylined, hidden shape", () => {
    const h = html(createElement(FlightGlyph, { flight: BLUE_KITE, size: 24, keyline: "var(--board-cream)", strokeWidth: 1.5 }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('width="24"');
    expect(h).toContain('stroke="var(--board-cream)"');
    expect(h).not.toMatch(/aria-label|<title/);
  });
});
