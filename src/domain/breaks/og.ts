import { formatMoney } from "@/lib/money";
import type { HeatStep, Kit } from "@/domain/flights";
import { canViewBreak, shapeGrid } from "./grid";
import type { BreakPage } from "./queries";

export type OgTone = "open" | "taken" | "paid" | "reserved" | "won";
export type OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 };
export type OgModel = { title: string; caption: string; cells: OgCell[]; columns: number; kit: Kit; heat: HeatStep };

/** A line as the preview may read it: state only. No handle or flight field exists, so none can be passed in. */
export type OgLine = Omit<BreakPage["lines"][number], "ownerHandle" | "ownerFlightColour" | "ownerFlightShape">;
export type OgPage = {
  break: BreakPage["break"];
  host: Pick<BreakPage["host"], "kit">;
  lines: readonly OgLine[];
  /** The active draw's places on a ran break (the OG route passes them from Task 14 on); ignored otherwise. */
  places?: readonly { number: number; place: 1 | 2 | 3 }[];
};

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
 * The link preview, anonymous by construction (Mosaic §6): link crawlers have no session, so the grid is shaped for no
 * viewer, and the page is rebuilt field by field first, so even a full BreakPage passed in brings no handle or flight.
 * Only each cell's number, tone and (won cells) place leave this function, with the break's kit and heat. Taken and
 * sent share one tone; bonus lines are left out (the image shows lines 1..N). Null when an anonymous viewer may not
 * see the break (a draft).
 */
export function ogModel(page: OgPage, now: Date): OgModel | null {
  const b = page.break;
  if (!canViewBreak(b.status, false)) return null;
  const shaped: BreakPage = {
    break: b,
    host: { id: b.hostId, handle: null, displayName: null, paymentHandles: {}, kit: page.host.kit },
    items: [],
    prizes: [],
    lines: page.lines.map((l) => ({
      number: l.number, ownerId: l.ownerId, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null,
      claimedAt: l.claimedAt, sentAt: l.sentAt, paidAt: l.paidAt, priceCents: l.priceCents, reservedForMiniId: l.reservedForMiniId, isBonus: l.isBonus,
    })),
  };
  const grid = shapeGrid(shaped, null, now);
  const placeOf = new Map(b.status === "drawn" ? (page.places ?? []).map((p) => [p.number, p.place]) : []);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c): OgCell => {
      const place = placeOf.get(c.number);
      return place ? { number: c.number, tone: "won", place } : { number: c.number, tone: c.state === "sent" ? "taken" : c.state };
    });
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.lineCount, b.linePriceCents),
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
    kit: grid.kit,
    heat: grid.heat,
  };
}
