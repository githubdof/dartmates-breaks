import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Flight } from "@/domain/flights";
import type { PhotoSrc } from "@/photos/urls";
import type { MyBreakCardProps } from "./me-copy";
import { MyBreakCard } from "./my-break-card";
import { MyHistoryRow } from "./my-history-row";

const noop = () => {};
const router = { refresh: noop, push: noop, replace: noop, back: noop, forward: noop, prefetch: noop, bfcacheId: "" };
const flight: Flight = { colour: "yellow", shape: "kite" };
const owing: MyBreakCardProps = {
  breakId: "b1", title: "Chronos", status: "open", hostName: "Jim", payee: "@Jim-R", handles: { venmo: "@Jim-R" },
  instructions: "Leave the note blank.", commitment: "abababababab",
  cells: [
    { number: 3, state: "sent", mine: true, overdue: false, bonus: false, flight, place: null },
    { number: 5, state: "taken", mine: true, overdue: false, bonus: false, flight, place: null },
  ],
  stateLine: "Unpaid.", unpaidNote: null, photo: null, photoNotice: null,
  owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false, bonusLost: [] },
};
const photo: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 1600, height: 1200, alt: "Chronos" };
const html = (p: MyBreakCardProps) =>
  renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(MyBreakCard, p)));

describe("MyBreakCard (Plan B deferred render tests)", () => {
  // Regression pin: the card has no plate or notice today; null props must keep it that way.
  it("without a photo shows no plate and no notice", () => {
    const h = html(owing);
    expect(h).not.toContain('data-testid="plate"');
    expect(h).not.toContain('data-testid="my-photo-notice"');
  });
  it("with a photo shows a decorative 40 px paper-surface plate beside the title", () => {
    const h = html({ ...owing, photo });
    expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
    expect(h).toContain('data-surface="paper"');
    expect(h).toContain('alt=""');
  });
  it("shows the notice sentence with its time until the holder has seen it, as a polite status", () => {
    const h = html({ ...owing, photo, photoNotice: { text: "Lead photo replaced", iso: "2026-10-21T18:40:00.000Z", fallback: "2:40 pm today" } });
    expect(h).toMatch(/data-testid="my-photo-notice"[^>]*role="status"|role="status"[^>]*data-testid="my-photo-notice"/);
    expect(h).toMatch(/data-testid="my-photo-notice"[^>]*>[^<]*Lead photo replaced/);
    expect(h).toContain("2:40 pm today");
  });
  it("shows the notice even when the last photo was removed (no plate, the sentence stays)", () => {
    const h = html({ ...owing, photo: null, photoNotice: { text: "Top-spot photo removed", iso: "2026-10-21T18:40:00.000Z", fallback: "2:40 pm today" } });
    expect(h).not.toContain('data-testid="plate"');
    expect(h).toContain("Top-spot photo removed");
  });
  it("on an open break it says what is owed and offers How to pay and Give back", () => {
    const h = html(owing);
    expect(h).toContain('data-testid="how-to-pay"');
    expect(h).toContain("How to pay Jim");
    expect(h).toContain('data-testid="give-back"');
    expect(h).toContain("You owe $5.");
    expect(h).toContain('data-testid="my-state">Unpaid.<');
    expect(h).not.toContain('data-testid="my-unpaid"');
    // The pay sheet mounts only while open, so its test ids are not on the page yet.
    expect(h).not.toContain('data-testid="pay-sheet"');
  });
  it("draws your lines in your flight, on the steel wire, with no kit, no lamp and no board frame", () => {
    const h = html(owing);
    expect(h).toContain('aria-label="Line 3, yours, sent"');
    expect(h).toContain('aria-label="Line 5, yours, taken"');
    expect(h.match(/data-flight="yellow-kite"/g)).toHaveLength(2);
    expect(h).toContain("--wire-strong:var(--board-steel)");
    expect(h).not.toContain("--kit-dark");
    expect(h).not.toContain('data-testid="lamp"');
    expect(h).not.toContain('data-testid="board-frame"');
  });
  it("on a ran break with unsent lines it says Unpaid. and who to ask, and offers nothing to do", () => {
    const h = html({ ...owing, status: "drawn", owe: null, unpaidNote: "Line 5 is not marked paid. Ask Jim about it." });
    expect(h).toContain('data-testid="my-state">Unpaid.<');
    expect(h).toContain('data-testid="my-unpaid">Line 5 is not marked paid. Ask Jim about it.<');
    expect(h).not.toContain('data-testid="how-to-pay"');
    expect(h).not.toContain('data-testid="give-back"');
    expect(h).not.toContain('data-testid="my-owed"');
  });
  it("a paid card shows its state and no actions", () => {
    const h = html({ ...owing, stateLine: "Paid.", owe: null });
    expect(h).toContain('data-testid="my-state">Paid.<');
    expect(h).not.toContain('data-testid="how-to-pay"');
    expect(h).not.toContain('data-testid="give-back"');
  });
});

describe("MyHistoryRow (Mosaic §9)", () => {
  it("is plain: the title, the state word and the pill, with no cells, money or counts", () => {
    const h = renderToStaticMarkup(createElement(MyHistoryRow, { breakId: "b1", title: "Chronos", status: "drawn", stateLine: "Won Chronos 22g." }));
    expect(h).toContain('href="/b/b1"');
    expect(h).toContain("Won Chronos 22g.");
    expect(h).toContain(">Ran<");
    expect(h).not.toContain('role="img"');
    expect(h).not.toContain("$");
  });
});
