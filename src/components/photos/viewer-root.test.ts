import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PhotoSrc } from "@/photos/urls";
import { Plate } from "./plate";
import { countText, plateButtonName } from "./viewer-model";
import { ViewerButton, ViewerRoot } from "./viewer-root";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
// createElement's overloads reject children passed as arguments for components whose children prop is required.
const mk = createElement as (type: unknown, props: object | null, ...children: unknown[]) => React.ReactElement;
const photo: PhotoSrc = { src: "https://x.test/photos/a-160.webp", srcSet: "https://x.test/photos/a-160.webp 160w", width: 640, height: 480, alt: "Chronos" };

describe("ViewerButton and ViewerRoot", () => {
  it("the lead plate is a button named 'Prize photos, 5' that shows '5 photos' and holds a decorative image", () => {
    const h = html(mk(ViewerButton, { index: 0, name: plateButtonName(5, false), testId: "photo-plate" },
      mk(Plate, { photo, size: 64, surface: "board", decorative: true }), mk("span", null, countText(5))));
    expect(h).toContain('aria-label="Prize photos, 5"'); expect(h).toContain('type="button"');
    expect(h).toContain('data-testid="photo-plate"'); expect(h).toContain("5 photos"); expect(h).toContain('alt=""');
  });
  it("a holder with an unseen change gets 'Prize photos, 5, updated'", () => {
    expect(html(mk(ViewerButton, { index: 0, name: plateButtonName(5, true) }, "Updated"))).toContain('aria-label="Prize photos, 5, updated"');
  });
  it("without a testId the button carries no data-testid", () => {
    expect(html(mk(ViewerButton, { index: 1, name: "Photo 2 of 5" }, "x"))).not.toContain("data-testid");
  });
  it("the first render ships no viewer: no dialog", () => {
    const h = html(mk(ViewerRoot, { photos: [{ ...photo, caption: null }] }, mk(ViewerButton, { index: 0, name: "Prize photos, 1" }, "x")));
    expect(h).not.toContain("<dialog"); // the marker string itself lives only in photo-viewer.tsx
  });
});
