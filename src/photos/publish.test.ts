import { describe, it, expect } from "vitest";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import { seedPhoto } from "../../tests/helpers/photos";
import { PhotosNotReady } from "@/domain/errors";
import { removePhoto } from "@/domain/photos/commands";
import type { Caller } from "@/domain/types";
import { assertPhotosPublished } from "./publish";

const as = (u: { id: string }, role: Caller["role"] = "host"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("assertPhotosPublished (photos spec §5.4)", () => {
  it("throws PhotosNotReady for a live photos-draft row missing from copied", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const mem = createMemoryStorage();
      const p1 = await seedPhoto(tx, mem, as(host), b.id);
      await seedPhoto(tx, mem, as(host), b.id); // p2, finalised after the copy
      await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId]))).rejects.toBeInstanceOf(PhotosNotReady);
    });
  });

  it("passes when every live row is copied, and ignores removed rows", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const mem = createMemoryStorage();
      const p1 = await seedPhoto(tx, mem, as(host), b.id);
      const p2 = await seedPhoto(tx, mem, as(host), b.id);
      await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId, p2.photoId]))).resolves.toBeUndefined();
      await removePhoto(tx, as(host), { photoId: p2.photoId, now: new Date() });
      await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId]))).resolves.toBeUndefined();
      await expect(assertPhotosPublished(tx, b.id, new Set())).rejects.toBeInstanceOf(PhotosNotReady);
    });
  });
});
