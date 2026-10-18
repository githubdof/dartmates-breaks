import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { cleanPaymentName, completeOnboarding, nameLocked, normalizeHandle, TERMS_VERSION, updateFlight, updateProfile } from "./commands";
import { users, legalAcceptances, events } from "@/db/schema";
import { InvalidInput, NotAuthorized, NotOnboarded } from "@/domain/errors";

const caller = (id: string) => ({ id, role: "member" as const, onboarded: false, banned: false });

describe("normalizeHandle", () => {
  it("NFKC-normalises and lowercases, rejects bad shapes and reserved names", () => {
    expect(normalizeHandle("Ｊim_Roberts")).toBe("jim_roberts");
    expect(() => normalizeHandle("ab")).toThrow(InvalidInput);
    expect(() => normalizeHandle("has space")).toThrow(InvalidInput);
    expect(() => normalizeHandle("admin")).toThrow(InvalidInput);
  });
});

describe("completeOnboarding", () => {
  it("sets handle, display name, age confirmation and records the terms acceptance", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null, displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: "Jim_R", displayName: "Jim Roberts", ageConfirmed: true, acceptedTerms: true, ipHash: "abc" });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row.handle).toBe("jim_r"); expect(row.displayName).toBe("Jim Roberts"); expect(row.ageConfirmedAt).not.toBeNull();
      const acc = await tx.select().from(legalAcceptances).where(sql`${legalAcceptances.userId} = ${u.id}`);
      expect(acc).toHaveLength(1);
      expect(acc[0]).toMatchObject({ docKind: "terms", version: TERMS_VERSION, ipHash: "abc" });
    });
  });
  it("a repeat onboarding throws and leaves one acceptance and one event", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null, displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      const p = { handle: "repeat1", displayName: "R", ageConfirmed: true, acceptedTerms: true };
      await completeOnboarding(tx, caller(u.id), p);
      await expect(completeOnboarding(tx, caller(u.id), { ...p, handle: "repeat2" })).rejects.toThrow(/already set up/);
      const acc = await tx.select().from(legalAcceptances).where(sql`${legalAcceptances.userId} = ${u.id}`);
      expect(acc).toHaveLength(1);
      const evs = await tx.select().from(events).where(sql`${events.actorId} = ${u.id} and ${events.type} = 'user.onboarded'`);
      expect(evs).toHaveLength(1);
    });
  });
  it("requires the 18+ and terms checkboxes", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await expect(completeOnboarding(tx, caller(u.id), { handle: "abc", displayName: "A", ageConfirmed: false, acceptedTerms: true })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("reports a taken handle (case-insensitively)", async () => {
    await withTx(async (tx) => {
      await makeUser(tx, { handle: "taken1" });
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null }).where(sql`${users.id} = ${u.id}`);
      await expect(completeOnboarding(tx, caller(u.id), { handle: "TAKEN1", displayName: "x", ageConfirmed: true, acceptedTerms: true })).rejects.toThrow(/taken/);
    });
  });
});

const onboarded = (id: string) => ({ id, role: "member" as const, onboarded: true, banned: false });

describe("payment name", () => {
  it("is cleaned: trimmed, inner spaces collapsed, blank is none, at most 60 characters", () => {
    expect(cleanPaymentName("  John   Smith ")).toBe("John Smith");
    expect(cleanPaymentName("   ")).toBeNull();
    expect(cleanPaymentName(undefined)).toBeNull();
    expect(cleanPaymentName("Ｊｏｈｎ")).toBe("John");
    expect(() => cleanPaymentName("x".repeat(61))).toThrow(/at most 60/);
  });
  it("is stored by onboarding when given", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null, displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: `p${u.handle}`.slice(0, 20), displayName: "Pat", ageConfirmed: true, acceptedTerms: true, paymentName: " Patricia  Lee " });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row.paymentName).toBe("Patricia Lee");
    });
  });
  it("is refused by the database above 60 characters", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      // Drizzle wraps the driver error; the constraint name is on `.cause`. Last statement: the failure aborts the transaction.
      const err = await tx.execute(sql`update users set payment_name = ${"x".repeat(61)} where id = ${u.id}`).catch((e: unknown) => e);
      expect(String((err as { cause?: unknown })?.cause ?? err)).toMatch(/users_payment_name_chk/);
    });
  });
});

describe("completeOnboarding, half set up", () => {
  it("finishes an account that has a handle but no display name or age confirmation", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: u.handle, displayName: "Half Done", ageConfirmed: true, acceptedTerms: true });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ handle: u.handle, displayName: "Half Done" });
      expect(row.ageConfirmedAt).not.toBeNull();
      expect(row.paymentName).toBeNull();
    });
  });
});

describe("updateProfile", () => {
  it("changes the display name and payment name, logs what changed, and is a no-op when nothing did", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await updateProfile(tx, onboarded(u.id), { displayName: "Dave R", paymentName: "David Roberts" })).toEqual({ changed: ["displayName", "paymentName"] });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ displayName: "Dave R", paymentName: "David Roberts" });
      expect(row.nameChangedAt).not.toBeNull();
      expect(await updateProfile(tx, onboarded(u.id), { displayName: "Dave R", paymentName: " David  Roberts" })).toEqual({ changed: [] });
      const evs = await tx.select().from(events).where(sql`${events.actorId} = ${u.id} and ${events.type} = 'user.profile_updated'`);
      expect(evs.map((e) => e.payload)).toEqual([{ changed: ["displayName", "paymentName"] }]);
    });
  });
  it("locks the display name 30 days after sign-up but keeps the payment name editable", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set created_at = now() - interval '31 days' where id = ${u.id}`);
      await expect(updateProfile(tx, onboarded(u.id), { displayName: "New Name", paymentName: "" })).rejects.toThrow(/locked 30 days/);
      expect(await updateProfile(tx, onboarded(u.id), { displayName: u.handle, paymentName: "Pat Lee" })).toEqual({ changed: ["paymentName"] });
      await expect(updateProfile(tx, onboarded(u.id), { displayName: "", paymentName: "" })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("tells when a name is locked", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(nameLocked(new Date("2026-09-14T11:00:00Z"), now)).toBe(true);
    expect(nameLocked(new Date("2026-09-15T12:00:00Z"), now)).toBe(false);
  });
});

describe("updateFlight", () => {
  const flightEvents = (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    tx.select().from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'user.profile_updated'`);

  it("stores the flight, marks it chosen and logs the change", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ flightColour: "pink", flightShape: "slim" }).where(sql`${users.id} = ${u.id}`);
      await updateFlight(tx, onboarded(u.id), { colour: "blue", shape: "kite" });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ flightColour: "blue", flightShape: "kite" });
      expect(row.flightChosenAt).not.toBeNull();
      // The changed field's name, never the values (recorded ruling 10).
      expect((await flightEvents(tx, u.id)).map((e) => e.payload)).toEqual([{ changed: ["flight"] }]);
    });
  });
  it("keeping the random flight counts as choosing it, once", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ flightColour: "sky", flightShape: "pear" }).where(sql`${users.id} = ${u.id}`);
      await updateFlight(tx, onboarded(u.id), { colour: "sky", shape: "pear" });
      const [first] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(first.flightChosenAt).not.toBeNull();
      await updateFlight(tx, onboarded(u.id), { colour: "sky", shape: "pear" });
      const [second] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(second.flightChosenAt).toEqual(first.flightChosenAt);
      expect(await flightEvents(tx, u.id)).toHaveLength(1);
    });
  });
  it("refuses a colour or shape outside the set and changes nothing", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      const [before] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      await expect(updateFlight(tx, onboarded(u.id), { colour: "red" as never, shape: "kite" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateFlight(tx, onboarded(u.id), { colour: "blue", shape: "dart" as never })).rejects.toThrow("Choose one of the 32 flights");
      const [after] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(after).toMatchObject({ flightColour: before.flightColour, flightShape: before.flightShape, flightChosenAt: null });
      expect(await flightEvents(tx, u.id)).toHaveLength(0);
    });
  });
  it("refuses a banned caller and one who has not finished onboarding", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await expect(updateFlight(tx, { ...onboarded(u.id), banned: true }, { colour: "blue", shape: "kite" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateFlight(tx, { ...onboarded(u.id), banned: true }, { colour: "blue", shape: "kite" })).rejects.toThrow(/suspended/);
      await expect(updateFlight(tx, { ...onboarded(u.id), onboarded: false }, { colour: "blue", shape: "kite" })).rejects.toBeInstanceOf(NotOnboarded);
    });
  });
});
