import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FLIGHT_COLOURS, LAMP } from "@/domain/flights";
import { KitThumb } from "./kit-thumb";
import { kitThumbCells, thumbFillers } from "./kit-thumb-model";

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
  const h = renderToStaticMarkup(createElement(KitThumb, { cells, kit: { dark: "petrol", light: "orange" }, heat: 2, size: 96 }));
  it("wears the host's kit and the lamp at the break's step, and is decorative", () => {
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.petrol.face}`);
    expect(h).toContain(`--kit-light:${FLIGHT_COLOURS.orange.face}`);
    expect(h).toContain(LAMP[2]);
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('data-testid="thumb"');
  });
  it("draws the kit view only: no flight, no holder, the place on the won cell", () => {
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    expect(h).toContain('data-tone="won" data-place="1"');
    expect(h.match(/data-tone="/g)).toHaveLength(3);
  });
});
