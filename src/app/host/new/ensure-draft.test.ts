import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withTx } from "../../../../tests/helpers/db";
import { makeUser } from "../../../../tests/helpers/fixtures";
import { h, resetHarness } from "../../../../tests/helpers/pipeline-harness";
import { breaks, prizes } from "@/db/schema";
import type { Caller } from "@/domain/types";
import { ensureDraftAction } from "./actions";

vi.mock("@/db/client", async (orig) => (await import("../../../../tests/helpers/pipeline-harness")).mockDb(await orig()));
vi.mock("@/auth/session", async () => {
  const { h } = await import("../../../../tests/helpers/pipeline-harness");
  return { getCaller: async () => h.caller };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), redirect: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.clearAllMocks(); resetHarness(); });

const ID = "6f1c2a3b-0000-4000-8000-0000000000b1";
const SLOT = "6f1c2a3b-0000-4000-8000-0000000000a1";
const form = (o: Record<string, string> = {}): FormData => {
  const f = new FormData();
  const fields: Record<string, string> = {
    title: "Strip break", prize1: "Chronos 22g", prize1Slot: SLOT, prize1Condition: "new_in_box", lineCount: "10", linePrice: "5", newBreakId: ID, ...o,
  };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const as = (u: { id: string }): Caller => ({ id: u.id, role: "host", onboarded: true, banned: false });

describe("ensureDraftAction (photos spec §9, plan ruling 12)", () => {
  it("saves a draft under newBreakId without a payment handle and without redirecting", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const user = await makeUser(tx, { role: "host" });
      h.caller = as(user);
      const r = await ensureDraftAction(form());
      expect(r).toEqual({ ok: true, data: { breakId: ID } });
      expect(redirect).not.toHaveBeenCalled();
      const [b] = await tx.select().from(breaks).where(eq(breaks.id, ID));
      expect(b).toMatchObject({ status: "draft", title: "Strip break", hostId: user.id });
    });
  });
  it("a second call with the same id saves the latest form into the same draft", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const user = await makeUser(tx, { role: "host" });
      h.caller = as(user);
      await ensureDraftAction(form());
      expect(await ensureDraftAction(form({ title: "Renamed" }))).toEqual({ ok: true, data: { breakId: ID } });
      const rows = await tx.select().from(breaks).where(eq(breaks.id, ID));
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Renamed");
    });
  });
  it("a form that cannot be saved answers the parser's sentence", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      h.caller = as(await makeUser(tx, { role: "host" }));
      expect(await ensureDraftAction(form({ prize1Condition: "" }))).toMatchObject({ ok: false, message: "Chronos 22g: choose its condition" });
    });
  });
  it("a missing or malformed newBreakId is the stale-form error", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      h.caller = as(await makeUser(tx, { role: "host" }));
      expect(await ensureDraftAction(form({ newBreakId: "x" }))).toMatchObject({ ok: false, message: "This form is out of date. Reload the page and try again." });
    });
  });
  it("an open draft's form (breakId, no newBreakId) saves into that draft, 2nd place included", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      h.caller = as(await makeUser(tx, { role: "host" }));
      await ensureDraftAction(form());
      const SLOT2 = "6f1c2a3b-0000-4000-8000-0000000000a2";
      const f = form({ title: "Edited", prize2: "Flights", prize2Slot: SLOT2, prize2Condition: "used", breakId: ID });
      f.delete("newBreakId");
      expect(await ensureDraftAction(f)).toEqual({ ok: true, data: { breakId: ID } });
      const [b] = await tx.select().from(breaks).where(eq(breaks.id, ID));
      expect(b.title).toBe("Edited");
      const slots = (await tx.select({ s: prizes.slotKey }).from(prizes).where(eq(prizes.breakId, ID))).map((r) => r.s);
      expect(slots.sort()).toEqual([SLOT, SLOT2].sort());
    });
  });
});
