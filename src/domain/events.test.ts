import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { appendEvent } from "./events";
import { events } from "@/db/schema";

describe("appendEvent", () => {
  it("writes an event row and returns its id", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const id = await appendEvent(tx, { breakId: b.id, actorId: host.id, type: "test.event", payload: { a: 1 } });
      const [row] = await tx.select().from(events).where(sql`${events.id} = ${id}`);
      expect(row.type).toBe("test.event");
      expect(row.payload).toEqual({ a: 1 });
      expect(row.processedAt).toBeNull();
    });
  });
  it("rejects a duplicate batch id for the same break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const batchId = "33333333-3333-4333-8333-333333333333";
      await appendEvent(tx, { breakId: b.id, type: "x", batchId });
      // drizzle wraps the driver error in DrizzleQueryError; the postgres error is on `.cause`
      await expect(appendEvent(tx, { breakId: b.id, type: "x", batchId })).rejects.toMatchObject({ cause: { constraint_name: "events_batch_uq" } });
    });
  });
  it("skips a duplicate batch id when ignoreDuplicateBatch is set", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const batchId = "44444444-4444-4444-8444-444444444444";
      expect(await appendEvent(tx, { breakId: b.id, type: "x", batchId }, { ignoreDuplicateBatch: true })).not.toBeNull();
      expect(await appendEvent(tx, { breakId: b.id, type: "x", batchId }, { ignoreDuplicateBatch: true })).toBeNull();
    });
  });
});
