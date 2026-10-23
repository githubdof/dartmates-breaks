import { describe, it, expect } from "vitest";
import { parseComposer } from "./parse";
import { previewText } from "./preview";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  return f;
}
const S1 = "6f1c2a3b-0000-4000-8000-000000000001", S2 = "6f1c2a3b-0000-4000-8000-000000000002";
const S3 = "6f1c2a3b-0000-4000-8000-000000000003", S4 = "6f1c2a3b-0000-4000-8000-000000000004";
const base = { title: "Taylor Chronos", prize1: "Chronos 22g", prize1Slot: S1, prize1Condition: "new_in_box",lineCount: "50", linePrice: "5", venmo: "@Jim-R", intent: "open" };

describe("parseComposer", () => {
  it("fills defaults: 24 hours, no per-person limit, pick or random", () => {
    const r = parseComposer(form({ ...base, paymentWindowHours: "", maxLinesPerUser: "" }));
    expect(r).toMatchObject({ ok: true, open: true, input: { lineCount: 50, linePriceCents: 500, paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_or_random", items: [{ name: "Chronos 22g", slotKey: S1, condition: "new_in_box" }], secondPlace: [] } });
  });
  it("reads choices, 2nd place, cents and the picking mode", () => {
    const r = parseComposer(form({
      ...base, prize1: ["Chronos 22g", " ", "Chronos 24g"], prize1Slot: [S1, S2, S3], prize1Condition: ["new_in_box", "", "used"],
      prize2: "Flight pack", prize2Slot: S4, prize2Condition: "new_opened", linePrice: "5.5", claimMode: "straight", maxLinesPerUser: "3",
    }));
    expect(r).toMatchObject({ ok: true, input: { linePriceCents: 550, claimMode: "straight", maxLinesPerUser: 3, items: [{ name: "Chronos 22g" }, { name: "Chronos 24g" }], secondPlace: [{ name: "Flight pack" }] } });
  });
  it("pairs each prize with its slot and condition, dropping blank rows with theirs", () => {
    const r = parseComposer(form({ ...base, prize1: ["Chronos 22g", " ", "Chronos 24g"], prize1Slot: [S1, S2, S3], prize1Condition: ["new_in_box", "", "used"],
      prize2: "Flight pack", prize2Slot: S4, prize2Condition: "new_opened" }));
    expect(r).toMatchObject({ ok: true, input: {
      items: [{ name: "Chronos 22g", slotKey: S1, condition: "new_in_box" }, { name: "Chronos 24g", slotKey: S3, condition: "used" }],
      secondPlace: [{ name: "Flight pack", slotKey: S4, condition: "new_opened" }] } });
    expect(parseComposer(form({ ...base, prize2: " ", prize2Slot: S4, prize2Condition: "" }))).toMatchObject({ ok: true, input: { secondPlace: [] } });
  });
  it("asks for the condition of every named prize, the top spot included (ruling 21)", () => {
    expect(parseComposer(form({ ...base, prize1Condition: "" }))).toEqual({ ok: false, error: "Chronos 22g: choose its condition" });
    expect(parseComposer(form({ ...base, prize1Condition: "mint" }))).toEqual({ ok: false, error: "Chronos 22g: choose its condition" });
    expect(parseComposer(form({ ...base, prize2: "Flight pack", prize2Slot: S4, prize2Condition: "" }))).toEqual({ ok: false, error: "Flight pack: choose its condition" });
  });
  it("refuses a missing, malformed or repeated slot key", () => {
    const stale = { ok: false, error: "This form is out of date. Reload the page and try again." };
    expect(parseComposer(form({ ...base, prize1Slot: "x" }))).toEqual(stale);
    expect(parseComposer(form({ ...base, prize1: ["A", "B"], prize1Slot: [S1, S1], prize1Condition: ["used", "used"] }))).toEqual(stale);
    expect(parseComposer(form({ ...base, prize1: ["A", "B"], prize1Slot: [S1], prize1Condition: ["used", "used"] }))).toEqual(stale);
    expect(parseComposer(form({ ...base, prize2: "Flight pack", prize2Slot: S1, prize2Condition: "used" }))).toEqual(stale); // repeated across ranks
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
    expect(previewText(50, "0.25")).toBe("50 lines at $0.25 = $12.50");
    expect(previewText(3, ".5")).toBe("3 lines at $0.50 = $1.50");
    expect(previewText(4, "0.01")).toBe("4 lines at $0.01 = $0.04");
  });
});
