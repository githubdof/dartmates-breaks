import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { toCaller, shouldPromote, syncUser } from "./session";
import { events, type users } from "@/db/schema";
import type { Tx } from "@/db/client";
import { withTx } from "../../tests/helpers/db";
import { makeUser } from "../../tests/helpers/fixtures";

type UserRow = Pick<typeof users.$inferSelect, "id" | "role" | "handle" | "displayName" | "ageConfirmedAt" | "bannedAt">;

describe("shouldPromote", () => {
  const confirmed = "2026-10-13T00:00:00Z";
  it("promotes a confirmed, listed email, ignoring case and whitespace", () => {
    expect(shouldPromote("Boss@Example.com", confirmed, " a@x.com , boss@example.com ")).toBe(true);
  });
  it("never promotes an unconfirmed email", () => {
    expect(shouldPromote("boss@example.com", null, "boss@example.com")).toBe(false);
    expect(shouldPromote("boss@example.com", undefined, "boss@example.com")).toBe(false);
  });
  it("does not promote unlisted emails or an empty list", () => {
    expect(shouldPromote("other@example.com", confirmed, "boss@example.com")).toBe(false);
    expect(shouldPromote("boss@example.com", confirmed, "")).toBe(false);
  });
});

describe("toCaller", () => {
  it("is onboarded only with handle, display name and age confirmation", () => {
    const base: UserRow = { id: "u", role: "member", handle: "h", displayName: "d", ageConfirmedAt: new Date(), bannedAt: null };
    expect(toCaller(base).onboarded).toBe(true);
    expect(toCaller({ ...base, handle: null }).onboarded).toBe(false);
    expect(toCaller({ ...base, bannedAt: new Date() }).banned).toBe(true);
  });
});

describe("syncUser", () => {
  const roleEvents = (tx: Tx, id: string) =>
    tx.select({ payload: events.payload }).from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'user.role_changed'`);

  it("records user.role_changed once when an existing member is promoted", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      const email = `${u.handle}@example.com`;
      expect((await syncUser(tx, u.id, email, true)).role).toBe("admin");
      await syncUser(tx, u.id, email, true);
      expect(await roleEvents(tx, u.id)).toEqual([{ payload: { from: "member", to: "admin", reason: "admin_emails" } }]);
    });
  });
  it("records the promotion of a brand-new user, and nothing without promotion", async () => {
    await withTx(async (tx) => {
      const fresh = randomUUID();
      await syncUser(tx, fresh, `${fresh}@example.com`, true);
      expect(await roleEvents(tx, fresh)).toEqual([{ payload: { from: "member", to: "admin", reason: "admin_emails" } }]);
      const plain = await makeUser(tx);
      expect((await syncUser(tx, plain.id, `${plain.handle}@example.com`, false)).role).toBe("member");
      expect(await roleEvents(tx, plain.id)).toEqual([]);
    });
  });
});
