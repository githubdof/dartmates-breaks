import { sql, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, events, lines } from "@/db/schema";
import { lockBreak, assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { CapExceeded, InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { bonusAllowance } from "@/domain/breaks/rules";
import { assertCaps, isOverdue, validateNumbers } from "./rules";
import { globalUnpaidCount } from "./queries";

type BreakRow = typeof breaks.$inferSelect;

/** postgres-js can't bind a JS array to `any(...)` inside a raw template with prepare:false; pass a Postgres array literal. */
const intArray = (ns: number[]) => sql`${`{${ns.join(",")}}`}::int[]`;

/** "Every line is taken." / "Only 1 line is open." / "Only 3 lines are open." — no partial random or straight-fill claims. */
function onlyOpen(n: number): LineTaken {
  const e = new LineTaken([]);
  e.message = n === 0 ? "Every line is taken." : `Only ${n} ${n === 1 ? "line is" : "lines are"} open.`;
  return e;
}

/** "Take the last 3" pressed after lines moved: the bar's count no longer matches what is open. */
function openChanged(): LineTaken {
  const e = new LineTaken([]);
  e.message = "The open lines just changed. Check the board and try again.";
  return e;
}

/** A bonus line goes with holding a numbered line (spec §7): once a buyer holds none in the break, their bonus lines go too. */
async function dropOrphanBonus(tx: Tx, b: BreakRow, ownerId: string, actorId: string): Promise<number[]> {
  const [held] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${ownerId} and ${lines.isBonus} = false`);
  if (held.n > 0) return [];
  const rows = await tx.execute<{ number: number }>(sql`delete from lines where break_id = ${b.id} and owner_id = ${ownerId} and is_bonus = true returning number`);
  const numbers = rows.map((r) => r.number).sort((x, y) => x - y);
  for (const number of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId, type: "line.bonus_removed", payload: { number, ownerId, reason: "no_numbered_line" } });
  }
  return numbers;
}

/** Claims are main-break only in Plan 1; minis and free draws arrive in Plan 2. */
function assertClaimable(b: BreakRow): void {
  if (b.status !== "open") throw new NotOpen(b.status);
  if (b.kind !== "main") throw new InvalidInput("not a main break");
}

async function heldBy(tx: Tx, breakId: string, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.breakId} = ${breakId} and ${lines.ownerId} = ${userId} and ${lines.isBonus} = false`);
  return r.n;
}
/** Serializes a buyer's claims across breaks so the platform-wide unpaid cap can't be overshot by parallel claims. */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"user:" + userId}))`);
}

/**
 * A retry of a random, next or take-the-rest claim (same batch id, e.g. after a lost response) returns the lines that
 * batch already got, with no caps check and no new event. Runs before assertClaimable so a retry after the claim that
 * closed the break still succeeds. Null when this batch claimed nothing yet.
 */
async function priorBatch(tx: Tx, breakId: string, callerId: string, batchId: string): Promise<{ got: number[] } | null> {
  const got = (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${breakId} and ${lines.ownerId} = ${callerId} and ${lines.claimBatchId} = ${batchId}`)
    .orderBy(lines.number)).map((r) => r.number);
  return got.length > 0 ? { got } : null;
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
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  assertClaimable(b);
  if (b.claimMode === "straight") throw new InvalidInput("This break fills in order. Say how many lines you want.");
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const mine = (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id} and ${inArray(lines.number, numbers)}`)).map((r) => r.number);
  const wanted = numbers.filter((n) => !mine.includes(n));
  // Caps count only lines that are actually free right now (the break row lock keeps this stable).
  const free = wanted.length === 0 ? [] : (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${inArray(lines.number, wanted)}`)).map((r) => r.number);
  const isHost = caller.id === b.hostId;
  // A retry where the caller already holds everything requested claims nothing new, so no cap applies.
  if (free.length > 0) assertCaps({ requested: free.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaidCount(tx, caller.id) });
  const got = await assign(tx, b, caller, free, p.batchId);
  const taken = wanted.filter((n) => !got.includes(n));
  if (got.length === 0 && mine.length === 0) throw new LineTaken(taken);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got: [...mine, ...got].sort((x, y) => x - y), taken };
}

export async function claimRandom(tx: Tx, caller: Caller, p: { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  const prior = await priorBatch(tx, b.id, caller.id, p.batchId);
  if (prior) return prior;
  assertClaimable(b);
  if (b.claimMode !== "pick_or_random") throw new InvalidInput("This break doesn't allow random lines");
  if (!Number.isInteger(p.count) || p.count < 1) throw new InvalidInput("Ask for at least one line");
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: p.count, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaidCount(tx, caller.id) });
  const picked = await tx.execute<{ number: number }>(sql`
    select number from lines where break_id = ${b.id} and owner_id is null and reserved_for_mini_id is null and number <= ${b.lineCount}
    order by random() limit ${p.count} for update skip locked`);
  if (picked.length < p.count) throw onlyOpen(picked.length);
  const got = await assign(tx, b, caller, picked.map((r) => r.number), p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

/** Straight fill: the caller gets the lowest open numbers, all or nothing. The break row lock serialises callers. */
export async function claimNext(tx: Tx, caller: Caller, p: { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  const prior = await priorBatch(tx, b.id, caller.id, p.batchId);
  if (prior) return prior;
  assertClaimable(b);
  if (b.claimMode !== "straight") throw new InvalidInput("This break lets you pick your lines");
  if (!Number.isInteger(p.count) || p.count < 1) throw new InvalidInput("Ask for at least one line");
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: p.count, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaidCount(tx, caller.id) });
  const next = (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)
    .orderBy(lines.number).limit(p.count)).map((r) => r.number);
  if (next.length < p.count) throw onlyOpen(next.length);
  const got = await assign(tx, b, caller, next, p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function claimAllOpen(tx: Tx, caller: Caller, p: { breakId: string; batchId: string; expected?: number; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  const prior = await priorBatch(tx, b.id, caller.id, p.batchId);
  if (prior) return prior;
  assertClaimable(b);
  const open = (await tx.select({ number: lines.number }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)).map((r) => r.number);
  if (open.length === 0) throw new LineTaken([]);
  // "Take the last 3" means those three: if lines reopened or went since the bar was drawn, claim nothing and say so.
  if (p.expected !== undefined && open.length !== p.expected) throw openChanged();
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: open.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaidCount(tx, caller.id) });
  const got = await assign(tx, b, caller, open, p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function markSent(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<void> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const rows = await tx.execute<{ number: number }>(sql`
    update lines set sent_at = now()
    where break_id = ${b.id} and owner_id = ${caller.id} and paid_at is null and sent_at is null and number = any(${intArray(numbers)})
    returning number`);
  if (rows.length === 0) {
    // Nothing newly sent: fine if the caller already marked these sent (retry), otherwise they aren't the caller's to mark.
    const [held] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines)
      .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id} and ${lines.paidAt} is null and ${inArray(lines.number, numbers)}`);
    if (held.n === 0) throw new NotAuthorized("Those lines aren't yours or are already paid");
    return;
  }
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.sent", payload: { numbers: rows.map((r) => r.number).sort((x, y) => x - y) } });
}

export async function markPaid(tx: Tx, caller: Caller, p: { breakId: string; number: number; expectedOwnerId: string }): Promise<{ filled: boolean }> {
  assertOnboarded(caller);
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
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  // Bonus lines are free and always paid: never un-mark them (they would count toward the buyer's unpaid cap).
  const rows = await tx.execute<{ owner_id: string }>(sql`update lines set paid_at = null where break_id = ${b.id} and number = ${p.number} and paid_at is not null and award_id is null and is_bonus = false returning owner_id`);
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
  await dropOrphanBonus(tx, b, cur.ownerId, caller.id);
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

/** Host releases several of one buyer's unpaid lines in one transaction: all of them or none. */
export async function releaseForBuyer(tx: Tx, caller: Caller, p: { breakId: string; ownerId: string; numbers: number[]; reason: "overdue" | "host_dropped" }): Promise<{ released: number[] }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, p.breakId); // locks the break row first
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const current = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${inArray(lines.number, numbers)}`).for("update");
  for (const n of numbers) {
    const l = current.find((r) => r.number === n);
    if (!l || l.ownerId !== p.ownerId) throw new OwnerChanged();
    if (l.paidAt) throw new InvalidInput(`Line ${n} is paid. Un-mark it first.`);
    if (p.reason === "overdue" && !isOverdue(l, b)) throw new InvalidInput(`Line ${n} is not overdue yet`);
  }
  await tx.update(lines).set({ ownerId: null, claimedAt: null, sentAt: null, priceCents: null, claimBatchId: null })
    .where(sql`${lines.breakId} = ${b.id} and ${inArray(lines.number, numbers)} and ${lines.ownerId} = ${p.ownerId} and ${lines.paidAt} is null`);
  for (const n of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: n, reason: p.reason } });
  }
  await dropOrphanBonus(tx, b, p.ownerId, caller.id);
  return { released: numbers };
}

/** Host gives a participant a free, already-paid line numbered above N (spec §7 bonus). */
export async function addBonusLine(tx: Tx, caller: Caller, p: { breakId: string; ownerId: string }): Promise<{ number: number }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, p.breakId); // locks the break row first
  // Bonus lines are free and skip the self-claim cap: the host never grants one to themselves.
  if (p.ownerId === b.hostId) throw new InvalidInput("Bonus lines go to buyers, not the host");
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  if (b.kind !== "main") throw new InvalidInput("Bonus lines are for main breaks only");
  const [held] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${p.ownerId} and ${lines.number} <= ${b.lineCount}`);
  if (held.n === 0) throw new InvalidInput("A bonus line goes to someone who holds a line in this break");
  const [agg] = await tx.select({ used: sql<number>`(count(*) filter (where ${lines.isBonus}))::int` }).from(lines).where(sql`${lines.breakId} = ${b.id}`);
  const max = bonusAllowance(b.lineCount);
  if (agg.used >= max) throw new CapExceeded("bonus lines", max);
  // Numbered from every bonus line ever added, not the highest one left: a removed bonus line's number is never given again.
  const [added] = await tx.select({ n: sql<number>`count(*)::int` }).from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.bonus_added'`);
  const number = b.lineCount + added.n + 1;
  const now = new Date();
  await tx.insert(lines).values({ breakId: b.id, number, ownerId: p.ownerId, claimedAt: now, paidAt: now, priceCents: 0, isBonus: true });
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.bonus_added", payload: { number, ownerId: p.ownerId } });
  return { number };
}

/** A buyer gives back unpaid lines (reason `withdrawn`). All or nothing: any refusal throws, and the caller's transaction rolls back. */
export async function giveBackLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<{ released: number[] }> {
  for (const number of p.numbers) await releaseLine(tx, caller, { breakId: p.breakId, number, reason: "withdrawn" });
  return { released: p.numbers };
}

/** The host un-marks paid lines (the ledger's Undo and per-line un-mark); each logs `line.unpaid`. All or nothing, as above. */
export async function unmarkPaidLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<void> {
  assertOnboarded(caller);
  for (const number of p.numbers) await unmarkPaid(tx, caller, { breakId: p.breakId, number });
}
