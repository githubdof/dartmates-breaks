import { sql, eq, asc, desc, and } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, lines, users, hostProfiles } from "@/db/schema";
import type { ClaimMode } from "./rules";
import { SYSTEM } from "@/domain/types";
import { kitFor, type Kit } from "@/domain/flights";

export type BreakPage = {
  break: typeof breaks.$inferSelect;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string }; kit: Kit };
  items: (typeof breakItems.$inferSelect)[];
  prizes: (typeof prizes.$inferSelect)[];
  /** Holders' handles and flights are read for everyone; shapeGrid alone decides who sees them (Mosaic §6). */
  lines: {
    number: number; ownerId: string | null; ownerHandle: string | null; ownerFlightColour: string | null; ownerFlightShape: string | null;
    claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; priceCents: number | null; reservedForMiniId: string | null; isBonus: boolean;
  }[];
};

export async function getBreakPage(tx: Tx, breakId: string): Promise<BreakPage | null> {
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
  if (!b) return null;
  const [host] = await tx.select({
    id: users.id, handle: users.handle, displayName: users.displayName, paymentHandles: hostProfiles.paymentHandles,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, b.hostId));
  const items = await tx.select().from(breakItems).where(eq(breakItems.breakId, breakId)).orderBy(asc(breakItems.createdAt));
  const prizeRows = await tx.select().from(prizes).where(eq(prizes.breakId, breakId)).orderBy(asc(prizes.rank));
  const lineRows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, ownerHandle: users.handle,
    ownerFlightColour: users.flightColour, ownerFlightShape: users.flightShape,
    claimedAt: lines.claimedAt, sentAt: lines.sentAt,
    paidAt: lines.paidAt, priceCents: lines.priceCents, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  return {
    break: b,
    host: { id: host.id, handle: host.handle, displayName: host.displayName, paymentHandles: host.paymentHandles ?? {}, kit: kitFor(host) },
    items, prizes: prizeRows, lines: lineRows,
  };
}

export type HostTrust = { breaksRun: number; since: Date; drawsVerified: number; stalledSince: Date | null };

/**
 * The host record (Mosaic §9) and the interim trust figures. breaksRun: drawn breaks (each has an active draw, as
 * before). since: member-since, the month the host joined (Plan B's public "member since"), the one date the record
 * and the "On Breaks since" line both say, so the profile says it once. drawsVerified: active draws of drawn breaks whose `verified_at` was set when the draw was recorded (verifyInputs passed), so it never
 * exceeds breaksRun and a voided draw counts neither way. stalledSince: the oldest Closed break still waiting for its
 * draw. Counts only: never prize totals, money or a ranking against other hosts. The id is bound as a parameter in
 * every subquery (see hostProfile on bare column names).
 */
export async function hostTrust(tx: Tx, hostId: string): Promise<HostTrust> {
  const [r] = await tx.select({
    since: users.createdAt,
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${hostId}::uuid and b.status = 'drawn')`,
    drawsVerified: sql<number>`(select count(*)::int from draws d join breaks b on b.id = d.break_id where b.host_id = ${hostId}::uuid and b.status = 'drawn' and d.voided_at is null and d.verified_at is not null)`,
    stalledSince: sql<Date | null>`(select min(b.filled_at) from breaks b where b.host_id = ${hostId}::uuid and b.status = 'filled')`.mapWith(breaks.filledAt),
  }).from(users).where(eq(users.id, hostId));
  return { breaksRun: r?.breaksRun ?? 0, since: r?.since ?? new Date(0), drawsVerified: r?.drawsVerified ?? 0, stalledSince: r?.stalledSince ?? null };
}

/** Instructions built from handles ("Venmo @x. Leave the note blank.") go stale when a handle changes: forms carry only typed ones. */
export const isGeneratedInstructions = (s: string): boolean => /^(Venmo \S+\. )?(PayPal paypal\.me\/\S+\. )?Leave the note blank\.$/.test(s.trim());

export type LastBreakDefaults = {
  lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null;
  claimMode: ClaimMode; paymentInstructions: string;
};

/** The host's most recent main break: the composer starts from it (design §5.6, hosts run several a week). */
export async function lastBreakDefaults(tx: Tx, hostId: string): Promise<LastBreakDefaults | null> {
  const [r] = await tx.select({
    lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, paymentWindowHours: breaks.paymentWindowHours,
    maxLinesPerUser: breaks.maxLinesPerUser, claimMode: breaks.claimMode, paymentInstructions: breaks.paymentInstructions,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id)).limit(1);
  if (!r) return null;
  return { ...r, paymentInstructions: isGeneratedInstructions(r.paymentInstructions) ? "" : r.paymentInstructions };
}

export async function hostPaymentHandles(tx: Tx, hostId: string): Promise<{ venmo?: string; paypal?: string }> {
  const [r] = await tx.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, hostId));
  return r?.paymentHandles ?? {};
}

export type HostBreakRow = { id: string; title: string; status: string; lineCount: number; openedAt: Date | null; paid: number; taken: number };

/** The host's main breaks for /host, newest first (minis wait for their own UI). Paid and taken count numbered lines only. */
export async function listHostBreaks(tx: Tx, hostId: string): Promise<HostBreakRow[]> {
  return tx.select({
    id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount, openedAt: breaks.openedAt,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`,
    taken: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id));
}

export type HostProfile = {
  id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number;
  /** The host record (Mosaic §9), from hostTrust. */
  drawsVerified: number; stalledSince: Date | null;
  /** The host's kit, or the default (Blue with Yellow) while they have not picked one. */
  kit: Kit;
};

/**
 * /h/{handle} (design §5.9, Mosaic §8): public figures only. Never email, payment name or payment handles. Null for an
 * unknown handle, for the SYSTEM user, and for anyone who is not a host and never listed a break (a buyer's or an
 * admin's handle is not a host profile).
 */
export async function hostProfile(tx: Tx, handle: string): Promise<HostProfile | null> {
  const [u] = await tx.select({
    id: users.id, handle: users.handle, displayName: users.displayName, role: users.role,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(sql`lower(${users.handle}) = lower(${handle})`);
  if (!u || !u.handle || u.id === SYSTEM.id) return null;
  // The id is bound as a parameter, as hostTrust does. Drizzle writes a single-table select's columns unqualified,
  // so `${users.id}` inside `from breaks b` would render as a bare "id" and Postgres would read it as b.id.
  const [c] = await tx.select({
    pastCount: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.kind = 'main' and b.status in ('drawn','cancelled'))`,
    listed: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.status <> 'draft')`,
  }).from(users).where(eq(users.id, u.id));
  if (c.listed === 0 && u.role !== "host") return null;
  const t = await hostTrust(tx, u.id);
  return {
    id: u.id, handle: u.handle, displayName: u.displayName, since: t.since, breaksRun: t.breaksRun, pastCount: c.pastCount,
    drawsVerified: t.drawsVerified, stalledSince: t.stalledSince, kit: kitFor(u),
  };
}

export type DraftForEdit = {
  id: string; hostId: string; status: string; title: string; description: string; lineCount: number; linePriceCents: number;
  paymentWindowHours: number; maxLinesPerUser: number | null; claimMode: ClaimMode; paymentInstructions: string;
  topSpot: string[]; secondPlace: string[];
};

/** A break's editable fields and prize names by rank. The caller decides who may see it (drafts: the host and admins). */
export async function draftForEdit(tx: Tx, breakId: string): Promise<DraftForEdit | null> {
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
  if (!b) return null;
  // Only the prize names: no lines, no holders.
  const rows = await tx.select({ rank: prizes.rank, name: breakItems.name }).from(prizes)
    .innerJoin(breakItems, eq(breakItems.id, prizes.itemId)).where(eq(prizes.breakId, breakId))
    .orderBy(asc(prizes.rank), asc(breakItems.createdAt), asc(breakItems.id));
  const names = (rank: number) => rows.filter((r) => r.rank === rank).map((r) => r.name);
  return {
    id: b.id, hostId: b.hostId, status: b.status, title: b.title, description: b.description, lineCount: b.lineCount, linePriceCents: b.linePriceCents,
    paymentWindowHours: b.paymentWindowHours, maxLinesPerUser: b.maxLinesPerUser, claimMode: b.claimMode, paymentInstructions: b.paymentInstructions,
    topSpot: names(1), secondPlace: names(2),
  };
}
