import type { Role } from "@/domain/types";
import { isOverdue } from "@/domain/lines/rules";
import { COLLISION_ORDER, WATCHED_PAIR, flightOf, heatStep, type Flight, type FlightColour, type FlightShape, type HeatStep, type Kit } from "@/domain/flights";
import { GLOBAL_UNPAID_CAP, SELF_CLAIM_SHARE } from "./rules";
import type { BreakPage } from "./queries";

export type CellState = "open" | "taken" | "sent" | "paid" | "reserved";
/** One grid cell as a given viewer may see it. `holder`, `flight` and `overdue` are already gated by the server. */
export type GridCell = { number: number; state: CellState; mine: boolean; overdue: boolean; bonus: boolean; holder: string | null; flight: Flight | null };
export type GridCounts = { open: number; taken: number; sent: number; paid: number; reserved: number; total: number };
export type AllowanceReason = "per_person" | "host" | "global";
export type Allowance = { remaining: number; reason: AllowanceReason; limit: number };
export type ViewerLines = { held: number[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null };
export type GridViewer = { id: string; role: Role; globalUnpaid: number };
export type GridModel = {
  cells: GridCell[]; counts: GridCounts; hostView: boolean; participant: boolean; showHolders: boolean;
  viewer: ViewerLines | null; allowance: Allowance;
  /** Public and the same for every viewer (Mosaic §4, §6): the host's kit and the lamp's step. */
  kit: Kit; heat: HeatStep;
};

/** From Closed on (closed, running draw, ran) the lamp is frozen at its top step (Mosaic §4 Heat). */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["filled", "drawing", "drawn"]);

export function isHostView(hostId: string, viewer: { id: string; role: Role } | null): boolean {
  return !!viewer && (viewer.id === hostId || viewer.role === "admin");
}

/** Drafts are private to their host (and admins). */
export function canViewBreak(status: string, hostView: boolean): boolean {
  return status !== "draft" || hostView;
}

function stateOf(l: BreakPage["lines"][number]): CellState {
  if (l.reservedForMiniId && !l.ownerId) return "reserved";
  if (!l.ownerId) return "open";
  if (l.paidAt) return "paid";
  if (l.sentAt) return "sent";
  return "taken";
}

/** Mirrors assertCaps: how many more lines this viewer may claim, and which cap binds first. */
export function allowanceFor(p: { maxLinesPerUser: number | null; lineCount: number; heldNumbered: number; isHost: boolean; globalUnpaid: number }): Allowance {
  const options: Allowance[] = [];
  if (p.maxLinesPerUser !== null) options.push({ reason: "per_person", limit: p.maxLinesPerUser, remaining: p.maxLinesPerUser - p.heldNumbered });
  if (p.isHost) {
    const cap = Math.floor(p.lineCount * SELF_CLAIM_SHARE);
    options.push({ reason: "host", limit: cap, remaining: cap - p.heldNumbered });
  }
  options.push({ reason: "global", limit: GLOBAL_UNPAID_CAP, remaining: GLOBAL_UNPAID_CAP - p.globalUnpaid });
  const tightest = options.reduce((a, o) => (o.remaining < a.remaining ? o : a));
  return { ...tightest, remaining: Math.max(0, tightest.remaining) };
}

/**
 * The per-break collision rule (Mosaic §5). Holders in claim order (first claim in this break, ties by id); when one
 * shares a flight with an earlier holder, or a shape within a watched pair (yellow and lime, petrol and plum), they show
 * the next shape after their own in standard → pear → kite → slim that neither their colour nor its pair already shows.
 * With all four taken, the flight shows unchanged. Nothing is stored: a release recomputes, and every member viewer
 * gets the same answer. "Next" is read cyclically from the holder's own shape; claim order is by first claim (recorded ruling 14).
 */
export function shownFlights(holders: readonly { id: string; firstClaimAt: Date; flight: Flight }[]): Map<string, Flight> {
  const ordered = [...holders].sort((a, b) => a.firstClaimAt.getTime() - b.firstClaimAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shown = new Map<FlightColour, Set<FlightShape>>();
  const out = new Map<string, Flight>();
  for (const h of ordered) {
    const { colour } = h.flight;
    const pair = WATCHED_PAIR[colour];
    const taken = (s: FlightShape) => (shown.get(colour)?.has(s) ?? false) || (pair ? (shown.get(pair)?.has(s) ?? false) : false);
    let shape = h.flight.shape;
    if (taken(shape)) {
      const start = COLLISION_ORDER.indexOf(shape);
      shape = [1, 2, 3].map((k) => COLLISION_ORDER[(start + k) % COLLISION_ORDER.length]).find((s) => !taken(s)) ?? h.flight.shape;
    }
    if (!shown.has(colour)) shown.set(colour, new Set());
    shown.get(colour)!.add(shape);
    out.set(h.id, { colour, shape });
  }
  return out;
}

/** Each holder's stored flight and first claim in this break, through the collision rule. */
function holderFlights(ls: BreakPage["lines"]): Map<string, Flight> {
  const first = new Map<string, { firstClaimAt: Date; flight: Flight }>();
  for (const l of ls) {
    if (!l.ownerId || !l.ownerFlightColour || !l.ownerFlightShape) continue;
    const at = l.claimedAt ?? new Date(0);
    const cur = first.get(l.ownerId);
    if (!cur || at < cur.firstClaimAt) first.set(l.ownerId, { firstClaimAt: at, flight: flightOf({ flightColour: l.ownerFlightColour, flightShape: l.ownerFlightShape }) });
  }
  return shownFlights([...first].map(([id, h]) => ({ id, ...h })));
}

export function shapeGrid(page: BreakPage, viewer: GridViewer | null, now: Date): GridModel {
  const b = page.break;
  const hostView = isHostView(b.hostId, viewer);
  const participant = !!viewer && page.lines.some((l) => l.ownerId === viewer.id);
  const showHolders = hostView || participant;
  const sorted = [...page.lines].sort((x, y) => x.number - y.number);
  // Flights are holder data (Mosaic §6): computed only for viewers who see holders, and set under the same condition as
  // holder (`showHolders && l.ownerId`). The values can still differ: holder is null for an owner with no handle.
  const flights = showHolders ? holderFlights(sorted) : new Map<string, Flight>();

  const cells: GridCell[] = sorted.map((l) => ({
    number: l.number,
    state: stateOf(l),
    mine: !!viewer && l.ownerId === viewer.id,
    overdue: hostView && isOverdue(l, b, now),
    bonus: l.isBonus,
    holder: showHolders && l.ownerId ? l.ownerHandle : null,
    flight: showHolders && l.ownerId ? (flights.get(l.ownerId) ?? null) : null,
  }));

  const counts: GridCounts = { open: 0, taken: 0, sent: 0, paid: 0, reserved: 0, total: b.lineCount };
  for (const c of cells) if (!c.bonus && c.number <= b.lineCount) counts[c.state] += 1;

  let viewerLines: ViewerLines | null = null;
  if (viewer) {
    const mine = sorted.filter((l) => l.ownerId === viewer.id);
    const unsentRows = mine.filter((l) => !l.paidAt && !l.sentAt);
    const firstClaim = unsentRows.reduce<Date | null>((min, l) => (l.claimedAt && (!min || l.claimedAt < min) ? l.claimedAt : min), null);
    viewerLines = {
      held: mine.map((l) => l.number),
      unsent: unsentRows.map((l) => l.number),
      sent: mine.filter((l) => !l.paidAt && l.sentAt).map((l) => l.number),
      paid: mine.filter((l) => l.paidAt).map((l) => l.number),
      owedCents: unsentRows.reduce((s, l) => s + (l.priceCents ?? b.linePriceCents), 0),
      payBy: firstClaim ? new Date(firstClaim.getTime() + b.paymentWindowHours * 3_600_000) : null,
    };
  }

  const heldNumbered = viewer ? sorted.filter((l) => l.ownerId === viewer.id && !l.isBonus).length : 0;
  const allowance = allowanceFor({
    maxLinesPerUser: b.maxLinesPerUser, lineCount: b.lineCount, heldNumbered,
    isHost: !!viewer && viewer.id === b.hostId, globalUnpaid: viewer?.globalUnpaid ?? 0,
  });
  const heat = heatStep(counts.open, b.lineCount, CLOSED_STATUSES.has(b.status));
  return { cells, counts, hostView, participant, showHolders, viewer: viewerLines, allowance, kit: page.host.kit, heat };
}
