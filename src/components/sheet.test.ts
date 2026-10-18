import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sheet } from "./sheet";

const bodyClass = (full: boolean) => {
  const props = { open: true, onClose: () => {}, title: "Pay for your lines", full } as ComponentProps<typeof Sheet>;
  const html = renderToStaticMarkup(createElement(Sheet, props, createElement("p", null, "You have lines 1 and 3.")));
  const m = html.match(/<div class="([^"]*overflow-y-auto[^"]*)"><p>/);
  if (!m) throw new Error("sheet body not found");
  return m[1].split(/\s+/);
};

describe("Sheet body", () => {
  // Safari resolves `flex: 1 1 0%` (Tailwind `flex-1`) to zero height inside a column-flex <dialog> whose height is
  // set by its content, so the body collapsed and the pay sheet showed only its header. `flex-auto` sizes the body
  // from its content; `min-h-0` still lets it shrink and scroll once the sheet hits its height cap.
  it.each([false, true])("sizes from its content and still scrolls (full: %s)", (full) => {
    const cls = bodyClass(full);
    expect(cls).toContain("flex-auto");
    expect(cls).not.toContain("flex-1");
    expect(cls).toContain("min-h-0");
    expect(cls).toContain("overflow-y-auto");
  });
});
