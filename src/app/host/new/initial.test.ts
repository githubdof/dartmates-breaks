import { describe, it, expect } from "vitest";
import { draftComposerInitial, newComposerInitial } from "./initial";

describe("composer initial values", () => {
  it("starts a new break from the host's last one, or from the defaults", () => {
    expect(newComposerInitial(null, {})).toEqual({
      breakId: null, title: "", description: "", lineCount: 50, price: "5", paymentWindowHours: "", maxLinesPerUser: "",
      claimMode: "pick_or_random", paymentInstructions: "", venmo: "", paypal: "", prize1: [""], prize2: "",
    });
    expect(newComposerInitial(
      { lineCount: 20, linePriceCents: 550, paymentWindowHours: 12, maxLinesPerUser: 3, claimMode: "straight", paymentInstructions: "Zelle only." },
      { venmo: "@Jim", paypal: "JimR" },
    )).toMatchObject({ lineCount: 20, price: "5.50", paymentWindowHours: "12", maxLinesPerUser: "3", claimMode: "straight", paymentInstructions: "Zelle only.", venmo: "@Jim", paypal: "JimR" });
  });
  it("fills the form from a draft, dropping instructions that were built from handles", () => {
    const d = {
      id: "b1", hostId: "h1", status: "draft", title: "Chronos", description: "Mint", lineCount: 30, linePriceCents: 125000,
      paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const,
      paymentInstructions: "Venmo @Jim. Leave the note blank.", topSpot: ["22g", "24g"], secondPlace: ["Flights"],
    };
    expect(draftComposerInitial(d, { venmo: "@Jim" })).toEqual({
      breakId: "b1", title: "Chronos", description: "Mint", lineCount: 30, price: "1250", paymentWindowHours: "24", maxLinesPerUser: "",
      claimMode: "pick_only", paymentInstructions: "", venmo: "@Jim", paypal: "", prize1: ["22g", "24g"], prize2: "Flights",
    });
    expect(draftComposerInitial({ ...d, topSpot: [], secondPlace: [], paymentInstructions: "Zelle only." }, {}))
      .toMatchObject({ prize1: [""], prize2: "", paymentInstructions: "Zelle only." });
  });
  it("keeps every 2nd-place name a draft holds in the one 2nd-place field", () => {
    const d = {
      id: "b1", hostId: "h1", status: "draft", title: "Chronos", description: "", lineCount: 30, linePriceCents: 500,
      paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const,
      paymentInstructions: "", topSpot: ["22g"], secondPlace: ["Flights", "Darts case"],
    };
    expect(draftComposerInitial(d, {}).prize2).toBe("Flights, Darts case");
  });
});
