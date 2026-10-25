import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PREFIX_PATTERN, VARIANT_WIDTHS, publicVariantUrl, variantPath } from "@/storage/buckets";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import { photoSrc, SIGNED_READ_SECONDS } from "./urls";
import { newPhotoPrefix } from "./variants";

const P = `${randomUUID()}/${"A".repeat(22)}`;

describe("photoSrc (photos spec §5.5)", () => {
  it("a photo in `photos` gets public URLs and a srcset over the three widths", async () => {
    const mem = createMemoryStorage();
    const s = await photoSrc(mem, { location: "photos", prefix: P, width: 1600, height: 1200, alt: "Taylor Chronos" }, 640);
    expect(s).toEqual({
      src: publicVariantUrl(P, 640),
      srcSet: `${publicVariantUrl(P, 160)} 160w, ${publicVariantUrl(P, 640)} 640w, ${publicVariantUrl(P, 1600)} 1600w`,
      width: 1600, height: 1200, alt: "Taylor Chronos",
    });
  });

  it("srcset widths are the variants' real widths, and duplicates collapse (ruling 4)", async () => {
    const mem = createMemoryStorage();
    expect((await photoSrc(mem, { location: "photos", prefix: P, width: 100, height: 100, alt: "a" }, 160)).srcSet)
      .toBe(`${publicVariantUrl(P, 160)} 100w`);
    expect((await photoSrc(mem, { location: "photos", prefix: P, width: 1600, height: 160, alt: "a" }, 160)).srcSet)
      .toBe(`${publicVariantUrl(P, 160)} 160w, ${publicVariantUrl(P, 640)} 640w, ${publicVariantUrl(P, 1600)} 1600w`);
    expect((await photoSrc(mem, { location: "photos", prefix: P, width: 300, height: 400, alt: "a" }, 160)).srcSet)
      .toBe(`${publicVariantUrl(P, 160)} 120w, ${publicVariantUrl(P, 640)} 300w`);
  });

  it.each(["photos-draft", "photo-archive"] as const)("a photo in %s gets 10-minute signed URLs and never a public one", async (location) => {
    const mem = createMemoryStorage();
    const spy = vi.spyOn(mem, "signedReadUrl");
    const s = await photoSrc(mem, { location, prefix: P, width: 1600, height: 1200, alt: "a" }, 160);
    expect(SIGNED_READ_SECONDS).toBe(600);
    expect(spy.mock.calls).toEqual(VARIANT_WIDTHS.map((w) => [location, variantPath(P, w), 600]));
    expect(s.src).toBe(`memory://sign/${location}/${variantPath(P, 160)}?seconds=600`);
    expect(s.src + s.srcSet).not.toContain("/object/public/");
  });

  it("a signed photo whose size collapsed out of the srcset still gets a signed src", async () => {
    const mem = createMemoryStorage();
    const spy = vi.spyOn(mem, "signedReadUrl");
    const s = await photoSrc(mem, { location: "photos-draft", prefix: P, width: 100, height: 100, alt: "a" }, 1600);
    expect(spy.mock.calls).toEqual([["photos-draft", variantPath(P, 160), 600], ["photos-draft", variantPath(P, 1600), 600]]);
    expect(s.src).toBe(`memory://sign/photos-draft/${variantPath(P, 1600)}?seconds=600`);
    expect(s.srcSet).toBe(`memory://sign/photos-draft/${variantPath(P, 160)}?seconds=600 100w`);
  });

  it("newPhotoPrefix matches PREFIX_PATTERN, starts with the break id, and never repeats", () => {
    const id = randomUUID();
    const [a, b] = [newPhotoPrefix(id), newPhotoPrefix(id)];
    expect(a).toMatch(PREFIX_PATTERN);
    expect(a.startsWith(`${id}/`)).toBe(true);
    expect(a).not.toBe(b);
  });
});
