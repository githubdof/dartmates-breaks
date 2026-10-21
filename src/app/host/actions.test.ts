import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";
import { createDraft, type CreateDraftInput } from "@/domain/breaks/commands";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import { deleteDraftAction } from "./actions";

// The action runs through db.transaction; here that runs inside the test's own transaction, which rolls back.
let current: Tx | null = null;
let caller: Caller | null = null;
vi.mock("@/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/client")>();
  return { ...real, db: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => (current ? fn(current) : real.db.transaction(fn)) } };
});
vi.mock("@/auth/session", () => ({ getCaller: async () => caller }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
class Redirected extends Error { constructor(readonly to: string) { super(to); } }
vi.mock("next/navigation", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/navigation")>();
  return { ...real, redirect: vi.fn((to: string) => { throw new Redirected(to); }) };
});

beforeEach(() => { vi.mocked(redirect).mockClear(); vi.mocked(revalidatePath).mockClear(); caller = null; });
afterEach(() => { current = null; });

const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const input: CreateDraftInput = {
  title: "Target Chronos", description: "", lineCount: 10, linePriceCents: 500, paymentWindowHours: 24, maxLinesPerUser: null,
  claimMode: "pick_or_random", paymentInstructions: "", paymentHandles: { venmo: "@Jim", paypal: "" },
  items: [{ name: "Chronos 22g", slotKey: "6f1c2a3b-0000-4000-8000-0000000000a1", condition: "new_in_box" }], secondPlace: [],
};

describe("deleteDraftAction", () => {
  it("deletes the caller's draft: deleted_at is set, the row stays as a tombstone, and it redirects to /host", async () => {
    await withTx(async (tx) => {
      current = tx;
      const host = await makeUser(tx, { role: "host" }); caller = as(host, "host");
      const { breakId } = await createDraft(tx, caller, input);
      await expect(deleteDraftAction(breakId)).rejects.toMatchObject({ to: "/host" });
      expect(redirect).toHaveBeenCalledWith("/host");
      expect(revalidatePath).toHaveBeenCalledWith("/host");
      const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.status).toBe("draft");
    });
  });
  it("answers the refusal and changes nothing for another host's draft, a non-uuid, or no session", async () => {
    await withTx(async (tx) => {
      current = tx;
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, as(host, "host"), input);
      caller = as(other, "host");
      expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
      expect(await deleteDraftAction("b1")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      caller = null;
      expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
      expect(redirect).not.toHaveBeenCalled();
      const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
      expect(row.deletedAt).toBeNull();
    });
  });
});
