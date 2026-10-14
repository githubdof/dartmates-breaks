import { it, expect } from "vitest";
import { commitmentShort, giveBackPrompt, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";

it("writes the pay block", () => {
  expect(payHeadline(1000, "@Jim-Roberts-36")).toBe("Send $10 to @Jim-Roberts-36");
  // The sheet renders "Pay by " + <LocalTime> (the viewer's own time) + " " + releaseText(host).
  expect(releaseText("Jim")).toBe("or Jim can release your lines.");
  expect(SENT_HINT).toBe("No need to comment Sent on Facebook.");
  expect(commitmentShort("ab".repeat(32))).toBe("abababababab");
  expect(commitmentShort(null)).toBeNull();
});

it("confirms giving lines back by naming them", () => {
  expect(giveBackPrompt([4])).toEqual({ text: "Give back line 4? It goes back on the board.", confirm: "Give back 1 line" });
  expect(giveBackPrompt([4, 11])).toEqual({ text: "Give back lines 4 and 11? They go back on the board.", confirm: "Give back 2 lines" });
});

it("offers random lines in place of taken ones", () => {
  expect(retryRandomLabel(1)).toBe("Take a random open line instead");
  expect(retryRandomLabel(2)).toBe("Take 2 random open lines instead");
});
