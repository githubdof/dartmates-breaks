import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import type { PhotoSrc } from "@/photos/urls";
import { BreakCard } from "./break-card";

const b: FeedBreak = {
  id: "b1", title: "Chronos 22g", lineCount: 50, linePriceCents: 500, openedAt: new Date("2026-10-20T10:00:00Z"),
  open: 12, taken: 28, paid: 10, paidLastDay: 0,
  host: { id: "h1", handle: "jim", displayName: "Jim", breaksRun: 3, since: new Date("2026-01-01T00:00:00Z") },
  kit: { dark: "blue", light: "yellow" }, heat: 0,
};
const cells: ThumbCell[] = Array.from({ length: 50 }, (_, i) => ({
  number: i + 1, state: i < 10 ? "paid" : i < 38 ? "taken" : "open", bonus: false,
}));
const photo: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 1600, height: 1200, alt: "Chronos 22g" };
const card = (o: { photo?: PhotoSrc | null }) => renderToStaticMarkup(createElement(BreakCard, { b, cells, ...o }));

describe("BreakCard (spec §8.1)", () => {
  // Regression pin: passes before this task (no photo prop yet) and must keep passing.
  it("without a photo is exactly today's card: one 96 px kit thumbnail, no plate", () => {
    const h = card({ photo: null });
    expect(h).not.toContain('data-testid="plate"');
    expect(h).toContain('data-testid="thumb"');
    expect(h).toContain("width:108px");
    expect(h).toBe(card({}));
  });
  it("with a photo leads with a decorative 96 px board-surface plate in the thumbnail's slot", () => {
    const h = card({ photo });
    expect(h).toMatch(/data-testid="plate"[^>]*data-size="96"/);
    expect(h).toContain('data-surface="board"');
    expect(h).toContain('alt=""');
    expect(h).not.toContain('alt="Chronos 22g"');
    expect(h).toContain('data-testid="card-media"');
  });
  it("still shows how full the break is: a 48 px kit board in the corner with every cell, and N to go in the caption", () => {
    const h = card({ photo });
    expect(h.match(/data-testid="thumb"/g)).toHaveLength(1);
    expect(h).toContain("width:60px");
    expect(h.match(/data-tone="paid"/g)).toHaveLength(10);
    expect(h.match(/data-tone="taken"/g)).toHaveLength(28);
    expect(h.match(/data-tone="open"/g)).toHaveLength(12);
    expect(h).not.toContain("data-place");
    expect(h).toContain("12 to go");
  });
  it("keeps the board's language off the photo: the plate carries no kit variable, lamp or flight", () => {
    const plate = card({ photo }).match(/<span[^>]*data-testid="plate"[\s\S]*?<\/span>/)![0];
    expect(plate).not.toMatch(/--kit-|board-lamp|data-flight|--fc/);
  });
  // Regression pin: the card link exists today; the photo must not take it over.
  it("still links the whole card to the break", () => expect(card({ photo })).toContain('href="/b/b1"'));
});
