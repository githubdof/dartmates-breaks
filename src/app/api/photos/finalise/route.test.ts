import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withTx } from "../../../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines } from "../../../../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../../../../tests/helpers/memory-storage";
import { photoFixtures, type PhotoFixture } from "../../../../../tests/fixtures/photos/make";
import { h, commitThenFail, filesIn, key, resetHarness, storageInsideTx } from "../../../../../tests/helpers/pipeline-harness";
import { breaks, breakPhotos, photoUploads } from "@/db/schema";
import { issueUploadTicket, recordProcessedPhoto } from "@/domain/photos/commands";
import { InvalidInput, notOpenMessage } from "@/domain/errors";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import { processPhoto, MAX_INCOMING_BYTES } from "@/photos/process";
import { VARIANT_WIDTHS, publicVariantUrl, variantPath } from "@/storage/buckets";
import { POST } from "./route";

vi.mock("@/db/client", async (orig) => (await import("../../../../../tests/helpers/pipeline-harness")).mockDb(await orig()));
vi.mock("@/auth/session", async () => {
  const { h } = await import("../../../../../tests/helpers/pipeline-harness");
  return { getCaller: async () => h.caller };
});
vi.mock("@/storage/photo-storage", async (orig) => {
  const { h, recording } = await import("../../../../../tests/helpers/pipeline-harness");
  return { ...(await orig<typeof import("@/storage/photo-storage")>()), photoStorage: () => recording(h.mem) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domain/photos/commands", async (orig) => (await import("../../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));
vi.mock("@/domain/photos/peek", async (orig) => (await import("../../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));
vi.mock("@/photos/process", async (orig) => (await import("../../../../../tests/helpers/pipeline-harness")).wrapAll(await orig()));

const realRecord = (await vi.importActual<typeof import("@/domain/photos/commands")>("@/domain/photos/commands")).recordProcessedPhoto;
const realProcess = (await vi.importActual<typeof import("@/photos/process")>("@/photos/process")).processPhoto;

let fx: Record<PhotoFixture, Buffer>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
beforeEach(() => { h.mem = createMemoryStorage(); });
afterEach(() => { vi.clearAllMocks(); resetHarness(); });

const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request("http://localhost/api/photos/finalise", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", ...headers }, body: JSON.stringify(body),
}));
async function upload(tx: Tx, host: Caller, breakId: string, file: Buffer) {
  const { ticketId, incomingName } = await issueUploadTicket(tx, host, { breakId, now: new Date() });
  h.mem.files.set(key("incoming", incomingName), file);
  return { ticketId, incomingName };
}
const rows = (tx: Tx, breakId: string) => tx.select().from(breakPhotos).where(eq(breakPhotos.breakId, breakId)).orderBy(breakPhotos.position);
const ticket = async (tx: Tx, id: string) => (await tx.select().from(photoUploads).where(eq(photoUploads.id, id)))[0];
const setStatus = (tx: Tx, id: string, status: string) => tx.update(breaks).set({ status }).where(sql`${breaks.id} = ${id}`);
const openNow = (tx: Tx, id: string) => setStatus(tx, id, "open");
const nothingLeft = () => [...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")];

/** A host signed in, a break in the given state, one photo uploaded into `incoming`. */
async function scene(tx: Tx, o: { open?: boolean; file?: Buffer } = {}) {
  h.current = tx;
  const user = await makeUser(tx, { role: "host" });
  const host = as(user, "host");
  h.caller = host;
  const b = o.open ? await openBreakWithLines(tx, { hostId: user.id }) : await makeBreak(tx, { hostId: user.id });
  const up = await upload(tx, host, b.id, o.file ?? fx.tiny);
  return { user, host, b, ...up };
}
/** processPhoto opens the break while it runs (the host opened it from another tab). */
const openWhileProcessing = (tx: Tx, breakId: string) =>
  vi.mocked(processPhoto).mockImplementationOnce(async (buf) => { await openNow(tx, breakId); return realProcess(buf); });

describe("POST /api/photos/finalise (photos spec §5.3)", () => {
  it("a draft's photo lands in photos-draft as three variants, the row is recorded, the incoming file is gone", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      const r = await post({ ticketId, slot: null, alt: "Taylor Chronos 24g" });
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const { photoId, src } = await r.json();
      expect(filesIn("photos-draft")).toHaveLength(3);
      for (const k of filesIn("photos-draft")) expect(k).toMatch(new RegExp(`^photos-draft/${b.id}/[A-Za-z0-9_-]{22}-(160|640|1600)\\.webp$`));
      expect(filesIn("photos")).toEqual([]);
      expect(filesIn("incoming")).toEqual([]);
      expect(await rows(tx, b.id)).toMatchObject([{ id: photoId, bucket: "photos-draft", position: 0, alt: "Taylor Chronos 24g" }]);
      expect((await ticket(tx, ticketId)).consumedAt).not.toBeNull();
      expect(src.src).not.toContain("/object/public/"); // a draft is read through a signed URL
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("an open break's photo lands in photos", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx, { open: true });
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(200);
      expect(filesIn("photos")).toHaveLength(3);
      expect([...filesIn("photos-draft"), ...filesIn("incoming")]).toEqual([]);
      expect((await r.json()).src.src).toBe(publicVariantUrl((await rows(tx, b.id))[0].path!, 160));
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("the break opened while the photo was processing: copied to photos, recorded once with location photos, draft copies gone (ruling 7)", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      openWhileProcessing(tx, b.id);
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(200);
      expect(vi.mocked(recordProcessedPhoto).mock.calls.slice(-2).map((c) => c[2].location)).toEqual(["photos-draft", "photos"]);
      expect(filesIn("photos")).toHaveLength(3);
      expect([...filesIn("photos-draft"), ...filesIn("incoming")]).toEqual([]);
      expect(await rows(tx, b.id)).toMatchObject([{ bucket: "photos" }]);
      expect(h.ops.filter((o) => o !== "download:incoming" && o !== "remove:incoming")).toEqual(
        ["put:photos-draft", "put:photos-draft", "put:photos-draft", "copy:photos", "copy:photos", "copy:photos", "remove:photos-draft"]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a second refusal after the copy removes every copy and answers that refusal", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      openWhileProcessing(tx, b.id);
      vi.mocked(recordProcessedPhoto)
        .mockImplementationOnce(realRecord)
        .mockImplementationOnce(async () => { throw new InvalidInput("A break can have up to 8 photos."); });
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "A break can have up to 8 photos." });
      expect(nothingLeft()).toEqual([]);
      expect(await rows(tx, b.id)).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a failed copy after the break opened removes every copy and answers 'Photos are still being prepared. Try again.'", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      openWhileProcessing(tx, b.id);
      h.failOn = (op, n) => op === "copy:photos" && n === 2;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "Photos are still being prepared. Try again." });
      expect(nothingLeft()).toEqual([]);
      expect(await rows(tx, b.id)).toEqual([]);
      expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a record that committed but reported a failure keeps the variants the row names", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      vi.mocked(recordProcessedPhoto).mockImplementationOnce(async (t, c, p) => { commitThenFail(); return realRecord(t, c, p); });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(500);
      expect(await r.json()).toEqual({ error: "Something went wrong. Please try again." });
      const [row] = await rows(tx, b.id);
      expect(filesIn("photos-draft")).toEqual(VARIANT_WIDTHS.map((w) => key("photos-draft", variantPath(row.path!, w))).sort());
      expect(filesIn("incoming")).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a record that failed without committing removes the variants", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx);
      vi.mocked(recordProcessedPhoto).mockImplementationOnce(async () => { throw new Error("socket closed"); });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(500);
      expect(await rows(tx, b.id)).toEqual([]);
      expect(nothingLeft()).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("another host's upload answers 404 and leaves that host's incoming file alone", async () => {
    await withTx(async (tx) => {
      const { incomingName, ticketId } = await scene(tx);
      h.caller = as(await makeUser(tx, { role: "host" }), "host");
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "This upload could not be found. Try again." });
      expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
      expect([...filesIn("photos-draft"), ...filesIn("photos")]).toEqual([]);
      expect(h.ops).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("an expired upload answers 410 and removes the incoming file", async () => {
    await withTx(async (tx) => {
      const { ticketId } = await scene(tx);
      await tx.update(photoUploads).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(photoUploads.id, ticketId));
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(410);
      expect(await r.json()).toEqual({ error: "This upload took too long. Try again." });
      expect([...filesIn("incoming"), ...filesIn("photos-draft")]).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("an upload used once answers 409 the second time and removes the re-sent file", async () => {
    await withTx(async (tx) => {
      const { b, ticketId, incomingName } = await scene(tx);
      expect((await post({ ticketId, slot: null, alt: "Darts" })).status).toBe(200);
      h.mem.files.set(key("incoming", incomingName), fx.tiny);
      const second = await post({ ticketId, slot: null, alt: "Darts" });
      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({ error: "This upload was already used. Try again." });
      expect(filesIn("incoming")).toEqual([]);
      expect(await rows(tx, b.id)).toHaveLength(1);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a file over 5 MB answers 413, writes no variant, leaves the upload unconsumed, removes the incoming file", async () => {
    await withTx(async (tx) => {
      const { ticketId } = await scene(tx, { file: Buffer.concat([fx.tiny, Buffer.alloc(MAX_INCOMING_BYTES + 1 - fx.tiny.length)]) });
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(413);
      expect(await r.json()).toEqual({ error: "This photo is over 5 MB. Pick a smaller one." });
      expect(nothingLeft()).toEqual([]);
      expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it.each(["svg", "gif", "htmlAsJpg", "pixelBomb"] as const)("%s answers 415 with no variant anywhere and no incoming file", async (name) => {
    await withTx(async (tx) => {
      const { ticketId } = await scene(tx, { file: fx[name] });
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(415);
      expect(await r.json()).toEqual({ error: "This photo can't be used. Pick a JPEG, PNG or WebP." });
      expect(nothingLeft()).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a refusal after the put removes the variants and the incoming file", async () => {
    await withTx(async (tx) => {
      const { ticketId } = await scene(tx);
      vi.mocked(recordProcessedPhoto).mockImplementationOnce(async () => { throw new InvalidInput("refused"); });
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "refused" });
      expect(nothingLeft()).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("no incoming file (the upload never arrived) answers 409", async () => {
    await withTx(async (tx) => {
      const { ticketId, incomingName } = await scene(tx);
      h.mem.files.delete(key("incoming", incomingName));
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "The photo didn't arrive. Try again." });
      expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("refuses a signed-out caller (401), a cross-site origin (403), a wrong content type (415) and a malformed body (400), touching nothing", async () => {
    await withTx(async (tx) => {
      const { host, ticketId, incomingName } = await scene(tx);
      const body = { ticketId, slot: null, alt: "Darts" };
      h.caller = null;
      const u = await post(body);
      expect([u.status, await u.json()]).toEqual([401, { error: "Sign in to continue" }]);
      h.caller = { ...host, banned: true };
      const banned = await post(body);
      expect([banned.status, await banned.json()]).toEqual([403, { error: "This account is suspended" }]);
      h.caller = host;
      const x = await post(body, { origin: "https://evil.example" });
      expect([x.status, await x.json()]).toEqual([403, { error: "This request was refused." }]);
      const t = await post(body, { "content-type": "text/plain" });
      expect([t.status, await t.json()]).toEqual([415, { error: "This request was refused." }]);
      const notJson = await POST(new Request("http://localhost/api/photos/finalise", {
        method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: "{nope",
      }));
      expect([notJson.status, await notJson.json()]).toEqual([400, { error: "This request was refused." }]);
      expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
      expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
      expect((await post({ ...body, alt: "x".repeat(121) })).status).toBe(400);
      expect((await post({ ...body, alt: "   " })).status).toBe(400);
      expect((await post({ ...body, ticketId: "../x" })).status).toBe(400);
      expect((await post({ ...body, slot: "top" })).status).toBe(400);
      expect(h.ops.filter((o) => o !== "remove:incoming")).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("reads the body with a 2 KB cap: a chunked oversized body with no Content-Length answers 413 unread (ruling 30)", async () => {
    await withTx(async (tx) => {
      const { ticketId, incomingName } = await scene(tx);
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull: (c) => c.enqueue(new TextEncoder().encode(" ".repeat(1024))), // never ends on its own
        cancel: () => { cancelled = true; },
      });
      const req = new Request("http://localhost/api/photos/finalise", {
        method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: stream, duplex: "half",
      } as RequestInit);
      expect(req.headers.get("content-length")).toBeNull();
      const r = await POST(req);
      expect(r.status).toBe(413);
      expect(await r.json()).toEqual({ error: "This request was refused." });
      expect(cancelled).toBe(true);
      expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
      expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);

  it("a drawing break answers 409 with the state copy and removes the incoming file", async () => {
    await withTx(async (tx) => {
      const { b, ticketId } = await scene(tx, { open: true });
      await setStatus(tx, b.id, "drawing");
      const r = await post({ ticketId, slot: null, alt: "Darts" });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: notOpenMessage("drawing") });
      expect(filesIn("incoming")).toEqual([]);
      expect([...filesIn("photos-draft"), ...filesIn("photos")]).toEqual([]);
      expect(storageInsideTx()).toEqual([]);
    });
  }, 60_000);
});
