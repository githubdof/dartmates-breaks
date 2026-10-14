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

it("shapes awkward addresses into a valid handle", () => {
  expect(suggestHandle("Ünïcode.Name+tag@x.com")).toBe("unicode_name_tag");
  expect(suggestHandle("a@x.com")).toBe("a__");
  expect(suggestHandle("___@x.com")).toBe("user");
  expect(suggestHandle("admin@x.com")).toBe("admin_1");
  expect(suggestHandle("a-very-long-local-part-indeed@x.com")).toBe("a_very_long_local_pa");
  expect(suggestHandle("")).toBe("user");
  for (const email of ["Ünïcode.Name+tag@x.com", "a@x.com", "admin@x.com", "a-very-long-local-part-indeed@x.com"]) {
    expect(() => normalizeHandle(suggestHandle(email))).not.toThrow();
  }
});
