import { describe, it, expect } from "vitest";
import { toFailure } from "./action-result";
import { CapExceeded, LineTaken, NotOpen } from "@/domain/errors";

describe("toFailure", () => {
  it("carries the taken numbers and says what to do", () => {
    expect(toFailure(new LineTaken([7]))).toEqual({ ok: false, code: "LINE_TAKEN", message: "Line 7 was just taken. Pick another.", details: { taken: [7] } });
  });
  it("names several taken lines", () => {
    expect(toFailure(new LineTaken([4, 7, 12])).message).toBe("Lines 4, 7 and 12 were just taken. Pick others.");
    expect(toFailure(new LineTaken([])).message).toBe("Those lines were just taken. Pick others.");
  });
  it("carries the cap limit and which cap bit", () => {
    expect(toFailure(new CapExceeded("lines per person", 5))).toEqual({ ok: false, code: "CAP_EXCEEDED", message: "You can hold 5 lines in this break.", details: { limit: 5, capKind: "per_person" } });
    expect(toFailure(new CapExceeded("host-held lines", 1)).message).toBe("Hosts can hold 1 line in their own break.");
    expect(toFailure(new CapExceeded("open unpaid claims", 30))).toMatchObject({ message: "You can have 30 unpaid lines across breaks. Pay for some first.", details: { capKind: "global" } });
    expect(toFailure(new CapExceeded("bonus lines", 5))).toMatchObject({ message: "This break has used all 5 bonus lines.", details: { capKind: "bonus" } });
  });
  it("has no details for other domain errors, and never shows an internal status word", () => {
    expect(toFailure(new NotOpen("filled"))).toEqual({ ok: false, code: "NOT_OPEN", message: "This break is closed. Every line is taken and paid." });
    expect(toFailure(new NotOpen("drawing")).message).toBe("The draw is running. The result is in about a minute.");
    expect(toFailure(new NotOpen("draft")).message).toBe("This break isn't open yet.");
  });
  it("keeps a message a command rewrote after construction", () => {
    const e = new LineTaken([]);
    e.message = "Only 2 lines are open.";
    expect(toFailure(e)).toEqual({ ok: false, code: "LINE_TAKEN", message: "Only 2 lines are open.", details: { taken: [] } });
  });
});
