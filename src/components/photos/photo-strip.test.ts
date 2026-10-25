import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoStrip, type PhotoStripProps } from "./photo-strip";
import type { StripPhoto } from "./strip-state";

// A static render never calls a server action; stub the module so the strip's imports pull in no database.
vi.mock("@/app/photos/actions", () => ({
  describePhotoAction: vi.fn(), removePhotoAction: vi.fn(), reorderPhotosAction: vi.fn(), requestPhotoUpload: vi.fn(), retagPhotoAction: vi.fn(),
}));

const src = (id: string) => ({ src: `https://s.test/${id}-160.webp`, srcSet: `https://s.test/${id}-160.webp 160w`, width: 1600, height: 1200, alt: `Alt ${id}` });
const photo = (id: string): StripPhoto => ({ photoId: id, src: src(id), slot: null, alt: `Alt ${id}` });
const ok: PhotoStripProps = {
  breakId: "b1", initial: [photo("a"), photo("b")], prizes: [{ slot: "s1", label: "Chronos 22g", itemName: "Chronos 22g" }],
  max: 8, canAdd: true, claimed: false, title: "Strip break",
};
const html = (p: PhotoStripProps) => renderToStaticMarkup(createElement(PhotoStrip, p));

describe("PhotoStrip render (photos spec §9)", () => {
  it("disables Add photos with the reason beside it until the draft can be saved", () => {
    const h = html({ ...ok, initial: [], canAdd: false });
    expect(h).toMatch(/<button[^>]*disabled[^>]*>Add photos<\/button>/);
    expect(h).toContain("Add a title, a price and the top spot first.");
  });
  it("enabled once valid: no reason text", () => {
    const h = html({ ...ok, initial: [], canAdd: true });
    expect(h).not.toMatch(/<button[^>]*disabled[^>]*>Add photos/);
    expect(h).not.toContain("Add a title, a price and the top spot first.");
  });
  it("carries the hint and the count", () => {
    expect(html(ok)).toContain("Photos of the items. Rules and specs go in the description.");
    expect(html(ok)).toMatch(/data-testid="photo-count"[^>]*>2 of 8 photos</);
  });
  it("tiles in order, the first marked Lead, each ready and with a named options button", () => {
    const h = html(ok);
    expect(h.match(/data-testid="photo-tile"/g)).toHaveLength(2);
    expect(h.match(/data-status="ready"/g)).toHaveLength(2);
    expect(h.indexOf('data-photo-id="a"')).toBeLessThan(h.indexOf('data-photo-id="b"'));
    expect(h.indexOf(">Lead<")).toBeLessThan(h.indexOf('aria-label="Options for photo 2"'));
    expect(h.match(/>Lead</g)).toHaveLength(1);
    expect(h).toContain('aria-label="Options for photo 1"');
    expect(h).toContain('alt="Alt a"');
  });
  it("the file input accepts JPEG, PNG, WebP and HEIC, multiple", () => {
    const input = html(ok).match(/<input[^>]*data-testid="photo-input"[^>]*>/)![0];
    expect(input).toContain('type="file"');
    expect(input).toContain("multiple");
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) expect(input).toContain(t);
  });
  it("renders no uploading banner and no Undo line when nothing is pending", () => {
    const h = html(ok);
    expect(h).not.toContain("Photos are still uploading.");
    expect(h).not.toContain('data-testid="photo-undo"');
  });
  it("each tile's grip is hidden from assistive technology and the options button is collapsed", () => {
    const h = html(ok);
    expect(h.match(/<div[^>]*data-testid="photo-grip"[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(h.match(/aria-expanded="false"/g)).toHaveLength(2);
  });
});
