import { it, expect } from "vitest";
import { bonusGoesWith, commitmentShort, nextPendingOwe, owedAfterClaim, giveBackPrompt, lateReleaseText, payeeFor, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";

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

it("adds the lines just got to what was already owed, and shows nothing when none were got", () => {
  const base = { numbers: [7], cents: 500, payByIso: "2026-10-14T01:00:00Z", payByFallback: "9 pm", late: true };
  expect(nextPendingOwe(base, [3, 12], 500)).toEqual({ numbers: [3, 7, 12], cents: 1500, payByIso: "2026-10-14T01:00:00Z", payByFallback: "9 pm", late: true });
  expect(nextPendingOwe(null, [4], 500)).toEqual({ numbers: [4], cents: 500, payByIso: null, payByFallback: null, late: false });
  expect(nextPendingOwe(base, [], 500)).toBeNull();
});

it("words a missed deadline and names who to pay", () => {
  // The sheet renders "Payment was due " + <LocalTime> + ". " + lateReleaseText(host).
  expect(lateReleaseText("Jim")).toBe("Jim can release your lines now.");
  expect(payeeFor({ venmo: "@Jim-R", paypal: "JimR" }, "Jim")).toBe("@Jim-R");
  expect(payeeFor({ paypal: "JimR" }, "Jim")).toBe("paypal.me/JimR");
  expect(payeeFor({}, "Jim")).toBe("Jim");
});

it("names the bonus lines a give-back takes with it (recorded ruling 6)", () => {
  expect(bonusGoesWith([{ number: 5, bonus: false }, { number: 51, bonus: true }], [5])).toEqual([51]);
  expect(bonusGoesWith([{ number: 3, bonus: false }, { number: 5, bonus: false }, { number: 51, bonus: true }], [5])).toEqual([]);
  expect(bonusGoesWith([{ number: 5, bonus: false }], [5])).toEqual([]);
  expect(giveBackPrompt([5], [51]).text).toBe("Give back line 5? It goes back on the board. Your bonus line 51 goes too.");
  expect(giveBackPrompt([4, 5], [51, 52]).text).toBe("Give back lines 4 and 5? They go back on the board. Your bonus lines 51 and 52 go too.");
  expect(giveBackPrompt([4])).toEqual({ text: "Give back line 4? It goes back on the board.", confirm: "Give back 1 line" });
  const base = { numbers: [5], cents: 500, payByIso: null, payByFallback: null, late: false, bonusLost: [51] };
  expect(nextPendingOwe(base, [6], 500)?.bonusLost).toEqual([51]);
});

it("says what is owed after a claim without counting a line twice, whichever lands first (§7 Claim commits)", () => {
  // Answer first: the owe shown does not hold the new lines yet.
  expect(owedAfterClaim({ numbers: [2], cents: 500 }, [4, 11], 500)).toBe(1500);
  // Props first: the refreshed owe already holds them.
  expect(owedAfterClaim({ numbers: [2, 4, 11], cents: 1500 }, [4, 11], 500)).toBe(1500);
  expect(owedAfterClaim(null, [4], 500)).toBe(500);
  expect(owedAfterClaim(null, [], 500)).toBe(0);
});
