import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { processPhoto, UnsupportedImage, MAX_INCOMING_BYTES } from "./process";
import { photoFixtures } from "../../tests/fixtures/photos/make";

let fx: Awaited<ReturnType<typeof photoFixtures>>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
const sizeOf = async (b: Buffer) => { const m = await sharp(b).metadata(); return [m.width, m.height]; };
/** The RIFF chunk ids of a WebP file, in order (each chunk: 4-byte id, uint32 LE size, data padded to even). */
const webpChunks = (b: Buffer) => {
  const ids: string[] = [];
  for (let o = 12; o + 8 <= b.length; o += 8 + b.readUInt32LE(o + 4) + (b.readUInt32LE(o + 4) % 2)) ids.push(b.toString("latin1", o, o + 4));
  return ids;
};
const PIXEL_CHUNKS = ["VP8 ", "VP8L", "VP8X", "ALPH"];

describe("processPhoto refuses (spec §5.3 step 2)", () => {
  it.each(["svg", "gif", "tiff", "avif", "htmlAsJpg", "truncated", "empty", "overLimit", "pixelBomb", "headerBomb"] as const)(
    "%s throws UnsupportedImage", async (name) => {
      await expect(processPhoto(fx[name])).rejects.toBeInstanceOf(UnsupportedImage);
    });
  it("keeps the 5 MB cap the route downloads with", () => expect(MAX_INCOMING_BYTES).toBe(5_242_880));
});

describe("processPhoto variants (spec §5.3 step 3, recorded ruling 4)", () => {
  it("writes 160, 640 and 1600 WebP variants on the long edge, in that order", async () => {
    const p = await processPhoto(fx.atLimit);
    expect(p.variants.map((v) => v.width)).toEqual([160, 640, 1600]);
    for (const v of p.variants) expect((await sharp(v.body).metadata()).format).toBe("webp");
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[160, 120], [640, 480], [1600, 1200]]);
    expect([p.width, p.height]).toEqual([1600, 1200]);
  });
  it("never upscales a source smaller than a variant", async () => {
    const p = await processPhoto(fx.tiny);
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[100, 100], [100, 100], [100, 100]]);
    expect([p.width, p.height]).toEqual([100, 100]);
  });
  it("keeps a 10:1 panorama's proportions", async () => {
    const p = await processPhoto(fx.panorama);
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[160, 16], [640, 64], [1600, 160]]);
  });
  it("stands the portrait photo upright: red on top, blue below, no orientation tag", async () => {
    const p = await processPhoto(fx.portrait);
    const big = p.variants[2].body;
    expect(await sizeOf(big)).toEqual([300, 400]);
    const { data, info } = await sharp(big).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(px(150, 50)[0]).toBeGreaterThan(200);   // red at the top
    expect(px(150, 350)[2]).toBeGreaterThan(200);  // blue at the bottom
    expect((await sharp(big).metadata()).orientation).toBeUndefined();
  });
  it("keeps transparency", async () => {
    const p = await processPhoto(fx.alphaPng);
    for (const v of p.variants) {
      const { data, info } = await sharp(v.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect((await sharp(v.body).metadata()).hasAlpha).toBe(true);
      expect(data[info.channels - 1]).toBeLessThan(255);
    }
  });
});

describe("processPhoto strips every piece of metadata (spec §5.3, §10)", () => {
  it("the fixtures really carry it", async () => {
    const m = await sharp(fx.portrait).metadata();
    expect([!!m.exif, !!m.xmp, !!m.iptc, !!m.icc, m.orientation]).toEqual([true, true, true, true, 6]);
    expect((await sharp(fx.alphaPng).metadata()).comments).toHaveLength(1);
  });
  it.each(["portrait", "alphaPng", "polyglot"] as const)("no EXIF, XMP, IPTC, ICC or comment in any variant of %s", async (name) => {
    const p = await processPhoto(fx[name]);
    for (const v of p.variants) {
      const m = await sharp(v.body).metadata();
      expect({ exif: m.exif, xmp: m.xmp, iptc: m.iptc, icc: m.icc, comments: m.comments }).toEqual(
        { exif: undefined, xmp: undefined, iptc: undefined, icc: undefined, comments: undefined });
      for (const s of ["shot at home", "Phone", "Photoshop", "xmpmeta", "<script"]) expect(v.body.includes(s), s).toBe(false);
      for (const id of webpChunks(v.body)) expect(PIXEL_CHUNKS, id).toContain(id); // no EXIF, XMP or ICCP chunk
    }
  });
});

describe("a polyglot is accepted and re-encoded to pixels only (panel ruling 32)", () => {
  it("the fixture really is a JPEG that carries HTML", async () => {
    expect((await sharp(fx.polyglot).metadata()).format).toBe("jpeg");
    expect(fx.polyglot.includes("<script>alert(1)</script>")).toBe(true);
  });
  it("is accepted, and no byte of the HTML survives in any variant", async () => {
    const p = await processPhoto(fx.polyglot);
    expect(p.variants.map((v) => v.width)).toEqual([160, 640, 1600]);
    for (const v of p.variants) {
      expect([v.body.toString("latin1", 0, 4), v.body.toString("latin1", 8, 12)]).toEqual(["RIFF", "WEBP"]);
      for (const s of ["<script", "script>", "alert(1)"]) expect(v.body.includes(s), s).toBe(false);
      const ids = webpChunks(v.body);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(PIXEL_CHUNKS, id).toContain(id);
    }
  });
});
