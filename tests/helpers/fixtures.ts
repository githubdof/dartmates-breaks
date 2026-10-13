import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, breaks, breakItems, prizes, lines } from "@/db/schema";
import { commitment } from "@/crypto/commit";

// Random, not Date.now(): parallel vitest workers would collide on the same millisecond.
const uniq = () => randomBytes(6).toString("hex");

export async function makeUser(tx: Tx, opts: { role?: "member" | "host" | "admin"; handle?: string } = {}) {
  const id = randomUUID();
  const handle = opts.handle ?? `u${uniq()}`;
  await tx.insert(users).values({
    id, email: `${handle}@example.com`, handle, displayName: handle,
    role: opts.role ?? "member", ageConfirmedAt: new Date(),
  });
  return { id, handle };
}

export async function makeBreak(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; status?: string; kind?: string }) {
  const [b] = await tx.insert(breaks).values({
    hostId: opts.hostId, title: `Break ${uniq()}`, lineCount: opts.lineCount ?? 12,
    linePriceCents: opts.linePriceCents ?? 2000, status: opts.status ?? "draft", kind: opts.kind ?? "main",
  }).returning();
  const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: "Darts" }).returning();
  await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  return b;
}

/** Shortcut for tests that need an open break with lines but don't test `breaks.open` itself. */
export async function openBreakWithLines(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number }) {
  const b = await makeBreak(tx, { ...opts, status: "draft" });
  const secret = randomBytes(32);
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${b.id}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${b.id}::uuid, generate_series(1, ${b.lineCount})`);
  return { ...b, status: "open", secret };
}

export async function lineRows(tx: Tx, breakId: string) {
  return tx.select().from(lines).where(sql`${lines.breakId} = ${breakId}`).orderBy(lines.number);
}

/** Ledger invariants that must hold after any interleaving. Called at the end of each concurrency test (Task 10). */
export async function assertInvariants(tx: Tx): Promise<void> {
  const ids = (rows: Record<string, unknown>[]) => rows.map((r) => Object.values(r).join(":")).join(", ");
  const paidUnowned = await tx.execute<{ break_id: string; number: number }>(sql`
    select break_id, number from lines where paid_at is not null and owner_id is null`);
  if (paidUnowned.length) throw new Error(`paid lines without owner: ${ids(paidUnowned)}`);
  const ownedUnclaimed = await tx.execute<{ break_id: string; number: number }>(sql`
    select break_id, number from lines where owner_id is not null and claimed_at is null`);
  if (ownedUnclaimed.length) throw new Error(`owned lines without claimed_at: ${ids(ownedUnclaimed)}`);
  const unpaidInFull = await tx.execute<{ break_id: string; number: number }>(sql`
    select l.break_id, l.number from lines l join breaks b on b.id = l.break_id
    where b.status in ('filled','drawing','drawn') and l.number <= b.line_count and l.paid_at is null`);
  if (unpaidInFull.length) throw new Error(`unpaid numbered lines in a filled/drawing/drawn break: ${ids(unpaidInFull)}`);
}
