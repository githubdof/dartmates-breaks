import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { BUCKETS, type BucketName } from "@/storage/buckets";
import { StorageNotFound, TooLarge, type PhotoStorage } from "@/storage/photo-storage";

/** One behaviour, two implementations: the memory fake (pnpm test) and Supabase Storage (pnpm test:ci, local stack). */
export function photoStorageContract(label: string, make: () => PhotoStorage): void {
  describe(`PhotoStorage contract: ${label}`, () => {
    let s: PhotoStorage;
    const folder = randomUUID(); // every path this suite writes sits under one fresh folder
    const at = (name: string) => `${folder}/${name}`;
    beforeAll(() => { s = make(); });
    afterAll(async () => {
      for (const b of Object.values(BUCKETS)) await s.remove(b, (await s.list(b, folder)).map((o) => o.name));
    });

    it("puts and downloads the same bytes, and a second put replaces them", async () => {
      const one = randomBytes(300), two = randomBytes(200);
      await s.put(BUCKETS.draft, at("a-160.webp"), one, "image/webp");
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("a-160.webp"), 1000), one)).toBe(0);
      await s.put(BUCKETS.draft, at("a-160.webp"), two, "image/webp");
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("a-160.webp"), 1000), two)).toBe(0);
    });

    it("refuses a download past maxBytes and names a missing object", async () => {
      await s.put(BUCKETS.public, at("big-160.webp"), randomBytes(2048), "image/webp");
      await expect(s.download(BUCKETS.public, at("big-160.webp"), 2047)).rejects.toBeInstanceOf(TooLarge);
      expect((await s.download(BUCKETS.public, at("big-160.webp"), 2048)).length).toBe(2048);
      await expect(s.download(BUCKETS.public, at("none-160.webp"), 2048)).rejects.toBeInstanceOf(StorageNotFound);
    });

    it("copies across buckets and keeps the source", async () => {
      const body = randomBytes(100);
      await s.put(BUCKETS.draft, at("c-640.webp"), body, "image/webp");
      await s.copy({ bucket: BUCKETS.draft, path: at("c-640.webp") }, { bucket: BUCKETS.public, path: at("c-640.webp") });
      expect(Buffer.compare(await s.download(BUCKETS.public, at("c-640.webp"), 1000), body)).toBe(0);
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("c-640.webp"), 1000), body)).toBe(0);
    });

    it("re-puts an existing destination on copy: the source's bytes, a fresh age, no error (ruling 25)", async () => {
      const ageOf = async (b: BucketName, path: string) => (await s.list(b, folder)).find((o) => o.name === path)!.createdAt.getTime();
      const body = randomBytes(120), stale = randomBytes(80);
      await s.put(BUCKETS.archive, at("e-640.webp"), stale, "image/webp");
      await s.put(BUCKETS.public, at("e-640.webp"), body, "image/webp");
      const before = await ageOf(BUCKETS.archive, at("e-640.webp"));
      await new Promise((r) => setTimeout(r, 1100)); // past any second-granular timestamp
      await s.copy({ bucket: BUCKETS.public, path: at("e-640.webp") }, { bucket: BUCKETS.archive, path: at("e-640.webp") });
      expect(Buffer.compare(await s.download(BUCKETS.archive, at("e-640.webp"), 1000), body)).toBe(0);
      expect(await ageOf(BUCKETS.archive, at("e-640.webp"))).toBeGreaterThan(before);
      await s.copy({ bucket: BUCKETS.public, path: at("e-640.webp") }, { bucket: BUCKETS.archive, path: at("e-640.webp") }); // and again: still no error
      expect(Buffer.compare(await s.download(BUCKETS.public, at("e-640.webp"), 1000), body)).toBe(0);
    });

    it("removes present and missing paths alike", async () => {
      await s.put(BUCKETS.archive, at("r-160.webp"), randomBytes(10), "image/webp");
      await s.remove(BUCKETS.archive, [at("r-160.webp"), at("never-160.webp")]);
      await expect(s.download(BUCKETS.archive, at("r-160.webp"), 100)).rejects.toBeInstanceOf(StorageNotFound);
    });

    it("lists every object under a folder, nested ones too, by full path, and nothing outside it", async () => {
      const other = randomUUID();
      const dir = at("ls"); // its own folder: earlier tests leave objects in `folder` until afterAll
      await s.put(BUCKETS.archive, `${dir}/l1-160.webp`, randomBytes(10), "image/webp");
      await s.put(BUCKETS.archive, `${dir}/deep/l2-160.webp`, randomBytes(10), "image/webp");
      await s.put(BUCKETS.archive, `${other}/l3-160.webp`, randomBytes(10), "image/webp");
      try {
        const rows = await s.list(BUCKETS.archive, dir);
        expect(rows.map((r) => r.name).sort()).toEqual([`${dir}/deep/l2-160.webp`, `${dir}/l1-160.webp`]);
        expect(rows.every((r) => r.createdAt instanceof Date && !Number.isNaN(r.createdAt.getTime()))).toBe(true);
        expect((await s.list(BUCKETS.archive, "")).map((r) => r.name)).toEqual(expect.arrayContaining([`${dir}/l1-160.webp`, `${other}/l3-160.webp`]));
      } finally {
        await s.remove(BUCKETS.archive, [`${other}/l3-160.webp`]);
      }
    });

    it("signs a read URL and an upload into incoming for the given path", async () => {
      await s.put(BUCKETS.draft, at("s-160.webp"), randomBytes(10), "image/webp");
      expect(await s.signedReadUrl(BUCKETS.draft, at("s-160.webp"), 600)).toContain(at("s-160.webp"));
      const up = await s.createSignedUpload(at("in.jpg"));
      expect(up.url).toContain(at("in.jpg"));
      expect(up.token.length).toBeGreaterThan(0);
    });
  });
}
