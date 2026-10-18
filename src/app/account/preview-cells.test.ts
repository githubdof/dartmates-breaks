import { it, expect } from "vitest";
import { DARK_COLOURS, LIGHT_COLOURS } from "@/domain/flights";
import { flightGrid, KIT_PREVIEW, previewCells } from "./preview-cells";

const PLUM_KITE = { colour: "plum", shape: "kite" } as const;

it("lays the 32 flights out as four rows of shapes by eight columns, the dark tier's three colours first", () => {
  const grid = flightGrid();
  expect(grid).toHaveLength(4);
  for (const row of grid) {
    expect(row.map((f) => f.colour)).toEqual([...DARK_COLOURS, ...LIGHT_COLOURS]);
    expect(new Set(row.map((f) => f.shape)).size).toBe(1);
  }
  expect(new Set(grid.flat().map((f) => `${f.colour}-${f.shape}`)).size).toBe(32);
});

it("previews the picked flight in every state a member sees it in", () => {
  const { big, row } = previewCells(PLUM_KITE);
  expect(big).toMatchObject({ state: "paid", mine: false, flight: PLUM_KITE, place: null });
  expect(row.map((c) => [c.state, c.mine, c.place])).toEqual([
    ["open", false, null], ["taken", false, null], ["taken", true, null], ["sent", true, null],
    ["paid", false, null], ["paid", true, null], ["paid", false, 1],
  ]);
  expect(row[0].flight).toBeNull();
  expect(row.slice(1).every((c) => c.flight === PLUM_KITE)).toBe(true);
});

it("previews a kit in the kit view: no flight on any cell", () => {
  expect(KIT_PREVIEW.map((c) => [c.state, c.place])).toEqual([["open", null], ["taken", null], ["paid", null], ["paid", 1]]);
  expect(KIT_PREVIEW.every((c) => c.flight === null && c.holder === null)).toBe(true);
});
