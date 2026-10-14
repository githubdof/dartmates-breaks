import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, lineRows } from "../../../tests/helpers/fixtures";
import { createDraft, openBreak, updateDraft } from "./commands";
import { getBreakPage } from "./queries";
import { breaks, breakSecrets, events, hostProfiles } from "@/db/schema";
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const asHost = (u: { id: string }): Caller => ({ id: u.id, role: "host", onboarded: true, banned: false });
const asMember = (u: { id: string }): Caller => ({ id: u.id, role: "member", onboarded: true, banned: false });

const input = { title: "Target Chronos", lineCount: 12, linePriceCents: 2000, items: [{ name: "Chronos 22g" }, { name: "Chronos 24g" }] };

describe("createDraft", () => {
  it("creates a draft with items and a rank-1 choice set", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.break.status).toBe("draft");
      expect(page.items.map((i) => i.name)).toEqual(["Chronos 22g", "Chronos 24g"]);
      expect(page.prizes.filter((p) => p.rank === 1)).toHaveLength(2);
    });
  });
  it("rejects members", async () => {
    await withTx(async (tx) => {
      const m = await makeUser(tx);
      await expect(createDraft(tx, asMember(m), input)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("rejects fewer than 2 lines or a zero price", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), { ...input, lineCount: 1 })).rejects.toBeInstanceOf(InvalidInput);
      await expect(createDraft(tx, asHost(host), { ...input, linePriceCents: 0 })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("saves payment handles to the host profile and defaults the payment instructions from them", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "@Jim-R", paypal: "JimR" } });
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.host.paymentHandles).toEqual({ venmo: "@Jim-R", paypal: "JimR" });
      expect(page.break.paymentInstructions).toBe("Venmo @Jim-R. PayPal paypal.me/JimR. Leave the note blank.");
      const [p1] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${host.id}`);
      expect(p1.paymentHandlesChangedAt).not.toBeNull();
      // same handles again: changedAt is untouched; explicit instructions win
      const { breakId: b2 } = await createDraft(tx, asHost(host), { ...input, paymentInstructions: "Cash at the club", paymentHandles: { venmo: "@Jim-R", paypal: "JimR" } });
      const [p2] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${host.id}`);
      expect(p2.paymentHandlesChangedAt).toEqual(p1.paymentHandlesChangedAt);
      expect((await getBreakPage(tx, b2))!.break.paymentInstructions).toBe("Cash at the club");
    });
  });
  it("stores the picking mode, defaulting to pick or random, and keeps allow_random_claims in step", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const a = await createDraft(tx, asHost(host), input);
      const b = await createDraft(tx, asHost(host), { ...input, claimMode: "straight" });
      const pa = (await getBreakPage(tx, a.breakId))!.break;
      const pb = (await getBreakPage(tx, b.breakId))!.break;
      expect(pa.claimMode).toBe("pick_or_random");
      expect(pa.allowRandomClaims).toBe(true);
      expect(pb.claimMode).toBe("straight");
      expect(pb.allowRandomClaims).toBe(false);
      await expect(createDraft(tx, asHost(host), { ...input, claimMode: "random_only" as never })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("adds 2nd-place items as rank-2 prizes", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [{ name: "Chronos 22g" }], secondPlace: [{ name: "Flight pack" }, { name: "  " }] });
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.prizes.map((p) => p.rank)).toEqual([1, 2]);
      expect(page.items.map((i) => i.name).sort()).toEqual(["Chronos 22g", "Flight pack"]);
    });
  });
});

describe("openBreak", () => {
  it("opens, commits a secret, pre-creates lines and logs an event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      const [b] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
      expect(b.status).toBe("open");
      expect(b.seedCommitment).toMatch(/^[0-9a-f]{64}$/);
      expect(b.openedAt).not.toBeNull();
      const [s] = await tx.select().from(breakSecrets).where(sql`${breakSecrets.breakId} = ${breakId}`);
      expect(s.keyId).toBe("v1");
      expect((await lineRows(tx, breakId)).map((l) => l.number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId}`);
      expect(evs.map((e) => e.type)).toContain("break.opened");
    });
  });
  it("is rejected when the break is not a draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("is rejected for a draft without a rank-1 prize", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [] });
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("is rejected for a banned or listing-paused host", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await tx.execute(sql`update users set listing_paused_at = now() where id = ${host.id}`);
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
});

describe("updateDraft", () => {
  it("replaces a draft's settings and prizes and logs break.updated", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, secondPlace: [{ name: "Flight pack" }] });
      await updateDraft(tx, asHost(host), breakId, {
        title: "Target Chronos v2", lineCount: 20, linePriceCents: 500, claimMode: "straight",
        items: [{ name: "Chronos 26g" }], secondPlace: [], paymentHandles: { venmo: "Jim-R" },
      });
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.break).toMatchObject({
        title: "Target Chronos v2", lineCount: 20, linePriceCents: 500, claimMode: "straight", allowRandomClaims: false,
        status: "draft", paymentInstructions: "Venmo @Jim-R. Leave the note blank.",
      });
      expect(page.items.map((i) => i.name)).toEqual(["Chronos 26g"]);
      expect(page.prizes.map((p) => p.rank)).toEqual([1]);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.updated'`);
      expect(evs).toHaveLength(1);
    });
  });
  it("refuses anyone but the host and changes nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const otherHost = await makeUser(tx, { role: "host" }); const member = await makeUser(tx);
      const { breakId } = await createDraft(tx, asHost(host), input);
      await expect(updateDraft(tx, asMember(member), breakId, { ...input, title: "Hijacked" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateDraft(tx, asHost(otherHost), breakId, { ...input, title: "Hijacked" })).rejects.toBeInstanceOf(NotAuthorized);
      expect((await getBreakPage(tx, breakId))!.break.title).toBe("Target Chronos");
    });
  });
  it("refuses a break that is already open and leaves its prizes alone", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, items: [{ name: "Other" }] })).rejects.toBeInstanceOf(NotOpen);
      expect((await getBreakPage(tx, breakId))!.items.map((i) => i.name).sort()).toEqual(["Chronos 22g", "Chronos 24g"]);
    });
  });
  it("validates like createDraft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, lineCount: 51 })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, claimMode: "random_only" as never })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
});
