import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HostBreakRow as Row } from "@/domain/breaks/queries";
import type { PhotoSrc } from "@/photos/urls";
import { HostBreakRow } from "./host-break-row";

const base: Row = { id: "b1", title: "Chronos 22g", status: "open", lineCount: 50, openedAt: new Date("2026-10-20T10:00:00Z"), paid: 10, taken: 20 };
const photo: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 1600, height: 1200, alt: "Chronos 22g" };
const row = (o: { status?: string; photo: PhotoSrc | null }) =>
  renderToStaticMarkup(createElement(HostBreakRow, { b: { ...base, status: o.status ?? base.status }, photo: o.photo }));

describe("HostBreakRow (spec §8.4)", () => {
  it("is today's row without a photo", () => {
    const h = row({ photo: null });
    expect(h).not.toContain('data-testid="plate"');
    expect(h).toContain('href="/b/b1"');
    expect(h).toContain("10 of 50 paid");
  });
  it("shows a 40 px paper plate beside the title with a photo", () => {
    const h = row({ photo });
    expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
    expect(h).toContain('data-surface="paper"');
    expect(h).toContain('alt=""');
  });
  it("sends a draft to its editor and a live break to its page, with or without a photo", () => {
    expect(row({ status: "draft", photo })).toContain('href="/host/b1/edit"');
    expect(row({ status: "open", photo })).toContain('href="/b/b1"');
  });
});
