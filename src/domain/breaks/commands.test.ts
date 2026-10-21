import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, lineRows, prize, photoRow } from "../../../tests/helpers/fixtures";
import { createDraft, deleteDraft, openBreak, updateDraft, updateHostKit } from "./commands";
import { draftForEdit, getBreakPage } from "./queries";
import { breaks, breakItems, breakPhotos, breakSecrets, events, hostProfiles, photoUploads, prizes } from "@/db/schema";
import type { Tx } from "@/db/client";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { InvalidInput, NotAuthorized, NotFound, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const asHost = (u: { id: string }): Caller => ({ id: u.id, role: "host", onboarded: true, banned: false });
const asMember = (u: { id: string }): Caller => ({ id: u.id, role: "member", onboarded: true, banned: false });

const input = { title: "Target Chronos", lineCount: 12, linePriceCents: 2000, items: [prize("Chronos 22g"), prize("Chronos 24g")] };

/** Slot key -> item id, from the break's prizes. */
async function slotItems(tx: Tx, breakId: string): Promise<Map<string, string>> {
  const rows = await tx.select({ slotKey: prizes.slotKey, itemId: prizes.itemId }).from(prizes).where(sql`${prizes.breakId} = ${breakId}`);
  return new Map(rows.map((r) => [r.slotKey, r.itemId!]));
}
async function photoSlot(tx: Tx, photoId: string): Promise<string | null> {
  const [r] = await tx.select({ prizeSlot: breakPhotos.prizeSlot }).from(breakPhotos).where(sql`${breakPhotos.id} = ${photoId}`);
  return r.prizeSlot;
}

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
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [prize("Chronos 22g")], secondPlace: [prize("Flight pack"), prize("  ")] });
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
      const { breakId } = await createDraft(tx, asHost(host), { ...input, secondPlace: [prize("Flight pack")] });
      await updateDraft(tx, asHost(host), breakId, {
        title: "Target Chronos v2", lineCount: 20, linePriceCents: 500, claimMode: "straight",
        items: [prize("Chronos 26g")], secondPlace: [], paymentHandles: { venmo: "Jim-R" },
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
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, items: [prize("Other")] })).rejects.toBeInstanceOf(NotOpen);
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

describe("prize slots and condition", () => {
  it("stores each prize's slot key and condition, in the composer's order", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, b, c] = [prize("Chronos 22g"), prize("Chronos 24g", "used"), prize("Flight pack", "new_opened")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, b], secondPlace: [c] });
      const d = (await draftForEdit(tx, breakId))!;
      expect(d.topSpot).toEqual([a, b]);
      expect(d.secondPlace).toEqual([c]);
    });
  });
  it("refuses a prize with no condition, a bad slot key, or a slot key used twice", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), { ...input, items: [{ ...prize("X"), condition: "mint" as never }] })).rejects.toThrow("Choose the condition of each prize");
      await expect(createDraft(tx, asHost(host), { ...input, items: [prize("X", "used", "slot-1")] })).rejects.toThrow("This form is out of date. Reload the page and try again.");
      const twice = randomUUID();
      await expect(createDraft(tx, asHost(host), { ...input, items: [prize("X", "used", twice)], secondPlace: [prize("Y", "used", twice)] })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("removing the first 'or' choice keeps the other two slots, their items and their photo tags", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, b, c] = [prize("Chronos 22g"), prize("Chronos 24g", "used"), prize("Phantom 24g", "new_opened")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, b, c] });
      const before = await slotItems(tx, breakId);
      const onB = await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: b.slotKey });
      const onC = await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: c.slotKey });
      await updateDraft(tx, asHost(host), breakId, { ...input, items: [a, c] });
      expect((await draftForEdit(tx, breakId))!.topSpot).toEqual([a, c]);
      const after = await slotItems(tx, breakId);
      expect([...after.keys()].sort()).toEqual([a.slotKey, c.slotKey].sort());
      expect(after.get(a.slotKey)).toBe(before.get(a.slotKey)); // updated in place, not reinserted
      expect(after.get(c.slotKey)).toBe(before.get(c.slotKey));
      expect(await photoSlot(tx, onC)).toBe(c.slotKey); // the Phantom photo still shows the Phantom
      expect(await photoSlot(tx, onB)).toBeNull(); // a removed slot clears the tag
    });
  });
  it("renames and re-conditions a kept slot in place and adds a new slot after the kept ones", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, c, e] = [prize("Chronos 22g"), prize("Phantom 24g"), prize("Chronos 26g", "used")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, c] });
      const before = await slotItems(tx, breakId);
      const renamed = { ...a, name: "Chronos 22g steel", condition: "used" as const };
      await updateDraft(tx, asHost(host), breakId, { ...input, items: [renamed, c, e] });
      expect((await draftForEdit(tx, breakId))!.topSpot).toEqual([renamed, c, e]);
      expect((await slotItems(tx, breakId)).get(a.slotKey)).toBe(before.get(a.slotKey));
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.updated'`);
      expect(evs).toHaveLength(1);
    });
  });
  // Regression pin (ruling 41): Task 2's column sits under the existing items_mutation_guard, so this passes before
  // Step 3. It pins that the condition freezes with its item and must stay green.
  it("regression pin: freezes a prize's condition with its item after the first paid line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await tx.execute(sql`update lines set owner_id = ${buyer.id}, claimed_at = now(), paid_at = now() where break_id = ${breakId} and number = 1`);
      await expect(tx.execute(sql`update break_items set condition = 'used' where break_id = ${breakId}`))
        .rejects.toMatchObject({ cause: { message: expect.stringMatching(/add-only after the first paid line/) } });
    });
  });
});

describe("createDraft with the composer's id", () => {
  it("makes the break under that id once; a second call applies the input to the same row", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const id = randomUUID();
      expect(await createDraft(tx, asHost(host), input, { breakId: id })).toEqual({ breakId: id });
      expect(await createDraft(tx, asHost(host), { ...input, title: "Target Chronos v2" }, { breakId: id })).toEqual({ breakId: id });
      const rows = await tx.select().from(breaks).where(sql`${breaks.id} = ${id}`);
      expect(rows.map((r) => r.title)).toEqual(["Target Chronos v2"]);
      const types = (await tx.select().from(events).where(sql`${events.breakId} = ${id}`)).map((e) => e.type).sort();
      expect(types).toEqual(["break.created", "break.updated"]);
      expect((await draftForEdit(tx, id))!.topSpot).toEqual(input.items); // same slots, no duplicate prizes
    });
  });
  it("refuses another host's id, an admin's included, and changes nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const admin = await makeUser(tx, { role: "admin" });
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await expect(createDraft(tx, asHost(other), { ...input, title: "Hijacked" }, { breakId: id })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(createDraft(tx, { ...asHost(admin), role: "admin" }, { ...input, title: "Hijacked" }, { breakId: id })).rejects.toBeInstanceOf(NotAuthorized);
      expect((await draftForEdit(tx, id))!.title).toBe("Target Chronos");
    });
  });
  it("refuses an id that is not a uuid, and the id of a break already open", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), input, { breakId: "b1" })).rejects.toBeInstanceOf(InvalidInput);
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await openBreak(tx, asHost(host), id);
      await expect(createDraft(tx, asHost(host), input, { breakId: id })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("deleteDraft", () => {
  it("deletes the prizes, items, photo rows and tickets, keeps the events, and returns the photo locations", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: input.items[0].slotKey }); // bucket defaults to photos-draft
      await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: null });
      await tx.insert(photoUploads).values({ hostId: host.id, breakId, incomingName: `x-${randomUUID()}`, expiresAt: new Date(Date.now() + 300_000) });
      const { photos } = await deleteDraft(tx, asHost(host), breakId);
      expect(photos).toHaveLength(2);
      expect(photos.every((p) => p.location === "photos-draft" && p.prefix.startsWith(`${breakId}/`))).toBe(true);
      for (const t of [prizes, breakItems, breakPhotos, photoUploads]) {
        expect(await tx.select().from(t).where(sql`${t.breakId} = ${breakId}`)).toHaveLength(0);
      }
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
      expect(row.deletedAt).toBeInstanceOf(Date); // a tombstone: the row stays for its events
      expect(row.status).toBe("draft");
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId}`);
      expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["break.created", "break.deleted"]));
      expect(evs.find((e) => e.type === "break.deleted")!.payload).toEqual({ photos: 2 });
    });
  });
  it("skips a photo row whose files are already gone (path null) in what it returns, and counts it in the event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: null });
      const hidden = await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: null });
      // An admin-hidden photo whose copies are all gone (ruling 10): only reachable under allowPhotoModeration.
      await allowPhotoModeration(tx);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive', path = null where id = ${hidden}`);
      const { photos } = await deleteDraft(tx, asHost(host), breakId);
      expect(photos).toHaveLength(1);
      expect(photos[0].prefix).toMatch(new RegExp(`^${breakId}/`));
      const [ev] = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.deleted'`);
      expect(ev.payload).toEqual({ photos: 2 });
    });
  });
  it("is for the host or an admin, and only while the break is a draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const member = await makeUser(tx);
      const admin = await makeUser(tx, { role: "admin" });
      const a = await createDraft(tx, asHost(host), input);
      await expect(deleteDraft(tx, asHost(other), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      await expect(deleteDraft(tx, asMember(member), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      expect(await deleteDraft(tx, { ...asHost(admin), role: "admin" }, a.breakId)).toEqual({ photos: [] });
      const b = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), b.breakId);
      await expect(deleteDraft(tx, asHost(host), b.breakId)).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("leaves a deleted draft unreachable: delete, edit, open and create-by-id all say not found", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await deleteDraft(tx, asHost(host), id);
      await expect(deleteDraft(tx, asHost(host), id)).rejects.toBeInstanceOf(NotFound);
      await expect(updateDraft(tx, asHost(host), id, input)).rejects.toBeInstanceOf(NotFound);
      await expect(openBreak(tx, asHost(host), id)).rejects.toBeInstanceOf(NotFound);
      await expect(createDraft(tx, asHost(host), input, { breakId: id })).rejects.toBeInstanceOf(NotFound);
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
