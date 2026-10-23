import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { env } from "@/lib/env";
import { publicVariantUrl } from "@/storage/buckets";
import { leadPhotoDataUri, OG_PHOTO_MAX_BYTES, toPngDataUri } from "./photo";

const B = "00000000-0000-4000-8000-0000000000b1";
const P = `${B}/${"A".repeat(22)}`;
const URL640 = publicVariantUrl(P, 640);
const webp = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#ff0000" } }).webp().toBuffer();
const ok = () => new Response(webp, { headers: { "content-type": "image/webp" } });

describe("leadPhotoDataUri (photos spec §8.4)", () => {
  it("fetches the 640 variant from the photos bucket under SUPABASE_URL, without redirects, and returns a WebP data URI", async () => {
    const f = vi.fn<typeof fetch>(async () => ok());
    const uri = await leadPhotoDataUri(B, P, { fetcher: f, format: "webp" });
    expect(uri).toBe(`data:image/webp;base64,${webp.toString("base64")}`);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${env().SUPABASE_URL}/storage/v1/object/public/photos/${P}-640.webp`);
    expect(url).toBe(URL640);
    expect(init).toMatchObject({ redirect: "error" });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    ["traversal", `${B}/../../photo-archive/x`],
    ["another break's photo", `${randomUUID()}/${"A".repeat(22)}`],
    ["21 characters", `${B}/${"A".repeat(21)}`],
    ["an encoded slash", `${B}/AAAAAAAAAAAAAAAAAAA%2F`],
    ["a full URL", "https://evil.example/x.webp"],
    ["empty", ""],
  ])("refuses a malformed prefix (%s) without fetching", async (_, prefix) => {
    const f = vi.fn();
    expect(await leadPhotoDataUri(B, prefix, { fetcher: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("gives up after the timeout", async () => {
    const hang = vi.fn((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
    const t0 = Date.now();
    expect(await leadPhotoDataUri(B, P, { fetcher: hang as typeof fetch, timeoutMs: 50 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("refuses a body past the byte cap, by header and by stream", async () => {
    const big = Buffer.alloc(OG_PHOTO_MAX_BYTES + 1, 1);
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(big, { headers: { "content-type": "image/webp", "content-length": String(big.length) } }) })).toBeNull();
    // No content-length: the stream is cut at the cap (a ReadableStream body, so no length header is set).
    let pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(64 * 1024)); } });
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(stream, { headers: { "content-type": "image/webp" } }) })).toBeNull();
    // An endless body is read only up to the cap, then cancelled.
    expect(pulled).toBeLessThan(OG_PHOTO_MAX_BYTES / (64 * 1024) + 4);
  });
  it("refuses a failed status, a network error and bytes that are not WebP", async () => {
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response("no", { status: 404 }) })).toBeNull();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => { throw new TypeError("fetch failed"); } })).toBeNull();
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(png, { headers: { "content-type": "image/webp" } }) })).toBeNull();
  });
});

describe("the PNG fallback (rulings 15 and 31): tested whichever OG_PHOTO_FORMAT the probe chose", () => {
  it("with format png, returns a PNG data URI of the same picture", async () => {
    const f = vi.fn(async () => ok());
    const uri = (await leadPhotoDataUri(B, P, { fetcher: f, format: "png" }))!;
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(uri.split(",")[1], "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 640, 480]);
    const { data } = await sharp(Buffer.from(uri.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    // Lossy WebP holds pure red as (255, 0, 2): the PNG carries exactly the pixels the WebP decodes to.
    const { data: source } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([source[0], source[1], source[2]]);
    expect(data[0] > 240 && data[1] < 20 && data[2] < 20).toBe(true);
  });
  it("still checks the WebP magic before transcoding", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(png, { headers: { "content-type": "image/webp" } }), format: "png" })).toBeNull();
  });
  it("refuses a WebP past 12 megapixels (limitInputPixels) and a corrupt one, without throwing", async () => {
    const huge = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#ff0000" } }).webp().toBuffer();
    expect(huge.length).toBeLessThan(OG_PHOTO_MAX_BYTES); // so it is the pixel limit that refuses it, not the byte cap
    expect(await toPngDataUri(huge)).toBeNull();
    const corrupt = Buffer.concat([webp.subarray(0, 64), Buffer.alloc(64)]);
    expect(await toPngDataUri(corrupt)).toBeNull();
  });
  it("with format png, a failed transcode is no photo: the fetched WebP is never passed on", async () => {
    const corrupt = Buffer.concat([webp.subarray(0, 64), Buffer.alloc(64)]);
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(corrupt, { headers: { "content-type": "image/webp" } }), format: "png" })).toBeNull();
  });
  it("with format webp, hands over the fetched bytes untouched as a WebP data URI (no transcode)", async () => {
    const f = vi.fn(async () => ok());
    expect(await leadPhotoDataUri(B, P, { fetcher: f, format: "webp" })).toBe(`data:image/webp;base64,${webp.toString("base64")}`);
  });
});
