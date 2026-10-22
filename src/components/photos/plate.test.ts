import { describe, it, expect } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import type { PhotoSrc } from "@/photos/urls";
import { Plate } from "./plate";

const photo = (o: Partial<PhotoSrc> = {}): PhotoSrc => ({
  src: "https://x.test/photos/a-160.webp",
  srcSet: "https://x.test/photos/a-160.webp 160w, https://x.test/photos/a-640.webp 640w",
  width: 640, height: 480, alt: "Chronos 24g", ...o,
});
const plate = (o: Partial<ComponentProps<typeof Plate>> = {}) => html(createElement(Plate, { photo: photo(), size: 64, surface: "board", ...o }));
const root = (h: string) => h.match(/^<[^>]+>/)![0];

describe("Plate (photos spec §8.0)", () => {
  it("the root carries data-testid, data-size and data-surface", () => {
    expect(root(plate())).toContain('data-testid="plate"');
    expect(root(plate())).toContain('data-size="64"'); expect(root(plate())).toContain('data-surface="board"');
    expect(root(plate({ size: 96, surface: "paper" }))).toContain('data-size="96"');
    expect(root(plate({ size: 96, surface: "paper" }))).toContain('data-surface="paper"');
  });
  it("board: a 64 px image in a 3 px mat and a 1 px steel keyline, 72 px outside", () => {
    const h = plate();
    expect(h).toContain('width="64"'); expect(h).toContain('height="64"');
    expect(root(h)).toContain("width:72px;height:72px");
    expect(h).toContain("p-[3px]"); expect(h).toContain("bg-board-wall-2"); expect(h).toContain("border-board-steel");
  });
  it("paper: no mat, a wire-strong keyline, 42 px outside a 40 px image", () => {
    const h = plate({ size: 40, surface: "paper" });
    expect(root(h)).toContain("width:42px;height:42px"); expect(h).toContain("border-wire-strong");
    expect(h).not.toContain("p-[3px]"); expect(h).not.toContain("border-board-steel");
  });
  it("every size has its outer box and never a board pitch", () => {
    for (const [size, board, paper] of [[40, 48, 42], [48, 56, 50], [64, 72, 66], [96, 104, 98]] as const) {
      expect(root(plate({ size }))).toContain(`width:${board}px;height:${board}px`);
      expect(root(plate({ size, surface: "paper" }))).toContain(`width:${paper}px;height:${paper}px`);
      expect(plate({ size })).toContain(`width="${size}"`);
    }
    expect(plate()).not.toContain("44.75");
  });
  it("decorative plates carry alt=\"\"; others the photo's alt", () => {
    expect(plate({ decorative: true })).toContain('alt=""');
    expect(plate()).toContain('alt="Chronos 24g"');
  });
  it("crops, never stretches: a 10:1 panorama still sits in a square box", () => {
    const h = plate({ photo: photo({ width: 1600, height: 160 }) });
    expect(h).toContain("object-cover"); expect(h).toContain('width="64"'); expect(h).toContain('height="64"');
    expect(h).not.toContain("object-fill"); expect(h).not.toContain('width="1600"');
  });
  it("a 100 px source keeps the box and passes its srcset through untouched", () => {
    const h = plate({ photo: photo({ width: 100, height: 100, srcSet: "https://x.test/photos/a-160.webp 100w" }) });
    expect(h).toContain('srcSet="https://x.test/photos/a-160.webp 100w"'); expect(h).toContain('sizes="64px"');
  });
  it("a transparent PNG shows the mat colour: the image itself carries the placeholder, with no filter or tint", () => {
    const img = plate().match(/<img[^>]*>/)![0];
    expect(img).toContain("bg-board-wall-2");
    expect(img).not.toMatch(/grayscale|sepia|opacity|mix-blend|rotate/);
  });
  it("loads lazily and decodes off the main thread", () => {
    expect(plate()).toContain('loading="lazy"'); expect(plate()).toContain('decoding="async"');
  });
});
