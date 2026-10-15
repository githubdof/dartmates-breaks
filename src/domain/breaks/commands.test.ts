import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, lineRows } from "../../../tests/helpers/fixtures";
import { createDraft, openBreak, updateDraft, updateHostKit } from "./commands";
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
  it("lets an admin edit a host's draft without touching the host's payment handles", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const admin = await makeUser(tx, { role: "admin" });
      const asAdmin: Caller = { id: admin.id, role: "admin", onboarded: true, banned: false };
      const { breakId } = await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "Jim" } });
      const [before] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${host.id}`);
      // A blank handles form: the instructions come from the host's stored handles, and nothing is erased.
      await updateDraft(tx, asAdmin, breakId, { ...input, title: "Fixed by admin", paymentHandles: { venmo: "", paypal: "" } });
      let page = (await getBreakPage(tx, breakId))!;
      expect(page.break).toMatchObject({ title: "Fixed by admin", paymentInstructions: "Venmo @Jim. Leave the note blank." });
      // Supplied handles shape the instructions but are not saved to the host's profile.
      await updateDraft(tx, asAdmin, breakId, { ...input, paymentHandles: { paypal: "Other" } });
      page = (await getBreakPage(tx, breakId))!;
      expect(page.break.paymentInstructions).toBe("PayPal paypal.me/Other. Leave the note blank.");
      const [after] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${host.id}`);
      expect(after.paymentHandles).toEqual({ venmo: "@Jim" });
      expect(after.paymentHandlesChangedAt).toEqual(before.paymentHandlesChangedAt);
      const [adminProfile] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${admin.id}`);
      expect(adminProfile).toBeUndefined();
    });
  });
  it("saves the host's own payment handles when the host edits", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "Jim" } });
      await updateDraft(tx, asHost(host), breakId, { ...input, paymentHandles: { venmo: "Jim2", paypal: "JimR" } });
      const [p] = await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${host.id}`);
      expect(p.paymentHandles).toEqual({ venmo: "@Jim2", paypal: "JimR" });
      const [ev] = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.updated'`);
      expect(ev.payload).toMatchObject({ lineCount: 12, linePriceCents: 2000 });
    });
  });
  it("logs host.payment_handles_changed with from and to only when the handles change", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "Jim" } });
      await updateDraft(tx, asHost(host), breakId, { ...input, paymentHandles: { venmo: "Jim" } }); // same: no event
      await updateDraft(tx, asHost(host), breakId, { ...input, paymentHandles: { venmo: "Jim2", paypal: "JimR" } });
      const evs = await tx.select().from(events).where(sql`${events.actorId} = ${host.id} and ${events.type} = 'host.payment_handles_changed'`);
      // One transaction shares one now(): compare as a set, with the count pinning "no event for the same handles".
      expect(evs).toHaveLength(2);
      expect(evs.map((e) => e.payload)).toEqual(expect.arrayContaining([
        { from: {}, to: { venmo: "@Jim" } },
        { from: { venmo: "@Jim" }, to: { venmo: "@Jim2", paypal: "JimR" } },
      ]));
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

describe("updateHostKit", () => {
  const kitEvents = (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    tx.select().from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'host.profile_updated'`);
  const profile = async (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    (await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${id}`))[0];

  it("creates the profile row when there is none and logs that the kit changed", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await updateHostKit(tx, asHost(host), { dark: "petrol", light: "pink" });
      expect(await profile(tx, host.id)).toMatchObject({ kitDark: "petrol", kitLight: "pink", paymentHandles: {} });
      expect((await kitEvents(tx, host.id)).map((e) => e.payload)).toEqual([{ changed: ["kit"] }]);
    });
  });
  it("keeps the payment handles, logs each change, and does nothing when the kit is unchanged", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "@Jim-R" } });
      await updateHostKit(tx, asHost(host), { dark: "petrol", light: "pink" });
      await updateHostKit(tx, asHost(host), { dark: "plum", light: "sky" });
      await updateHostKit(tx, asHost(host), { dark: "plum", light: "sky" });
      expect(await profile(tx, host.id)).toMatchObject({ kitDark: "plum", kitLight: "sky", paymentHandles: { venmo: "@Jim-R" } });
      const payloads = (await kitEvents(tx, host.id)).map((e) => e.payload);
      expect(payloads).toEqual([{ changed: ["kit"] }, { changed: ["kit"] }]); // never the colours (recorded ruling 10)
    });
  });
  it("refuses a colour outside the set or in the wrong tier, and stores nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(updateHostKit(tx, asHost(host), { dark: "yellow", light: "pink" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateHostKit(tx, asHost(host), { dark: "blue", light: "plum" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateHostKit(tx, asHost(host), { dark: "blue", light: "red" as never })).rejects.toThrow("Choose a dark colour and a light colour for your kit");
      expect(await profile(tx, host.id)).toBeUndefined();
    });
  });
  it("is for hosts and admins only, and never for a banned host", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx);
      const host = await makeUser(tx, { role: "host" });
      await expect(updateHostKit(tx, asMember(member), { dark: "blue", light: "yellow" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateHostKit(tx, { ...asHost(host), banned: true }, { dark: "blue", light: "yellow" })).rejects.toThrow(/suspended/);
      await updateHostKit(tx, { ...asHost(host), role: "admin" }, { dark: "petrol", light: "sky" });
      expect(await kitEvents(tx, host.id)).toHaveLength(1);
    });
  });
});
