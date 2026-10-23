import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTx } from "./db";
import { makeUser, openBreakWithLines, lineRows, assertInvariants, YELLOW_KITE, BLUE_STANDARD, PLUM_LIME } from "./fixtures";

const userExists = async (id: string) => (await db.execute(sql`select 1 from users where id = ${id}::uuid`)).length > 0;

describe("fixtures", () => {
  it("creates an open break with N unowned lines and rolls back", async () => {
    let hostId = "";
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      hostId = host.id;
      expect((await tx.execute(sql`select 1 from users where id = ${hostId}::uuid`)).length).toBe(1);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      const rows = await lineRows(tx, b.id);
      expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
      expect(rows.every((r) => r.ownerId === null)).toBe(true);
    });
    expect(hostId).not.toBe("");
    expect(await userExists(hostId)).toBe(false);
  });

  it("assertInvariants passes on a clean break and throws naming a broken one", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3 });
      await assertInvariants(tx);
      await tx.execute(sql`update breaks set status = 'filled' where id = ${b.id}`);
      await expect(assertInvariants(tx)).rejects.toThrow(b.id);
    });
  });

  it("gives users flights from both tiers and a host a kit", async () => {
    await withTx(async (tx) => {
      const yellow = await makeUser(tx, { flight: YELLOW_KITE });
      const blue = await makeUser(tx, { flight: BLUE_STANDARD });
      const host = await makeUser(tx, { role: "host", kit: PLUM_LIME });
      const flights = await tx.execute<{ id: string; flight_colour: string; flight_shape: string }>(
        sql`select id, flight_colour, flight_shape from users where id in (${yellow.id}::uuid, ${blue.id}::uuid)`);
      expect(new Map(flights.map((r) => [r.id, `${r.flight_colour}-${r.flight_shape}`]))).toEqual(new Map([[yellow.id, "yellow-kite"], [blue.id, "blue-standard"]]));
      const [kit] = await tx.execute<{ kit_dark: string; kit_light: string }>(sql`select kit_dark, kit_light from host_profiles where user_id = ${host.id}::uuid`);
      expect(kit).toEqual({ kit_dark: "plum", kit_light: "lime" });
    });
  });
});
