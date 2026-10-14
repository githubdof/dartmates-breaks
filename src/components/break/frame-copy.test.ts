import { describe, it, expect } from "vitest";
import { closesText, leftText, orList, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "./frame-copy";

describe("frame copy", () => {
  it("counts and deadlines read as sentences, no middle dots", () => {
    expect(leftText(19, 50)).toBe("19 of 50 left");
    expect(payWithinText(24)).toBe("Pay within 24 hours.");
    expect(payWithinText(1)).toBe("Pay within 1 hour.");
  });
  it("names the viewer's lines", () => {
    expect(youHaveText([])).toBeNull();
    expect(youHaveText([4])).toBe("You have line 4.");
    expect(youHaveText([4, 11, 27])).toBe("You have 4, 11 and 27.");
  });
  it("uses the interim trust line until the reputation plan lands", () => {
    const since = new Date("2026-10-01T12:00:00Z");
    expect(trustText({ breaksRun: 0, since })).toBe("new host");
    expect(trustText({ breaksRun: 4, since })).toBe("new host");
    expect(trustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026");
  });
  it("describes prizes, choices and 2nd place", () => {
    const items = [{ id: "a", name: "Chronos 22g" }, { id: "b", name: "Chronos 24g" }, { id: "c", name: "Flight pack" }];
    expect(prizeLines([{ rank: 1, itemId: "a" }], items)).toEqual(["Top spot gets Chronos 22g."]);
    expect(prizeLines([{ rank: 1, itemId: "a" }, { rank: 1, itemId: "b" }, { rank: 2, itemId: "c" }], items))
      .toEqual(["Top spot gets a choice: Chronos 22g or Chronos 24g.", "2nd place gets Flight pack."]);
    expect(orList(["a", "b", "c"])).toBe("a, b or c");
  });
  it("states the rules", () => {
    expect(pickingText("pick_or_random")).toBe("Pick your lines or take random ones.");
    expect(pickingText("pick_only")).toBe("Pick your lines. No randoms.");
    expect(pickingText("straight")).toBe("Straight fill. Lines go out in order.");
    expect(perPersonText(null)).toBe("No limit per person.");
    expect(perPersonText(1)).toBe("Up to 1 line per person.");
    expect(perPersonText(5)).toBe("Up to 5 lines per person.");
    expect(closesText("Jim")).toBe("When every line is paid, the break closes and Jim runs the draw.");
  });
});
