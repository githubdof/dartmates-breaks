import { describe, it, expect, vi } from "vitest";
import { PREFIX_PATTERN, publicVariantUrl } from "@/storage/buckets";
import type { PhotoView } from "@/domain/photos/queries";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import { leadSrcs } from "./lead-srcs";

const B = "00000000-0000-4000-8000-0000000000b1";
const P = `${B}/Zq3_x-9KpL2mN8vR4tY7wA`; // 22 url-safe characters after the slash
const view = (id: string, location: PhotoView["location"], prefix: string): PhotoView =>
  ({ id, position: 0, slot: null, alt: "Chronos 22g", width: 1600, height: 1200, location, prefix });

describe("leadSrcs (photos spec §8.1)", () => {
  it("prefix fixture is valid (guards the tests below)", () => expect(PREFIX_PATTERN.test(P)).toBe(true));
  it("maps each break id to public srcset URLs without touching Storage", async () => {
    const storage = createMemoryStorage();
    const spy = vi.spyOn(storage, "signedReadUrl");
    const m = await leadSrcs(storage, new Map([[B, view("p1", "photos", P)]]), 160);
    expect([...m.keys()]).toEqual([B]);
    expect(m.get(B)!.src).toBe(publicVariantUrl(P, 160));
    expect(m.get(B)!.src).toMatch(/\/storage\/v1\/object\/public\/photos\/00000000-0000-4000-8000-0000000000b1\/Zq3_x-9KpL2mN8vR4tY7wA-160\.webp$/);
    expect(m.get(B)!.srcSet).toContain("-640.webp 640w");
    expect(JSON.stringify([...m])).not.toMatch(/token=|sign/);
    expect(spy).not.toHaveBeenCalled();
  });
  it("refuses a lead that is not in the public bucket", async () => {
    for (const loc of ["photos-draft", "photo-archive"] as const)
      await expect(leadSrcs(createMemoryStorage(), new Map([[B, view("p1", loc, P)]]), 160)).rejects.toThrow(/public/);
  });
  it("returns an empty map for no leads", async () => expect((await leadSrcs(createMemoryStorage(), new Map(), 160)).size).toBe(0));
});
