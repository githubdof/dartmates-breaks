import { describe, it, expect } from "vitest";
import { parseAccount } from "./parse";

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
