import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines } from "../../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../../tests/helpers/memory-storage";
import { seedPhoto } from "../../../tests/helpers/photos";
import { h, commitThenFail, filesIn, resetHarness, storageInsideTx } from "../../../tests/helpers/pipeline-harness";
import { breakPhotos, photoUploads } from "@/db/schema";
import { claimLines } from "@/domain/lines/commands";
import { removePhoto, reorderPhotos } from "@/domain/photos/commands";
import { peekPhoto } from "@/domain/photos/peek";
import { NotOpen } from "@/domain/errors";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import {
  describePhotoAction, markPhotoNoticeSeenAction, removePhotoAction, reorderPhotosAction, requestPhotoUpload, retagPhotoAction,
} from "./actions";

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
vi.mock("@/domain/photos/commands", async (orig) => (await import("../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));
vi.mock("@/domain/photos/peek", async (orig) => (await import("../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));

const realRemove = (await vi.importActual<typeof import("@/domain/photos/commands")>("@/domain/photos/commands")).removePhoto;
const realPeekPhoto = (await vi.importActual<typeof import("@/domain/photos/peek")>("@/domain/photos/peek")).peekPhoto;

beforeEach(() => { h.mem = createMemoryStorage(); });
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); resetHarness(); });

const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const rows = (tx: Tx, breakId: string) => tx.select().from(breakPhotos).where(eq(breakPhotos.breakId, breakId)).orderBy(breakPhotos.position);
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

/** A host signed in, a break (draft, open, or open with line 1 claimed) and one seeded photo; the mocks' calls cleared. */
async function scene(tx: Tx, state: "draft" | "open" | "claimed") {
  h.current = tx;
  const user = await makeUser(tx, { role: "host" });
  const buyer = await makeUser(tx);
  const host = as(user, "host");
  h.caller = host;
  const b = state === "draft" ? await makeBreak(tx, { hostId: user.id }) : await openBreakWithLines(tx, { hostId: user.id });
  const p = await seedPhoto(tx, h.mem, host, b.id);
  if (state === "claimed") await claimLines(tx, as(buyer), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  vi.clearAllMocks();
  return { user, host, buyer, b, p };
}
/** The first claim lands between the action's read of the photo and its removing transaction. */
const claimAfterPeek = (tx: Tx, buyer: { id: string }, breakId: string) =>
  vi.mocked(peekPhoto).mockImplementationOnce(async (t, id) => {
    const v = await realPeekPhoto(t, id);
    await claimLines(tx, as(buyer), { breakId, numbers: [1], batchId: randomUUID() });
    return v;
  });

describe("requestPhotoUpload (photos spec §5.2)", () => {
  it("commits the upload grant, then signs an upload into incoming for its name (ruling 28)", async () => {
    await withTx(async (tx) => {
      const { b } = await scene(tx, "draft");
      const spy = vi.spyOn(h.mem, "createSignedUpload");
      const r = await requestPhotoUpload(b.id);
      expect(r.ok).toBe(true);
      const grants = await tx.select().from(photoUploads).where(eq(photoUploads.breakId, b.id));
      const t = grants.find((g) => g.consumedAt === null)!;
      expect(r.ok && r.data).toEqual({ ticketId: t.id, uploadUrl: `memory://upload/incoming/${t.incomingName}`, token: expect.any(String) });
      expect(spy.mock.calls).toEqual([[t.incomingName]]);
      expect(h.timeline).toEqual(["tx:begin", "tx:end", "sign:incoming"]);
    });
  });

  it("deletes the grant when the upload URL cannot be signed", async () => {
    await withTx(async (tx) => {
      const { b } = await scene(tx, "draft");
      h.failOn = (op) => op === "sign:incoming";
      quiet();
      const r = await requestPhotoUpload(b.id);
      expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." });
      const open = (await tx.select().from(photoUploads).where(eq(photoUploads.breakId, b.id))).filter((g) => g.consumedAt === null);
      expect(open).toEqual([]);
      expect(h.timeline).toEqual(["tx:begin", "tx:end", "sign:incoming", "tx:begin", "tx:end"]); // signed outside, dropped after
    });
  });

  it("refuses a malformed id and another host's break without signing anything", async () => {
    await withTx(async (tx) => {
      const { b } = await scene(tx, "draft");
      expect(await requestPhotoUpload("nope")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      h.caller = as(await makeUser(tx, { role: "host" }), "host");
      expect(await requestPhotoUpload(b.id)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
      expect(h.ops).toEqual([]);
    });
  });
});

describe("removePhotoAction (photos spec §6, panel ruling 24)", () => {
  it("removing before any claim deletes the variants outright; nothing reaches photo-archive", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "open");
      expect((await removePhotoAction(p.photoId)).ok).toBe(true);
      expect(h.ops).toEqual(["remove:photos"]);
      expect(filesIn("photo-archive")).toEqual([]);
      expect(filesIn("photos")).toEqual([]);
      expect(await rows(tx, b.id)).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("removing a draft's photo deletes it from photos-draft", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "draft");
      expect((await removePhotoAction(p.photoId)).ok).toBe(true);
      expect(h.ops).toEqual(["remove:photos-draft"]);
      expect(filesIn("photos-draft")).toEqual([]);
      expect(await rows(tx, b.id)).toEqual([]);
    });
  });

  it("removing after a claim copies to photo-archive first, commits, then deletes from photos", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      expect((await removePhotoAction(p.photoId)).ok).toBe(true);
      expect(h.ops).toEqual(["copy:photo-archive", "copy:photo-archive", "copy:photo-archive", "remove:photos"]);
      expect(h.timeline.indexOf("copy:photo-archive")).toBeLessThan(h.timeline.indexOf("tx:begin", 2)); // copied before the removing transaction
      expect(filesIn("photo-archive")).toHaveLength(3);
      expect(filesIn("photos")).toEqual([]);
      expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive" }]);
      expect((await rows(tx, b.id))[0].removedAt).not.toBeNull();
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a failed archive copy removes nothing and answers 'Couldn't remove the photo. Try again.' (ruling 24)", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      h.failOn = (op, n) => op === "copy:photo-archive" && n === 2;
      quiet();
      const r = await removePhotoAction(p.photoId);
      expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." });
      expect((await rows(tx, b.id))[0]).toMatchObject({ removedAt: null, bucket: "photos" });
      expect(filesIn("photos")).toHaveLength(3);
      expect(filesIn("photo-archive")).toEqual([]);
      expect(vi.mocked(removePhoto)).not.toHaveBeenCalled();
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a first claim landing between the read and the lock: the removal rolls back, archives, then commits (ruling 24)", async () => {
    await withTx(async (tx) => {
      const { b, p, buyer } = await scene(tx, "open");
      claimAfterPeek(tx, buyer, b.id);
      const r = await removePhotoAction(p.photoId);
      expect(r.ok).toBe(true);
      expect(vi.mocked(removePhoto)).toHaveBeenCalledTimes(2); // the first attempt saw archive: true with no copy and rolled back
      expect(h.ops).toEqual(["copy:photo-archive", "copy:photo-archive", "copy:photo-archive", "remove:photos"]);
      expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive" }]);
      expect(filesIn("photo-archive")).toHaveLength(3);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("the same race with a failed archive copy leaves the photo live with its files and archives nothing", async () => {
    await withTx(async (tx) => {
      const { b, p, buyer } = await scene(tx, "open");
      claimAfterPeek(tx, buyer, b.id);
      h.failOn = (op) => op === "copy:photo-archive";
      quiet();
      const r = await removePhotoAction(p.photoId);
      expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." });
      expect((await rows(tx, b.id))[0]).toMatchObject({ removedAt: null, bucket: "photos" });
      expect(filesIn("photos")).toHaveLength(3);
      expect(filesIn("photo-archive")).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a refused removal after the archive copy removes that copy", async () => {
    await withTx(async (tx) => {
      const { p } = await scene(tx, "claimed");
      vi.mocked(removePhoto).mockImplementationOnce(async () => { throw new NotOpen("drawing"); });
      const r = await removePhotoAction(p.photoId);
      expect(r).toMatchObject({ ok: false, code: "NOT_OPEN" });
      expect(filesIn("photo-archive")).toEqual([]);
      expect(filesIn("photos")).toHaveLength(3);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a removal that committed but reported a failure keeps the archive copy the row now names", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      vi.mocked(removePhoto).mockImplementationOnce(async (t, c, q) => { commitThenFail(); return realRemove(t, c, q); });
      quiet();
      const r = await removePhotoAction(p.photoId);
      expect(r.ok).toBe(true); // the re-read shows the photo removed, so the action finishes as a success
      expect(await rows(tx, b.id)).toMatchObject([{ bucket: "photo-archive" }]);
      expect(filesIn("photo-archive")).toHaveLength(3);
      expect(filesIn("photos")).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a removal that failed without committing drops the archive copy and keeps the photo", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      vi.mocked(removePhoto).mockImplementationOnce(async () => { throw new Error("socket closed"); });
      quiet();
      expect(await removePhotoAction(p.photoId)).toMatchObject({ ok: false, code: "INTERNAL" });
      expect((await rows(tx, b.id))[0]).toMatchObject({ removedAt: null, bucket: "photos" });
      expect(filesIn("photos")).toHaveLength(3);
      expect(filesIn("photo-archive")).toEqual([]);
    });
  });

  it("a failed delete from photos after the commit still answers ok and leaves the archive copy", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      h.failOn = (op) => op === "remove:photos";
      quiet();
      expect((await removePhotoAction(p.photoId)).ok).toBe(true);
      expect((await rows(tx, b.id))[0].removedAt).not.toBeNull();
      expect(filesIn("photo-archive")).toHaveLength(3); // the stray public files are Task 11's
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a double removal refused after its archive copy keeps the archive files the first removal's row names", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      const stale = await realPeekPhoto(tx, p.photoId); // B read the photo before A committed
      // A commits, but its delete from photos has not happened yet, so B's archive copy succeeds.
      h.failOn = (op) => op === "remove:photos";
      quiet();
      expect((await removePhotoAction(p.photoId)).ok).toBe(true);
      h.failOn = () => false;
      vi.mocked(peekPhoto).mockImplementationOnce(async () => stale);
      const r = await removePhotoAction(p.photoId);
      expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" }); // B's removal is refused: the photo is no longer live
      expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive", path: p.prefix }]);
      expect(filesIn("photo-archive")).toHaveLength(3);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("a double removal whose archive copy fails keeps the archive files the first removal's row names", async () => {
    await withTx(async (tx) => {
      const { b, p } = await scene(tx, "claimed");
      const stale = await realPeekPhoto(tx, p.photoId);
      expect((await removePhotoAction(p.photoId)).ok).toBe(true); // A: archived, committed, photos files gone
      vi.mocked(peekPhoto).mockImplementationOnce(async () => stale);
      quiet();
      const r = await removePhotoAction(p.photoId); // B copies from photos, which no longer holds the files
      expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." });
      expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive", path: p.prefix }]);
      expect(filesIn("photo-archive")).toHaveLength(3);
      expect(filesIn("photos")).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  });

  it("another host's removePhotoAction is refused and no storage call is made", async () => {
    await withTx(async (tx) => {
      const { p } = await scene(tx, "claimed");
      h.caller = as(await makeUser(tx, { role: "host" }), "host");
      expect(await removePhotoAction(p.photoId)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
      expect(h.ops).toEqual([]);
    });
  });
});

describe("reorder, retag, describe and notice-seen actions", () => {
  it("pass their inputs to the commands and refuse malformed ones", async () => {
    await withTx(async (tx) => {
      const { b, p: p1, host } = await scene(tx, "open");
      const p2 = await seedPhoto(tx, h.mem, host, b.id);
      vi.clearAllMocks();
      expect(await reorderPhotosAction(b.id, [p1.photoId, "nope"])).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await reorderPhotosAction(b.id, [p1.photoId, p1.photoId])).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await reorderPhotosAction(b.id, [])).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await reorderPhotosAction(b.id, [p2.photoId, p1.photoId])).toEqual({ ok: true, data: undefined });
      expect(vi.mocked(reorderPhotos).mock.calls).toHaveLength(1);
      expect(vi.mocked(reorderPhotos).mock.calls[0][2]).toMatchObject({ breakId: b.id, order: [p2.photoId, p1.photoId] });
      expect((await rows(tx, b.id)).map((r) => r.id)).toEqual([p2.photoId, p1.photoId]);
      expect(await describePhotoAction(p1.photoId, "")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await describePhotoAction(p1.photoId, "x".repeat(121))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await describePhotoAction(p1.photoId, "  Taylor Chronos 24g  ")).toEqual({ ok: true, data: undefined });
      expect((await rows(tx, b.id)).find((r) => r.id === p1.photoId)!.alt).toBe("Taylor Chronos 24g");
      expect(await retagPhotoAction(p1.photoId, "top")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect((await retagPhotoAction(p1.photoId, null)).ok).toBe(true);
      expect((await markPhotoNoticeSeenAction(b.id)).ok).toBe(true);
      expect(await markPhotoNoticeSeenAction("nope")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(h.ops).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  });
});
