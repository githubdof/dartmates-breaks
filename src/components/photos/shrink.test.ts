import { afterEach, expect, it, vi } from "vitest";
import { CannotRead, fitWithin, JPEG_QUALITY, MAX_EDGE, shrinkForUpload } from "./shrink";

afterEach(() => vi.unstubAllGlobals());

function setup(o: { w: number; h: number; blob?: Blob | null }) {
  const bitmap = { width: o.w, height: o.h, close: vi.fn() };
  const drawImage = vi.fn();
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(o.blob === undefined ? new Blob(["j"], { type: "image/jpeg" }) : o.blob));
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal("document", { createElement: () => canvas });
  return { bitmap, canvas, drawImage, toBlob };
}

it("fitWithin shrinks the long edge to 2048 and never upscales", () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 });
  expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  expect(fitWithin(1000, 500)).toEqual({ width: 1000, height: 500 });
  expect(fitWithin(10000, 1000)).toEqual({ width: 2048, height: 205 });
  expect(MAX_EDGE).toBe(2048);
  expect(JPEG_QUALITY).toBe(0.85);
});
it("decodes with the orientation applied, draws at the fitted size and encodes JPEG at 0.85", async () => {
  const { bitmap, canvas, drawImage, toBlob } = setup({ w: 4000, h: 3000 });
  const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
  const out = await shrinkForUpload(file);
  expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  expect([canvas.width, canvas.height]).toEqual([2048, 1536]);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1536);
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(out.type).toBe("image/jpeg");
});
it("a small photo is drawn at its own size", async () => {
  const { drawImage, bitmap } = setup({ w: 1000, h: 500 });
  await shrinkForUpload(new File(["x"], "a.png", { type: "image/png" }));
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 500);
});
it("an undecodable file throws CannotRead whose message is the spec's sentence", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("x")));
  const p = shrinkForUpload(new File(["x"], "a.heic"));
  await expect(p).rejects.toThrow(CannotRead);
  await expect(shrinkForUpload(new File(["x"], "a.heic"))).rejects.toThrow("This photo can't be read here. Pick a JPEG or PNG.");
});
it("a canvas that yields no blob is also CannotRead, and the bitmap is still closed", async () => {
  const { bitmap } = setup({ w: 800, h: 600, blob: null });
  await expect(shrinkForUpload(new File(["x"], "a.jpg"))).rejects.toThrow(CannotRead);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});
