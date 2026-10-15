import { describe, it, expect } from "vitest";
import { feedHref, parseFeedParams } from "./params";

describe("feed params", () => {
  it("reads the sort and the host, falling back to newest and no host", () => {
    expect(parseFeedParams({})).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ sort: "filling", host: "Jim_R" })).toEqual({ sort: "filling", host: "jim_r" });
    expect(parseFeedParams({ sort: "almost", host: "@jim_r" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: ["almost", "filling"], host: ["ann", "bob"] })).toEqual({ sort: "almost", host: "ann" });
    expect(parseFeedParams({ sort: "closing", host: "x" })).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ host: "<script>" })).toEqual({ sort: "newest", host: null });
  });
  it("writes the shortest URL for a choice", () => {
    expect(feedHref({ sort: "newest", host: null })).toBe("/breaks");
    expect(feedHref({ sort: "filling", host: null })).toBe("/breaks?sort=filling");
    expect(feedHref({ sort: "newest", host: "jim_r" })).toBe("/breaks?host=jim_r");
    expect(feedHref({ sort: "almost", host: "jim_r" })).toBe("/breaks?sort=almost&host=jim_r");
  });
});
