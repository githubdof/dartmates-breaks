import { describe, it, expect } from "vitest";
import { toCaller } from "./session";

describe("toCaller", () => {
  it("is onboarded only with handle, display name and age confirmation", () => {
    const base = { id: "u", role: "member", handle: "h", displayName: "d", ageConfirmedAt: new Date(), bannedAt: null };
    expect(toCaller(base as any).onboarded).toBe(true);
    expect(toCaller({ ...base, handle: null } as any).onboarded).toBe(false);
    expect(toCaller({ ...base, bannedAt: new Date() } as any).banned).toBe(true);
  });
});
