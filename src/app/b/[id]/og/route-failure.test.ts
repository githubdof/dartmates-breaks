import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { OgModel, OgPage } from "@/domain/breaks/og";
import { leadPhotos } from "@/domain/photos/queries";
import { publicVariantUrl } from "@/storage/buckets";
import { OG_PHOTO_MAX_BYTES } from "./photo";

// No database here: the break is found (mocked), so only the image step or the lead photo can fail. The preview must
// answer 404 like the missing-break path, never a 500 with a stack, whether the fonts cannot be read or the renderer
// throws; and a lead photo that cannot be had draws the preview without it, never a 404 or a 500.
let fonts: "missing" | "garbage" | "ok" | "real" = "ok";
let prefixOverride: string | null = null;
vi.mock("@/db/client", () => ({ db: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn({}) } }));
vi.mock("@/domain/breaks/queries", () => ({ getBreakPage: async () => ({ break: { status: "open" } }) }));
vi.mock("@/domain/photos/queries", () => ({
  leadPhotos: vi.fn(async (_tx: unknown, ids: string[]) => new Map([[ids[0], { id: "p1", prefix: `${ids[0]}/${"A".repeat(22)}`, location: "photos" }]])),
}));
vi.mock("@/domain/breaks/og", () => ({
  // Reflects the lead it is given, as the real one does.
  ogModel: (page: OgPage): OgModel => ({
    title: "T", caption: "4 to go, $5 a line", hostedBy: "Hosted by @jim", kit: { dark: "blue", light: "yellow" }, heat: 0, cells: [{ number: 1, tone: "open" }], columns: 4,
    photo: page.lead ? { id: page.lead.id, prefix: prefixOverride ?? page.lead.prefix } : null,
  }),
}));
const realFonts = (await vi.importActual<typeof import("./fonts")>("./fonts")).ogFonts();
const fontList = () => {
  if (fonts === "missing") throw new Error("ENOENT: no such file or directory, open 'assets/og/Barlow-500.ttf'");
  if (fonts === "real") return realFonts;
  return [{ name: "Barlow", data: Buffer.from("not a font"), weight: 500, style: "normal" }];
};
vi.mock("./fonts", () => ({ ogFonts: fontList, get OG_FONTS() { return fontList(); } }));
// The plate step's failures: a data URI the real leadPhotoDataUri would never hand over, or an ogImage that throws
// only when it is given a photo. Off (null / false) by default, so the real modules run.
let photoOverride: string | null = null;
let imageThrowsWithPhoto = false;
vi.mock("./photo", async (importOriginal) => {
  const real = await importOriginal<typeof import("./photo")>();
  return { ...real, leadPhotoDataUri: (...a: Parameters<typeof real.leadPhotoDataUri>) => photoOverride ?? real.leadPhotoDataUri(...a) };
});
vi.mock("./image", async (importOriginal) => {
  const real = await importOriginal<typeof import("./image")>();
  return {
    ...real,
    ogImage: (m: OgModel, photo: string | null = null) => {
      if (imageThrowsWithPhoto && photo !== null) throw new Error("plate cannot be drawn");
      return real.ogImage(m, photo);
    },
  };
});
afterEach(() => { fonts = "ok"; prefixOverride = null; photoOverride = null; imageThrowsWithPhoto = false; vi.unstubAllGlobals(); });

const { GET } = await import("./route");
const get = (id: string) => GET(new Request(`http://localhost/b/${id}/og`), { params: Promise.resolve({ id }) });
const ID = randomUUID();
const webp = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#ff0000" } }).webp().toBuffer();

describe("GET /b/{id}/og when the image cannot be drawn", () => {
  it("answers 404, never a 500, when a font file is missing", async () => {
    fonts = "missing";
    const r = await get(randomUUID());
    expect(r.status).toBe(404);
    expect(await r.text()).not.toMatch(/ENOENT|at /);
  });
  it("answers 404, never a 500 or a broken 200 stream, when the renderer throws", async () => {
    fonts = "garbage";
    const r = await get(randomUUID());
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).not.toBe("image/png");
  }, 30_000);
});

describe("GET /b/{id}/og when the lead photo cannot be had (photos spec §8.4)", () => {
  beforeEach(() => { fonts = "real"; });
  /** Asserts the preview's contract and says whether the red test photo is drawn on it. */
  const png = async (r: Response): Promise<boolean> => {
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 240 && data[i + 1] < 20 && data[i + 2] < 20) return true;
    return false;
  };
  it("answers the PNG without the photo when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("answers the PNG without the photo when the fetch times out", async () => {
    vi.stubGlobal("fetch", vi.fn((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)))));
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("answers the PNG without the photo when the body is past the cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.alloc(OG_PHOTO_MAX_BYTES + 1), { headers: { "content-type": "image/webp" } })));
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("answers the PNG without the photo when the bytes cannot be transcoded", async () => {
    const corrupt = Buffer.concat([webp.subarray(0, 64), Buffer.alloc(64)]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(corrupt, { headers: { "content-type": "image/webp" } })));
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("fetches nothing for a malformed prefix, and still answers the PNG", async () => {
    prefixOverride = "../photo-archive/x";
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await png(await get(ID))).toBe(false);
    expect(f).not.toHaveBeenCalled();
  }, 30_000);
  it("makes exactly one fetch, to the 640 variant, when the photo is fine", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } })); vi.stubGlobal("fetch", f);
    expect(await png(await get(ID))).toBe(true);
    expect(f.mock.calls.map((c: unknown[]) => String(c[0]))).toEqual([publicVariantUrl(`${ID}/${"A".repeat(22)}`, 640)]);
  }, 30_000);
  it("answers the PNG without the photo when the lead read itself fails (ruling 31), and fetches nothing", async () => {
    vi.mocked(leadPhotos).mockRejectedValueOnce(new Error("connection reset"));
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await png(await get(ID))).toBe(false);
    expect(f).not.toHaveBeenCalled();
  }, 30_000);

  // Satori renders inside ImageResponse's body stream: a bad image only throws when the bytes are read (arrayBuffer).
  it("answers the PNG without the photo when the renderer cannot decode the plate (one retry with no plate)", async () => {
    photoOverride = "data:image/png;base64,AAAA";
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("answers the PNG without the photo when drawing the plate throws", async () => {
    imageThrowsWithPhoto = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } })));
    expect(await png(await get(ID))).toBe(false);
  }, 30_000);
  it("still answers 404 when the retry without the plate fails too", async () => {
    photoOverride = "data:image/png;base64,AAAA";
    fonts = "garbage";
    const r = await get(ID);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).not.toBe("image/png");
  }, 30_000);
});
