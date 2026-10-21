import { describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak, prize, YELLOW_KITE, BLUE_STANDARD, PLUM_LIME } from "../../../tests/helpers/fixtures";
import { breaks, draws, drawRequests, hostProfiles } from "@/db/schema";
import { draftForEdit, getBreakPage, hostKit, hostProfile, hostTrust, isGeneratedInstructions, lastBreakDefaults, listHostBreaks } from "./queries";
import { shapeGrid } from "./grid";
import { DEFAULT_KIT } from "@/domain/flights";
import { hostRecordText } from "@/components/break/frame-copy";
import type { Tx } from "@/db/client";
import { createDraft, updateHostKit } from "./commands";
import { randomUUID } from "node:crypto";
import { claimLines, markPaid, addBonusLine } from "@/domain/lines/commands";
import { myLines, waitingOnHost } from "@/domain/lines/queries";
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
      // The drawn break's draw verified when it was recorded (Task 4a), so the record reads 1 run, 1 verified.
      expect(p).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 1, pastCount: 2, drawsVerified: 1, stalledSince: null, kit: { dark: "blue", light: "yellow" } });
      expect(p!.breaksRun).toBeGreaterThan(0);
      expect(p!.since).toBeInstanceOf(Date);
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "drawsVerified", "handle", "id", "kit", "pastCount", "since", "stalledSince"]);
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
      const [g22, g24, flights] = [prize("22g"), prize("24g", "used"), prize("Flights", "new_opened")];
      const { breakId } = await createDraft(tx, asCaller(host, "host"), {
        title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight",
        items: [g22, g24], secondPlace: [flights],
      });
      const d = await draftForEdit(tx, breakId);
      expect(d).toMatchObject({ id: breakId, hostId: host.id, status: "draft", title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight", maxLinesPerUser: null, secondPlace: [flights] });
      expect([...d!.topSpot].sort((x, y) => x.name.localeCompare(y.name))).toEqual([g22, g24]);
      expect(await draftForEdit(tx, randomUUID())).toBeNull();
    });
  });
  it("knows instructions built from handles", () => {
    expect(isGeneratedInstructions("Venmo @Jim. PayPal paypal.me/Jim. Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Zelle only. Leave the note blank.")).toBe(false);
  });
});

const setKit = (tx: Tx, hostId: string, dark: string, light: string) =>
  tx.execute(sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${hostId}::uuid, ${dark}, ${light})
    on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`);

describe("the break page model carries the kit and the heat (Task 5 contract, Mosaic §4 Heat, §6)", () => {
  it("is the same public kit and step for every viewer, and step 4 from Closed on", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx); const stranger = await makeUser(tx);
      await setKit(tx, host.id, "plum", "lime");
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(buyer), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      const now = new Date();
      const page = (await getBreakPage(tx, b.id))!;
      const viewers = [
        null,
        { id: stranger.id, role: "member" as const, globalUnpaid: 0 },
        { id: buyer.id, role: "member" as const, globalUnpaid: 2 },
        { id: host.id, role: "host" as const, globalUnpaid: 0 },
      ];
      for (const viewer of viewers) {
        const g = shapeGrid(page, viewer, now);
        expect(g.kit).toEqual({ dark: "plum", light: "lime" });
        expect(g.heat).toBe(2);
      }
      await claimLines(tx, asCaller(buyer), { breakId: b.id, numbers: [3, 4], batchId: randomUUID() });
      for (const number of [1, 2, 3, 4]) await markPaid(tx, asCaller(host, "host"), { breakId: b.id, number, expectedOwnerId: buyer.id });
      const closed = (await getBreakPage(tx, b.id))!;
      expect(closed.break.status).toBe("filled");
      expect(shapeGrid(closed, null, now).heat).toBe(4);
      // A host who never chose: the default kit.
      const other = await makeUser(tx, { role: "host" });
      const plain = await openBreakWithLines(tx, { hostId: other.id, lineCount: 4 });
      expect(shapeGrid((await getBreakPage(tx, plain.id))!, null, now)).toMatchObject({ kit: DEFAULT_KIT, heat: 0 });
    });
  });
});

describe("the break page model reads each holder's stored flight (Mosaic §6, Task 5 holder gate)", () => {
  it("gives holders and the host the stored flights from the query, and a stranger none", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host", kit: PLUM_LIME });
      const yellow = await makeUser(tx, { flight: YELLOW_KITE }); const blue = await makeUser(tx, { flight: BLUE_STANDARD });
      const stranger = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(yellow), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, asCaller(blue), { breakId: b.id, numbers: [3], batchId: randomUUID() });
      const page = (await getBreakPage(tx, b.id))!;
      const now = new Date();
      const flightsFor = (viewer: Parameters<typeof shapeGrid>[1]) => shapeGrid(page, viewer, now).cells.map((c) => c.flight && `${c.flight.colour}-${c.flight.shape}`);
      for (const viewer of [{ id: yellow.id, role: "member" as const, globalUnpaid: 2 }, { id: host.id, role: "host" as const, globalUnpaid: 0 }]) {
        expect(flightsFor(viewer)).toEqual(["yellow-kite", "yellow-kite", "blue-standard", null]);
      }
      for (const viewer of [null, { id: stranger.id, role: "member" as const, globalUnpaid: 0 }]) {
        expect(flightsFor(viewer)).toEqual([null, null, null, null]);
        expect(shapeGrid(page, viewer, now).cells.every((c) => c.holder === null)).toBe(true);
      }
    });
  });
});

describe("hostTrust record (Mosaic §9)", () => {
  it("counts verified draws from active draws only and finds the oldest Closed break still waiting for its draw", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const voided = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      // The second draw is voided (the one update draws allow): the break is Closed again and has waited four days.
      await tx.execute(sql`update draws set voided_at = now(), voided_by = ${host.id}::uuid, void_reason = 'test' where id = ${voided.drawId}::uuid`);
      await tx.execute(sql`update breaks set status = 'filled', filled_at = now() - interval '4 days' where id = ${voided.id}::uuid`);
      const t = await hostTrust(tx, host.id);
      expect(t).toMatchObject({ breaksRun: 1, drawsVerified: 1 });
      expect(t.stalledSince).toBeInstanceOf(Date);
      expect(Date.now() - t.stalledSince!.getTime()).toBeGreaterThan(3.9 * 86_400_000);
    });
  });
  it("has nothing verified and nothing stalled for a host who has run nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      expect(await hostTrust(tx, host.id)).toMatchObject({ breaksRun: 0, drawsVerified: 0, stalledSince: null });
    });
  });
  it("reads \"No breaks run yet.\" for a host with nothing run, dated from when they joined", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await tx.execute(sql`update users set created_at = '2025-06-15T12:00:00Z' where id = ${host.id}::uuid`);
      const t = await hostTrust(tx, host.id);
      expect(t).toMatchObject({ breaksRun: 0, drawsVerified: 0, stalledSince: null });
      // Nothing has run, so "since" stays the join date (the profile's "On Breaks since" line).
      expect(t.since.toISOString()).toBe("2025-06-15T12:00:00.000Z");
      expect(hostRecordText(t)).toBe("No breaks run yet.");
      const p = await hostProfile(tx, host.handle);
      expect(p).toMatchObject({ breaksRun: 0, drawsVerified: 0, stalledSince: null, since: t.since });
      expect(hostRecordText(p!)).toBe("No breaks run yet.");
    });
  });
  it("counts a ran break whose draw never verified as run, not verified, and dates the record from when the host joined", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      // Joined long before the first break ran: the record's month is member-since (Mosaic §9 extends hostTrust), not the first run.
      await tx.execute(sql`update users set created_at = '2025-01-10T12:00:00Z' where id = ${host.id}::uuid`);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const early = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      await redrawUnverified(tx, early.drawId, host.id, new Date("2026-03-05T12:00:00Z"));
      const t = await hostTrust(tx, host.id);
      expect(t).toMatchObject({ breaksRun: 2, drawsVerified: 1, stalledSince: null });
      expect(t.since.toISOString()).toBe("2025-01-10T12:00:00.000Z");
      expect(hostRecordText(t)).toBe("2 breaks run since Jan 2025. 1 draw verified.");
      // The profile reads the same record.
      expect(await hostProfile(tx, host.handle)).toMatchObject({ breaksRun: 2, drawsVerified: 1, stalledSince: null, since: t.since });
    });
  });
});

/**
 * A ran break whose active draw never verified (it predates migration 0004, or its check failed): the draw is voided
 * and recorded again without verified_at, as verify-stored.test.ts does, created at `ranAt`.
 */
async function redrawUnverified(tx: Tx, drawId: string, hostId: string, ranAt: Date) {
  const [d] = await tx.select().from(draws).where(eq(draws.id, drawId));
  await tx.update(draws).set({ voidedAt: new Date(), voidedBy: hostId, voidReason: "recorded again unverified" }).where(eq(draws.id, d.id));
  const [req] = await tx.insert(drawRequests).values({ breakId: d.breakId, attempt: 2, requestedBy: hostId, beaconRound: d.beaconRound, status: "done" }).returning({ id: drawRequests.id });
  await tx.insert(draws).values({
    breakId: d.breakId, requestId: req.id, secret: d.secret, beaconRound: d.beaconRound, beaconRandomness: d.beaconRandomness,
    beaconSignature: d.beaconSignature, seed: d.seed, algorithmVersion: d.algorithmVersion, entriesSnapshot: d.entriesSnapshot,
    ranking: d.ranking, resultHash: d.resultHash, runBy: d.runBy, createdAt: ranAt,
  });
}

describe("hostKit", () => {
  it("is the default kit, not chosen, for a host without a profile or a pick; then the host's pick", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      expect(await hostKit(tx, host.id)).toEqual({ kit: DEFAULT_KIT, chosen: false });
      await updateHostKit(tx, { id: host.id, role: "host", onboarded: true, banned: false }, { dark: "plum", light: "sky" });
      expect(await hostKit(tx, host.id)).toEqual({ kit: { dark: "plum", light: "sky" }, chosen: true });
    });
  });
});

const draftInput = { title: "Target Chronos", lineCount: 12, linePriceCents: 2000, items: [prize("Chronos 22g")] };
const markDeleted = (tx: Tx, id: string) => tx.execute(sql`update breaks set deleted_at = now() where id = ${id}`);

describe("deleted drafts leave every host list, profile and editor query (ruling 12)", () => {
  it("draftForEdit and getBreakPage answer null", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asCaller(host, "host"), draftInput);
      await markDeleted(tx, breakId);
      expect(await draftForEdit(tx, breakId)).toBeNull();
      expect(await getBreakPage(tx, breakId)).toBeNull();
    });
  });
  it("listHostBreaks leaves it out and keeps the host's other drafts", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const kept = await createDraft(tx, asCaller(host, "host"), draftInput);
      const gone = await createDraft(tx, asCaller(host, "host"), { ...draftInput, title: "Gone" });
      await markDeleted(tx, gone.breakId);
      expect((await listHostBreaks(tx, host.id)).map((b) => b.id)).toEqual([kept.breakId]);
    });
  });
  it("lastBreakDefaults skips a newer deleted draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await createDraft(tx, asCaller(host, "host"), { ...draftInput, lineCount: 20 });
      const gone = await createDraft(tx, asCaller(host, "host"), { ...draftInput, lineCount: 30 });
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute' where id = ${gone.breakId}`);
      await markDeleted(tx, gone.breakId);
      expect((await lastBreakDefaults(tx, host.id))?.lineCount).toBe(20);
    });
  });
  // Regression pins (ruling 41): these queries already leave drafts out by status, and Task 2 keeps a deleted break a
  // draft with no lines. They pass before Step 3 and must stay green.
  it("regression pin: hostProfile and hostTrust count nothing from a deleted draft", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx, { handle: "deletedonly" }); const host = await makeUser(tx, { role: "host", handle: "hostdel" });
      const a = await makeBreak(tx, { hostId: member.id, status: "draft" }); await markDeleted(tx, a.id);
      expect(await hostProfile(tx, "deletedonly")).toBeNull(); // a non-host with only a deleted draft has no profile
      const before = await hostTrust(tx, host.id);
      const b = await makeBreak(tx, { hostId: host.id, status: "draft" }); await markDeleted(tx, b.id);
      expect(await hostTrust(tx, host.id)).toEqual(before);
      expect((await hostProfile(tx, "hostdel"))?.pastCount).toBe(0);
    });
  });
  it("regression pin: waitingOnHost and myLines see no deleted draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id, status: "draft" }); await markDeleted(tx, b.id);
      expect(await waitingOnHost(tx, host.id)).toEqual([]);
      expect((await myLines(tx, host.id, new Date())).map((r) => r.breakId)).not.toContain(b.id);
    });
  });
});
