import { describe, it, expect } from "vitest";
import { countText, landedSlide, neighbours, plateButtonName, positionText, viewerCaption } from "./viewer-model";

describe("viewer model", () => {
  it("position, caption, neighbours, count and the plate's name", () => {
    expect(positionText(1, 5)).toBe("Photo 2 of 5");
    expect(viewerCaption("Top spot: Taylor Chronos 24g", 1, 5)).toBe("Top spot: Taylor Chronos 24g. Photo 2 of 5.");
    expect(viewerCaption(null, 0, 1)).toBe("Photo 1 of 1.");
    expect(neighbours(0, 5)).toEqual({ prev: null, next: 1 });
    expect(neighbours(2, 5)).toEqual({ prev: 1, next: 3 });
    expect(neighbours(4, 5)).toEqual({ prev: 3, next: null });
    expect(neighbours(0, 1)).toEqual({ prev: null, next: null });
    expect(countText(1)).toBe("1 photo"); expect(countText(5)).toBe("5 photos");
    expect(plateButtonName(5, false)).toBe("5 photos of the prizes");
    expect(plateButtonName(5, true)).toBe("Updated, 5 photos of the prizes");
  });
  it("the slide a scroll landed on is the nearest whole slide, kept inside the strip (I1)", () => {
    expect(landedSlide(0, 390, 3)).toBe(0);
    expect(landedSlide(390, 390, 3)).toBe(1);
    expect(landedSlide(150, 390, 3)).toBe(0);  // a swipe back that interrupted a scroll to slide 1
    expect(landedSlide(250, 390, 3)).toBe(1);
    expect(landedSlide(779.5, 390, 3)).toBe(2); // sub-pixel scroll positions
    expect(landedSlide(5000, 390, 3)).toBe(2);
    expect(landedSlide(-20, 390, 3)).toBe(0);   // overscroll
    expect(landedSlide(100, 0, 3)).toBeNull();  // not laid out: nothing to report
    expect(landedSlide(0, 390, 0)).toBeNull();
  });
});
