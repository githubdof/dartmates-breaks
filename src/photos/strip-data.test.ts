import { describe, it, expect } from "vitest";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import type { PhotoView } from "@/domain/photos/queries";
import { toStripPhotos } from "./strip-data";

const BREAK = "6f1c2a3b-0000-4000-8000-000000000001";
const view = (o: Partial<PhotoView> & { id: string }): PhotoView => ({
  position: 0, slot: null, alt: "Darts", width: 1600, height: 1200, location: "photos", prefix: `${BREAK}/${o.id.padEnd(22, "x")}`, ...o,
});

describe("toStripPhotos", () => {
  it("a public photo gets plain URLs, a draft photo a signed one, in live order with slot and alt", async () => {
    const s = createMemoryStorage();
    const out = await toStripPhotos(s, [view({ id: "p1", location: "photos", slot: "s1", alt: "Lead" }), view({ id: "p2", location: "photos-draft" })]);
    expect(out.map((p) => [p.photoId, p.slot, p.alt])).toEqual([["p1", "s1", "Lead"], ["p2", null, "Darts"]]);
    expect(out[0].src.src).toMatch(/\/photos\/.*-160\.webp$/);
    // The memory store signs as memory://sign/<bucket>/<path>?seconds=…; the real store's signed URL carries a token.
    expect(out[1].src.src).toMatch(/^memory:\/\/sign\/photos-draft\/.*-160\.webp\?seconds=600$/);
  });
});
