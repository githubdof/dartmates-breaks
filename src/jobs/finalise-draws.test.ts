import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, openBreakWithLines } from "../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw } from "@/domain/draws/commands";
import { finalisePendingDraws } from "./finalise-draws";
import { FakeBeacon } from "@/crypto/beacon";
import { encryptSecret } from "@/crypto/secrets";
import { breakSecrets, breaks, drawRequests } from "@/db/schema";
import type { Caller } from "@/domain/types";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });

describe("finalisePendingDraws", () => {
  it("finalises requests whose round has arrived and skips the rest", async () => {
    await withTx(async (tx) => {
      // Isolate from committed leftovers (e.g. concurrency tests commit pending requests without secrets); rolled back with the tx.
      await tx.execute(sql`update draw_requests set status = 'done' where status = 'pending'`);
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
      await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
      await claimLines(tx, c(a.id), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
      const { beaconRound } = await requestDraw(tx, c(host.id, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      // Too early: the round is 60s in the future.
      // `contains`, not equality: other committed rows in the test DB may also be pending.
      const early = await finalisePendingDraws(tx, beacon, beaconRound - 1);
      expect(early.skipped).toContain(b.id);
      expect(early.finalised).not.toContain(b.id);
      // Round arrived.
      const late = await finalisePendingDraws(tx, beacon, beaconRound);
      expect(late.finalised).toContain(b.id);
      const [row] = await tx.select({ s: breaks.status }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.s).toBe("drawn");
      const [req] = await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id}`);
      expect(req.status).toBe("done");
    });
  });
});
