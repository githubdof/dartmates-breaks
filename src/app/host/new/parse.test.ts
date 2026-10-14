import { describe, it, expect } from "vitest";
import { parseComposer } from "./parse";
import { previewText } from "./preview";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  return f;
}
const base = { title: "Taylor Chronos", prize1: "Chronos 22g", lineCount: "50", linePrice: "5", venmo: "@Jim-R", intent: "open" };

describe("parseComposer", () => {
  it("fills defaults: 24 hours, no per-person limit, pick or random", () => {
    const r = parseComposer(form({ ...base, paymentWindowHours: "", maxLinesPerUser: "" }));
    expect(r).toMatchObject({ ok: true, open: true, input: { lineCount: 50, linePriceCents: 500, paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_or_random", items: [{ name: "Chronos 22g" }], secondPlace: [] } });
  });
  it("reads choices, 2nd place, cents and the picking mode", () => {
    const r = parseComposer(form({ ...base, prize1: ["Chronos 22g", " ", "Chronos 24g"], prize2: "Flight pack", linePrice: "5.5", claimMode: "straight", maxLinesPerUser: "3" }));
    expect(r).toMatchObject({ ok: true, input: { linePriceCents: 550, claimMode: "straight", maxLinesPerUser: 3, items: [{ name: "Chronos 22g" }, { name: "Chronos 24g" }], secondPlace: [{ name: "Flight pack" }] } });
  });
  it("reads a price typed with a dollar sign or a thousands comma", () => {
    expect(parseComposer(form({ ...base, linePrice: "$5" }))).toMatchObject({ ok: true, input: { linePriceCents: 500 } });
    expect(parseComposer(form({ ...base, linePrice: "1,000" }))).toMatchObject({ ok: true, input: { linePriceCents: 100000 } });
  });
  it("always passes the handles so a host can clear them", () => {
    const r = parseComposer(form({ ...base, venmo: "", paypal: "", intent: "draft" }));
    expect(r).toMatchObject({ ok: true, open: false, input: { paymentHandles: { venmo: "", paypal: "" } } });
  });
  it("names the field in every error", () => {
    expect(parseComposer(form({ ...base, title: " " }))).toEqual({ ok: false, error: "Add a title" });
    expect(parseComposer(form({ ...base, linePrice: "0" }))).toEqual({ ok: false, error: "Price per line: more than $0" });
    expect(parseComposer(form({ ...base, linePrice: "0.001" }))).toEqual({ ok: false, error: "Price per line: at least $0.01" });
    expect(parseComposer(form({ ...base, linePrice: "" }))).toEqual({ ok: false, error: "Price per line: enter an amount" });
    expect(parseComposer(form({ ...base, lineCount: "51" }))).toEqual({ ok: false, error: "Lines: at most 50" });
    expect(parseComposer(form({ ...base, lineCount: "1" }))).toEqual({ ok: false, error: "Lines: at least 2" });
    expect(parseComposer(form({ ...base, claimMode: "bogus" }))).toEqual({ ok: false, error: "Choose how buyers get lines" });
    expect(parseComposer(form({ ...base, prize1: "" }))).toEqual({ ok: false, error: "Top spot: name the prize" });
    expect(parseComposer(form({ ...base, venmo: "", paypal: "", paymentInstructions: "" }))).toEqual({ ok: false, error: "Add a Venmo or PayPal handle, or payment instructions, before opening" });
  });
});

describe("previewText", () => {
  it("multiplies lines by price", () => {
    expect(previewText(50, "5")).toBe("50 lines at $5 = $250");
    expect(previewText(12, "20.5")).toBe("12 lines at $20.50 = $246");
    expect(previewText(12, "")).toBe("");
  });
});
