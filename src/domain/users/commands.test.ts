import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { completeOnboarding, normalizeHandle, TERMS_VERSION } from "./commands";
import { users, legalAcceptances } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";

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
