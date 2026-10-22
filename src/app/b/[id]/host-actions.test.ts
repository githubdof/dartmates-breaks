import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { withTx } from "../../../../tests/helpers/db";
import { makeUser, makeBreak } from "../../../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../../../tests/helpers/memory-storage";
import { seedPhoto } from "../../../../tests/helpers/photos";
import { h, commitThenFail, filesIn, resetHarness, storageInsideTx } from "../../../../tests/helpers/pipeline-harness";
import { breakPhotos } from "@/db/schema";
import { openBreak } from "@/domain/breaks/commands";
import { NotOpen } from "@/domain/errors";
import { peekBreakStatus } from "@/domain/photos/peek";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import { saveBreak, type ComposerState } from "@/app/host/new/actions";
import { openBreakAction } from "./host-actions";

vi.mock("@/db/client", async (orig) => (await import("../../../../tests/helpers/pipeline-harness")).mockDb(await orig()));
vi.mock("@/auth/session", async () => {
  const { h } = await import("../../../../tests/helpers/pipeline-harness");
  return { getCaller: async () => h.caller };
});
vi.mock("@/storage/photo-storage", async (orig) => {
  const { h, recording } = await import("../../../../tests/helpers/pipeline-harness");
  return { ...(await orig<typeof import("@/storage/photo-storage")>()), photoStorage: () => recording(h.mem) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }),
}));
vi.mock("@/domain/breaks/commands", async (orig) => (await import("../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));
vi.mock("@/domain/photos/commands", async (orig) => (await import("../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));
vi.mock("@/domain/photos/peek", async (orig) => (await import("../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));

const realOpen = (await vi.importActual<typeof import("@/domain/breaks/commands")>("@/domain/breaks/commands")).openBreak;

beforeEach(() => { h.mem = createMemoryStorage(); });
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); resetHarness(); });

const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const rows = (tx: Tx, breakId: string) => tx.select().from(breakPhotos).where(eq(breakPhotos.breakId, breakId)).orderBy(breakPhotos.position);
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

/** The host signed in, a draft ready to open with `n` seeded photos in photos-draft; the mocks' calls cleared. */
async function draft(tx: Tx, n: number) {
  h.current = tx;
  const user = await makeUser(tx, { role: "host" });
  const host = as(user, "host");
  h.caller = host;
  const b = await makeBreak(tx, { hostId: user.id });
  const photos = [];
  for (let i = 0; i < n; i++) photos.push(await seedPhoto(tx, h.mem, host, b.id));
  vi.clearAllMocks();
  return { user, host, b, photos };
}

describe("openBreakAction (photos spec §5.4)", () => {
  it("copies every draft photo to photos, opens, then drops the draft copies", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      expect((await openBreakAction(b.id)).ok).toBe(true);
      expect(filesIn("photos")).toHaveLength(6);
      expect(filesIn("photos-draft")).toEqual([]);
      expect((await rows(tx, b.id)).map((r) => r.bucket)).toEqual(["photos", "photos"]);
      expect(await peekBreakStatus(tx, b.id)).toBe("open");
      expect(h.ops.lastIndexOf("copy:photos")).toBeLessThan(h.ops.indexOf("remove:photos-draft"));
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a copy failure answers 'Photos are still being prepared. Try again.', the break stays a draft, photos holds nothing", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      h.failOn = (op, n) => op === "copy:photos" && n === 4;
      quiet();
      expect(await openBreakAction(b.id)).toEqual({ ok: false, code: "PHOTOS_NOT_READY", message: "Photos are still being prepared. Try again." });
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(6);
      expect(vi.mocked(openBreak)).not.toHaveBeenCalled();
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a photo finalised between the copy and the lock refuses the open and removes the photos copies", async () => {
    await withTx(async (tx) => {
      const { b, host } = await draft(tx, 1);
      // The late photo is recorded while the copy runs (no transaction is open then), before the open locks the break.
      const copy = h.mem.copy.bind(h.mem);
      let calls = 0;
      vi.spyOn(h.mem, "copy").mockImplementation(async (from, to) => {
        if (++calls === 3) await seedPhoto(tx, h.mem, host, b.id);
        return copy(from, to);
      });
      const r = await openBreakAction(b.id);
      expect(r).toEqual({ ok: false, code: "PHOTOS_NOT_READY", message: "Photos are still being prepared. Try again." });
      expect(vi.mocked(openBreak)).not.toHaveBeenCalled();
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(6);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("an open that rolled back on an unexpected error removes the photos copies and keeps the draft copies", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      vi.mocked(openBreak).mockImplementationOnce(async () => { throw new Error("socket closed"); });
      quiet();
      expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "INTERNAL" });
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(6);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("an open that committed but reported a failure keeps the photos copies (the re-read shows it open)", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      vi.mocked(openBreak).mockImplementationOnce(async (t, c, id) => { commitThenFail(); return realOpen(t, c, id); });
      quiet();
      expect((await openBreakAction(b.id)).ok).toBe(true);
      expect(await peekBreakStatus(tx, b.id)).toBe("open");
      expect(filesIn("photos")).toHaveLength(6);
      expect(filesIn("photos-draft")).toEqual([]);
      expect((await rows(tx, b.id)).map((r) => r.bucket)).toEqual(["photos", "photos"]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a refused open (a domain error) removes the photos copies", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      vi.mocked(openBreak).mockImplementationOnce(async () => { throw new NotOpen("open"); });
      expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "NOT_OPEN" });
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(6);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("regression pin: a stranger's openBreakAction copies nothing and gets the host refusal", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 2);
      h.caller = as(await makeUser(tx, { role: "host" }), "host");
      expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
      expect(h.ops).toEqual([]);
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
    });
  });

  it("regression pin: a draft with no photo opens as before", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 0);
      expect((await openBreakAction(b.id)).ok).toBe(true);
      expect(await peekBreakStatus(tx, b.id)).toBe("open");
      expect(h.ops).toEqual([]);
    });
  });

  it("regression pin: signed out and malformed ids are refused before anything", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 1);
      expect(await openBreakAction("nope")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      h.caller = null;
      expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
      expect(h.ops).toEqual([]);
    });
  });
});

describe("saveBreak with intent=open (photos plan ruling 13)", () => {
  function form(breakId: string): FormData {
    const f = new FormData();
    const fields: Record<string, string> = {
      breakId, title: "Taylor Chronos", prize1: "Chronos 22g", prize1Slot: "6f1c2a3b-0000-4000-8000-000000000001",
      prize1Condition: "new_in_box", lineCount: "10", linePrice: "5", venmo: "@Jim-R", intent: "open",
    };
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  }

  it("on a draft with a photo copies it to photos before opening", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 1);
      await expect(saveBreak({} as ComposerState, form(b.id))).rejects.toThrow(`REDIRECT:/b/${b.id}`);
      expect(filesIn("photos")).toHaveLength(3);
      expect(filesIn("photos-draft")).toEqual([]);
      expect(await peekBreakStatus(tx, b.id)).toBe("open");
      expect((await rows(tx, b.id)).map((r) => r.bucket)).toEqual(["photos"]);
      expect(h.ops.lastIndexOf("copy:photos")).toBeLessThan(h.ops.indexOf("remove:photos-draft"));
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a copy failure answers the copy and leaves the draft as it was", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 1);
      h.failOn = (op) => op === "copy:photos";
      quiet();
      const r = await saveBreak({} as ComposerState, form(b.id));
      expect(r).toMatchObject({ error: "Photos are still being prepared. Try again.", values: { title: "Taylor Chronos" } });
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("photos-draft")).toHaveLength(3);
    });
  });

  it("an open that committed but reported a failure still redirects to the break", async () => {
    await withTx(async (tx) => {
      const { b } = await draft(tx, 1);
      vi.mocked(openBreak).mockImplementationOnce(async (t, c, id) => { commitThenFail(); return realOpen(t, c, id); });
      quiet();
      await expect(saveBreak({} as ComposerState, form(b.id))).rejects.toThrow(`REDIRECT:/b/${b.id}`);
      expect(await peekBreakStatus(tx, b.id)).toBe("open");
      expect(filesIn("photos")).toHaveLength(3);
      expect(filesIn("photos-draft")).toEqual([]);
    });
  });
});
