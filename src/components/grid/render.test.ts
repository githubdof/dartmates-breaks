import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { LedgerRow } from "@/components/ledger/ledger-row";
import { Cell } from "./cell";
import { Grid } from "./grid";

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el);
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, ...o });

describe("Cell: every state has a shape and a name, not only a colour (design §4)", () => {
  it("open: a card face, a toggle", () => {
    const h = html(createElement(Cell, { cell: cell(1), onPress: noop }));
    expect(h).toContain('aria-label="Line 1, open"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain('data-state="open"');
    expect(h).toContain("bg-card");
  });
  it("selected: pressed, the inset ring and the check", () => {
    const h = html(createElement(Cell, { cell: cell(1), selected: true, onPress: noop }));
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain("inset_0_0_0_3px");
    expect(h).toContain("✓");
  });
  it("taken: the hatch, disabled but focusable, no pressed state", () => {
    const h = html(createElement(Cell, { cell: cell(2, { state: "taken" }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 2, taken"');
    expect(h).toContain('aria-disabled="true"');
    expect(h).not.toContain("aria-pressed");
    expect(h).toContain("bg-hatch");
  });
  it("sent and mine: the dashed edge and the green flag", () => {
    const h = html(createElement(Cell, { cell: cell(3, { state: "sent", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 3, yours, sent"');
    expect(h).toContain("border-dashed");
    expect(h).toContain("border-t-green");
  });
  it("paid and mine: the ink face, a white number and a white flag", () => {
    const h = html(createElement(Cell, { cell: cell(4, { state: "paid", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 4, yours, paid"');
    expect(h).toContain("bg-ink");
    expect(h).toContain("text-card");
    expect(h).toContain("border-t-card");
  });
  it("overdue (host view): the red edge and the ! glyph", () => {
    const h = html(createElement(Cell, { cell: cell(5, { state: "taken", overdue: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 5, taken, overdue"');
    expect(h).toContain("border-red");
    expect(h).toContain(">!<");
  });
  it("bonus: the + mark; a display-only cell is an image", () => {
    const h = html(createElement(Cell, { cell: cell(51, { state: "paid", bonus: true }) }));
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="Line 51, bonus, paid"');
    expect(h).toContain(">+<");
  });
});

describe("Grid: one group, one tab stop, disabled where the viewer cannot pick", () => {
  it("labels the group and keeps one roving tab stop", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2, { state: "taken" }), cell(3)], lineCount: 3, label: "Lines, 2 of 3 open", onPress: noop, focusNumber: 3 }));
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Lines, 2 of 3 open"');
    expect(h.match(/tabindex="0"/g)).toHaveLength(1);
    expect(h).toMatch(/data-cell="3"[^>]*tabindex="0"|tabindex="0"[^>]*data-cell="3"/);
  });
  it("disables unselected open cells at the limit, and every open cell when read-only", () => {
    const atLimit = html(createElement(Grid, { cells: [cell(1), cell(2)], lineCount: 2, label: "L", selected: new Set([1]), disabledOpen: true, onPress: noop }));
    expect(atLimit).toMatch(/aria-label="Line 2, open"[^>]*aria-disabled="true"/);
    expect(atLimit).not.toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
    const readOnly = html(createElement(Grid, { cells: [cell(1)], lineCount: 2, label: "L", readOnly: true, onPress: noop }));
    expect(readOnly).toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
  });
  it("puts bonus lines on their own labelled row", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2), cell(3, { state: "paid", bonus: true })], lineCount: 2, label: "L" }));
    expect(h).toContain("Bonus");
    expect(h.indexOf("Line 3, bonus, paid")).toBeGreaterThan(h.indexOf("Bonus"));
  });
});

describe("LedgerRow: state as a word, the late time in red, one Paid button with a full name", () => {
  const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
    handle: null, displayName: null, paymentName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
  });
  const props = (r: LedgerRowView, o: Record<string, unknown> = {}) => ({
    row: r, actionable: true, recentlyPaid: false, pending: false, expanded: false, bonusUsed: 0, bonusMax: 1,
    onToggle: noop, onPaid: noop, onUndo: noop, onMarkLine: noop, onUnmarkLine: noop, onRelease: noop, onBonus: noop, ...o,
  });
  const alice = row({ ownerId: "a", handle: "alice", displayName: "Alice", paymentName: "Alice Smith", numbers: [2], unpaid: [2], overdue: [2], owedCents: 500, status: "overdue", lateText: "4 h late" });

  it("an overdue buyer", () => {
    const h = html(createElement(LedgerRow, props(alice)));
    expect(h).toContain('data-status="overdue"');
    expect(h).toContain(">Overdue<");
    expect(h).toContain("4 h late");
    expect(h).toContain("text-red");
    expect(h).toContain("pays as Alice Smith");
    expect(h).toContain('aria-label="Mark Alice paid, $5"');
  });
  it("just marked paid: Undo instead of Paid", () => {
    const h = html(createElement(LedgerRow, props(alice, { recentlyPaid: true })));
    expect(h).toContain('data-testid="ledger-undo"');
    expect(h).not.toContain('data-testid="ledger-paid"');
  });
  it("a paid buyer has no button, and nothing to do once the draw has started", () => {
    const paid = row({ ownerId: "b", handle: "bob", numbers: [7], paid: [7], status: "paid" });
    expect(html(createElement(LedgerRow, props(paid)))).not.toContain('data-testid="ledger-paid"');
    expect(html(createElement(LedgerRow, props(alice, { actionable: false })))).not.toContain('data-testid="ledger-paid"');
  });
  it("without onToggle the name is plain text and the row does not expand; a title names the break", () => {
    const h = html(createElement(LedgerRow, props(alice, { onToggle: undefined, title: "Chronos break" })));
    expect(h).not.toContain("aria-expanded");
    expect(h).toContain("Chronos break");
    expect(h).toContain("Alice");
    expect(html(createElement(LedgerRow, props(alice)))).toContain("aria-expanded");
  });
});
