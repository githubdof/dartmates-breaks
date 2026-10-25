import { describe, it, expect } from "vitest";
import { closesText, hostedByText, hostLabel, mediaText, orList, pastText, payWithinText, perPersonText, pickingText, hostRecordLines, hostRecordText, stallText, smallLineText, toGoText, trustText, youHaveText } from "./frame-copy";

describe("frame copy", () => {
  it("counts and deadlines read as sentences, no middle dots", () => {
    expect(payWithinText(24)).toBe("Pay within 24 hours.");
    expect(payWithinText(1)).toBe("Pay within 1 hour.");
  });
  it("names the viewer's lines as a sentence: \"4 and 11\", \"4, 11 and 27\", no serial comma, no dots", () => {
    expect(youHaveText([])).toBeNull();
    expect(youHaveText([4])).toBe("You have line 4.");
    expect(youHaveText([4, 11])).toBe("You have 4 and 11.");
    expect(youHaveText([4, 11, 27])).toBe("You have 4, 11 and 27.");
  });
  it("counts down as \"N to go\" and names the break by size and price (Mosaic §8, §9)", () => {
    expect(toGoText(12)).toBe("12 to go");
    expect(toGoText(1)).toBe("1 to go");
    expect(toGoText(0)).toBe("0 to go");
    expect(mediaText(50, 500)).toBe("50 lines, $5 a line");
    expect(mediaText(12, 1250)).toBe("12 lines, $12.50 a line");
  });
  it("uses the interim trust line until the reputation plan lands", () => {
    const since = new Date("2026-10-01T12:00:00Z");
    expect(trustText({ breaksRun: 0, since })).toBe("New host");
    expect(trustText({ breaksRun: 4, since })).toBe("New host");
    expect(trustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026");
    expect(hostedByText("@jim", "New host")).toBe("Hosted by @jim. New host.");
    expect(hostRecordText({ breaksRun: 0, drawsVerified: 0, since })).toBe("No breaks run yet.");
    expect(hostRecordText({ breaksRun: 1, drawsVerified: 1, since })).toBe("1 break run since Oct 2026. 1 draw verified.");
    expect(hostRecordText({ breaksRun: 41, drawsVerified: 40, since })).toBe("41 breaks run since Oct 2026. 40 draws verified.");
    expect(hostRecordText({ breaksRun: 2, drawsVerified: 0, since })).toBe("2 breaks run since Oct 2026. 0 draws verified.");
    expect(stallText(3)).toBe("Closed 3 days ago, not drawn yet.");
    const now = new Date("2026-10-14T12:00:00Z");
    // The record is never only good news: a Closed break waiting 3 days or more adds the stall line under it.
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: new Date("2026-10-10T11:00:00Z") }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified.", "Closed 4 days ago, not drawn yet."]);
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: new Date("2026-10-12T12:00:00Z") }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified."]);
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: null }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified."]);
    expect(pastText(0)).toBe("No past breaks yet.");
    expect(pastText(1)).toBe("1 past break.");
    expect(pastText(7)).toBe("7 past breaks.");
  });
  it("joins alternatives with or", () => {
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
  it("names the host one way everywhere", () => {
    expect(hostLabel({ displayName: "Jim", handle: "jim" })).toBe("Jim");
    expect(hostLabel({ displayName: null, handle: "jim" })).toBe("@jim");
    expect(hostLabel({ displayName: null, handle: null })).toBe("the host");
  });
  it("shows the pay window only while the break is open", () => {
    expect(smallLineText("open", 24, "@jim", "New host")).toBe("Pay within 24 hours. Hosted by @jim. New host.");
    for (const s of ["draft", "filled", "drawing", "drawn", "cancelled"]) {
      expect(smallLineText(s, 24, "@jim", "New host")).toBe("Hosted by @jim. New host.");
    }
  });
});
