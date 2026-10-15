import { afterEach, describe, it, expect, vi } from "vitest";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "./network-note";

afterEach(() => vi.unstubAllGlobals());

describe("canRefresh", () => {
  it("refreshes unless the browser says it is offline", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(canRefresh()).toBe(true);
    vi.stubGlobal("navigator", { onLine: false });
    expect(canRefresh()).toBe(false);
    vi.stubGlobal("navigator", {});
    expect(canRefresh()).toBe(true);
  });
  it("words the two notes differently: only the online one promises a refreshed board", () => {
    expect(NETWORK_NOTE).toBe("Couldn't reach Breaks. Check your connection; the board is refreshed.");
    expect(OFFLINE_NOTE).toBe("You're offline. Check your connection, then try again.");
  });
});
