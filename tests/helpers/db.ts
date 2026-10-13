import { db, type Tx } from "@/db/client";

class Rollback extends Error {}

/** Run fn in a transaction that is always rolled back, so tests leave no rows. */
export async function withTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
