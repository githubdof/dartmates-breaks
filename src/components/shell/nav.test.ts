import { describe, it, expect } from "vitest";
import { navItems, showHeaderNav, showTabBar, signInHref } from "./nav";

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

describe("showHeaderNav", () => {
  it("shows the header nav only with two or more destinations", () => {
    expect(showHeaderNav("host")).toBe(true);
    expect(showHeaderNav("admin")).toBe(true);
    expect(showHeaderNav("member")).toBe(false);
    expect(showHeaderNav(null)).toBe(false);
  });
});

describe("signInHref", () => {
  it("comes back to the page Sign in was tapped on", () => {
    expect(signInHref("/b/123/result")).toBe("/login?next=%2Fb%2F123%2Fresult");
    expect(signInHref("/legal/draw")).toBe("/login?next=%2Flegal%2Fdraw");
  });
  it("needs no next from home or the login page itself", () => {
    expect(signInHref("/")).toBe("/login");
    expect(signInHref(null)).toBe("/login");
    expect(signInHref("/login")).toBe("/login");
  });
});
