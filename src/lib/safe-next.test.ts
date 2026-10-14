import { describe, it, expect } from "vitest";
import { afterSignIn, safeNext, signedInTarget } from "./safe-next";

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

describe("after sign-in", () => {
  it("lands a member on the feed when there is no safe next", () => {
    expect(afterSignIn(undefined)).toBe("/breaks");
    expect(afterSignIn("/")).toBe("/breaks");
    expect(afterSignIn("//evil.com")).toBe("/breaks");
    expect(afterSignIn("https://evil.com/x")).toBe("/breaks");
    expect(afterSignIn("/h/jim")).toBe("/h/jim");
  });
  it("sends an unfinished account to onboarding first, keeping next and its ?pick=", () => {
    expect(signedInTarget(false, "/b/x?pick=1,2")).toBe("/onboarding?next=%2Fb%2Fx%3Fpick%3D1%2C2");
    expect(signedInTarget(false, undefined)).toBe("/onboarding?next=%2Fbreaks");
    expect(signedInTarget(true, "/b/x?pick=1,2")).toBe("/b/x?pick=1,2");
    expect(signedInTarget(true, "/")).toBe("/breaks");
  });
});
