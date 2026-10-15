import { formatMoney } from "@/lib/money";
import { canViewBreak, shapeGrid } from "./grid";
import type { BreakPage } from "./queries";

export type OgTone = "open" | "taken" | "paid" | "reserved";
export type OgCell = { number: number; tone: OgTone };
export type OgModel = { title: string; caption: string; cells: OgCell[]; columns: number };

const MAX_TITLE = 80;

/** The image's caption (design §6): "19 of 50 left, $5 a line" while open, the community's state word after. */
export function ogCaption(status: string, open: number, total: number, priceCents: number): string {
  switch (status) {
    case "open": return `${open} of ${total} left, ${formatMoney(priceCents)} a line`;
    case "filled": return "Closed. Every line is paid.";
    case "drawing": return "Running draw";
    case "drawn": return "Ran. Anyone can check the draw.";
    case "cancelled": return "Cancelled";
    default: return "";
  }
}

/**
 * The link preview, anonymous by construction: link crawlers have no session, so the grid is shaped for no viewer
 * (shapeGrid withholds holders and the overdue flag) and only each cell's number and tone leave this function.
 * Taken and sent share one tone; bonus lines are left out (the image shows lines 1..N). Null when an anonymous
 * viewer may not see the break (a draft).
 */
export function ogModel(page: BreakPage, now: Date): OgModel | null {
  const b = page.break;
  if (!canViewBreak(b.status, false)) return null;
  const grid = shapeGrid(page, null, now);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c) => ({ number: c.number, tone: c.state === "sent" ? "taken" : c.state }));
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.lineCount, b.linePriceCents),
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
  };
}
