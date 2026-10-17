import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ClaimBar } from "./claim-bar";
import type { Bar } from "./claim-bar-state";

const noop = () => {};
const router = { refresh: noop, push: noop, replace: noop, back: noop, forward: noop, prefetch: noop };
const render = (bar: Bar, status: string, toGo: string | null) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(ClaimBar, { bar, status, toGo, pending: false, count: 1, onCount: noop, onClaim: noop, signInHref: "/login", onStep: noop, onLast: noop, onSent: noop, resultHref: "/b/x/result" })));

describe("ClaimBar: the checkout count and the status pill beside the action (Mosaic §8)", () => {
  it("selection: summary, then \"12 to go\" with the pill, then Claim", () => {
    const h = render({ kind: "selection", summary: "Lines 7, 12, $10", action: "claim", label: "Claim 2 lines", disabled: false, hint: null }, "open", "12 to go");
    expect(h).toContain('data-testid="to-go"');
    expect(h).toMatch(/data-testid="to-go"[^>]*>12 to go</);
    expect(h).toContain(">Open<");
    expect(h).toContain("font-shoulders");
    expect(h.indexOf('data-testid="bar-summary"')).toBeLessThan(h.indexOf('data-testid="bar-meta"'));
    expect(h.indexOf('data-testid="bar-meta"')).toBeLessThan(h.indexOf('data-testid="claim-submit"'));
    expect(h).not.toContain("You hold");
  });
  it("owe and idle carry the count too", () => {
    expect(render({ kind: "owe", summary: "You owe $10 to @jim" }, "open", "12 to go")).toMatch(/data-testid="to-go"[^>]*>12 to go</);
    expect(render({ kind: "idle", note: null, stepper: { max: 5, action: "random" }, lastN: null, hint: null, signIn: false }, "open", "3 to go")).toMatch(/>3 to go</);
  });
  it("once closed: no count, the pill alone beside the message", () => {
    const h = render({ kind: "message", text: "Closed. Every line is paid. Waiting for Jim to run the draw." }, "filled", null);
    expect(h).not.toContain('data-testid="to-go"');
    expect(h).toContain(">Closed<");
  });
});
