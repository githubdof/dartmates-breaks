import { afterEach, describe, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { withTx } from "../../../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { drawPlacesForPreview, getDrawResult } from "@/domain/draws/queries";
import { placesOf } from "@/domain/draws/places";
import type { Tx } from "@/db/client";
import { breakPhotos } from "@/db/schema";
import { issueUploadTicket, recordProcessedPhoto } from "@/domain/photos/commands";
import { publicVariantUrl } from "@/storage/buckets";
import type { Caller } from "@/domain/types";
import { GET } from "./route";

// The route reads through db.transaction; here that runs inside the test's own transaction, which rolls back.
// withTx (tests/helpers/db.ts) imports this same db, so the mock must never break it: with no test transaction
// current, db.transaction is the real one (recorded panel fix ruling 7).
let current: Tx | null = null;
vi.mock("@/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/client")>();
  return { ...real, db: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => (current ? fn(current) : real.db.transaction(fn)) } };
});
afterEach(() => { current = null; vi.unstubAllGlobals(); });

const get = (id: string) => GET(new Request(`http://localhost/b/${id}/og`), { params: Promise.resolve({ id }) });
const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const webp = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#ff0000" } }).webp().toBuffer();
/** A recorded photo (rows only): `photos` for an open break, `photos-draft` for a draft (ruling 7). */
async function addPhoto(tx: Tx, host: { id: string }, breakId: string, location: "photos" | "photos-draft"): Promise<{ photoId: string }> {
  const now = new Date();
  const { ticketId } = await issueUploadTicket(tx, as(host, "host"), { breakId, now });
  const prefix = `${breakId}/${randomBytes(16).toString("base64url")}`;
  const { photoId } = await recordProcessedPhoto(tx, as(host, "host"), { ticketId, prefix, location, width: 1600, height: 1200, slot: null, alt: "Darts", now });
  return { photoId };
}

describe("GET /b/{id}/og (recorded ruling 25)", () => {
  it("answers a 1200 × 630 PNG for an open, a closed and a ran break, and 404 for a draft", async () => {
    await withTx(async (tx) => {
      current = tx;
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const closed = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await claimLines(tx, as(buyer), { breakId: closed.id, numbers: [1, 2], batchId: randomUUID() });
      for (const number of [1, 2]) await markPaid(tx, as(host, "host"), { breakId: closed.id, number, expectedOwnerId: buyer.id });
      const ran = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      for (const id of [open.id, closed.id, ran.id]) {
        const r = await get(id);
        expect(r.status, id).toBe(200);
        expect(r.headers.get("content-type")).toBe("image/png");
        const png = Buffer.from(await r.arrayBuffer());
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
      }
      // The preview's draw query selects the order, the prize ranks and the time only (no handle, no item name), and
      // its places agree with the result page's.
      const prev = await drawPlacesForPreview(tx, ran.id);
      expect(Object.keys(prev!).sort()).toEqual(["ranAt", "ranking", "ranks"]);
      const full = await getDrawResult(tx, ran.id);
      expect(placesOf(prev!.ranking, prev!.ranks)).toEqual(placesOf(full!.ranking, full!.awards.map((a) => a.rank)));
      expect(prev!.ranAt).toEqual(full!.draw.createdAt);
      const draft = await makeBreak(tx, { hostId: host.id });
      expect((await get(draft.id)).status).toBe(404);
    });
  }, 60_000);
  it("draws an open break's live lead: one fetch, to its 640 variant", async () => withTx(async (tx) => {
    current = tx;
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, host, b.id, "photos");
    const [{ path }] = await tx.select({ path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.id, photoId));
    const f = vi.fn<typeof fetch>(async () => new Response(webp, { headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", f);
    const r = await get(b.id);
    expect(r.status).toBe(200);
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual([publicVariantUrl(path!, 640)]);
  }), 30_000);
  // Regression pin: drafts already answer 404; the photo must not change that.
  it("still answers 404 for a draft with a photo, and fetches nothing", async () => withTx(async (tx) => {
    current = tx;
    const host = await makeUser(tx, { role: "host" });
    const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
    await addPhoto(tx, host, b.id, "photos-draft");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await get(b.id)).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  }));
});
