import { describe, it, expect, vi } from "vitest";
import { markSeenOnce } from "./notice-seen-logic";

describe("markSeenOnce", () => {
  it("calls once for an unseen notice, and only once per break per page view", async () => {
    const call = vi.fn().mockResolvedValue(undefined); const fired = new Set<string>();
    await markSeenOnce("b1", true, call, fired); await markSeenOnce("b1", true, call, fired);
    expect(call).toHaveBeenCalledTimes(1); expect(call).toHaveBeenCalledWith("b1");
    await markSeenOnce("b2", true, call, fired);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("never calls when there is nothing unseen", async () => {
    const call = vi.fn(); await markSeenOnce("b1", false, call, new Set());
    expect(call).not.toHaveBeenCalled();
  });
  it("a rejected call is swallowed", async () => {
    const call = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(markSeenOnce("b1", true, call, new Set())).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledTimes(1);
  });
});
