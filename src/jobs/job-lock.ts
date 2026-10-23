import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Runs `work` while a holder transaction keeps the job's transaction-scoped advisory lock (key
 * `hashtext('job:' || name)`, as tick.ts's withJobLock), or answers "locked" when another run has it. The holder runs
 * no other statement: `work` does its reads and writes on other connections. A session lock would not hold, since the
 * pool is a transaction-mode pooler with no session state.
 */
export async function withHeldJobLock<T>(name: string, work: () => Promise<T>): Promise<T | "locked"> {
  return db.transaction(async (holder) => {
    const [{ got }] = await holder.execute<{ got: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${"job:" + name})) as got`);
    if (!got) return "locked" as const;
    return work();
  });
}
