import { sql, eq, and, asc, desc, inArray, isNull, isNotNull, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws, hostProfiles, lines, users } from "@/db/schema";
import { heatStep, kitFor, type HeatStep, type Kit } from "@/domain/flights";
import type { CellState } from "./grid";

export const FEED_SORTS = ["newest", "filling", "almost"] as const;
/**
 * newest: opened_at desc. filling: numbered lines paid in the last 24 h, most first. almost: fewest open numbered
 * lines first (platform spec §13 "closing soon", design §6 "Almost full"). Ties fall to the newest opened.
 */
export type FeedSort = (typeof FEED_SORTS)[number];
export const isFeedSort = (v: unknown): v is FeedSort => typeof v === "string" && (FEED_SORTS as readonly string[]).includes(v);

export type FeedHost = { id: string; handle: string | null; displayName: string | null; breaksRun: number; since: Date };
export type FeedBreak = {
  id: string; title: string; lineCount: number; linePriceCents: number; openedAt: Date;
  /** Numbered lines only (bonus lines never count). open: unowned and not reserved; taken: owned and unpaid, sent included. */
  open: number; taken: number; paid: number; paidLastDay: number;
  host: FeedHost;
  /** Public (Mosaic §6): the host's kit and the lamp's step, never a flight. The feed lists open breaks, so the lamp is never closed here. */
  kit: Kit; heat: HeatStep;
};

const DAY_MS = 86_400_000;

/** Open main breaks for the feed, the landing page and the host profile. Drafts, closed, ran and mini breaks never appear. */
export async function listFeed(tx: Tx, p: { sort: FeedSort; hostHandle?: string | null; limit?: number; now: Date }): Promise<FeedBreak[]> {
  const since = new Date(p.now.getTime() - DAY_MS).toISOString();
  const open = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is null and l.reserved_for_mini_id is null and l.number <= ${breaks.lineCount})`;
  const taken = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`;
  const paid = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`;
  const paidLastDay = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at > ${since}::timestamptz and l.number <= ${breaks.lineCount})`;
  // Same rule as hostTrust: the host's drawn breaks, of any kind.
  const breaksRun = sql<number>`(select count(*)::int from breaks b2 where b2.host_id = ${breaks.hostId} and b2.status = 'drawn')`;
  const order: SQL[] =
    p.sort === "filling" ? [desc(paidLastDay), desc(breaks.openedAt), desc(breaks.id)]
    : p.sort === "almost" ? [asc(open), desc(breaks.openedAt), desc(breaks.id)]
    : [desc(breaks.openedAt), desc(breaks.id)];
  const where: SQL[] = [eq(breaks.status, "open"), eq(breaks.kind, "main"), isNull(users.bannedAt)]; // a banned host's breaks leave the feed
  if (p.hostHandle) where.push(sql`lower(${users.handle}) = lower(${p.hostHandle})`);
  const rows = await tx.select({
    id: breaks.id, title: breaks.title, lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, openedAt: breaks.openedAt,
    open, taken, paid, paidLastDay,
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, hostSince: users.createdAt, breaksRun,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId)).leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(and(...where)).orderBy(...order).limit(p.limit ?? 50);
  return rows.map((r) => ({
    id: r.id, title: r.title, lineCount: r.lineCount, linePriceCents: r.linePriceCents,
    openedAt: r.openedAt ?? new Date(0), // an open break always has opened_at
    open: r.open, taken: r.taken, paid: r.paid, paidLastDay: r.paidLastDay,
    host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, breaksRun: r.breaksRun, since: r.hostSince },
    kit: kitFor(r),
    heat: heatStep(r.open, r.lineCount, false),
  }));
}

export type ThumbCell = { number: number; state: CellState; bonus: boolean };

/**
 * State-only cells for thumbnails. Owner ids and handles are not even selected, so nothing about who holds a line can
 * reach a card (on the break grid, holders stay shapeGrid's call). Every requested id gets an entry.
 */
export async function feedThumbs(tx: Tx, breakIds: readonly string[]): Promise<Map<string, ThumbCell[]>> {
  const out = new Map<string, ThumbCell[]>(breakIds.map((id) => [id, []]));
  if (breakIds.length === 0) return out;
  const rows = await tx.select({
    breakId: lines.breakId, number: lines.number, isBonus: lines.isBonus,
    owned: sql<boolean>`${lines.ownerId} is not null`,
    sent: sql<boolean>`${lines.sentAt} is not null`,
    paid: sql<boolean>`${lines.paidAt} is not null`,
    reserved: sql<boolean>`${lines.reservedForMiniId} is not null`,
  }).from(lines).where(inArray(lines.breakId, [...breakIds])).orderBy(asc(lines.breakId), asc(lines.number));
  for (const r of rows) {
    const state: CellState = r.reserved && !r.owned ? "reserved" : !r.owned ? "open" : r.paid ? "paid" : r.sent ? "sent" : "taken";
    out.get(r.breakId)?.push({ number: r.number, state, bonus: r.isBonus });
  }
  return out;
}

/** Hosts with at least one open main break, for the feed's host filter. */
export async function feedHosts(tx: Tx): Promise<{ handle: string }[]> {
  const rows = await tx.selectDistinct({ handle: users.handle }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId))
    .where(and(eq(breaks.status, "open"), eq(breaks.kind, "main"), isNotNull(users.handle), isNull(users.bannedAt))).orderBy(asc(users.handle));
  return rows.flatMap((r) => (r.handle ? [{ handle: r.handle }] : []));
}

export type LatestRan = { breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date };

/** The landing hero (design §5.2): the most recent main break that ran, read from its active (not voided) draw; never a banned host's. */
export async function latestRanBreak(tx: Tx): Promise<LatestRan | null> {
  const [r] = await tx.select({ breakId: breaks.id, title: breaks.title, lineCount: breaks.lineCount, ranking: draws.ranking, ranAt: draws.createdAt })
    .from(draws).innerJoin(breaks, eq(breaks.id, draws.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .where(and(isNull(draws.voidedAt), eq(breaks.status, "drawn"), eq(breaks.kind, "main"), isNull(users.bannedAt)))
    .orderBy(desc(draws.createdAt), desc(draws.id)).limit(1);
  if (!r || r.ranking.length === 0) return null;
  return { breakId: r.breakId, title: r.title, lineCount: r.lineCount, topLine: r.ranking[0], ranAt: r.ranAt };
}
