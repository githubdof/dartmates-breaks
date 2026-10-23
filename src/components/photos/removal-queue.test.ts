import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { removalQueue, timers, UNDO_MS, type Schedule } from "./removal-queue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("schedules exactly 8 seconds", () => {
  const schedule = vi.fn<Schedule>(() => () => {});
  removalQueue(vi.fn(), schedule).remove("a");
  expect(UNDO_MS).toBe(8000);
  expect(schedule).toHaveBeenCalledWith(expect.any(Function), 8000);
});
it("the timer firing commits once", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  vi.advanceTimersByTime(7999);
  expect(commit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(commit.mock.calls).toEqual([["a"]]);
  expect(q.pending()).toBeNull();
  vi.advanceTimersByTime(60_000);
  q.flush();
  expect(commit).toHaveBeenCalledTimes(1);
});
it("a second removal commits the first at once, then waits its own 8 seconds; the first never commits again", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  vi.advanceTimersByTime(3000);
  q.remove("b");
  expect(commit.mock.calls).toEqual([["a"]]);
  expect(q.pending()).toBe("b");
  vi.advanceTimersByTime(8000);
  expect(commit.mock.calls).toEqual([["a"], ["b"]]);
  vi.advanceTimersByTime(8000);
  expect(commit).toHaveBeenCalledTimes(2);
});
it("unmount (flush) commits the pending removal once and cancels its timer", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  q.flush();
  q.flush();
  vi.advanceTimersByTime(8000);
  expect(commit.mock.calls).toEqual([["a"]]);
});
it("undo returns the item, commits nothing and cancels the timer", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  expect(q.undo()).toBe("a");
  vi.advanceTimersByTime(8000);
  q.flush();
  expect(commit).not.toHaveBeenCalled();
  expect(q.undo()).toBeNull();
});
