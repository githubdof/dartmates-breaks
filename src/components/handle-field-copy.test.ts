import { describe, it, expect } from "vitest";
import { handleNote, looksLikeHandle, toCheck } from "./handle-field-copy";

describe("handle field copy", () => {
  it("checks only handle-shaped values", () => {
    expect(looksLikeHandle("jim_r")).toBe(true);
    expect(looksLikeHandle("ｊｉｍ＿ｒ")).toBe(true);
    expect(looksLikeHandle("ab")).toBe(false);
    expect(looksLikeHandle("has space")).toBe(false);
  });
  it("reads the endpoint's answers", () => {
    expect(toCheck(200, { state: "free" })).toEqual({ state: "free" });
    expect(toCheck(200, { state: "taken" })).toEqual({ state: "taken" });
    expect(toCheck(200, { state: "invalid", message: "That handle is reserved" })).toEqual({ state: "invalid", message: "That handle is reserved" });
    expect(toCheck(429, { state: "limited" })).toEqual({ state: "limited" });
    expect(toCheck(401, { state: "signed-out" })).toEqual({ state: "unknown" });
    expect(toCheck(200, {})).toEqual({ state: "unknown" });
  });
  it("says what it found, with red only for a problem", () => {
    expect(handleNote({ state: "free" }, "jim_r")).toEqual({ text: "@jim_r is free.", tone: "quiet" });
    expect(handleNote({ state: "taken" }, "jim_r")).toEqual({ text: "That handle is taken. Try another.", tone: "bad" });
    expect(handleNote({ state: "invalid", message: "That handle is reserved" }, "admin")).toEqual({ text: "That handle is reserved.", tone: "bad" });
    expect(handleNote({ state: "limited" }, "jim_r")).toEqual({ text: "We'll check this handle when you continue.", tone: "quiet" });
    expect(handleNote({ state: "unknown" }, "jim_r")).toEqual({ text: "Couldn't check right now. We'll check when you continue.", tone: "quiet" });
    expect(handleNote({ state: "checking" }, "jim_r")).toEqual({ text: "Checking.", tone: "quiet" });
    expect(handleNote({ state: "idle" }, "")).toEqual({ text: "", tone: "quiet" });
  });
});
