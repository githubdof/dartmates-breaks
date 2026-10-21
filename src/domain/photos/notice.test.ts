import { describe, it, expect } from "vitest";
import { noticeFor, placeWords } from "./notice";
import type { PhotoChange } from "./types";

const TOP = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const CHRONOS = "33333333-3333-4333-8333-333333333333";
const PHANTOM = "44444444-4444-4444-8444-444444444444";
const single = placeWords([{ slotKey: TOP, rank: 1, itemName: "Taylor Chronos 24g" }, { slotKey: SECOND, rank: 2, itemName: "Case" }]);
const choice = placeWords([
  { slotKey: CHRONOS, rank: 1, itemName: "Chronos 24g" }, { slotKey: PHANTOM, rank: 1, itemName: "Phantom 24g" },
  { slotKey: SECOND, rank: 2, itemName: "Case" },
]);
const n = (changes: PhotoChange[], placeOf = single) => noticeFor(changes, placeOf);

describe("placeWords", () => {
  it("names a single prize by its place and an 'or' alternative by its item (ruling 3)", () => {
    expect(single(TOP)).toBe("Top spot");
    expect(single(SECOND)).toBe("2nd place");
    expect(choice(CHRONOS)).toBe("Chronos 24g");
    expect(choice(PHANTOM)).toBe("Phantom 24g");
    expect(choice(SECOND)).toBe("2nd place");
  });
});

describe("noticeFor", () => {
  it("is null when nothing counts: an add, a reorder that keeps the lead, no change", () => {
    expect(n([])).toBeNull();
    expect(n([{ kind: "added" }])).toBeNull();
    expect(n([{ kind: "reordered" }])).toBeNull();
    expect(n([{ kind: "added" }, { kind: "reordered" }])).toBeNull();
  });
  it("names the removed photo's place", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: false }])).toBe("Top-spot photo removed");
    expect(n([{ kind: "removed", slot: SECOND, wasLead: false }])).toBe("2nd-place photo removed");
    expect(n([{ kind: "removed", slot: null, wasLead: false }])).toBe("Photo removed");
    expect(n([{ kind: "removed", slot: PHANTOM, wasLead: false }], choice)).toBe("Phantom 24g photo removed");
  });
  it("removing the last photo reads as its removal, not a replaced lead (ruling 1)", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: true }])).toBe("Top-spot photo removed");
    expect(n([{ kind: "removed", slot: null, wasLead: true }])).toBe("Photo removed");
  });
  it("removing the lead when another photo takes position 0 reads as a replaced lead (ruling 1)", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: true }, { kind: "lead" }])).toBe("Lead photo replaced");
  });
  it("a reorder that changes position 0 is one lead change, however many photos moved (ruling 2)", () => {
    expect(n([{ kind: "lead" }])).toBe("Lead photo replaced");
    expect(n([{ kind: "lead" }, { kind: "lead" }])).toBe("Lead photo replaced");
  });
  it("a retag away from a prize counts; tagging an untagged photo and a same-slot retag do not", () => {
    expect(n([{ kind: "retagged", from: TOP, to: SECOND }])).toBe("A photo moved from Top spot to 2nd place");
    expect(n([{ kind: "retagged", from: CHRONOS, to: PHANTOM }], choice)).toBe("A photo moved from Chronos 24g to Phantom 24g");
    expect(n([{ kind: "retagged", from: TOP, to: null }])).toBe("Top-spot photo untagged");
    expect(n([{ kind: "retagged", from: null, to: TOP }])).toBeNull();
    expect(n([{ kind: "retagged", from: TOP, to: TOP }])).toBeNull();
  });
  it("two or more counting changes of different kinds in one action read 'Photos changed' (ruling 2)", () => {
    expect(n([{ kind: "removed", slot: SECOND, wasLead: false }, { kind: "retagged", from: TOP, to: SECOND }])).toBe("Photos changed");
    expect(n([{ kind: "lead" }, { kind: "retagged", from: TOP, to: null }])).toBe("Photos changed");
    // Non-counting changes never turn one sentence into "Photos changed".
    expect(n([{ kind: "added" }, { kind: "removed", slot: SECOND, wasLead: false }])).toBe("2nd-place photo removed");
  });
});
