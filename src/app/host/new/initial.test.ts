import { describe, it, expect } from "vitest";
import { composerBreakId, draftComposerInitial, newComposerInitial } from "./initial";

const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-00000000000${++n}`; };
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const draft = {
  id: "b1", hostId: "h1", status: "draft", title: "Chronos", description: "Mint", lineCount: 30, linePriceCents: 125000,
  paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const,
  paymentInstructions: "Venmo @Jim. Leave the note blank.",
  topSpot: [{ slotKey: "s1", name: "22g", condition: "new_in_box" as const }, { slotKey: "s2", name: "24g", condition: null }],
  secondPlace: [{ slotKey: "s3", name: "Flights", condition: "used" as const }],
};

describe("composer initial values", () => {
  it("starts a new break from the host's last one, or from the defaults", () => {
    expect(newComposerInitial(null, {}, ids())).toEqual({
      breakId: null, newBreakId: id(1), title: "", description: "", lineCount: 50, price: "5", paymentWindowHours: "", maxLinesPerUser: "",
      claimMode: "pick_or_random", paymentInstructions: "", venmo: "", paypal: "",
      prize1: [{ slotKey: id(2), name: "", condition: "" }], prize2: null,
    });
    expect(newComposerInitial(
      { lineCount: 20, linePriceCents: 550, paymentWindowHours: 12, maxLinesPerUser: 3, claimMode: "straight", paymentInstructions: "Zelle only." },
      { venmo: "@Jim", paypal: "JimR" }, ids(),
    )).toMatchObject({ lineCount: 20, price: "5.50", paymentWindowHours: "12", maxLinesPerUser: "3", claimMode: "straight", paymentInstructions: "Zelle only.", venmo: "@Jim", paypal: "JimR" });
  });
  it("fills the form from a draft, dropping instructions that were built from handles", () => {
    expect(draftComposerInitial(draft, { venmo: "@Jim" }, ids())).toEqual({
      breakId: "b1", newBreakId: null, title: "Chronos", description: "Mint", lineCount: 30, price: "1250", paymentWindowHours: "24", maxLinesPerUser: "",
      claimMode: "pick_only", paymentInstructions: "", venmo: "@Jim", paypal: "",
      prize1: [{ slotKey: "s1", name: "22g", condition: "new_in_box" }, { slotKey: "s2", name: "24g", condition: "" }],
      prize2: { slotKey: "s3", name: "Flights", condition: "used" },
    });
    expect(draftComposerInitial({ ...draft, topSpot: [], secondPlace: [], paymentInstructions: "Zelle only." }, {}, ids()))
      .toMatchObject({ prize1: [{ slotKey: id(1), name: "", condition: "" }], prize2: null, paymentInstructions: "Zelle only." });
  });
  it("keeps every 2nd-place name a draft holds in the one 2nd-place row, under the first one's slot and condition", () => {
    const d = { ...draft, secondPlace: [{ slotKey: "s3", name: "Flights", condition: "used" as const }, { slotKey: "s4", name: "Darts case", condition: "new_opened" as const }] };
    expect(draftComposerInitial(d, {}, ids()).prize2).toEqual({ slotKey: "s3", name: "Flights, Darts case", condition: "used" });
  });
  it("the composer's id is the new break's id, else the draft's (ruling 22)", () => {
    expect(composerBreakId(newComposerInitial(null, {}, ids()))).toBe(id(1));
    expect(composerBreakId(draftComposerInitial(draft, {}, ids()))).toBe(draft.id);
  });
});
