import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PhotoSrc } from "@/photos/urls";
import { PayBreakHeader } from "./pay-break-header";

const photo: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 1600, height: 1200, alt: "Chronos" };
const render = (p: { title: string; photo: PhotoSrc | null }) => renderToStaticMarkup(createElement(PayBreakHeader, p));

describe("PayBreakHeader (spec §8.4)", () => {
  it("renders nothing without a photo: the pay sheet is unchanged", () => expect(render({ title: "Chronos", photo: null })).toBe(""));
  it("shows a 40 px paper plate beside the break's title", () => {
    const h = render({ title: "Chronos", photo });
    expect(h).toContain('data-testid="pay-break"');
    expect(h).toContain("Chronos");
    expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
    expect(h).toContain('alt=""');
  });
});
