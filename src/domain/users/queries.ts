import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";
import { normalizeHandle } from "./commands";

export type Account = { handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date };

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({ handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId));
  return r ?? null;
}

export type HandleState = { state: "free" | "taken" } | { state: "invalid"; message: string };

/**
 * Live availability for onboarding (design §5.10), normalised exactly as onboarding stores handles. Says only
 * taken or free: no id, name or other detail of whoever holds it. The caller's own handle reads as free.
 */
export async function handleStatus(tx: Tx, raw: string, selfId: string): Promise<HandleState> {
  let handle: string;
  try {
    handle = normalizeHandle(raw);
  } catch (e) {
    if (e instanceof InvalidInput) return { state: "invalid", message: e.message };
    throw e;
  }
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`lower(${users.handle}) = ${handle} and ${users.id} <> ${selfId}`);
  return { state: r.n > 0 ? "taken" : "free" };
}
