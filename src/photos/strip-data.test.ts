import { describe, it, expect, vi } from "vitest";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import type { PhotoView } from "@/domain/photos/queries";
import type { BreakPage } from "@/domain/breaks/queries";
import { prizeStripPrizes, toStripPhotos } from "./strip-data";

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
  it("a draft photo whose signing fails drops out instead of throwing (I5)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const s = { ...createMemoryStorage(), signedReadUrl: () => Promise.reject(new Error("signing down")) };
      const out = await toStripPhotos(s, [view({ id: "p1", location: "photos" }), view({ id: "p2", location: "photos-draft" }), view({ id: "p3", location: "photos" })]);
      expect(out.map((p) => p.photoId)).toEqual(["p1", "p3"]);
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});

const page = (o: { prizes: { rank: number; slotKey: string; itemId: string | null }[]; items: { id: string; name: string }[] }) => o as unknown as BreakPage;
describe("prizeStripPrizes", () => {
  it("lists every prize by slot in rank order with its item's name", () => {
    expect(prizeStripPrizes(page({ prizes: [{ rank: 2, slotKey: "s3", itemId: "i3" }, { rank: 1, slotKey: "s1", itemId: "i1" }],
      items: [{ id: "i1", name: "Chronos 22g" }, { id: "i3", name: "Flight pack" }] }))).toEqual([
      { slot: "s1", label: "Chronos 22g", itemName: "Chronos 22g" },
      { slot: "s3", label: "Flight pack", itemName: "Flight pack" },
    ]);
  });
  it("falls back to the place when a prize has no item", () => {
    expect(prizeStripPrizes(page({ prizes: [{ rank: 1, slotKey: "s1", itemId: null }, { rank: 2, slotKey: "s2", itemId: null }], items: [] }))).toEqual([
      { slot: "s1", label: "Top spot", itemName: null },
      { slot: "s2", label: "2nd place", itemName: null },
    ]);
  });
});
