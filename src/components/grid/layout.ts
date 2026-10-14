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
