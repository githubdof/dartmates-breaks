import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines } from "../../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";
import { hostTrust, lastBreakDefaults, listHostBreaks } from "./queries";
import { randomUUID } from "node:crypto";
import { claimLines, markPaid } from "@/domain/lines/commands";
import type { Caller } from "@/domain/types";

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

const asCaller = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("lastBreakDefaults", () => {
  it("returns the settings of the host's most recent main break, or null", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      expect(await lastBreakDefaults(tx, host.id)).toBeNull();
      await makeBreak(tx, { hostId: host.id, lineCount: 20, linePriceCents: 500 });
      const later = await makeBreak(tx, { hostId: host.id, lineCount: 30, linePriceCents: 750, claimMode: "straight" });
      // Same transaction, same now(): push the second one later explicitly (a draft, so nothing is frozen).
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute', payment_window_hours = 12, max_lines_per_user = 3, payment_instructions = 'Venmo only.' where id = ${later.id}`);
      expect(await lastBreakDefaults(tx, host.id)).toEqual({ lineCount: 30, linePriceCents: 750, paymentWindowHours: 12, maxLinesPerUser: 3, claimMode: "straight", paymentInstructions: "Venmo only." });
    });
  });
});

describe("lastBreakDefaults instructions", () => {
  it("drops instructions generated from handles and keeps typed ones", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set payment_instructions = 'Venmo @Jim. PayPal paypal.me/Jim. Leave the note blank.' where id = ${b.id}`);
      expect((await lastBreakDefaults(tx, host.id))?.paymentInstructions).toBe("");
      await tx.execute(sql`update breaks set payment_instructions = 'Zelle only. Leave the note blank.' where id = ${b.id}`);
      expect((await lastBreakDefaults(tx, host.id))?.paymentInstructions).toBe("Zelle only. Leave the note blank.");
    });
  });
});

describe("listHostBreaks", () => {
  it("lists the host's breaks newest first, with paid and taken counts", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const older = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(a), { breakId: older.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, asCaller(host, "host"), { breakId: older.id, number: 1, expectedOwnerId: a.id });
      const newer = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute' where id = ${newer.id}`);
      const rows = await listHostBreaks(tx, host.id);
      expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
      expect(rows[1]).toMatchObject({ status: "open", lineCount: 4, paid: 1, taken: 1 });
      expect(rows[0]).toMatchObject({ status: "draft", paid: 0, taken: 0 });
    });
  });
});
