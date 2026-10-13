import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { finalisePendingDraws } from "./finalise-draws";
import { beaconFromEnv, type BeaconSource } from "@/crypto/beacon";

/** Runs fn inside the transaction that holds the job's advisory xact lock, so the lock covers the work. */
async function withJobLock<T>(name: string, fn: (tx: Tx) => Promise<T>): Promise<T | "locked"> {
  return db.transaction(async (tx) => {
    const [{ got }] = await tx.execute<{ got: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${"job:" + name})) as got`);
    if (!got) return "locked" as const;
    return fn(tx);
  });
}

export async function runTick(deps: { beacon?: BeaconSource; now?: Date } = {}) {
  const beacon = deps.beacon ?? beaconFromEnv();
  const now = deps.now ?? new Date();
  const round = beacon.roundAt(now);
  const draws = await withJobLock("finalise-draws", (tx) => finalisePendingDraws(tx, beacon, round));
  return { draws };
}
