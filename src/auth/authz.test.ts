import { describe, it, expect } from "vitest";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { assertHostOf, assertOnboarded, lockBreak } from "./authz";
import { NotAuthorized, NotFound, NotOnboarded } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const callerOf = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("authz", () => {
  it("assertHostOf allows the host and admins, rejects others", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx);
      const admin = await makeUser(tx, { role: "admin" });
      const b = await makeBreak(tx, { hostId: host.id });
      expect((await assertHostOf(tx, callerOf(host, "host"), b.id)).id).toBe(b.id);
      expect((await assertHostOf(tx, callerOf(admin, "admin"), b.id)).id).toBe(b.id);
      await expect(assertHostOf(tx, callerOf(other), b.id)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("lockBreak throws NotFound for unknown ids", async () => {
    await withTx(async (tx) => {
      await expect(lockBreak(tx, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFound);
    });
  });
  it("assertOnboarded rejects un-onboarded and banned callers", () => {
    expect(() => assertOnboarded({ id: "x", role: "member", onboarded: false, banned: false })).toThrow(NotOnboarded);
    expect(() => assertOnboarded({ id: "x", role: "member", onboarded: true, banned: true })).toThrow(NotAuthorized);
  });
});
