import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FLIGHT_COLOURS } from "@/domain/flights";
import { ComposerForm } from "./form";
import { draftComposerInitial, newComposerInitial } from "./initial";

// The server actions are never called by a static render; stub them so the form's imports pull in no database.
vi.mock("./actions", () => ({ saveBreak: async () => null }));
vi.mock("../actions", () => ({ deleteDraftAction: vi.fn() }));

const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-00000000000${++n}`; };
const PLUM_LIME = { dark: "plum", light: "lime" } as const;
const S1 = "6f1c2a3b-0000-4000-8000-0000000000a1", S2 = "6f1c2a3b-0000-4000-8000-0000000000a2", S3 = "6f1c2a3b-0000-4000-8000-0000000000a3";
const draft = {
  id: "6f1c2a3b-0000-4000-8000-000000000001", hostId: "h1", status: "draft", title: "Chronos", description: "", lineCount: 30, linePriceCents: 500,
  paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const, paymentInstructions: "",
  topSpot: [{ slotKey: S1, name: "22g", condition: "new_in_box" as const }], secondPlace: [] as { slotKey: string; name: string; condition: "new_in_box" | "new_opened" | "used" | null }[],
};

describe("the composer's board preview (recorded ruling 32)", () => {
  it("wears the host's kit, so the host previews the board in the kit it opens in", () => {
    const h = renderToStaticMarkup(createElement(ComposerForm, { initial: newComposerInitial(null, {}, ids()), maxLines: 100, kit: PLUM_LIME }));
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face}`);
    expect(h).toContain(`--kit-light:${FLIGHT_COLOURS.lime.face}`);
    expect(h).not.toContain(FLIGHT_COLOURS.blue.face);
  });
});

describe("the composer's prize rows", () => {
  it("posts the new break's id, a hidden slot per prize row and a required condition select", () => {
    const h = renderToStaticMarkup(createElement(ComposerForm, { initial: newComposerInitial(null, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
    expect(h).toContain('name="newBreakId" value="00000000-0000-4000-8000-000000000001"');
    expect(h).toContain('name="prize1Slot" value="00000000-0000-4000-8000-000000000002"');
    expect(h).toMatch(/<select[^>]*name="prize1Condition"[^>]*required/);
    expect(h).toMatch(/<option value=""( selected="")?>Condition<\/option><option value="new_in_box">New in box<\/option><option value="new_opened">New, opened<\/option><option value="used">Used<\/option>/);
    expect(h).not.toContain('name="breakId"');
    expect(h).not.toContain('data-testid="delete-draft"'); // a new break has nothing to delete
  });
  it("the draft editor posts the draft's id, keeps each prize's slot and condition, and requires a condition on every named row", () => {
    const d = { ...draft, topSpot: [{ slotKey: S1, name: "22g", condition: "used" as const }, { slotKey: S3, name: "24g", condition: null }],
      secondPlace: [{ slotKey: S2, name: "Flights", condition: "new_opened" as const }] };
    const h = renderToStaticMarkup(createElement(ComposerForm, { initial: draftComposerInitial(d, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
    expect(h).toContain(`name="breakId" value="${d.id}"`);
    expect(h).not.toContain('name="newBreakId"');
    expect(h).toContain(`name="prize1Slot" value="${S1}"`);
    expect(h).toContain(`name="prize1Slot" value="${S3}"`);
    expect(h).toContain(`name="prize2Slot" value="${S2}"`);
    expect(h).toMatch(/<option value="used" selected="">Used<\/option>/);
    expect(h.match(/<select[^>]*name="prize1Condition"[^>]*required/g)).toHaveLength(2); // both rows are named
    expect(h).toMatch(/<select[^>]*name="prize2Condition"[^>]*required/);
    expect(h).toContain('data-testid="delete-draft"');
  });
});
