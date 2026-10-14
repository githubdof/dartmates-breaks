import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { checkHandle, hitHandleLimit, HANDLE_CHECKS_PER_MINUTE, HANDLE_CHECKS_PER_USER_PER_MINUTE } from "./handle-check";

const fullwidth = (s: string) => [...s].map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join("");

describe("checkHandle (Review Focus 3)", () => {
  it("answers taken, free or invalid, normalising like onboarding, and says nothing else", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { handle: `jim_${randomUUID().slice(0, 8)}` });
      const me = await makeUser(tx);
      const ipHash = `ip-${randomUUID()}`;
      const now = new Date();
      const ask = (raw: string, callerId = me.id) => checkHandle(tx, { raw, callerId, ipHash, now });
      expect(await ask(jim.handle)).toEqual({ state: "taken" });
      expect(await ask(jim.handle.toUpperCase())).toEqual({ state: "taken" });
      expect(await ask(fullwidth(jim.handle))).toEqual({ state: "taken" });
      expect(await ask(`free_${randomUUID().slice(0, 8)}`)).toEqual({ state: "free" });
      expect(await ask(me.handle)).toEqual({ state: "free" }); // your own handle is yours to keep
      expect(await ask("admin")).toEqual({ state: "invalid", message: "That handle is reserved" });
      expect(await ask("ab")).toEqual({ state: "invalid", message: "Handle must be 3–20 letters, numbers or underscores" });
    });
  });

  it("limits each IP hash to 30 checks a minute, whatever the handle", async () => {
    await withTx(async (tx) => {
      const me = await makeUser(tx);
      const ipHash = `ip-${randomUUID()}`;
      const now = new Date("2026-10-14T12:00:00Z");
      for (let i = 0; i < HANDLE_CHECKS_PER_MINUTE; i++) {
        expect((await checkHandle(tx, { raw: `try_${i}_x`, callerId: me.id, ipHash, now })).state).not.toBe("limited");
      }
      expect(await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash, now })).toEqual({ state: "limited", retryAfter: 60 });
      expect((await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).state).toBe("free");
      expect((await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash: null, now })).state).toBe("free");
    });
  });

  it("limits one user to 60 checks a minute however many addresses they rotate through", async () => {
    await withTx(async (tx) => {
      const me = await makeUser(tx);
      const now = new Date("2026-10-14T12:00:00Z");
      for (let i = 0; i < HANDLE_CHECKS_PER_USER_PER_MINUTE; i++) {
        expect((await checkHandle(tx, { raw: `rot_${i}_x`, callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).state).not.toBe("limited");
      }
      expect(await checkHandle(tx, { raw: "one_more", callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).toEqual({ state: "limited", retryAfter: 60 });
    });
  });

  it("counts onboarding attempts on the same buckets: the 61st in a minute is refused", async () => {
    await withTx(async (tx) => {
      const me = await makeUser(tx);
      const now = new Date("2026-10-14T12:00:00Z");
      for (let i = 0; i < HANDLE_CHECKS_PER_USER_PER_MINUTE; i++) {
        expect(await hitHandleLimit(tx, { callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).toBeNull();
      }
      expect(await hitHandleLimit(tx, { callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).toEqual({ retryAfter: 60 });
      // The live check shares the bucket, so attempts on either path add up.
      expect(await checkHandle(tx, { raw: "one_more", callerId: me.id, ipHash: null, now })).toEqual({ state: "limited", retryAfter: 60 });
    });
  });
});
