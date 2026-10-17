import { describe, it, expect } from "vitest";
import { barCheckout, barShown, claimBar, failureNote, lastLabel, limitText, stepLabel, type BarInput } from "./claim-bar-state";

const base: BarInput = {
  status: "open", signedIn: true, claimMode: "pick_or_random", selected: [], priceCents: 500, openCount: 19,
  allowance: { remaining: 5, reason: "per_person", limit: 5 }, owe: null, justSent: false,
  hostName: "Jim", payee: "@Jim-Roberts-36", closedDaysAgo: null, viewerIsHost: false,
};

describe("claimBar (design §5.4 table)", () => {
  it("signed out with a selection: sign in to claim", () => {
    expect(claimBar({ ...base, signedIn: false, selected: [7, 12] })).toEqual({ kind: "selection", summary: "Lines 7, 12, $10", action: "sign-in", label: "Sign in to claim 2 lines", disabled: false, hint: null });
  });
  it("signed in with a selection: claim", () => {
    expect(claimBar({ ...base, selected: [7] })).toEqual({ kind: "selection", summary: "Line 7, $5", action: "claim", label: "Claim 1 line", disabled: false, hint: null });
  });
  it("guard: a selection over the allowance cannot be claimed and says which cap", () => {
    expect(claimBar({ ...base, selected: [3, 7, 9], allowance: { remaining: 2, reason: "per_person", limit: 5 } })).toEqual({
      kind: "selection", summary: "Lines 3, 7, 9, $15", action: "claim", label: "Claim 3 lines", disabled: true, hint: "You can hold 5 lines in this break.",
    });
    expect(claimBar({ ...base, selected: [2], allowance: { remaining: 0, reason: "host", limit: 0 } })).toMatchObject({
      disabled: true, hint: "Hosts cannot hold lines in a break under 10 lines.",
    });
    expect(claimBar({ ...base, selected: [3, 7], allowance: { remaining: 2, reason: "per_person", limit: 5 } })).toMatchObject({ disabled: false, hint: null });
  });
  it("every line taken but the break still open: say it is waiting on payments, in every mode", () => {
    const full = { kind: "message", text: "Every line is taken. Waiting on payments." };
    expect(claimBar({ ...base, openCount: 0 })).toEqual(full);
    expect(claimBar({ ...base, openCount: 0, claimMode: "pick_only" })).toEqual(full);
    expect(claimBar({ ...base, openCount: 0, claimMode: "straight" })).toEqual(full);
    expect(claimBar({ ...base, openCount: 0, signedIn: false })).toEqual(full);
    expect(claimBar({ ...base, openCount: 0, owe: { cents: 500, numbers: [4] } })).toMatchObject({ kind: "owe" });
  });
  it("nothing selected: pick for me, bounded by open lines and the allowance", () => {
    expect(claimBar(base)).toEqual({ kind: "idle", note: null, stepper: { max: 5, action: "random" }, lastN: null, hint: null, signIn: false });
    expect(claimBar({ ...base, openCount: 2 })).toMatchObject({ stepper: { max: 2 }, lastN: 2 });
  });
  it("take the last N only when 5 or fewer are open and the allowance covers them", () => {
    expect(claimBar({ ...base, openCount: 3 })).toMatchObject({ lastN: 3 });
    expect(claimBar({ ...base, openCount: 3, allowance: { remaining: 2, reason: "per_person", limit: 5 } })).toMatchObject({ lastN: null, stepper: { max: 2 } });
  });
  it("owes for unsent lines", () => {
    expect(claimBar({ ...base, owe: { cents: 1000, numbers: [4, 11] } })).toEqual({ kind: "owe", summary: "You owe $10 to @Jim-Roberts-36" });
    expect(claimBar({ ...base, owe: { cents: 1000, numbers: [4, 11] }, selected: [7] })).toMatchObject({ kind: "selection" });
  });
  it("just sent: the note shows and the claim controls return", () => {
    expect(claimBar({ ...base, justSent: true })).toMatchObject({ kind: "idle", note: "Sent. Jim will tick you off when it arrives.", stepper: { max: 5 }, signIn: false });
  });
  it("limit reached: says which cap", () => {
    expect(claimBar({ ...base, allowance: { remaining: 0, reason: "per_person", limit: 5 } })).toMatchObject({ kind: "idle", stepper: null, hint: "You can hold 5 lines in this break." });
    expect(claimBar({ ...base, allowance: { remaining: 0, reason: "host", limit: 1 } })).toMatchObject({ kind: "idle", stepper: null, hint: "Hosts can hold 1 line in their own break." });
  });
  it("a host of a break under 10 lines may hold none: no stepper and no hint, rather than \"0 lines\"", () => {
    expect(claimBar({ ...base, openCount: 3, allowance: { remaining: 0, reason: "host", limit: 0 } })).toEqual({ kind: "idle", note: null, stepper: null, lastN: null, hint: null, signIn: false });
  });
  it("pick only: no randoms; straight fill: say how many", () => {
    expect(claimBar({ ...base, claimMode: "pick_only" })).toMatchObject({ stepper: null, hint: "Tap the open lines you want." });
    expect(claimBar({ ...base, claimMode: "straight" })).toEqual({ kind: "idle", note: null, stepper: { max: 5, action: "next" }, lastN: null, hint: "Straight fill. Say how many; you get the next open numbers.", signIn: false });
  });
  it("signed out with nothing selected: a hint and a way to sign in (the only way in on straight fill)", () => {
    expect(claimBar({ ...base, signedIn: false })).toEqual({ kind: "idle", note: null, stepper: null, lastN: null, hint: "Tap the open lines you want.", signIn: true });
    expect(claimBar({ ...base, signedIn: false, claimMode: "straight" })).toMatchObject({ hint: "Straight fill. Sign in, then say how many.", signIn: true });
  });
  it("closed, running draw, ran, cancelled, draft", () => {
    expect(claimBar({ ...base, status: "filled" })).toEqual({ kind: "message", text: "Closed. Every line is paid. Waiting for Jim to run the draw." });
    expect(claimBar({ ...base, status: "filled", closedDaysAgo: 3 })).toEqual({ kind: "message", text: "Closed 3 days ago, not drawn yet." });
    expect(claimBar({ ...base, status: "drawing" })).toEqual({ kind: "message", text: "Jim started the draw. The result is in about a minute." });
    expect(claimBar({ ...base, status: "drawn" })).toEqual({ kind: "result" });
    expect(claimBar({ ...base, status: "cancelled" })).toEqual({ kind: "message", text: "Cancelled by Jim. Your refund comes from Jim, not Breaks." });
    expect(claimBar({ ...base, status: "draft" })).toEqual({ kind: "none" });
  });
  it("labels", () => {
    expect(limitText({ remaining: 0, reason: "global", limit: 30 })).toBe("You can have 30 unpaid lines across breaks. Pay for some first.");
    expect(limitText({ remaining: 0, reason: "host", limit: 1 })).toBe("Hosts can hold 1 line in their own break.");
    expect([stepLabel("random", 1), stepLabel("random", 3), stepLabel("next", 1), stepLabel("next", 4)]).toEqual(["Claim 1 random", "Claim 3 random", "Claim the next line", "Claim the next 4"]);
    expect([lastLabel(1), lastLabel(3)]).toEqual(["Take the last line", "Take the last 3"]);
  });
});

describe("failureNote (a refused claim)", () => {
  it("names the cap the server hit, in the bar's words", () => {
    expect(failureNote({ ok: false, code: "CAP_EXCEEDED", message: "Cap exceeded: lines per person", details: { limit: 2, capKind: "per_person" } }))
      .toBe("You can hold 2 lines in this break.");
    expect(failureNote({ ok: false, code: "CAP_EXCEEDED", message: "x", details: { limit: 5, capKind: "host" } })).toBe("Hosts can hold 5 lines in their own break.");
    expect(failureNote({ ok: false, code: "CAP_EXCEEDED", message: "x", details: { limit: 10, capKind: "global" } }))
      .toBe("You can have 10 unpaid lines across breaks. Pay for some first.");
  });
  it("keeps the server's message otherwise", () => {
    expect(failureNote({ ok: false, code: "LINE_TAKEN", message: "Line 7 is taken", details: { taken: [7] } })).toBe("Line 7 is taken");
    expect(failureNote({ ok: false, code: "CAP_EXCEEDED", message: "Bonus cap", details: { limit: 1, capKind: "bonus" } })).toBe("Bonus cap");
    expect(failureNote({ ok: false, code: "CAP_EXCEEDED", message: "No limit sent", details: { capKind: "per_person" } })).toBe("No limit sent");
    expect(failureNote({ ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." })).toBe("Something went wrong. Please try again.");
  });
});

describe("barShown", () => {
  const idle = { kind: "idle", note: null, stepper: null, lastN: null, hint: null, signIn: false } as const;
  it("hides the bar when it has nothing to say", () => {
    expect(barShown({ kind: "none" })).toBe(false);
    expect(barShown(idle)).toBe(false);
  });
  it("shows every other bar", () => {
    expect(barShown({ ...idle, hint: "Tap the open lines you want." })).toBe(true);
    expect(barShown({ ...idle, signIn: true })).toBe(true);
    expect(barShown({ ...idle, lastN: 2 })).toBe(true);
    expect(barShown({ ...idle, stepper: { max: 3, action: "random" } })).toBe(true);
    expect(barShown({ kind: "result" })).toBe(true);
    expect(barShown({ kind: "message", text: "Every line is taken. Waiting on payments." })).toBe(true);
  });
});

describe("the host on their own break", () => {
  it("is told what to do, not about themselves", () => {
    const host = { ...base, viewerIsHost: true };
    expect(claimBar({ ...host, status: "filled" })).toEqual({ kind: "message", text: "Closed. Every line is paid. Run the draw from Host tools." });
    expect(claimBar({ ...host, status: "filled", closedDaysAgo: 4 })).toEqual({ kind: "message", text: "Closed 4 days ago, not drawn yet. Run the draw from Host tools." });
    expect(claimBar({ ...host, status: "drawing" })).toEqual({ kind: "message", text: "You started the draw. The result is in about a minute." });
  });
});

describe("barCheckout (Mosaic §8)", () => {
  it("is \"N to go\" while the break is open, every bar kind included, and nothing after", () => {
    expect(barCheckout({ ...base, openCount: 12 })).toBe("12 to go");
    expect(barCheckout({ ...base, openCount: 0 })).toBe("0 to go");
    for (const status of ["draft", "filled", "drawing", "drawn", "cancelled"] as const) {
      expect(barCheckout({ ...base, status })).toBeNull();
    }
  });
});
