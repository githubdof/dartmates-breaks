import { describe, it, expect } from "vitest";
import type { PhotoSrc } from "@/photos/urls";
import { attachPlates, placeRows, variantText } from "./prizes-model";

const ps = (id: string): PhotoSrc => ({ src: `https://x.test/${id}-160.webp`, srcSet: `https://x.test/${id}-160.webp 160w`, width: 640, height: 480, alt: id });
const rows = placeRows(
  [{ rank: 1, itemId: "i1", slotKey: "A" }, { rank: 1, itemId: "i2", slotKey: "B" }, { rank: 2, itemId: "i3", slotKey: "C" }],
  [
    { id: "i1", name: "Taylor Chronos 24g", condition: "new_in_box", variantSchema: null },
    { id: "i2", name: "Phantom 24g", condition: "used", variantSchema: null },
    { id: "i3", name: "Flight pack", condition: null, variantSchema: null },
  ],
);

describe("prizes model", () => {
  it("variantText joins keys with '; ' and values with 'or'", () => {
    expect(variantText({ weight: ["18g", "20g"], tip: ["soft", "steel"] })).toBe("weight: 18g or 20g; tip: soft or steel");
    expect(variantText(null)).toBeNull(); expect(variantText({})).toBeNull();
  });
  it("placeRows: Top spot, Or, 2nd place in rank order, with condition labels", () => {
    expect(rows.map((r) => [r.key, r.word, r.captionWord, r.name, r.condition])).toEqual([
      ["A", "Top spot", "Top spot", "Taylor Chronos 24g", "New in box"],
      ["B", "Or", "Top spot", "Phantom 24g", "Used"],
      ["C", "2nd place", "2nd place", "Flight pack", null],
    ]);
  });
  it("placeRows sorts by rank and skips a prize whose item is missing", () => {
    const r = placeRows(
      [{ rank: 2, itemId: "i3", slotKey: "C" }, { rank: 1, itemId: "i1", slotKey: "A" }, { rank: 3, itemId: null, slotKey: "D" }],
      [{ id: "i1", name: "One", condition: null, variantSchema: null }, { id: "i3", name: "Three", condition: null, variantSchema: null }],
    );
    expect(r.map((x) => x.key)).toEqual(["A", "C"]);
  });
  it("attachPlates: at most three plates per place, in live order, with their viewer index; untagged go to 'Also in the photos'", () => {
    const live = ["p0", "p1", "p2", "p3", "p4"].map((id): { id: string; slot: string | null; photo: PhotoSrc } => ({ id, slot: "A", photo: ps(id) })).concat({ id: "u5", slot: null, photo: ps("u5") });
    const { places, untagged } = attachPlates(rows, live);
    expect(places[0].plates.map((p) => [p.id, p.index])).toEqual([["p0", 0], ["p1", 1], ["p2", 2]]);
    expect(untagged.map((p) => [p.id, p.index])).toEqual([["u5", 5]]);
  });
  it("a place with no tagged photo has no plates", () => {
    const { places } = attachPlates(rows, [{ id: "p0", slot: "A", photo: ps("p0") }]);
    expect(places[1].plates).toEqual([]); expect(places[2].plates).toEqual([]);
  });
  it("a photo tagged to a slot no place has (a stale tag) falls into untagged", () => {
    const { places, untagged } = attachPlates(rows, [{ id: "p0", slot: "Z", photo: ps("p0") }]);
    expect(places.every((p) => p.plates.length === 0)).toBe(true);
    expect(untagged.map((p) => p.id)).toEqual(["p0"]);
  });
});
