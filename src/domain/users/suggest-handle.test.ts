import { it, expect } from "vitest";
import { fromClaim, suggestHandle } from "./suggest-handle";
import { normalizeHandle } from "./commands";

it("derives a valid handle from the email", () => {
  expect(suggestHandle("Jim.Roberts+darts@example.com")).toBe("jim_roberts_darts");
  expect(suggestHandle("admin@example.com")).toBe("admin_1");
  expect(suggestHandle("jo@example.com")).toBe("jo_");
  expect(suggestHandle("@example.com")).toBe("user");
  expect(suggestHandle("averyveryverylongemailname@example.com")).toHaveLength(20);
  for (const e of ["Jim.Roberts+darts@example.com", "admin@example.com", "jo@example.com", "émile@example.com", "__@x.y"]) {
    expect(() => normalizeHandle(suggestHandle(e))).not.toThrow();
  }
});

it("knows when onboarding came from a claim", () => {
  expect(fromClaim("/b/123?pick=4,7")).toBe(true);
  expect(fromClaim("/b/123")).toBe(false);
  expect(fromClaim("/")).toBe(false);
});
