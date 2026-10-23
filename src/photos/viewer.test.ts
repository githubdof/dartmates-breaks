import { describe, it, expect } from "vitest";
import type { Caller } from "@/domain/types";
import { photoAudience, photoViewer } from "./viewer";

const ctx = { hostId: "h", holderIds: new Set(["u1"]) };

describe("photoViewer", () => {
  it("anonymous is null; host, holder, admin and others are told apart", () => {
    expect(photoViewer(null, ctx)).toBeNull();
    expect(photoViewer({ id: "h", role: "host" } as Caller, ctx)).toEqual({ id: "h", isHost: true, isHolder: false, isAdmin: false });
    expect(photoViewer({ id: "u1", role: "member" } as Caller, ctx)).toEqual({ id: "u1", isHost: false, isHolder: true, isAdmin: false });
    expect(photoViewer({ id: "a", role: "admin" } as Caller, ctx)).toEqual({ id: "a", isHost: false, isHolder: false, isAdmin: true });
  });
  it("photoAudience: host wins over holder; anonymous and others are 'other'", () => {
    expect(photoAudience(null)).toBe("other");
    expect(photoAudience({ id: "h", isHost: true, isHolder: true, isAdmin: false })).toBe("host");
    expect(photoAudience({ id: "u1", isHost: false, isHolder: true, isAdmin: false })).toBe("holder");
    expect(photoAudience({ id: "a", isHost: false, isHolder: false, isAdmin: true })).toBe("other");
  });
});
