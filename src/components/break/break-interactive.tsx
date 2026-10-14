"use client";
import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest } from "@/app/b/[id]/actions";
import { Grid } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { SegmentedControl } from "@/components/segmented-control";
import { clampStep } from "@/components/stepper-math";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import { PaySheet } from "./pay-sheet";
import { nextPendingOwe } from "./pay-copy";
import { barShown, claimBar, failureNote, limitText, sentNote } from "./claim-bar-state";
import { cellNote, isRepeat, isSelectable, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
import { useAutoRefresh } from "./use-auto-refresh";
import { usePaySheet, type Owe } from "./use-pay-sheet";
import { useClaim, type ClaimData } from "./use-claim";

export type { Owe } from "./use-pay-sheet";

export type BreakInteractiveProps = {
  breakId: string;
  status: BreakStatus;
  claimMode: ClaimMode;
  priceCents: number;
  lineCount: number;
  title: string;
  shareUrl: string;
  /** "Pay within 24 hours. Hosted by @jim, new host." It shares one row with the Grid | List toggle (pixel budget). */
  smallLine: string;
  /** The host's profile (/h/handle): the whole small line links there (design §5.4). Null when the host has no handle. */
  hostHref: string | null;
  cells: GridCell[];
  counts: GridCounts;
  signedIn: boolean;
  allowance: Allowance;
  owe: Owe | null;
  hostName: string;
  payee: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  commitment: string | null;
  closedDaysAgo: number | null;
  /** The viewer is this break's host (an admin is not). */
  viewerIsHost: boolean;
  initialPick: number[];
  children?: React.ReactNode;
};

type TapNote = { text: string; top: number; left: number };

export function BreakInteractive(p: BreakInteractiveProps) {
  const router = useRouter();
  // Server props are the truth; the optimistic layer only marks lines being claimed right now.
  const [cells, markClaimed] = useOptimistic(p.cells, (cur: GridCell[], numbers: number[]) =>
    cur.map((c) => (numbers.includes(c.number) && c.state === "open" ? { ...c, state: "taken" as const, mine: true } : c)));
  // ?pick= is parsed but not trimmed on the server: keep what is still open, inside the allowance, and say what was dropped.
  const [initial] = useState(() => {
    const r = reconcileSelection(p.initialPick, p.cells, p.allowance.remaining);
    const dropped = [r.taken.length > 0 ? takenAnnouncement(r.taken) : "", r.overLimit.length > 0 ? limitText(p.allowance) : ""];
    return { selected: r.selected, note: dropped.filter(Boolean).join(" ") || null };
  });
  const [selected, setSelected] = useState<number[]>(initial.selected);
  const [struck, setStruck] = useState<number[]>([]);
  // The live region: `n` re-keys the message so the same words twice (one taken cell tapped twice) are announced twice.
  const [announce, setAnnounce] = useState({ text: initial.note ?? "", n: 0 });
  // What was said last and when: the refresh after a refused claim would repeat its cap note (isRepeat).
  // `say` always speaks (a deliberate second tap is announced again); only the reconcile path below skips a repeat.
  const lastSaid = useRef<{ text: string; at: number } | null>(null);
  const say = (text: string) => {
    lastSaid.current = { text, at: Date.now() };
    setAnnounce((a) => ({ text, n: a.n + 1 }));
  };
  const [note, setNote] = useState<string | null>(initial.note);
  const [tapNote, setTapNote] = useState<TapNote | null>(null);
  const [outcome, setOutcome] = useState<{ got: number[]; taken: number[] } | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [count, setCount] = useState(1);
  const gridWrap = useRef<HTMLDivElement>(null);
  // The grid's single roving tab stop; null lets the grid choose (first selected, then first open).
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  // Closing the sheet hands focus back to the bar (effect below).
  const restoreFocus = useRef(false);

  const pay = usePaySheet({
    breakId: p.breakId,
    owe: p.owe,
    onNote: setNote,
    say,
    onSentOk: () => { setJustSent(true); setOutcome(null); say(sentNote(p.hostName)); },
    onClosed: () => { restoreFocus.current = true; },
  });

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setOutcome({ got: r.data.got, taken });
      say(outcomeText(r.data.got, taken));
      // Built on what is already shown (a retry adds to the first claim's provisional amount); none got, none provisional.
      pay.setPendingOwe((prev) => nextPendingOwe(p.owe ?? prev, r.data.got, p.priceCents));
      pay.show(); // the claim is committed; now the pay step
      return;
    }
    if (r.code === "NOT_SIGNED_IN") { router.push(loginHref(p.breakId, requested)); return; }
    if (r.code === "NOT_ONBOARDED") { router.push(onboardingHref(p.breakId, requested)); return; }
    const taken = r.details?.taken ?? [];
    if (taken.length > 0) {
      setSelected((cur) => cur.filter((n) => !taken.includes(n)));
      setStruck(taken);
    }
    // The actions revalidate only on success: refresh so the grid and the allowance catch up with the server
    // (struck lines turn taken, a lowered allowance disables the claim) instead of waiting for the 20 s refresh.
    // Called inside the claim's transition, so the optimistic marks hold until the fresh props land.
    router.refresh();
    pay.fail("retry", failureNote(r));
  };

  const claimer = useClaim({
    markClaimed,
    onDone: finish,
    // The claim may have committed: refresh the props (unless offline) and say so where the buyer is looking.
    onUnreachable: () => {
      if (canRefresh()) { router.refresh(); pay.fail("retry", NETWORK_NOTE); } else pay.fail("retry", OFFLINE_NOTE);
    },
  });
  const pending = claimer.pending || pay.pending;

  // Open: claims move. Closed: the host may start the draw. Running draw: the result lands. Keep all three fresh.
  useAutoRefresh(p.status === "open" || p.status === "filled" || p.status === "drawing");

  // When fresh props show a selected line taken by someone else: strike it, drop it, say so.
  // Lines dropped because the allowance shrank are not "taken": they get the limit text instead.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastCells = useRef(p.cells);
  const { cells: freshCells, allowance } = p;
  useEffect(() => {
    if (lastCells.current === freshCells) return;
    lastCells.current = freshCells;
    const cur = selectedRef.current;
    const r = reconcileSelection(cur, freshCells, allowance.remaining);
    if (r.selected.length !== cur.length || r.selected.some((n, i) => n !== cur[i])) setSelected(r.selected);
    const said: string[] = [];
    if (r.taken.length > 0) {
      setStruck(r.taken);
      said.push(takenAnnouncement(r.taken));
    }
    if (r.overLimit.length > 0) {
      const text = limitText(allowance);
      setNote(text);
      said.push(text);
    } else {
      // Back inside the allowance: a limit note left from before no longer applies.
      const text = limitText(allowance);
      setNote((cur) => (cur === text ? null : cur));
    }
    const text = said.join(" ");
    if (said.length > 0 && !isRepeat(lastSaid.current, text, Date.now())) {
      lastSaid.current = { text, at: Date.now() };
      setAnnounce((a) => ({ text, n: a.n + 1 }));
    }
  }, [freshCells, allowance]);

  // The taken-cell popover closes on the next tap anywhere or on Escape.
  useEffect(() => {
    if (!tapNote) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setTapNote(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close, true);
    };
  }, [tapNote]);

  const bar = claimBar({
    status: p.status, signedIn: p.signedIn, claimMode: p.claimMode, selected, priceCents: p.priceCents, openCount: p.counts.open,
    allowance: p.allowance, owe: p.owe, justSent, hostName: p.hostName, payee: p.payee, closedDaysAgo: p.closedDaysAgo,
    viewerIsHost: p.viewerIsHost,
  });
  // Closing the sheet hands focus back to the bar. The Sheet does it itself, but if the claim is still resolving it
  // may aim at the claim button that is about to be replaced; once the refresh has landed, look again.
  const barKind = bar.kind;
  useEffect(() => {
    if (pay.open || pending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !a.hasAttribute("disabled")) return;
    document.querySelector<HTMLElement>("[data-sticky-bar] button:not([disabled]), [data-sticky-bar] a")?.focus();
  }, [pay.open, pending, barKind]);

  const stepMax = bar.kind === "idle" && bar.stepper ? bar.stepper.max : 1;
  const stepCount = clampStep(count, 1, stepMax);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const struckSet = useMemo(() => new Set(struck), [struck]);
  const canPick = p.status === "open" && p.claimMode !== "straight";
  // Until the refreshed props land, the lines just got still count as open and unspent in them.
  const justGot = pay.pendingOwe && outcome ? outcome.got.length : 0;
  const retryMax = p.status === "open" && p.claimMode === "pick_or_random" ? Math.max(0, Math.min(p.counts.open, p.allowance.remaining) - justGot) : 0;

  /** "Line 7: @mike, paid" in a small popover under the tapped cell, and in the polite live region. */
  const showCellNote = (c: GridCell) => {
    const text = cellNote(c);
    say(text);
    const wrap = gridWrap.current;
    const btn = wrap?.querySelector<HTMLElement>(`[data-testid="cell-${c.number}"]`);
    if (!wrap || !btn) { setTapNote({ text, top: 0, left: 0 }); return; }
    const w = wrap.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    setTapNote({ text, top: r.bottom - w.top + 4, left: Math.max(0, Math.min(r.left - w.left, w.width - 220)) });
  };

  const onPress = (n: number) => {
    const c = cells.find((x) => x.number === n);
    if (!c) return;
    setFocusNumber(n); // the tab stop follows the last cell touched
    // Bonus and reserved lines are never selectable; a selected line can always be deselected.
    if (!selected.includes(n) && !isSelectable(c)) { showCellNote(c); return; }
    if (!canPick) return;
    setTapNote(null);
    const r = toggleSelection(selected, c, p.allowance.remaining);
    if (r.blocked) {
      const text = limitText(p.allowance);
      setNote(text);
      say(text);
      return;
    }
    setNote(null);
    setStruck([]);
    setOutcome(null);
    setSelected(r.next);
    // A changed request is a new batch: the kept id only ever retries the same request after a thrown action.
    claimer.newBatch();
    say(selectionAnnouncement(r.next.length, p.priceCents));
  };

  const onClaim = () => { const numbers = selected; claimer.run(numbers, (id) => claim(p.breakId, numbers, id)); };
  const onStep = () => {
    if (bar.kind !== "idle" || !bar.stepper) return;
    const action = bar.stepper.action;
    const n = stepCount;
    claimer.run([], (id) => (action === "next" ? claimNextAction(p.breakId, n, id) : claimRandomAction(p.breakId, n, id)));
  };
  const onLast = () => {
    if (bar.kind !== "idle" || bar.lastN === null) return;
    const expected = bar.lastN; // the N on the button: the server refuses if the open count moved since
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    claimer.run(open, (id) => claimRest(p.breakId, id, expected));
  };
  const onRetry = (n: number) => { pay.setError(null); claimer.run([], (id) => claimRandomAction(p.breakId, n, id)); };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-cell]"));
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (index < 0) return;
    const rows = e.currentTarget.querySelector<HTMLElement>("[data-grid-rows]");
    const cols = rows ? getComputedStyle(rows).gridTemplateColumns.split(" ").filter(Boolean).length : 1;
    const next = nextFocusIndex(index, e.key, cols, buttons.length);
    if (next === null) return;
    e.preventDefault();
    // The roving tab stop lives in state (the Grid renders it), never in DOM tabIndex writes React does not know about.
    const n = Number(buttons[next].dataset.cell);
    if (Number.isInteger(n)) setFocusNumber(n);
    buttons[next].focus();
  };

  return (
    <>
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-2">
          {p.hostHref ? <Link href={p.hostHref} className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4" data-testid="host-line">{p.smallLine}</Link> : p.smallLine}
        </p>
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      {/* Only when the bar renders: an idle host with nothing to do gets no bar, and the link would go nowhere. */}
      {barShown(bar) && <a href="#claim-bar" className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus:text-small focus:underline">Skip to claim bar</a>}
      <div ref={gridWrap} className="relative mt-3">
        {view === "grid" ? (
          <Grid
            cells={cells}
            lineCount={p.lineCount}
            label={`Lines, ${p.counts.open} of ${p.lineCount} open`}
            selected={selectedSet}
            struck={struckSet}
            disabledOpen={selected.length >= p.allowance.remaining}
            readOnly={!canPick}
            onPress={onPress}
            onKeyDown={onGridKey}
            focusNumber={focusNumber}
          />
        ) : (
          <LineList cells={cells} title={p.title} shareUrl={p.shareUrl} />
        )}
        {tapNote && (
          <p data-testid="cell-note" style={{ top: tapNote.top, left: tapNote.left }}
            className="absolute z-30 max-w-[220px] rounded-input border border-ink bg-card px-3 py-2 text-small shadow-sheet">
            {tapNote.text}
          </p>
        )}
      </div>
      {note && <p className="mt-2 text-small text-red" data-testid="bar-note">{note}</p>}
      <p role="status" aria-live="polite" className="sr-only"><span key={announce.n}>{announce.text}</span></p>
      {p.children}
      <ClaimBar
        bar={bar}
        pending={pending}
        count={stepCount}
        onCount={(n) => { setCount(n); claimer.newBatch(); }}
        onClaim={onClaim}
        signInHref={loginHref(p.breakId, selected)}
        onStep={onStep}
        onLast={onLast}
        onSent={() => pay.markSent()}
        onOweTap={() => { setOutcome(null); pay.show(); }}
        resultHref={`/b/${p.breakId}/result`}
      />
      <PaySheet
        open={pay.open}
        onClose={pay.close}
        breakId={p.breakId}
        outcome={outcome}
        owe={pay.owe}
        payee={p.payee}
        handles={p.handles}
        instructions={p.instructions}
        hostName={p.hostName}
        commitment={p.commitment}
        retryMax={retryMax}
        onRetry={onRetry}
        onSent={pay.markSent}
        onGaveBack={() => pay.setPendingOwe(null)}
        error={pay.error}
        pending={pending}
      />
    </>
  );
}
