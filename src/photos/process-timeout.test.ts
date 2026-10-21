import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import sharp, { type Sharp } from "sharp";
import { processPhoto, UnsupportedImage } from "./process";
import { photoFixtures } from "../../tests/fixtures/photos/make";

let fx: Awaited<ReturnType<typeof photoFixtures>>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
afterEach(() => { vi.restoreAllMocks(); });
// The prototype every pipeline inherits `timeout`, `metadata` and `toBuffer` from.
const proto = sharp.prototype as Sharp;

describe("every sharp pipeline is bounded (panel ruling 29)", () => {
  it("each instance that produces output was given its own .timeout({ seconds: 8 })", async () => {
    const timed = new Map<object, unknown>();
    const ran: object[] = [];
    const { timeout, metadata, toBuffer } = proto;
    vi.spyOn(proto, "timeout").mockImplementation(function (this: Sharp, o) { timed.set(this, o); return timeout.call(this, o); });
    vi.spyOn(proto, "metadata").mockImplementation(function (this: Sharp, ...a: never[]) { ran.push(this); return (metadata as (...x: never[]) => unknown).apply(this, a); } as never);
    vi.spyOn(proto, "toBuffer").mockImplementation(function (this: Sharp, ...a: never[]) { ran.push(this); return (toBuffer as (...x: never[]) => unknown).apply(this, a); } as never);
    await processPhoto(fx.atLimit);
    expect(ran.length).toBeGreaterThanOrEqual(4); // the format check and the three variants
    for (const instance of ran) expect(timed.get(instance)).toEqual({ seconds: 8 });
  });
  it("a pipeline that runs past its timeout is refused as UnsupportedImage, never a raw sharp error", async () => {
    // The text sharp 0.35.5 rejects with when `.timeout` fires: src/common.cc VipsProgressCallBack calls
    // vips_error("timeout", "%d%% complete", ...), which libvips formats as "timeout: 30% complete".
    vi.spyOn(proto, "toBuffer").mockRejectedValueOnce(new Error("timeout: 30% complete") as never);
    const r = processPhoto(fx.atLimit);
    await expect(r).rejects.toBeInstanceOf(UnsupportedImage);
    await expect(r).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/^timeout/) }) });
  });
});
