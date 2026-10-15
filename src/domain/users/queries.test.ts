import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { DEFAULT_KIT, isFlightColour, isFlightShape } from "@/domain/flights";
import { updateFlight } from "./commands";
import { updateHostKit } from "@/domain/breaks/commands";
import { accountOf, viewerFlightOf } from "./queries";

describe("accountOf", () => {
  it("reads the editable account fields, or null", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set payment_name = 'Pat Lee' where id = ${u.id}`);
      const a = await accountOf(tx, u.id);
      expect(a).toMatchObject({ handle: u.handle, displayName: u.handle, paymentName: "Pat Lee" });
      expect(a!.createdAt).toBeInstanceOf(Date);
      expect(await accountOf(tx, randomUUID())).toBeNull();
    });
  });
});

describe("the flight and the kit on /account", () => {
  it("reads the stored random flight, not chosen yet, and the default kit until a host picks one", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { role: "host" });
      const a = (await accountOf(tx, u.id))!;
      expect(isFlightColour(a.flight.colour) && isFlightShape(a.flight.shape)).toBe(true);
      expect(a).toMatchObject({ flightChosen: false, kit: DEFAULT_KIT, kitChosen: false });
      const caller = { id: u.id, role: "host" as const, onboarded: true, banned: false };
      await updateFlight(tx, caller, { colour: "plum", shape: "kite" });
      await updateHostKit(tx, caller, { dark: "petrol", light: "lime" });
      expect(await accountOf(tx, u.id)).toMatchObject({ flight: { colour: "plum", shape: "kite" }, flightChosen: true, kit: { dark: "petrol", light: "lime" }, kitChosen: true });
      expect(await viewerFlightOf(tx, u.id)).toEqual({ flight: { colour: "plum", shape: "kite" }, chosen: true });
      expect(await viewerFlightOf(tx, randomUUID())).toBeNull();
    });
  });
});
