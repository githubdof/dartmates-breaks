import { describe, it, expect } from "vitest";
import { FEED_CHIPS, feedHref, parseFeedParams, SORT_LABELS } from "./params";

describe("feed params", () => {
  it("reads the sort and the host, falling back to newest and no host", () => {
    expect(parseFeedParams({})).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ sort: "almost", host: "Jim_R" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: "almost", host: "@jim_r" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: ["almost", "newest"], host: ["ann", "bob"] })).toEqual({ sort: "almost", host: "ann" });
    expect(parseFeedParams({ sort: "closing", host: "x" })).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ host: "<script>" })).toEqual({ sort: "newest", host: null });
  });
  it("sends a link to the retired Filling fast sort to Newest, keeping the host", () => {
    expect(parseFeedParams({ sort: "filling", host: "jim_r" })).toEqual({ sort: "newest", host: "jim_r" });
  });
  it("offers two chips, Newest and Closest to full", () => {
    expect(FEED_CHIPS.map((s) => SORT_LABELS[s])).toEqual(["Newest", "Closest to full"]);
  });
  it("writes the shortest URL for a choice", () => {
    expect(feedHref({ sort: "newest", host: null })).toBe("/breaks");
    expect(feedHref({ sort: "almost", host: null })).toBe("/breaks?sort=almost");
    expect(feedHref({ sort: "newest", host: "jim_r" })).toBe("/breaks?host=jim_r");
    expect(feedHref({ sort: "almost", host: "jim_r" })).toBe("/breaks?sort=almost&host=jim_r");
  });
});
