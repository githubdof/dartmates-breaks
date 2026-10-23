import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks } from "@/db/schema";
import { NotAuthorized, NotFound, NotOnboarded } from "@/domain/errors";
import type { Caller } from "@/domain/types";

export type BreakRow = typeof breaks.$inferSelect;

/**
 * Row-locks the break. Every command that mutates a break or its lines calls this first. A deleted draft (a tombstone
 * kept for its events, photos spec §9) is not found, so every command refuses it.
 */
export async function lockBreak(tx: Tx, breakId: string): Promise<BreakRow> {
  const rows = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`).for("update");
  if (rows.length === 0 || rows[0].deletedAt !== null) throw new NotFound("Break not found");
  return rows[0];
}

export async function assertHostOf(tx: Tx, caller: Caller, breakId: string): Promise<BreakRow> {
  const b = await lockBreak(tx, breakId);
  if (b.hostId !== caller.id && caller.role !== "admin") throw new NotAuthorized("Only the host can do that");
  return b;
}

export function assertOnboarded(caller: Caller): void {
  if (caller.banned) throw new NotAuthorized("This account is suspended");
  if (!caller.onboarded) throw new NotOnboarded();
}

export function assertAdmin(caller: Caller): void {
  if (caller.role !== "admin") throw new NotAuthorized("Admins only");
}
