export type GridTier = "s" | "m" | "l";

/** 2–12 lines: up to 4 columns; 13–30: up to 6; 31–55: up to 8 (10 above 640, where the grid box is 552). */
export function gridTier(count: number): GridTier {
  return count <= 12 ? "s" : count <= 30 ? "m" : "l";
}

/** Literal class strings so Tailwind's scanner sees them; widths are the grid's own (container queries). */
export const GRID_COLS: Record<GridTier, string> = {
  s: "grid-cols-4",
  m: "grid-cols-6",
  l: "grid-cols-6 @min-[308px]:grid-cols-7 @min-[352px]:grid-cols-8 @min-[540px]:grid-cols-10",
};

/**
 * Cells stop growing past ~64 pt on small breaks. Large breaks fill the page column: `main` is 600 wide with
 * 24 pt gutters above 640, so the grid box is 552 and ten columns give 55.2 pt cells (the design's 56, within a point).
 */
export const GRID_MAX_W: Record<GridTier, string> = { s: "max-w-[256px]", m: "max-w-[384px]", l: "max-w-[552px]" };

const MAX_COLS: Record<GridTier, number> = { s: 4, m: 6, l: 8 };

/** What the CSS above resolves to: cols = min(max, floor(width / 44)), and 10 at 540+ for 31–55 lines. */
export function columnsFor(count: number, width: number): number {
  const tier = gridTier(count);
  if (tier === "l" && width >= 540) return 10;
  return Math.max(1, Math.min(MAX_COLS[tier], Math.floor(width / 44)));
}

/** Arrow-key focus movement inside the grid group. Null means "do nothing". */
export function nextFocusIndex(index: number, key: string, cols: number, count: number): number | null {
  switch (key) {
    case "ArrowRight": return index + 1 < count ? index + 1 : null;
    case "ArrowLeft": return index > 0 ? index - 1 : null;
    case "ArrowDown": return index + cols < count ? index + cols : null;
    case "ArrowUp": return index - cols >= 0 ? index - cols : null;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Columns for the square thumbnail (the photo fallback). */
export function thumbColumns(count: number): number {
  return Math.min(8, Math.max(2, Math.ceil(Math.sqrt(count))));
}

/** How far the board's rows pull into each gutter (globals.css .board-frame, .board-wire: margin-inline: -3.5px). */
export const BOARD_BLEED = 3.5;

/**
 * The board at a viewport width (Mosaic §5, recorded ruling 33). `column` is the page column: the viewport minus 16 px
 * gutters below 640, and 552 above. The rows pull BOARD_BLEED into each gutter, so `box` is the column plus 7 px (365 at
 * 390). Cells sit 1 px apart (the wire): `cell` is a cell's side (44.75 at 390, 47 at 360) and `pitch` a cell plus its
 * wire. Columns are read from the column, as the group's container queries read it. The 12 px frame is a box-shadow
 * drawn 15.5 px into the 16 px gutter, so it takes none of the box.
 */
export function boardGeometry(viewport: number, count: number): { column: number; box: number; cols: number; cell: number; pitch: number; rows: number; height: number } {
  const column = viewport >= 640 ? 552 : viewport - 32;
  const box = column + 2 * BOARD_BLEED;
  const cols = columnsFor(count, column);
  const cell = (box - (cols - 1)) / cols;
  const pitch = cell + 1;
  const rows = Math.ceil(count / cols);
  return { column, box, cols, cell, pitch, rows, height: rows * pitch - 1 };
}
