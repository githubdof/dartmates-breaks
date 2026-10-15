import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import { DEFAULT_KIT } from "@/domain/flights";
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
