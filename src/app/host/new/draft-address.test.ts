import { afterEach, describe, it, expect, vi } from "vitest";
import { editAddress, moveToEditAddress } from "./draft-address";

afterEach(() => { vi.unstubAllGlobals(); });

describe("moveToEditAddress", () => {
  it("moves the composer to the draft's edit address without a navigation, letting Next keep its history state", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { history: { state: { __NA: true }, replaceState }, location: { pathname: "/host/new" } });
    moveToEditAddress("6f1c2a3b-0000-4000-8000-000000000001");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/host/6f1c2a3b-0000-4000-8000-000000000001/edit");
    expect(editAddress("abc")).toBe("/host/abc/edit");
  });
  it("does nothing when the composer is already at that address", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { history: { state: null, replaceState }, location: { pathname: "/host/abc/edit" } });
    moveToEditAddress("abc");
    expect(replaceState).not.toHaveBeenCalled();
  });
});
