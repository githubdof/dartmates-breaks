import { formatMoney } from "@/lib/money";
import { DEFAULT_TZ } from "@/lib/time";
import type { HeatStep, Kit } from "@/domain/flights";
import type { PhotoView } from "@/domain/photos/queries";
import { canViewBreak, shapeGrid } from "./grid";
import type { BreakPage } from "./queries";

export type OgTone = "open" | "taken" | "paid" | "reserved" | "won";
export type OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 };
/** The draw as the preview may see it: when it ran. The won places come in on OgPage.places (Task 5). Never an entry or a holder. */
export type OgDraw = { ranAt: Date };
/** The lead photo as the preview may see it: a published file's id and prefix, nothing else (photos spec §8.4). */
export type OgPhoto = { id: string; prefix: string };
/**
 * Everything the image draws. No holder, no buyer's handle, no flight (pinned by og.test.ts); the host's name is public.
 * `photo` is the lead photo of the public `photos` bucket as its id and prefix only, or null (no lead, or not published).
 */
export type OgModel = { title: string; caption: string; hostedBy: string; kit: Kit; heat: HeatStep; cells: OgCell[]; columns: number; photo: OgPhoto | null };

/** A line as the preview may read it: state only. No handle or flight field exists, so none can be passed in. */
export type OgLine = Omit<BreakPage["lines"][number], "ownerHandle" | "ownerFlightColour" | "ownerFlightShape">;
export type OgPage = {
  break: BreakPage["break"];
  host: Pick<BreakPage["host"], "kit" | "handle" | "displayName">;
  lines: readonly OgLine[];
  /** The active draw's places on a ran break (the OG route passes them from Task 14 on); ignored otherwise. */
  places?: readonly { number: number; place: 1 | 2 | 3 }[];
  /** The break's lead photo (leadPhotos); only one in the public `photos` bucket reaches the model. */
  lead?: Pick<PhotoView, "id" | "prefix" | "location"> | null;
};

const MAX_TITLE = 80;

const RAN_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: DEFAULT_TZ });

/** The caption (§6): "12 to go, $5 a line" while open, the community's state word after. A crawler has no zone: New York. */
export function ogCaption(status: string, open: number, priceCents: number, ranAt: Date | null = null): string {
  switch (status) {
    case "open": return `${open} to go, ${formatMoney(priceCents)} a line`;
    case "filled": return "Closed. Every line is paid.";
    case "drawing": return "Running draw";
    case "drawn": return ranAt ? `Ran ${RAN_DAY.format(ranAt)}. Anyone can check the draw.` : "Ran. Anyone can check the draw.";
    case "cancelled": return "Cancelled";
    default: return "";
  }
}

/** "Hosted by @jim": the host is public on every break page; a buyer never is. */
export const ogHostedBy = (h: { handle: string | null; displayName: string | null }) =>
  `Hosted by ${h.handle ? `@${h.handle}` : h.displayName ?? "the host"}`;

/**
 * The link preview, anonymous by construction (Mosaic §6): link crawlers have no session, so the grid is shaped for no
 * viewer, and the page is rebuilt field by field first, so even a full BreakPage passed in brings no handle or flight.
 * Only each cell's number, tone and (won cells) place leave this function, with the break's kit and heat. Taken and
 * sent share one tone; bonus lines are left out (the image shows lines 1..N). Null when an anonymous viewer may not
 * see the break (a draft).
 */
export function ogModel(page: OgPage, now: Date, draw: OgDraw | null = null): OgModel | null {
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
  // Won places only for a ran break, from the places the route passed (Task 5); a bonus line that won is left out with its row.
  const placeOf = new Map(b.status === "drawn" ? (page.places ?? []).map((p) => [p.number, p.place]) : []);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c) => {
      const place = placeOf.get(c.number);
      return place ? { number: c.number, tone: "won" as const, place } : { number: c.number, tone: c.state === "sent" ? "taken" : c.state };
    });
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.linePriceCents, draw?.ranAt ?? null),
    hostedBy: ogHostedBy(page.host),
    kit: grid.kit,
    heat: grid.heat,
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
    // Published files only; the location itself never leaves this function.
    photo: page.lead?.location === "photos" ? { id: page.lead.id, prefix: page.lead.prefix } : null,
  };
}
