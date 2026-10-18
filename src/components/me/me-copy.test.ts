import { describe, it, expect } from "vitest";
import type { MyAward } from "@/domain/lines/queries";
import { howToPayLabel, stateLine, unpaidNote } from "./me-copy";

const base = { status: "open", unsent: [] as number[], sent: [] as number[], awards: [] as MyAward[] };
const award = (a: Partial<MyAward> & { rank: number }): MyAward => ({ itemName: null, choice: false, pickedAt: null, shippedAt: null, ...a });

describe("stateLine", () => {
  it("says where the viewer's lines stand, a win first", () => {
    expect(stateLine({ ...base, unsent: [5], sent: [3] }, "Jim")).toBe("Unpaid.");
    expect(stateLine({ ...base, sent: [3] }, "Jim")).toBe("Sent. Jim will tick you off when it arrives.");
    expect(stateLine(base, "Jim")).toBe("Paid.");
    expect(stateLine({ ...base, awards: [award({ rank: 1, choice: true })] }, "Jim")).toBe("Won. Tell Jim your choice.");
    expect(stateLine({ ...base, awards: [award({ rank: 1, itemName: "Chronos 22g" })] }, "Jim")).toBe("Won Chronos 22g.");
    expect(stateLine({ ...base, awards: [award({ rank: 2, itemName: "Flight pack" })] }, "Jim")).toBe("Won 2nd place: Flight pack.");
    expect(stateLine({ ...base, awards: [award({ rank: 1 })] }, "Jim")).toBe("Won the top spot.");
    expect(stateLine({ ...base, awards: [award({ rank: 2 })] }, "Jim")).toBe("Won 2nd place.");
    expect(stateLine({ ...base, awards: [award({ rank: 1, itemName: "Chronos 22g", shippedAt: new Date() })] }, "Jim")).toBe("Shipped.");
  });
  it("says Won, not a choice request, once the choice is answered", () => {
    expect(stateLine({ ...base, awards: [award({ rank: 1, itemName: "Chronos 22g", choice: true, pickedAt: new Date() })] }, "Jim")).toBe("Won Chronos 22g.");
  });
  it("asks for a pending choice before anything else, and otherwise describes the best award only", () => {
    const top = award({ rank: 1, itemName: "Chronos 22g" });
    expect(stateLine({ ...base, awards: [top, award({ rank: 2, choice: true })] }, "Jim")).toBe("Won. Tell Jim your choice.");
    expect(stateLine({ ...base, awards: [top, award({ rank: 2, itemName: "Flight pack" })] }, "Jim")).toBe("Won Chronos 22g.");
  });
  it("says Shipped only when every award has shipped", () => {
    const at = new Date();
    expect(stateLine({ ...base, awards: [award({ rank: 1, itemName: "A", shippedAt: at }), award({ rank: 2, itemName: "B", shippedAt: at })] }, "Jim")).toBe("Shipped.");
    expect(stateLine({ ...base, awards: [award({ rank: 1, itemName: "A", shippedAt: at }), award({ rank: 2, itemName: "B" })] }, "Jim")).toBe("Won A.");
  });
  it("says a cancelled break is cancelled, never that its lines are unpaid", () => {
    expect(stateLine({ ...base, status: "cancelled", unsent: [5] }, "Jim")).toBe("Cancelled.");
  });
  it("names the host on the pay button", () => {
    expect(howToPayLabel("Jim")).toBe("How to pay Jim");
  });
});

describe("unpaidNote", () => {
  it("says which lines are not marked paid and who to ask", () => {
    expect(unpaidNote([5], "Jim")).toBe("Line 5 is not marked paid. Ask Jim about it.");
    expect(unpaidNote([5, 6], "Jim")).toBe("Lines 5 and 6 are not marked paid. Ask Jim about them.");
    expect(unpaidNote([4, 5, 6], "@jim")).toBe("Lines 4, 5 and 6 are not marked paid. Ask @jim about them.");
  });
});
