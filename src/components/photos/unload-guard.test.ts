import { expect, it, vi } from "vitest";
import { guardUnload } from "./unload-guard";

const target = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() });

it("adds one beforeunload handler while uploads are in flight, and the cleanup removes that same handler", () => {
  const t = target();
  const stop = guardUnload(t, true);
  expect(t.addEventListener).toHaveBeenCalledTimes(1);
  const [type, handler] = t.addEventListener.mock.calls[0];
  expect(type).toBe("beforeunload");
  const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
  handler(e);
  expect(e.preventDefault).toHaveBeenCalledTimes(1);
  expect(e.returnValue).toBe("");
  stop();
  expect(t.removeEventListener).toHaveBeenCalledWith("beforeunload", handler);
});
it("adds nothing when nothing is in flight", () => {
  const t = target();
  guardUnload(t, false)();
  expect(t.addEventListener).not.toHaveBeenCalled();
  expect(t.removeEventListener).not.toHaveBeenCalled();
});
