import { describe, it, expect } from "vitest";
import { toCaller, shouldPromote } from "./session";

describe("shouldPromote", () => {
  const confirmed = "2026-10-13T00:00:00Z";
  it("promotes a confirmed, listed email, ignoring case and whitespace", () => {
    expect(shouldPromote("Boss@Example.com", confirmed, " a@x.com , boss@example.com ")).toBe(true);
  });
  it("never promotes an unconfirmed email", () => {
    expect(shouldPromote("boss@example.com", null, "boss@example.com")).toBe(false);
    expect(shouldPromote("boss@example.com", undefined, "boss@example.com")).toBe(false);
  });
  it("does not promote unlisted emails or an empty list", () => {
    expect(shouldPromote("other@example.com", confirmed, "boss@example.com")).toBe(false);
    expect(shouldPromote("boss@example.com", confirmed, "")).toBe(false);
  });
});

describe("toCaller", () => {
  it("is onboarded only with handle, display name and age confirmation", () => {
    const base = { id: "u", role: "member", handle: "h", displayName: "d", ageConfirmedAt: new Date(), bannedAt: null };
    expect(toCaller(base as any).onboarded).toBe(true);
    expect(toCaller({ ...base, handle: null } as any).onboarded).toBe(false);
    expect(toCaller({ ...base, bannedAt: new Date() } as any).banned).toBe(true);
  });
});
