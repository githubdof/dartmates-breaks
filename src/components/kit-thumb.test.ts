import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FLIGHT_COLOURS, LAMP } from "@/domain/flights";
import { kitVars } from "@/components/grid/grid";
import { lampLayer } from "@/components/grid/lamp";
import { KitThumb } from "./kit-thumb";
import { discPercent, kitThumbCells, ringWidth, thumbFillers } from "./kit-thumb-model";

describe("kitThumbCells", () => {
  it("keeps line state only: sent folds into taken, bonus lines drop unless placed, a placed line is won", () => {
    expect(kitThumbCells([
      { number: 1, state: "open", bonus: false },
      { number: 2, state: "sent", bonus: false },
      { number: 3, state: "paid", bonus: false },
      { number: 4, state: "reserved", bonus: false },
      { number: 5, state: "paid", bonus: true },
      { number: 6, state: "paid", bonus: true },
    ], [{ number: 3, place: 1 }, { number: 6, place: 2 }])).toEqual([
      { number: 1, tone: "open", place: null },
      { number: 2, tone: "taken", place: null },
      { number: 3, tone: "won", place: 1 },
      { number: 4, tone: "reserved", place: null },
      { number: 6, tone: "won", place: 2 },
    ]);
  });
  it("takes each place from placesOf (Task 6), and leaves every other line without one", () => {
    const cells = [1, 2, 3, 4].map((number) => ({ number, state: "paid" as const, bonus: false }));
    expect(kitThumbCells(cells, [{ number: 4, place: 1 }, { number: 3, place: 2 }, { number: 2, place: 3 }]).map((c) => c.place)).toEqual([null, 3, 2, 1]);
    // A place with no prize is skipped by placesOf, so a 3rd place with no 2nd stays 3rd.
    expect(kitThumbCells(cells, [{ number: 4, place: 1 }, { number: 2, place: 3 }]).map((c) => c.place)).toEqual([null, 3, null, 1]);
  });
  it("scales the place ring at 0.05 of the cell, floored at 3 px for the double ring and 1 px for the single ones", () => {
    // Spec 6: 0.05 x the cell. A feed cell is about 11 px, so the raw ring would be 0.55 px. The double ring needs 3 px
    // to draw two bands at all (a 2 px CSS double renders solid); the single and dashed rings keep a 1 px hairline.
    expect(ringWidth(1, 11)).toBe(3);
    expect(ringWidth(2, 11)).toBe(1);
    expect(ringWidth(3, 11)).toBe(1);
    expect(ringWidth(1, 40)).toBe(3);
    expect(ringWidth(1, 100)).toBe(5);
    expect(ringWidth(2, 100)).toBe(5);
  });
  it("widens the place disc to 64 % below 16 px cells, so a cream centre survives the 3 px double ring", () => {
    // Feed card (96 px / 8 = 12 px cells) and landing hero (112 / 8 = 14): at 48 % the disc is 5.8 or 6.7 px, which
    // two 3 px ring bands fill entirely (measured in the Task 20 e2e). At 64 % the centre is 1.7 or 3 px.
    expect(discPercent(12)).toBe(64);
    expect(discPercent(15.9)).toBe(64);
    expect(discPercent(16)).toBe(48);
    expect(discPercent(40)).toBe(48);
    for (const cell of [12, 14]) expect(cell * discPercent(cell) / 100 - 2 * ringWidth(1, cell)).toBeGreaterThanOrEqual(1);
  });
  it("completes the last row with empty slots", () => {
    expect(thumbFillers(50, 8)).toBe(6);
    expect(thumbFillers(16, 4)).toBe(0);
    expect(thumbFillers(5, 3)).toBe(1);
  });
});

describe("KitThumb", () => {
  const cells = kitThumbCells([
    { number: 1, state: "open", bonus: false },
    { number: 2, state: "taken", bonus: false },
    { number: 3, state: "paid", bonus: false },
  ], [{ number: 3, place: 1 }]);
  const kit = { dark: "petrol", light: "orange" } as const;
  const h = renderToStaticMarkup(createElement(KitThumb, { cells, kit, heat: 2, size: 96 }));
  it("takes the kit from kitVars, with no literal kit colours on its cells, and is decorative", () => {
    const vars = kitVars(kit) as Record<string, string>;
    expect(vars["--kit-dark"]).toBe(FLIGHT_COLOURS.petrol.face);
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.petrol.face}`);
    expect(h).toContain(`--kit-light:${FLIGHT_COLOURS.orange.face}`);
    // The hex appears once, in the custom property; every face reads var(--kit-*).
    expect(h.split(FLIGHT_COLOURS.petrol.face)).toHaveLength(2);
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('data-testid="thumb"');
  });
  it("uses the board's frame class and its lamp as an opacity layer at the step", () => {
    expect(h).toContain("thumb-frame");
    expect(h).toContain("board-lamp thumb-lamp");
    const lamp = lampLayer(2);
    expect(lamp.opacity).toBe(0.13);
    expect(h).toContain(`opacity:${lamp.opacity}`);
    // The step is not baked into the gradient's alpha.
    expect(h).not.toContain(LAMP[2]);
  });
  it("draws the kit view only: no flight, no holder, the place on the won cell", () => {
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    expect(h).toContain('data-tone="won" data-place="1"');
    expect(h.match(/data-tone="/g)).toHaveLength(3);
  });
  it("draws the taken band, the double top-spot ring and the wall-2 filler slots without wire", () => {
    // 3 cells on 2 columns: one filler slot, in --board-wall-2, with no steel shadow of its own (spec 5: not wire).
    expect(h.match(/data-slot/g)).toHaveLength(thumbFillers(3, 2));
    expect(h).toMatch(/data-slot[^>]*background:var\(--board-wall-2\)/);
    expect(h).not.toMatch(/data-slot[^>]*box-shadow/);
    // Taken: a kit-light band with an ink keyline.
    expect(h).toContain("background:var(--kit-light)");
    expect(h).toContain("border-top:1px solid var(--board-ink)");
    // The top spot's ring: double red; a 48 px cell gives 2.4 px, floored to 3 px.
    expect(h).toContain("3px double var(--red)");
    const g = renderToStaticMarkup(createElement(KitThumb, {
      cells: kitThumbCells([1, 2, 3].map((number) => ({ number, state: "paid" as const, bonus: false })), [{ number: 2, place: 2 }, { number: 3, place: 3 }]),
      kit, heat: 0, size: 96,
    }));
    expect(g).toContain("2.4px solid var(--green)");
    expect(g).toContain("2.4px dashed var(--green)");
  });
});
