import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { breaks, hostProfiles } from "@/db/schema";
import { draftForEdit, hostProfile, hostTrust, isGeneratedInstructions, lastBreakDefaults, listHostBreaks } from "./queries";
import { createDraft } from "./commands";
import { randomUUID } from "node:crypto";
import { claimLines, markPaid, addBonusLine } from "@/domain/lines/commands";
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

describe("listHostBreaks scope", () => {
  it("lists only this host's main breaks and counts numbered lines only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const mine = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(buyer), { breakId: mine.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, asCaller(host, "host"), { breakId: mine.id, number: 1, expectedOwnerId: buyer.id });
      await addBonusLine(tx, asCaller(host, "host"), { breakId: mine.id, ownerId: buyer.id }); // paid, but above N
      await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await makeBreak(tx, { hostId: other.id });
      const rows = await listHostBreaks(tx, host.id);
      expect(rows.map((r) => r.id)).toEqual([mine.id]);
      expect(rows[0]).toMatchObject({ status: "open", lineCount: 4, paid: 1, taken: 0 });
      expect(rows[0].openedAt).toBeInstanceOf(Date);
    });
  });
});

describe("hostTrust scope", () => {
  it("ignores other hosts' drawn breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: other.id, buyerIds: [buyer.id] });
      expect((await hostTrust(tx, host.id)).breaksRun).toBe(0);
      expect((await hostTrust(tx, other.id)).breaksRun).toBe(1);
    });
  });
});

describe("hostProfile", () => {
  it("shows a host's public figures by handle, ignoring case, and nothing private", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await makeBreak(tx, { hostId: host.id }); // a draft: neither run nor past
      const cancelled = await makeBreak(tx, { hostId: host.id });
      await tx.update(breaks).set({ status: "cancelled" }).where(sql`${breaks.id} = ${cancelled.id}`);
      await tx.execute(sql`update users set payment_name = 'Secret Name' where id = ${host.id}`);
      const p = await hostProfile(tx, host.handle.toUpperCase());
      // Non-zero counts prove the subqueries see this host's breaks (a bare "id" inside `from breaks b` would mean b.id).
      expect(p).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 1, pastCount: 2 });
      expect(p!.breaksRun).toBeGreaterThan(0);
      expect(p!.since).toBeInstanceOf(Date);
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "handle", "id", "kit", "pastCount", "since"]);
      expect(p!.kit).toEqual({ dark: "blue", light: "yellow" });
      expect(JSON.stringify(p)).not.toMatch(/example\.com|Secret Name/);
    });
  });
  it("is null for an unknown handle, the SYSTEM user, and anyone not a host who never listed a break", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx); const admin = await makeUser(tx, { role: "admin" }); const newHost = await makeUser(tx, { role: "host" });
      expect(await hostProfile(tx, member.handle)).toBeNull();
      expect(await hostProfile(tx, admin.handle)).toBeNull();
      expect(await hostProfile(tx, "system")).toBeNull();
      expect(await hostProfile(tx, "nobody_here_x")).toBeNull();
      // A host with nothing listed yet still has a profile page.
      expect(await hostProfile(tx, newHost.handle)).toMatchObject({ id: newHost.id, breaksRun: 0, pastCount: 0 });
    });
  });
  it("carries the host's kit, and nothing else from the profile row", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await tx.insert(hostProfiles).values({ userId: host.id, kitDark: "plum", kitLight: "lime", paymentHandles: { venmo: "@Secret-Pay" } });
      const p = await hostProfile(tx, host.handle);
      expect(p!.kit).toEqual({ dark: "plum", light: "lime" });
      expect(JSON.stringify(p)).not.toContain("Secret-Pay");
    });
  });
});

describe("draftForEdit", () => {
  it("reads a draft's settings and its prize names by rank", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asCaller(host, "host"), {
        title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight",
        items: [{ name: "22g" }, { name: "24g" }], secondPlace: [{ name: "Flights" }],
      });
      const d = await draftForEdit(tx, breakId);
      expect(d).toMatchObject({ id: breakId, hostId: host.id, status: "draft", title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight", maxLinesPerUser: null, secondPlace: ["Flights"] });
      expect([...d!.topSpot].sort()).toEqual(["22g", "24g"]);
      expect(await draftForEdit(tx, randomUUID())).toBeNull();
    });
  });
  it("knows instructions built from handles", () => {
    expect(isGeneratedInstructions("Venmo @Jim. PayPal paypal.me/Jim. Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Zelle only. Leave the note blank.")).toBe(false);
  });
});
