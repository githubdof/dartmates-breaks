import { describe, it, expect } from "vitest";
import { navItems, showTabBar } from "./nav";

describe("navItems", () => {
  it("shows Host only to hosts and admins", () => {
    expect(navItems(null).map((i) => i.label)).toEqual(["Browse"]);
    expect(navItems("member").map((i) => i.label)).toEqual(["Browse"]);
    expect(navItems("host").map((i) => i.label)).toEqual(["Browse", "Host"]);
    expect(navItems("admin").map((i) => i.label)).toEqual(["Browse", "Host"]);
  });
  it("marks the active destination", () => {
    const [browse, host] = navItems("host");
    expect(browse.match("/")).toBe(true);
    expect(browse.match("/host")).toBe(false);
    expect(host.match("/host/new")).toBe(true);
  });
});

describe("showTabBar", () => {
  it("hides on break pages so there is one bar at the bottom", () => {
    expect(showTabBar("/b/123", "host")).toBe(false);
    expect(showTabBar("/b/123/result", "host")).toBe(false);
    expect(showTabBar("/", "host")).toBe(true);
    expect(showTabBar("/host/new", "admin")).toBe(true);
  });
  it("hides a one-item bar (members and signed-out viewers only have Browse in Plan A)", () => {
    expect(showTabBar("/", "member")).toBe(false);
    expect(showTabBar("/", null)).toBe(false);
  });
});
