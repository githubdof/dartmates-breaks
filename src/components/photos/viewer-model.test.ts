import { describe, it, expect } from "vitest";
import { countText, neighbours, plateButtonName, positionText, viewerCaption } from "./viewer-model";

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
    expect(plateButtonName(5, false)).toBe("Prize photos, 5");
    expect(plateButtonName(5, true)).toBe("Prize photos, 5, updated");
  });
});
