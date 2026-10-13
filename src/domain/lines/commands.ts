import { sql, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines } from "@/db/schema";
import { lockBreak, assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { assertCaps, isOverdue, validateNumbers } from "./rules";

type BreakRow = typeof breaks.$inferSelect;

/** postgres-js can't bind a JS array to `any(...)` inside a raw template with prepare:false; pass a Postgres array literal. */
const intArray = (ns: number[]) => sql`${`{${ns.join(",")}}`}::int[]`;

/** Claims are main-break only in Plan 1; minis and free draws arrive in Plan 2. */
function assertClaimable(b: BreakRow): void {
  if (b.status !== "open") throw new NotOpen(b.status);
  if (b.kind !== "main") throw new InvalidInput("not a main break");
}

async function heldBy(tx: Tx, breakId: string, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.breakId} = ${breakId} and ${lines.ownerId} = ${userId} and ${lines.isBonus} = false`);
  return r.n;
}
async function globalUnpaid(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${userId} and ${lines.paidAt} is null`);
  return r.n;
}

async function assign(tx: Tx, b: BreakRow, caller: Caller, numbers: number[], batchId: string): Promise<number[]> {
  if (numbers.length === 0) return [];
  const rows = await tx.execute<{ number: number }>(sql`
    update lines set owner_id = ${caller.id}, claimed_at = now(), price_cents = ${b.linePriceCents}, claim_batch_id = ${batchId}
    where break_id = ${b.id} and number = any(${intArray(numbers)}) and owner_id is null and reserved_for_mini_id is null
    returning number`);
  return rows.map((r) => r.number).sort((x, y) => x - y);
}

async function finishClaim(tx: Tx, b: BreakRow, caller: Caller, got: number[], batchId: string, ipHash?: string) {
  if (got.length === 0) return;
  // A same-batch retry that obtains more lines must not trip events_batch_uq. Free draws (auto-paid): Plan 2.
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.claimed", payload: { numbers: got }, batchId, ipHash }, { ignoreDuplicateBatch: true });
}

export async function claimLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[]; batchId: string; ipHash?: string }): Promise<{ got: number[]; taken: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  assertClaimable(b);
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const mine = (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id} and ${inArray(lines.number, numbers)}`)).map((r) => r.number);
  const wanted = numbers.filter((n) => !mine.includes(n));
  // Caps count only lines that are actually free right now (the break row lock keeps this stable).
  const free = wanted.length === 0 ? [] : (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${inArray(lines.number, wanted)}`)).map((r) => r.number);
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: free.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const got = await assign(tx, b, caller, free, p.batchId);
  const taken = wanted.filter((n) => !got.includes(n));
  if (got.length === 0 && mine.length === 0) throw new LineTaken(taken);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got: [...mine, ...got].sort((x, y) => x - y), taken };
}

export async function claimRandom(tx: Tx, caller: Caller, p: { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  assertClaimable(b);
  if (!b.allowRandomClaims) throw new InvalidInput("This break doesn't allow random lines");
  if (!Number.isInteger(p.count) || p.count < 1) throw new InvalidInput("Ask for at least one line");
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: p.count, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const picked = await tx.execute<{ number: number }>(sql`
    select number from lines where break_id = ${b.id} and owner_id is null and reserved_for_mini_id is null and number <= ${b.lineCount}
    order by random() limit ${p.count} for update skip locked`);
  if (picked.length < p.count) { const e = new LineTaken([]); e.message = `Only ${picked.length} open`; throw e; }
  const got = await assign(tx, b, caller, picked.map((r) => r.number), p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function claimAllOpen(tx: Tx, caller: Caller, p: { breakId: string; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  assertClaimable(b);
  const open = (await tx.select({ number: lines.number }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)).map((r) => r.number);
  if (open.length === 0) throw new LineTaken([]);
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: open.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const got = await assign(tx, b, caller, open, p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function markSent(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<void> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  if (p.numbers.length === 0) throw new InvalidInput("Pick at least one line");
  const rows = await tx.execute<{ number: number }>(sql`
    update lines set sent_at = coalesce(sent_at, now()) where break_id = ${b.id} and owner_id = ${caller.id} and paid_at is null and number = any(${intArray(p.numbers)}) returning number`);
  if (rows.length === 0) throw new NotAuthorized("Those lines aren't yours or are already paid");
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.sent", payload: { numbers: rows.map((r) => r.number) } });
}

export async function markPaid(tx: Tx, caller: Caller, p: { breakId: string; number: number; expectedOwnerId: string }): Promise<{ filled: boolean }> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const [cur] = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  if (!cur || cur.ownerId !== p.expectedOwnerId) throw new OwnerChanged();
  if (cur.paidAt) return { filled: b.status === "filled" };
  await tx.update(lines).set({ paidAt: new Date() }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number} and ${lines.ownerId} = ${p.expectedOwnerId} and ${lines.paidAt} is null`);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.paid", payload: { number: p.number, ownerId: p.expectedOwnerId } });
  return { filled: await recomputeFill(tx, b.id, caller.id) };
}

export async function unmarkPaid(tx: Tx, caller: Caller, p: { breakId: string; number: number }): Promise<void> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const rows = await tx.execute<{ owner_id: string }>(sql`update lines set paid_at = null where break_id = ${b.id} and number = ${p.number} and paid_at is not null and award_id is null returning owner_id`);
  if (rows.length === 0) throw new InvalidInput("That line is not marked paid");
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.unpaid", payload: { number: p.number, ownerId: rows[0].owner_id } });
  await recomputeFill(tx, b.id, caller.id);
}

export async function releaseLine(tx: Tx, caller: Caller, p: { breakId: string; number: number; reason: "overdue" | "host_dropped" | "withdrawn" }): Promise<void> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const [cur] = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  if (!cur?.ownerId) throw new InvalidInput("That line is already open");
  if (cur.paidAt) throw new InvalidInput("A paid line can't be released; un-mark it first");
  const isHost = caller.id === b.hostId || caller.role === "admin";
  if (p.reason === "withdrawn" ? cur.ownerId !== caller.id : !isHost) throw new NotAuthorized("You can't release that line");
  if (p.reason === "overdue" && !isOverdue(cur, b)) throw new InvalidInput("That claim is not overdue yet");
  await tx.update(lines).set({ ownerId: null, claimedAt: null, sentAt: null, priceCents: null, claimBatchId: null }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: p.number, reason: p.reason } });
}

/** Caller must already hold the break row lock. */
export async function recomputeFill(tx: Tx, breakId: string, actorId?: string): Promise<boolean> {
  const [b] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
  const [r] = await tx.execute<{ unpaid: number; reserved: number }>(sql`
    select count(*) filter (where number <= ${b.lineCount} and paid_at is null)::int as unpaid,
           count(*) filter (where reserved_for_mini_id is not null and owner_id is null)::int as reserved
    from lines where break_id = ${breakId}`);
  const full = r.unpaid === 0 && r.reserved === 0;
  if (full && b.status === "open") {
    await tx.update(breaks).set({ status: "filled", filledAt: b.filledAt ?? new Date() }).where(sql`${breaks.id} = ${breakId}`);
    await appendEvent(tx, { breakId, actorId, type: "break.filled" });
    return true;
  }
  if (!full && b.status === "filled") {
    await tx.update(breaks).set({ status: "open" }).where(sql`${breaks.id} = ${breakId}`);
    await appendEvent(tx, { breakId, actorId, type: "break.unfilled" });
    return false;
  }
  return b.status === "filled";
}
