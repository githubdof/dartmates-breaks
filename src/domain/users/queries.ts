import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";

export type Account = { handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date };

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({ handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId));
  return r ?? null;
}
