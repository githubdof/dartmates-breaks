import { describe, it, expect } from "vitest";
import { parseAccount, parseFlight, parseKit } from "./parse";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

describe("parseAccount", () => {
  it("trims both names and allows a blank payment name", () => {
    expect(parseAccount(form({ displayName: "  Pat ", paymentName: " " }))).toEqual({ ok: true, input: { displayName: "Pat", paymentName: "" } });
    expect(parseAccount(form({ displayName: "Pat", paymentName: "Patricia Lee" }))).toEqual({ ok: true, input: { displayName: "Pat", paymentName: "Patricia Lee" } });
  });
  it("names the field in every error", () => {
    expect(parseAccount(form({ displayName: " ", paymentName: "" }))).toEqual({ ok: false, error: "Display name: at least 1 character" });
    expect(parseAccount(form({ displayName: "x".repeat(41), paymentName: "" }))).toEqual({ ok: false, error: "Display name: at most 40 characters" });
    expect(parseAccount(form({ displayName: "Pat", paymentName: "x".repeat(61) }))).toEqual({ ok: false, error: "Payment name: at most 60 characters" });
    expect(parseAccount(form({}))).toEqual({ ok: false, error: "Display name: at least 1 character" });
  });
});

describe("parseFlight", () => {
  it("reads one of the 32 flights from the picker's single radio group", () => {
    expect(parseFlight(form({ flight: "blue-kite" }))).toEqual({ ok: true, input: { colour: "blue", shape: "kite" } });
    expect(parseFlight(form({ flight: "pink-standard" }))).toEqual({ ok: true, input: { colour: "pink", shape: "standard" } });
  });
  it("refuses anything else with one message", () => {
    for (const flight of ["red-kite", "blue-dart", "blue", "blue-kite-slim", ""]) {
      expect(parseFlight(form({ flight })), flight).toEqual({ ok: false, error: "Choose one of the 32 flights" });
    }
    expect(parseFlight(form({}))).toEqual({ ok: false, error: "Choose one of the 32 flights" });
  });
});

describe("parseKit", () => {
  it("reads one dark and one light colour", () => {
    expect(parseKit(form({ kitDark: "plum", kitLight: "sky" }))).toEqual({ ok: true, input: { dark: "plum", light: "sky" } });
  });
  it("refuses swapped tiers, unknown colours and a missing half", () => {
    const error = { ok: false, error: "Choose a dark colour and a light colour for your kit" };
    expect(parseKit(form({ kitDark: "sky", kitLight: "plum" }))).toEqual(error);
    expect(parseKit(form({ kitDark: "red", kitLight: "sky" }))).toEqual(error);
    expect(parseKit(form({ kitDark: "plum" }))).toEqual(error);
  });
});
