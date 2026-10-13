import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/ok")).toBe("/ok");
    expect(safeNext("/ok?x=1")).toBe("/ok?x=1");
  });
  it.each([
    ["//a"],
    ["/\\a"],
    ["/\t/a"],
    ["/\n/a"],
    ["/\r/a"],
    ["/\x7f/a"],
    ["http://a"],
    ["javascript:alert(1)"],
    [""],
  ])("falls back to / for %j", (v) => {
    expect(safeNext(v)).toBe("/");
  });
  it("falls back to / for non-strings", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(42)).toBe("/");
    expect(safeNext(["/a"])).toBe("/");
  });
  it("never yields a foreign origin for encoded slashes", () => {
    const out = safeNext("/%2F/a");
    expect(new URL(out, "http://x").origin).toBe("http://x");
  });
});
