import { describe, it, expect } from "vitest";
import { gridTier, columnsFor, nextFocusIndex, thumbColumns, boardGeometry, GRID_COLS, GRID_MAX_W } from "./layout";

describe("grid columns (design §4)", () => {
  it("tiers by line count", () => {
    expect([2, 12, 13, 30, 31, 55].map(gridTier)).toEqual(["s", "s", "m", "m", "l", "l"]);
  });
  it("fits 8, 7 and 6 columns at 390, 360 and 320 pt phones, and 10 above 640", () => {
    expect(columnsFor(50, 358)).toBe(8);
    expect(columnsFor(50, 328)).toBe(7);
    expect(columnsFor(50, 288)).toBe(6);
    // Above 640 the page column is 600 wide with 24 pt gutters, so the grid box is 552.
    expect(columnsFor(55, 552)).toBe(10);
    expect(columnsFor(55, 539)).toBe(8);
    expect(columnsFor(20, 358)).toBe(6);
    expect(columnsFor(6, 358)).toBe(4);
  });
  it("keeps literal class strings for the scanner", () => {
    expect(GRID_COLS.l).toBe("grid-cols-6 @min-[308px]:grid-cols-7 @min-[352px]:grid-cols-8 @min-[540px]:grid-cols-10");
    expect(GRID_MAX_W.l).toBe("max-w-[552px]");
  });
  it("moves focus with the arrow keys and stops at the edges", () => {
    expect(nextFocusIndex(0, "ArrowRight", 8, 50)).toBe(1);
    expect(nextFocusIndex(0, "ArrowLeft", 8, 50)).toBeNull();
    expect(nextFocusIndex(3, "ArrowDown", 8, 50)).toBe(11);
    expect(nextFocusIndex(45, "ArrowDown", 8, 50)).toBeNull();
    expect(nextFocusIndex(11, "ArrowUp", 8, 50)).toBe(3);
    expect(nextFocusIndex(20, "Home", 8, 50)).toBe(0);
    expect(nextFocusIndex(20, "End", 8, 50)).toBe(49);
    expect(nextFocusIndex(20, "Enter", 8, 50)).toBeNull();
  });
  it("sizes thumbnails as a near-square", () => {
    expect([2, 6, 12, 50, 55].map(thumbColumns)).toEqual([2, 3, 4, 8, 8]);
  });
  it("the board at 390 and 360 (Mosaic §5, Review Focus 5): 365 px of eight 44.75 px cells on 1 px wires, then seven 47 px cells; the 12 px frame reaches 15.5 px into the gutter", () => {
    expect(boardGeometry(390, 50)).toEqual({ column: 358, box: 365, cols: 8, cell: 44.75, pitch: 45.75, rows: 7, height: 319.25 });
    expect(boardGeometry(360, 50)).toEqual({ column: 328, box: 335, cols: 7, cell: 47, pitch: 48, rows: 8, height: 383 });
    // The 44 pt floor holds at both widths, and half a pixel of gutter is left at the screen edge (3.5 px bleed + 12 px frame).
    for (const w of [390, 360]) {
      expect(boardGeometry(w, 50).cell).toBeGreaterThanOrEqual(44);
      expect((w - boardGeometry(w, 50).box) / 2 - 12).toBe(0.5);
    }
    expect(boardGeometry(1024, 55)).toMatchObject({ column: 552, box: 559, cols: 10 });
  });
});
