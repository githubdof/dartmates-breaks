import { describe, it, expect } from "vitest";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { LedgerRow } from "@/components/ledger/ledger-row";
import { LedgerSheet } from "@/components/ledger/ledger-sheet";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DEFAULT_KIT, FLIGHT_COLOURS, FLIGHT_SHAPES, TOKENS, type Flight, type FlightColour, type FlightShape, type Kit } from "@/domain/flights";
import { Cell } from "./cell";
import { cellMetrics } from "./cell-metrics";
import { PaperCell } from "./paper-cell";
import { FlightSprite } from "./flight-sprite";
import { Grid } from "./grid";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BoardLegend } from "@/components/board-legend";
import { GridPreview } from "./grid-preview";
import { LAMP_POSITION, lampLayer } from "./lamp";
import { KitSwatch } from "@/components/kit-swatch";
import { boardGeometry, columnsFor, GRID_COLS } from "./layout";

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el);
type C = GridCell & { place?: 1 | 2 | 3 | null };
const cell = (number: number, o: Partial<C> = {}): C => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });

describe("PaperCell: paper surfaces keep the first design (ledger, pay sheet; Mosaic §1.1)", () => {
  it("open: a card face, a toggle", () => {
    const h = html(createElement(PaperCell, { cell: cell(1), onPress: noop }));
    expect(h).toContain('aria-label="Line 1, open"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain("bg-card");
  });
  it("taken: the hatch; sent keeps its word and its dashed edge on paper", () => {
    expect(html(createElement(PaperCell, { cell: cell(2, { state: "taken" }), disabled: true, onPress: noop }))).toContain("bg-hatch");
    const sent = html(createElement(PaperCell, { cell: cell(3, { state: "sent" }), disabled: true, onPress: noop }));
    expect(sent).toContain('aria-label="Line 3, sent"');
    expect(sent).toContain("border-dashed");
  });
  it("paid: the ink face and a white number; no flight, no glyph", () => {
    const h = html(createElement(PaperCell, { cell: cell(4, { state: "paid", flight: { colour: "plum", shape: "kite" } }), disabled: true, onPress: noop }));
    expect(h).toContain("bg-ink");
    expect(h).toContain("text-card");
    expect(h).not.toContain("flight");
  });
});

const plum: Flight = { colour: "plum", shape: "kite" };
const yellow: Flight = { colour: "yellow", shape: "pear" };
const petrol: Flight = { colour: "petrol", shape: "standard" };
const at = (px: number, c: C, o: Partial<ComponentProps<typeof Cell>> = {}) =>
  html(createElement(Cell, { cell: c, px, onPress: noop, disabled: c.state !== "open", ...o }));
const sizeVars = (px: number, o: { mine?: boolean; place?: 1 | 2 | 3 | null } = {}) => {
  const m = cellMetrics(px, { mine: o.mine ?? false, place: o.place ?? null });
  return `--g:${m.glyph}px;--gi:${m.inset}px;--disc:${m.disc}px;--ns:${m.num}px`;
};

describe("cellMetrics: the §5 glyph and won-cell size rules", () => {
  it("sizes glyphs by cell size; yours is larger only from 48 px", () => {
    expect(cellMetrics(44, { mine: false, place: null })).toEqual({ glyph: 14, inset: 2, disc: 0, num: 18 });
    expect(cellMetrics(44.75, { mine: true, place: null })).toEqual({ glyph: 14, inset: 2, disc: 0, num: 18 });
    expect(cellMetrics(48, { mine: false, place: null })).toEqual({ glyph: 14, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(52, { mine: true, place: null })).toEqual({ glyph: 16, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(56, { mine: true, place: null })).toEqual({ glyph: 20, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(68, { mine: false, place: null })).toEqual({ glyph: 20, inset: 3, disc: 0, num: 18 });
  });
  it("won: a 26 px disc, a 10 px glyph and a 14 px top-spot number under 56 px; 30 px discs above", () => {
    expect(cellMetrics(44.75, { mine: false, place: 1 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 14 });
    expect(cellMetrics(44.75, { mine: false, place: 2 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 16 });
    expect(cellMetrics(55, { mine: true, place: 3 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 16 });
    expect(cellMetrics(56, { mine: false, place: 1 })).toEqual({ glyph: 14, inset: 3, disc: 30, num: 18 });
    expect(cellMetrics(67, { mine: false, place: 2 })).toEqual({ glyph: 14, inset: 3, disc: 30, num: 18 });
    expect(cellMetrics(68, { mine: false, place: 1 })).toEqual({ glyph: 20, inset: 3, disc: 30, num: 18 });
  });
});

describe("FlightSprite: one sprite, four silhouettes, a non-scaling stroke", () => {
  it("renders each shape's path from FLIGHT_SHAPES once", () => {
    const h = html(createElement(FlightSprite));
    expect(h).toContain('aria-hidden="true"');
    for (const s of Object.keys(FLIGHT_SHAPES) as FlightShape[]) {
      expect(h).toContain(`id="flight-${s}"`);
      expect(h).toContain(`d="${FLIGHT_SHAPES[s].path}"`);
    }
    expect(h.match(/vector-effect="non-scaling-stroke"/g)).toHaveLength(4);
  });
});

for (const px of [44, 56, 68] as const) {
  describe(`Cell at ${px} px: every §5 state, shape first`, () => {
    it("open: cream, a toggle, no glyph", () => {
      const h = at(px, cell(1));
      expect(h).toContain('aria-label="Line 1, open"');
      expect(h).toContain('aria-pressed="false"');
      expect(h).toContain('data-state="open"');
      expect(h).toContain('data-face="cream"');
      expect(h).toContain('data-ink="ink"');
      expect(h).toContain(sizeVars(px));
      expect(h).not.toContain("bc-hatch");
      expect(h).not.toContain("bc-glyph");
      expect(h).not.toContain("data-flight");
    });
    it("selected: pressed, the four corner brackets, no check glyph", () => {
      const h = at(px, cell(1), { selected: true });
      expect(h).toContain('aria-pressed="true"');
      expect(h).toContain('data-selected="true"');
      expect(h).toContain('data-mark="brackets"');
      expect(h).toContain("bc-brackets");
      expect(h.match(/<i><\/i>/g)).toHaveLength(4);
      expect(h).not.toContain("✓");
    });
    it("sniped: as claimed by others, with the ink strike; named just taken", () => {
      const h = at(px, cell(7, { state: "taken", flight: plum, holder: "mike" }), { struck: true });
      expect(h).toContain('aria-label="Line 7, just taken"');
      expect(h).toContain('data-struck="true"');
      expect(h).toContain('data-mark="strike"');
      expect(h).toContain("bc-strike");
      expect(h).toContain("bc-hatch");
      expect(h).toContain('data-glyph="filled"');
      expect(h).not.toContain("mike");
    });
    it("claimed, others (sent folds into taken): hatch, chip, the holder's flight filled with an ink keyline", () => {
      const h = at(px, cell(2, { state: "sent", flight: plum, holder: "mike" }));
      expect(h).toContain('aria-label="Line 2, taken"');
      expect(h).toContain('aria-disabled="true"');
      expect(h).not.toContain("aria-pressed");
      expect(h).toContain("bc-hatch");
      expect(h).toContain('data-face="hatch"');
      expect(h).toContain("bc-chip");
      expect(h).toContain('data-glyph="filled"');
      expect(h).toContain('href="#flight-kite"');
      expect(h).toContain('data-flight="plum-kite"');
      expect(h).toContain(`--fc:${FLIGHT_COLOURS.plum.face}`);
      expect(h).not.toContain("bc-ring");
      expect(h).not.toContain("bc-sent");
      expect(h).not.toContain("mike");
    });
    it("yours, not sent: your flight outlined, the yours ring ink outside", () => {
      const h = at(px, cell(3, { state: "taken", mine: true, flight: yellow }));
      expect(h).toContain('aria-label="Line 3, yours, taken"');
      expect(h).toContain('data-mine="true"');
      expect(h).toContain('data-glyph="outline"');
      expect(h).toContain('data-ring="ink-out"');
      expect(h).toContain('data-mark="ring"');
      expect(h).toContain(sizeVars(px, { mine: true }));
      expect(h).not.toContain("bc-sent");
    });
    it("yours, sent: your flight filled, the ring and the sent mark", () => {
      const h = at(px, cell(3, { state: "sent", mine: true, flight: yellow }));
      expect(h).toContain('aria-label="Line 3, yours, sent"');
      expect(h).toContain('data-glyph="filled"');
      expect(h).toContain("bc-ring");
      expect(h).toContain("bc-sent");
      expect(h).toContain('data-mark="sent"');
    });
    it("overdue (host view): the red inset edge and the ! in the glyph's place, no flight drawn", () => {
      const h = at(px, cell(5, { state: "taken", overdue: true, flight: plum }));
      expect(h).toContain('aria-label="Line 5, taken, overdue"');
      expect(h).toContain("bc-overdue");
      expect(h).toContain('data-overdue="true"');
      expect(h).toContain('data-mark="overdue-edge"');
      expect(h).toContain('data-mark="overdue-glyph"');
      expect(h).toContain(">!<");
      expect(h).toContain("bc-chip");
      expect(h).not.toContain("bc-glyph");
    });
    it("paid: the holder's colour on the overlay, and the number ink switches per tier (Review Focus 3)", () => {
      for (const colour of Object.keys(FLIGHT_COLOURS) as FlightColour[]) {
        const f = FLIGHT_COLOURS[colour];
        const h = at(px, cell(4, { state: "paid", flight: { colour, shape: "slim" } }));
        expect(h).toContain('aria-label="Line 4, paid"');
        expect(h).toContain(`--face:${f.face};--num:${f.ink};--fc:${f.face}`);
        expect(f.ink).toBe(f.tier === "dark" ? TOKENS.boardCream : TOKENS.boardInk);
        expect(h).toContain('data-face="face"');
        expect(h).toContain(`data-ink="${f.tier === "dark" ? "cream" : "ink"}"`);
        expect(h).toContain('data-glyph="on-face"');
        expect(h).toContain("bc-face");
        expect(h).not.toContain("bc-hatch");
      }
    });
    it("yours, paid: the ring turns cream outside on a dark face, ink outside on a light one", () => {
      const dark = at(px, cell(4, { state: "paid", mine: true, flight: petrol }));
      expect(dark).toContain('aria-label="Line 4, yours, paid"');
      expect(dark).toContain('data-ring="cream-out"');
      expect(at(px, cell(4, { state: "paid", mine: true, flight: yellow }))).toContain('data-ring="ink-out"');
    });
    it("reserved for a mini: the double steel rule and the m, no hatch, no glyph", () => {
      const h = at(px, cell(6, { state: "reserved" }));
      expect(h).toContain('aria-label="Line 6, reserved for a mini"');
      expect(h).toContain("bc-double");
      expect(h).toContain('data-face="reserved"');
      expect(h).toContain('data-ink="ink-2"');
      expect(h).toContain('data-mark="reserved-rule"');
      expect(h).toContain('data-mark="mini-label"');
      expect(h).toContain(">m<");
      expect(h).not.toContain("bc-hatch");
      expect(h).not.toContain("bc-glyph");
    });
    it("bonus: drawn as its state; the + is retired; a display-only cell is an image", () => {
      const h = html(createElement(Cell, { cell: cell(51, { state: "paid", bonus: true, flight: yellow }), px }));
      expect(h).toContain('role="img"');
      expect(h).toContain('data-cell="51"');
      expect(h).toContain('data-bonus="true"');
      expect(h).toContain('aria-label="Line 51, bonus, paid"');
      expect(h).not.toContain(">+<");
    });
    for (const [place, name] of [[1, "top spot"], [2, "2nd place"], [3, "3rd place"]] as const) {
      it(`won, ${name}: the black face, the cream bull with its ring, the holder's flight clear of it`, () => {
        const h = at(px, cell(23, { state: "paid", flight: plum, place }));
        expect(h).toContain(`aria-label="Line 23, ${name}"`);
        expect(h).toContain(`data-won="${place}"`);
        expect(h).toContain(`class="bc-bull" data-place="${place}"`);
        expect(h).toContain('data-face="won"');
        expect(h).toContain('data-mark="bull"');
        expect(h).toContain('data-glyph="won"');
        expect(h).toContain(`--fc:${FLIGHT_COLOURS.plum.face}`);
        expect(h).toContain(sizeVars(px, { place }));
        expect(h).not.toContain("bc-hatch");
        expect(h).not.toMatch(/top spot<|place</); // no place word in the cell, only in its name
      });
    }
    it("won and yours: named by its place alone, with no yours ring (Mosaic §5, recorded ruling 19)", () => {
      const h = at(px, cell(23, { state: "paid", mine: true, flight: plum, place: 1 }));
      expect(h).toContain('aria-label="Line 23, top spot"');
      expect(h).toContain('data-won="1"');
      expect(h).not.toContain("bc-ring");
      expect(h).not.toContain("yours");
    });
    it("kit view: an ink standard flight and the kit-light band; no data-flight and no --fc, whatever the data says", () => {
      const claimed = at(px, cell(2, { state: "taken", flight: plum }), { view: "kit" });
      expect(claimed).toContain('aria-label="Line 2, taken"');
      expect(claimed).toContain('data-glyph="kit"');
      expect(claimed).toContain('href="#flight-standard"');
      expect(claimed).toContain("bc-band");
      expect(claimed).toContain('data-mark="band"');
      expect(claimed).toContain("bc-hatch");
      const paid = at(px, cell(4, { state: "paid", flight: plum }), { view: "kit" });
      expect(paid).toContain("--face:var(--kit-dark);--num:var(--board-cream)");
      expect(paid).toContain('data-glyph="kit-paid"');
      const won = at(px, cell(23, { state: "paid", flight: plum, place: 1 }), { view: "kit" });
      expect(won).toContain('data-glyph="won-kit"');
      expect(won).toContain("bc-bull");
      for (const h of [claimed, paid, won]) {
        expect(h).not.toContain("data-flight");
        expect(h).not.toContain("--fc");
      }
    });
  });
}

describe("Cell sizing without px", () => {
  it("leaves the §5 sizes to the container queries: no inline size vars on a fluid board cell", () => {
    expect(html(createElement(Cell, { cell: cell(1), onPress: noop }))).not.toContain("--g:");
  });
});

describe("Grid: one group, one tab stop, disabled where the viewer cannot pick", () => {
  it("labels the group and keeps one roving tab stop", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2, { state: "taken" }), cell(3)], lineCount: 3, label: "Lines, 2 of 3 open", onPress: noop, focusNumber: 3 }));
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Lines, 2 of 3 open"');
    expect(h.match(/tabindex="0"/g)).toHaveLength(1);
    expect(h).toMatch(/data-cell="3"[^>]*tabindex="0"|tabindex="0"[^>]*data-cell="3"/);
  });
  it("disables unselected open cells at the limit, and every open cell when read-only", () => {
    const atLimit = html(createElement(Grid, { cells: [cell(1), cell(2)], lineCount: 2, label: "L", selected: new Set([1]), disabledOpen: true, onPress: noop }));
    expect(atLimit).toMatch(/aria-label="Line 2, open"[^>]*aria-disabled="true"/);
    expect(atLimit).not.toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
    const readOnly = html(createElement(Grid, { cells: [cell(1)], lineCount: 2, label: "L", readOnly: true, onPress: noop }));
    expect(readOnly).toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
  });
  it("puts bonus lines on their own labelled row", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2), cell(3, { state: "paid", bonus: true })], lineCount: 2, label: "L" }));
    expect(h).toContain("Bonus");
    expect(h.indexOf("Line 3, bonus, paid")).toBeGreaterThan(h.indexOf("Bonus"));
  });
});

describe("LedgerRow: state as a word, the late time in red, one Paid button with a full name", () => {
  const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
    handle: null, displayName: null, paymentName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
  });
  const props = (r: LedgerRowView, o: Record<string, unknown> = {}) => ({
    row: r, actionable: true, recentlyPaid: false, pending: false, expanded: false, bonusUsed: 0, bonusMax: 1,
    onToggle: noop, onPaid: noop, onUndo: noop, onMarkLine: noop, onUnmarkLine: noop, onRelease: noop, onBonus: noop, ...o,
  });
  const alice = row({ ownerId: "a", handle: "alice", displayName: "Alice", paymentName: "Alice Smith", numbers: [2], unpaid: [2], overdue: [2], owedCents: 500, status: "overdue", lateText: "4 h late" });

  it("an overdue buyer", () => {
    const h = html(createElement(LedgerRow, props(alice)));
    expect(h).toContain('data-status="overdue"');
    expect(h).toContain(">Overdue<");
    expect(h).toContain("4 h late");
    expect(h).toContain("text-red");
    expect(h).toContain("pays as Alice Smith");
    expect(h).toContain('aria-label="Mark Alice paid, $5"');
  });
  it("just marked paid: Undo instead of Paid", () => {
    const h = html(createElement(LedgerRow, props(alice, { recentlyPaid: true })));
    expect(h).toContain('data-testid="ledger-undo"');
    expect(h).not.toContain('data-testid="ledger-paid"');
  });
  it("a paid buyer has no button, and nothing to do once the draw has started", () => {
    const paid = row({ ownerId: "b", handle: "bob", numbers: [7], paid: [7], status: "paid" });
    expect(html(createElement(LedgerRow, props(paid)))).not.toContain('data-testid="ledger-paid"');
    expect(html(createElement(LedgerRow, props(alice, { actionable: false })))).not.toContain('data-testid="ledger-paid"');
  });
  it("without onToggle the name is plain text and the row does not expand; a title names the break", () => {
    const h = html(createElement(LedgerRow, props(alice, { onToggle: undefined, title: "Chronos break" })));
    expect(h).not.toContain("aria-expanded");
    expect(h).toContain("Chronos break");
    expect(h).toContain("Alice");
    // No button wraps the name: every button's content is free of it (the Paid button names Alice only in its label).
    const buttons = [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
    expect(buttons.some((b) => b.includes(">Alice<"))).toBe(false);
    expect(h).toContain('<span class="truncate font-semibold">Alice</span>');
    const toggled = html(createElement(LedgerRow, props(alice)));
    expect(toggled).toContain("aria-expanded");
    expect([...toggled.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].some((m) => m[1].includes(">Alice<"))).toBe(true);
  });
  it("the ledger's column header sits outside the Buyers list and is hidden from screen readers", () => {
    const router = { refresh: noop, push: noop, replace: noop, back: noop, forward: noop, prefetch: noop };
    const h = html(createElement(AppRouterContext.Provider, { value: router },
      createElement(LedgerSheet, { open: true, onClose: noop, breakId: "b", status: "open", rows: [alice], counts: { paid: 0, taken: 1, total: 4 }, bonus: { used: 0, max: 1 }, hostName: "@jim" })));
    const header = h.match(/<div([^>]*)><span>Buyer<\/span><span>Lines<\/span>/);
    expect(header).not.toBeNull();
    expect(header![1]).toContain('aria-hidden="true"');
    const listStart = h.indexOf('<ul aria-label="Buyers"');
    expect(listStart).toBeGreaterThan(h.indexOf(header![0]));
    expect(h.slice(listStart, h.indexOf("</ul>", listStart))).not.toContain("<span>Buyer</span>");
  });
});

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start) + 1);
};
const fifty = Array.from({ length: 50 }, (_, i) => cell(i + 1, i % 5 === 1 ? { state: "taken", flight: plum } : {}));
const plumLime: Kit = { dark: "plum", light: "lime" };

describe("Board (Mosaic §4, §5): the frame, the wire, the lamp, the kit", () => {
  it("draws the frame as one box-shadow stack into the gutter, never a border or padding", () => {
    expect(rule(".board-frame")).toContain(
      "box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring), 0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light);");
    expect(rule(".board-frame")).not.toMatch(/border|padding/);
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "Lines, 40 to go", onPress: noop }));
    expect(h).toContain('data-testid="board-frame"');
    // No ancestor within 12 px of the grid may clip overflow, and the frame takes no layout space.
    const tags = [h.match(/<div role="group"[^>]*>/)![0], h.match(/<div data-grid-rows[^>]*>/)![0]];
    for (const t of tags) expect(t).not.toMatch(/overflow|\bp[xytblr]?-|border/);
  });
  it("wires cells in steel, leaves empty last-row slots in --board-wall-2, and pulls the rows 3.5 px into each gutter", () => {
    expect(rule(".board-frame, .board-wire")).toContain("gap: 1px; background: var(--board-wall-2); margin-inline: -3.5px;");
    expect(rule(".board-frame > .bc:not(:focus-visible), .board-wire > .bc:not(:focus-visible)")).toContain("box-shadow: 0 0 0 1px var(--board-steel);");
  });
  it("sets the kit on the board from palette keys", () => {
    const def = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L" }));
    expect(def).toContain(`--kit-dark:${FLIGHT_COLOURS[DEFAULT_KIT.dark].face};--kit-light:${FLIGHT_COLOURS[DEFAULT_KIT.light].face}`);
    const kit = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", kit: plumLime }));
    expect(kit).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face};--kit-light:${FLIGHT_COLOURS.lime.face}`);
  });
  it("lamp: one gradient for every step, LAMP's alpha as the layer's opacity, an opacity-only transition, none without heat", () => {
    expect(([0, 1, 2, 3, 4] as const).map((s) => lampLayer(s).opacity)).toEqual([0.06, 0.095, 0.13, 0.165, 0.2]);
    const images = new Set(([0, 1, 2, 3, 4] as const).map((s) => lampLayer(s).backgroundImage));
    expect([...images]).toEqual(["radial-gradient(ellipse at center, rgba(255,232,200,1), transparent 70%)"]);
    expect(rule(".board-lamp")).toContain("transition: opacity var(--dur-lamp)");
    expect(rule(".board-lamp")).toContain(`inset: ${LAMP_POSITION};`); // 32 px above and below, 16 px each side
    const lit = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", heat: 3 }));
    expect(lit).toMatch(/<span aria-hidden="true" data-testid="lamp" class="board-lamp" style="[^"]*opacity:0.165/);
    expect(html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L" }))).not.toContain('data-testid="lamp"');
  });
  it("at 390 and 360: the 50-line board's classes give eight and seven columns (Review Focus 5)", () => {
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", onPress: noop }));
    expect(h).toContain(GRID_COLS.l);
    expect(h.match(/<button/g)).toHaveLength(50);
    expect(columnsFor(50, boardGeometry(390, 50).column)).toBe(8);
    expect(columnsFor(50, boardGeometry(360, 50).column)).toBe(7);
  });
  it("kit view: no cell carries data-flight or --fc, even if a flight reached the data", () => {
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", view: "kit", onPress: noop }));
    expect(h).toContain('data-view="kit"');
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    const member = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", view: "member", onPress: noop }));
    expect(member.match(/data-flight="plum-kite"/g)).toHaveLength(10);
  });
  it("defaults to the kit view: a caller that forgets `view` draws no flight (defence in depth)", () => {
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", onPress: noop }));
    expect(h).toContain('data-view="kit"');
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
  });
  it("kit view (the anonymous and non-holder board): a paid cell draws in the kit's dark face with the kit-paid glyph, never as an open cell", () => {
    const paid = [cell(1), cell(2, { state: "paid", flight: plum })];
    const kit = html(createElement(Grid, { cells: paid, lineCount: 2, label: "L", view: "kit" }));
    expect(kit).toContain("--face:var(--kit-dark)");
    expect(kit).toContain('data-glyph="kit-paid"');
    expect(kit).not.toContain("data-flight");
    expect(kit).not.toContain(FLIGHT_COLOURS.plum.face);
  });
  it("keeps the bonus row clear of the frame, wired but unframed", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2), cell(3, { state: "paid", bonus: true, flight: yellow })], lineCount: 2, label: "L" }));
    expect(h).toContain('class="mt-6 text-micro font-medium text-[var(--board-text-2)]">Bonus<');
    expect(h).toMatch(/class="board-wire relative mt-1 grid/);
  });
});

describe("BoardLegend: mini cells beside words, spaces between", () => {
  it("member: open, taken, sent, paid, yours; sent drawn as yours, sent; paid in the viewer's colour", () => {
    const h = html(createElement(BoardLegend, { view: "member", flight: yellow, kit: DEFAULT_KIT }));
    expect(h).toContain('aria-label="What the cells mean"');
    expect(h).toContain('data-testid="legend"');
    expect([...h.matchAll(/<\/span>([a-z]+)<\/li>/g)].map((m) => m[1])).toEqual(["open", "taken", "sent", "paid", "yours"]);
    expect(h).toContain(`--face:${FLIGHT_COLOURS.yellow.face}`);
    expect(h).toMatch(/data-state="sent" data-size="xs" data-mine="true"/);
    expect(h).toContain("bc-sent");
    expect(h.match(/width:16px;height:16px/g)).toHaveLength(5);
    expect(h).not.toContain("·");
  });
  it("member with no flight given (no viewer flight at all): a standard flight in the kit's dark colour", () => {
    const h = html(createElement(BoardLegend, { view: "member", flight: null, kit: plumLime }));
    expect(h).toContain('data-flight="plum-standard"');
  });
  it("kit: the legend sits in the host's kit, not the default", () => {
    const h = html(createElement(BoardLegend, { view: "kit", flight: null, kit: plumLime }));
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face};--kit-light:${FLIGHT_COLOURS.lime.face}`);
  });
  it("kit: open, taken, paid; no flight anywhere", () => {
    const h = html(createElement(BoardLegend, { view: "kit", flight: yellow, kit: DEFAULT_KIT }));
    expect([...h.matchAll(/<\/span>([a-z]+)<\/li>/g)].map((m) => m[1])).toEqual(["open", "taken", "paid"]);
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
  });
});

describe("GridPreview: the kit-view thumbnail", () => {
  it("frames the board in the kit, draws line state only, and never a flight", () => {
    const h = html(createElement(GridPreview, { count: 50, cells: fifty, kit: plumLime, heat: 2 }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("thumb-frame");
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face}`);
    expect(h).toContain("opacity:0.13");
    expect(h).toContain('data-size="thumb"');
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    expect(h.match(/class="bc /g)).toHaveLength(50);
    expect(rule(".thumb-frame")).toContain("box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 5px var(--kit-dark), 0 0 0 6px var(--kit-light);");
  });
  it("leaves bonus lines out and needs no cells for an empty board", () => {
    expect(html(createElement(GridPreview, { count: 3, cells: [cell(1), cell(2), cell(3, { bonus: true, state: "paid" })] })).match(/class="bc /g)).toHaveLength(2);
    expect(html(createElement(GridPreview, { count: 12 })).match(/class="bc /g)).toHaveLength(12);
  });
});

describe("KitSwatch: 20 × 10, dark | light, decorative", () => {
  it("splits the kit's two faces and says nothing to a screen reader", () => {
    const h = html(createElement(KitSwatch, { kit: { dark: "plum", light: "lime" } }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("h-[10px] w-5");
    expect(h).toContain(`linear-gradient(90deg, ${FLIGHT_COLOURS.plum.face} 50%, ${FLIGHT_COLOURS.lime.face} 50%)`);
  });
});
