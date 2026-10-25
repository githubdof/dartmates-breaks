import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PhotoSrc } from "@/photos/urls";
import { PrizesBlock, type PrizesBlockProps } from "./prizes-block";
import type { PlateData, PrizePlace, PrizesBlockNotice } from "./prizes-model";

const photoSrc = (id = "x"): PhotoSrc => ({ src: `https://x.test/${id}-160.webp`, srcSet: `https://x.test/${id}-160.webp 160w`, width: 640, height: 480, alt: id });
const plate = (id: string, index: number): PlateData => ({ id, index, photo: photoSrc(id) });
const place = (o: Partial<PrizePlace> & Pick<PrizePlace, "key" | "word" | "name">): PrizePlace => ({
  captionWord: o.word, condition: null, variants: null, plates: [], ...o,
});
const fixture: PrizesBlockProps = {
  places: [
    place({ key: "A", word: "Top spot", name: "Taylor Chronos 24g", condition: "New in box", variants: "weight: 18g or 20g", plates: [plate("p0", 0), plate("p1", 1)] }),
    place({ key: "B", word: "Or", name: "Phantom 24g", condition: "Used" }),
    place({ key: "C", word: "2nd place", name: "Flight pack", plates: [plate("p2", 2)] }),
  ],
  untagged: [plate("u3", 3)], removed: [], notice: null, noticeFirst: false, count: 4,
};
const block = (o: Partial<PrizesBlockProps> = {}) => renderToStaticMarkup(createElement(PrizesBlock, { ...fixture, ...o }));

describe("PrizesBlock", () => {
  it("one row per place in order: word, item name, condition, variants", () => {
    const h = block();
    expect(h.match(/data-testid="prize-place"/g)).toHaveLength(3);
    expect(h.indexOf("Top spot")).toBeLessThan(h.indexOf(">Or<"));
    expect(h.indexOf(">Or<")).toBeLessThan(h.indexOf("2nd place"));
    expect(h.indexOf("Taylor Chronos 24g")).toBeLessThan(h.indexOf("New in box"));
    expect(h).toContain("weight: 18g or 20g");
  });
  it("a place with no tagged photo shows its name only", () => {
    const row = block().split('data-testid="prize-place"')[2];
    expect(row).toContain("Phantom 24g"); expect(row).not.toContain("<img");
  });
  it("the plates it is given, as 64 px paper plates", () => {
    const first = block().split('data-testid="prize-place"')[1];
    expect(first.match(/<img/g)).toHaveLength(2);
    expect(first.match(/data-size="64"/g)).toHaveLength(2);
    expect(first).toContain('data-surface="paper"');
  });
  it("'Also in the photos' only when untagged photos exist", () => {
    expect(block()).toContain("Also in the photos"); expect(block({ untagged: [] })).not.toContain("Also in the photos");
  });
  it("removed photos appear marked 'Removed Oct 21' and are not buttons; none given, no 'Removed'", () => {
    const h = block({ removed: [{ id: "r1", photo: photoSrc(), alt: "Old lead", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
    expect(h).toContain("Removed"); expect(h).toContain("Oct 21");
    expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<button");
    expect(block({ removed: [] })).not.toContain("Removed");
  });
  it("a removed photo whose archive copy is gone keeps its mark with no image", () => {
    const h = block({ removed: [{ id: "r1", photo: null, alt: "", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
    expect(h).toContain("Removed"); expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<img");
  });
  it("the notice sentence with its time; holders read it first, everyone else last", () => {
    const n: PrizesBlockNotice = { text: "Lead photo replaced", iso: "2026-10-21T15:05:00Z", fallback: "Oct 21, 2026 at 3:05 pm" };
    const holder = block({ notice: n, noticeFirst: true }); const other = block({ notice: n, noticeFirst: false });
    expect(holder).toContain("Lead photo replaced on"); expect(holder).toContain('dateTime="2026-10-21T15:05:00Z"');
    expect(holder.indexOf("Lead photo replaced")).toBeLessThan(holder.indexOf("Top spot"));
    expect(other.indexOf("Lead photo replaced")).toBeGreaterThan(other.indexOf("2nd place"));
    expect(block({ notice: null })).not.toContain("photo-notice-line");
  });
  it("live plates are buttons named 'Photo K of N'; removed plates are not", () => {
    const h = block({ removed: [{ id: "r1", photo: photoSrc(), alt: "Old lead", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
    expect(h).toContain('aria-label="Photo 1 of 4"'); expect(h).toContain('aria-label="Photo 4 of 4"');
    expect(h.match(/aria-label="Photo \d of 4"/g)).toHaveLength(4);
    expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<button");
  });
  it("the block is headed Prizes and is not a <details> fold", () => {
    expect(block()).toContain(">Prizes<"); expect(block()).not.toContain("<details");
  });
});
