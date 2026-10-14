import type { Role } from "@/domain/types";
import { isOverdue } from "@/domain/lines/rules";
import { GLOBAL_UNPAID_CAP, SELF_CLAIM_SHARE } from "./rules";
import type { BreakPage } from "./queries";

export type CellState = "open" | "taken" | "sent" | "paid" | "reserved";
/** One grid cell as a given viewer may see it. `holder` and `overdue` are already gated by the server. */
export type GridCell = { number: number; state: CellState; mine: boolean; overdue: boolean; bonus: boolean; holder: string | null };
export type GridCounts = { open: number; taken: number; sent: number; paid: number; reserved: number; total: number };
export type AllowanceReason = "per_person" | "host" | "global";
export type Allowance = { remaining: number; reason: AllowanceReason; limit: number };
export type ViewerLines = { held: number[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null };
export type GridViewer = { id: string; role: Role; globalUnpaid: number };
export type GridModel = {
  cells: GridCell[]; counts: GridCounts; hostView: boolean; participant: boolean; showHolders: boolean;
  viewer: ViewerLines | null; allowance: Allowance;
};

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

export function shapeGrid(page: BreakPage, viewer: GridViewer | null, now: Date): GridModel {
  const b = page.break;
  const hostView = isHostView(b.hostId, viewer);
  const participant = !!viewer && page.lines.some((l) => l.ownerId === viewer.id);
  const showHolders = hostView || participant;
  const sorted = [...page.lines].sort((x, y) => x.number - y.number);

  const cells: GridCell[] = sorted.map((l) => ({
    number: l.number,
    state: stateOf(l),
    mine: !!viewer && l.ownerId === viewer.id,
    overdue: hostView && isOverdue(l, b, now),
    bonus: l.isBonus,
    holder: showHolders && l.ownerId ? l.ownerHandle : null,
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
  return { cells, counts, hostView, participant, showHolders, viewer: viewerLines, allowance };
}
