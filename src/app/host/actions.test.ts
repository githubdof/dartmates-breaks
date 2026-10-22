import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../../tests/helpers/memory-storage";
import { seedPhoto } from "../../../tests/helpers/photos";
import { h, filesIn, resetHarness, storageInsideTx } from "../../../tests/helpers/pipeline-harness";
import { breaks } from "@/db/schema";
import { createDraft, deleteDraft, type CreateDraftInput } from "@/domain/breaks/commands";
import type { PhotoLocation } from "@/domain/photos/types";
import type { Caller } from "@/domain/types";
import { deleteDraftAction } from "./actions";

// The action runs through db.transaction; here that runs in a savepoint of the test's own transaction, which rolls back.
vi.mock("@/db/client", async (orig) => (await import("../../../tests/helpers/pipeline-harness")).mockDb(await orig()));
vi.mock("@/auth/session", async () => {
  const { h } = await import("../../../tests/helpers/pipeline-harness");
  return { getCaller: async () => h.caller };
});
vi.mock("@/storage/photo-storage", async (orig) => {
  const { h, recording } = await import("../../../tests/helpers/pipeline-harness");
  return { ...(await orig<typeof import("@/storage/photo-storage")>()), photoStorage: () => recording(h.mem) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }),
}));
vi.mock("@/domain/breaks/commands", async (orig) => (await import("../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));

const realDeleteDraft = (await vi.importActual<typeof import("@/domain/breaks/commands")>("@/domain/breaks/commands")).deleteDraft;

beforeEach(() => { h.mem = createMemoryStorage(); });
afterEach(() => { vi.clearAllMocks(); resetHarness(); });

const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const input: CreateDraftInput = {
  title: "Target Chronos", description: "", lineCount: 10, linePriceCents: 500, paymentWindowHours: 24, maxLinesPerUser: null,
  claimMode: "pick_or_random", paymentInstructions: "", paymentHandles: { venmo: "@Jim", paypal: "" },
  items: [{ name: "Chronos 22g", slotKey: "6f1c2a3b-0000-4000-8000-0000000000a1", condition: "new_in_box" }], secondPlace: [],
};

describe("deleteDraftAction", () => {
  it("deletes the caller's draft: deleted_at is set, the row stays as a tombstone, and it redirects to /host", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const host = await makeUser(tx, { role: "host" }); h.caller = as(host, "host");
      const { breakId } = await createDraft(tx, h.caller, input);
      await expect(deleteDraftAction(breakId)).rejects.toThrow("REDIRECT:/host");
      expect(redirect).toHaveBeenCalledWith("/host");
      expect(revalidatePath).toHaveBeenCalledWith("/host");
      const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.status).toBe("draft");
      expect(h.ops).toEqual([]);
    });
  });

  it("answers the refusal and changes nothing for another host's draft, a non-uuid, or no session", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, as(host, "host"), input);
      await seedPhoto(tx, h.mem, as(host, "host"), breakId);
      h.caller = as(other, "host");
      expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
      expect(await deleteDraftAction("b1")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      h.caller = null;
      expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
      expect(redirect).not.toHaveBeenCalled();
      const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
      expect(row.deletedAt).toBeNull();
      expect(h.ops).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(3);
    });
  });

  it("sets deleted_at, removes every draft photo's variants after the commit, then redirects", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const host = await makeUser(tx, { role: "host" }); h.caller = as(host, "host");
      const { breakId } = await createDraft(tx, h.caller, input);
      await seedPhoto(tx, h.mem, h.caller, breakId);
      await seedPhoto(tx, h.mem, h.caller, breakId);
      expect(filesIn("photos-draft")).toHaveLength(6);
      await expect(deleteDraftAction(breakId)).rejects.toThrow("REDIRECT:/host");
      const [row] = await tx.select({ deletedAt: breaks.deletedAt }).from(breaks).where(eq(breaks.id, breakId));
      expect(row.deletedAt).not.toBeNull();
      expect(filesIn("photos-draft")).toEqual([]);
      expect(h.timeline).toEqual(["tx:begin", "tx:end", "remove:photos-draft", "remove:photos-draft"]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("skips a photo with no path, still redirects, and a failed removal does not stop it", async () => {
    await withTx(async (tx) => {
      h.current = tx;
      const host = await makeUser(tx, { role: "host" }); h.caller = as(host, "host");
      const { breakId } = await createDraft(tx, h.caller, input);
      await seedPhoto(tx, h.mem, h.caller, breakId);
      await seedPhoto(tx, h.mem, h.caller, breakId);
      vi.mocked(deleteDraft).mockImplementationOnce(async (t, c, id) => {
        const r = await realDeleteDraft(t, c, id);
        return { photos: [...r.photos, { location: "photos-draft" as PhotoLocation, prefix: null as unknown as string }] };
      });
      h.failOn = (op, n) => op === "remove:photos-draft" && n === 1;
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(deleteDraftAction(breakId)).rejects.toThrow("REDIRECT:/host");
      expect(h.ops).toEqual(["remove:photos-draft", "remove:photos-draft"]); // one call per seeded photo, none for the null path
      expect(filesIn("photos-draft")).toHaveLength(3); // the failed one is Task 11's
      expect(quiet).toHaveBeenCalled();
      quiet.mockRestore();
    });
  });
});
