import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak } from "../../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";
import { hostTrust } from "./queries";

describe("hostTrust", () => {
  it("counts the host's drawn breaks and reports when they joined", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      // The fixture's item guard only allows draft breaks, so move each to its status afterwards.
      for (const status of ["drawn", "drawn", "open"]) {
        const b = await makeBreak(tx, { hostId: host.id });
        await tx.update(breaks).set({ status }).where(sql`${breaks.id} = ${b.id}`);
      }
      const t = await hostTrust(tx, host.id);
      expect(t.breaksRun).toBe(2);
      expect(t.since).toBeInstanceOf(Date);
    });
  });
});
