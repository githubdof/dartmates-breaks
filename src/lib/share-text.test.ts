import { it, expect } from "vitest";
import { pageShare, shareText } from "./share-text";

const url = "https://breaks.example/b/1";

it("writes state-specific share text (design §6)", () => {
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 19, url })).toBe(`Taylor Chronos break. 50 lines at $5. Pick yours: ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 3, url })).toBe(`Only 3 spots left. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 1, url })).toBe(`Only 1 spot left. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 0, url })).toBe(`Every spot is taken. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "closed", title: "Taylor Chronos", url })).toBe(`CLOSED. Taylor Chronos. Draw tonight. ${url}`);
  expect(shareText({ state: "running", title: "Taylor Chronos", url })).toBe(`CLOSED. Taylor Chronos. Draw running now. ${url}`);
  expect(shareText({ state: "ran", topLine: 7, topHandle: "mike", url: `${url}/result` })).toBe(`CLOSED n RAN. Top spot: line 7, @mike. Check the draw: ${url}/result`);
  expect(shareText({ state: "ran", topLine: 7, topHandle: null, url })).toBe(`CLOSED n RAN. Top spot: line 7. Check the draw: ${url}`);
});

it("picks the share text by break state, and hides Share where there is nothing to share", () => {
  const src = { title: "Taylor Chronos", url, lineCount: 50, priceCents: 500, openCount: 19, top: null };
  expect(pageShare({ ...src, status: "open" })).toBe(`Taylor Chronos break. 50 lines at $5. Pick yours: ${url}`);
  expect(pageShare({ ...src, status: "filled" })).toBe(`CLOSED. Taylor Chronos. Draw tonight. ${url}`);
  expect(pageShare({ ...src, status: "drawing" })).toBe(`CLOSED. Taylor Chronos. Draw running now. ${url}`);
  expect(pageShare({ ...src, status: "drawn", top: { line: 7, handle: "mike" } })).toBe(`CLOSED n RAN. Top spot: line 7, @mike. Check the draw: ${url}/result`);
  expect(pageShare({ ...src, status: "drawn" })).toBeNull();
  expect(pageShare({ ...src, status: "draft" })).toBeNull();
  expect(pageShare({ ...src, status: "cancelled" })).toBeNull();
});
