"use client";
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { Flight, HeatStep, Kit } from "@/domain/flights";
import type { BoardView } from "@/components/grid/cell";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest } from "@/app/b/[id]/actions";
import { Grid, type BoardCell } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { countMoment, heldLegendFlight, landingTimes, momentAnnouncements, paySheetDelay, type PendingClaim } from "@/components/grid/board-moments";
import { BoardLegend } from "@/components/board-legend";
import { useBoardMoments } from "@/components/grid/use-board-moments";
import { prefersReducedMotion } from "@/lib/motion";
import { CallerBanner } from "./caller-banner";
import { BOARD_FULL_CALL, boardFullAnnouncement, drawStartAnnouncement, drawStartCall, fullBoardKey, withCall } from "./caller-copy";
import { SegmentedControl } from "@/components/segmented-control";
import { clampStep } from "@/components/stepper-math";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import type { PhotoSrc } from "@/photos/urls";
import { PaySheet } from "./pay-sheet";
import { nextPendingOwe, owedAfterClaim } from "./pay-copy";
import { barCheckout, barShown, claimBar, failureNote, limitText, sentNote } from "./claim-bar-state";
import { toGoText } from "./frame-copy";
import { cellNote, isRepeat, isSelectable, loginHref, onboardingHref, claimAnnouncement, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
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
  /** The "You have …" line: under the legend, inside the 390 × 664 budget (Mosaic §8). */
  underBoard?: React.ReactNode;
  /** The legend's flight: the viewer's own (recorded ruling 20). The island draws the legend, so it follows the held board. */
  legendFlight: Flight | null;
  /** The break's lead photo for the pay sheet's header; null when it has none. */
  lead: PhotoSrc | null;
  /** "Pay within 24 hours." while open, for the pay sheet's pay block (Mosaic §8); null once the break is not open. */
  payWithin: string | null;
  cells: GridCell[];
  /** member when the viewer sees holders (GridModel.showHolders), else kit (Mosaic §6). */
  boardView: BoardView;
  /** The viewer's stored flight (not the per-break shape) and whether they ever picked one; null when signed out. */
  myFlight: Flight | null;
  flightChosen: boolean;
  kit: Kit;
  heat: HeatStep;
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
  // An optimistic mark is hatched and mine but draws no ring: the ring appears at landing (Mosaic §7).
  const [cells, markClaimed] = useOptimistic<BoardCell[], number[]>(p.cells, (cur, numbers) =>
    cur.map((c) => (numbers.includes(c.number) && c.state === "open" ? { ...c, state: "taken" as const, mine: true, optimistic: true } : c)));
  // ?pick= is parsed but not trimmed on the server: keep what is still open, inside the allowance, and say what was dropped.
  const [initial] = useState(() => {
    const r = reconcileSelection(p.initialPick, p.cells, p.allowance.remaining);
    const dropped = [r.taken.length > 0 ? takenAnnouncement(r.taken) : "", r.overLimit.length > 0 ? limitText(p.allowance) : ""];
    return { selected: r.selected, note: dropped.filter(Boolean).join(" ") || null };
  });
  const [selected, setSelected] = useState<number[]>(initial.selected);
  const [struck, setStruck] = useState<number[]>([]);
  // The claim in flight, recorded before the action is called (useClaim's onStart), so its flights drop whichever lands
  // first: the refreshed props or the answer (recorded ruling 34). Null once its lines landed, or when it was refused.
  // Not named `claim`: that is the imported server action.
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  // The selection as it stood when the claim went out (useClaim's onStart): finish() clears the selection, and a tap
  // while the claim is in flight may change it, so the strike reads this too. Cleared once the claim has answered.
  const [claimSelection, setClaimSelection] = useState<number[]>([]);
  const wanted = useMemo(
    () => (claimSelection.length === 0 ? selected : [...new Set([...selected, ...claimSelection])]),
    [selected, claimSelection],
  );
  // The lines just given back: the next refresh announces "You gave back …" for them.
  const gaveBack = useRef<number[]>([]);
  const board = useBoardMoments({ cells: p.cells, view: p.boardView, struck, selected: wanted }, pendingClaim);
  // Drops not yet landed: the checkout count drops by one per landing (a text swap, never rolled).
  const [landing, setLanding] = useState(0);
  const sheetTimer = useRef<number | null>(null);
  // Board fills: the once-per-viewer flag as read for this break (the banner renders after hydration only); `fullPlay`
  // is null until it is read, and while the break is not filled.
  const [fullSeen, setFullSeen] = useState<{ breakId: string; play: boolean } | null>(null);
  const fullPlay = p.status === "filled" && fullSeen?.breakId === p.breakId ? fullSeen.play : null;
  const fullRead = useRef<string | null>(null);
  // The caller's call said in this commit (board fills or draw starts): the reconcile effect for the same props joins it
  // to what it says.
  const fullCall = useRef<string | null>(null);
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
  const [flightLine, setFlightLine] = useState<Flight | null>(null);
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
    onClosed: () => { restoreFocus.current = true; setFlightLine(null); },
  });

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setClaimSelection([]); // the strike now reads `struck`
      setOutcome({ got: r.data.got, taken });
      // At most once per break: `p.cells` are the props of the render that sent this claim, so a held line means a later claim.
      // A retry inside the same open sheet keeps the line it already showed.
      if (!p.flightChosen && p.myFlight && r.data.got.length > 0 && !p.cells.some((c) => c.mine)) setFlightLine(p.myFlight);
      say(claimAnnouncement(r.data.got, taken, p.hostName, owedAfterClaim(p.owe ?? pay.pendingOwe, r.data.got, p.priceCents)));
      if (r.data.got.length === 0) setPendingClaim(null); // none got: nothing will land
      // Built on what is already shown (a retry adds to the first claim's provisional amount); none got, none provisional.
      pay.setPendingOwe((prev) => nextPendingOwe(p.owe ?? prev, r.data.got, p.priceCents));
      // The claim is committed; the pay step opens at the last landing or at 400 ms, whichever comes first.
      if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
      const wait = paySheetDelay(r.data.got.length, prefersReducedMotion());
      if (wait === 0) pay.show();
      else sheetTimer.current = window.setTimeout(() => { sheetTimer.current = null; pay.show(); }, wait);
      return;
    }
    setPendingClaim(null); // refused: none of this claim will land
    setClaimSelection([]);
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
    // Before the action is called: a selection or "Take the last N" knows its numbers; a random claim does not.
    onStart: (requested) => { setPendingClaim({ numbers: requested.length > 0 ? requested : null }); setClaimSelection(selected); },
    onDone: finish,
    // The claim may have committed: refresh the props (unless offline) and say so where the buyer is looking.
    onUnreachable: () => {
      setClaimSelection([]); // no answer: the selection stays on screen, and the strike reads it there
      if (canRefresh()) { router.refresh(); pay.fail("retry", NETWORK_NOTE); } else pay.fail("retry", OFFLINE_NOTE);
    },
  });
  const pending = claimer.pending || pay.pending;
  // What the checkout count shows: the server's open count, plus the claimed lines whose flights have not landed yet.
  const shownOpen = p.counts.open + landing;

  // Open: claims move. Closed: the host may start the draw. Running draw: the result lands. Keep all three fresh.
  useAutoRefresh(p.status === "open" || p.status === "filled" || p.status === "drawing");

  // When fresh props show a selected line taken by someone else: strike it, drop it, say so.
  // Lines dropped because the allowance shrank are not "taken": they get the limit text instead.
  // An effect event: it reads the selection as it stands now without the effect re-running for every tap.
  const lastCells = useRef(p.cells);
  const { cells: freshCells, allowance, hostName } = p;
  const reconcile = useEffectEvent((before: readonly GridCell[], call: string | null) => {
    const cur = selected;
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
    // Paid, paid undone, released, given back, open again (Mosaic §7): own lines only where the row says so.
    const moved = momentAnnouncements(before, freshCells, hostName, gaveBack.current);
    if (moved) said.push(moved);
    // Keep only the give-back lines this refresh does not show yet (an unrelated refresh may land first).
    const stillMine = new Set(freshCells.filter((c) => c.mine).map((c) => c.number));
    gaveBack.current = gaveBack.current.filter((n) => stillMine.has(n));
    // The board-fills call from this commit goes first, so the one live-region message never drops it.
    const text = withCall(call, said).join(" ");
    if (said.length > 0 && !isRepeat(lastSaid.current, text, Date.now())) {
      lastSaid.current = { text, at: Date.now() };
      setAnnounce((a) => ({ text, n: a.n + 1 }));
    }
  });
  useEffect(() => {
    const call = fullCall.current;
    fullCall.current = null;
    if (lastCells.current === freshCells) return;
    const before = lastCells.current;
    lastCells.current = freshCells;
    reconcile(before, call);
  }, [freshCells, allowance, hostName]);

  // The claim's lines have landed: later diffs are other people's again. Keyed on the landed array itself (the hook
  // keeps it until the next changed snapshot, so a later claim before any change must not read it as its own landing).
  // Adjusted while rendering: the moments already sit in the hook's state (the same snapshot steps to the same state),
  // so the drop still commits.
  const [landedSeen, setLandedSeen] = useState(board.landed);
  if (landedSeen !== board.landed) {
    setLandedSeen(board.landed);
    if (board.landed.length > 0) setPendingClaim(null);
  }

  // The checkout count drops by one per landing: set as the run starts, while rendering, so the count never shows the
  // lower number first. Keyed on the run (`played`), not on the map shown: a kept map (a non-moving change mid-landing)
  // never restarts it. The timers that count it down are the run's effect.
  const [landingRun, setLandingRun] = useState(board.played);
  if (landingRun !== board.played) {
    setLandingRun(board.played);
    const drops = countMoment(board.played, "drop");
    setLanding(drops === 0 || prefersReducedMotion() ? 0 : landingTimes(drops).length);
  }
  useLayoutEffect(() => {
    const drops = countMoment(board.played, "drop");
    if (drops === 0 || prefersReducedMotion()) return;
    const ids = landingTimes(drops).map((t) => window.setTimeout(() => setLanding((n) => Math.max(0, n - 1)), t));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [board.played]);

  // Board fills (Mosaic §7): "Board's full. Game on." drops in once per viewer per break, then shows still.
  useLayoutEffect(() => {
    if (p.status !== "filled") { fullRead.current = null; return; }
    if (fullRead.current === p.breakId) return; // read once: a second run (Strict Mode, a new host name) would see its own write
    fullRead.current = p.breakId;
    let seen = true;
    try {
      seen = window.localStorage.getItem(fullBoardKey(p.breakId)) === "1";
      window.localStorage.setItem(fullBoardKey(p.breakId), "1");
    } catch {
      seen = true; // storage blocked: never force the moment
    }
    // The viewer's memory, read and marked above, decides the moment and its call: the decision is state, the call is
    // the live region's. Both are set here, once per break, because nothing else sees the read.
    setFullSeen({ breakId: p.breakId, play: !seen && !prefersReducedMotion() });
    if (!seen) {
      const call = boardFullAnnouncement(p.hostName);
      fullCall.current = call;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the live region announces what the once-per-viewer read decided; nothing else sees the read
      say(call);
    }
  }, [p.status, p.breakId, p.hostName]);

  // Draw starts (Mosaic §7): "Jim is stepping up to the oche." It drops in only when the draw starts while this page
  // is open (animate on change, never on mount); a later visit shows it still. No pulse, no ambient motion. A layout
  // effect, like board fills, so the call reaches `fullCall` before the reconcile effect of the same refresh reads it.
  const [drawPlay, setDrawPlay] = useState(false);
  const lastStatus = useRef(p.status);
  useLayoutEffect(() => {
    if (lastStatus.current === p.status) return;
    const was = lastStatus.current;
    lastStatus.current = p.status;
    if (p.status !== "drawing" || was === "drawing") return;
    setDrawPlay(!prefersReducedMotion());
    const call = drawStartAnnouncement(p.hostName);
    fullCall.current = call;
    say(call);
  }, [p.status, p.hostName]);

  useEffect(() => () => { if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current); }, []);

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
      {/* Only when the bar renders: an idle host with nothing to do gets no bar, and the link would go nowhere. */}
      {barShown(bar) && <a href="#claim-bar" className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus:text-small focus:text-[var(--board-text)] focus:underline">Skip to claim bar</a>}
      {/* 12 px gap, then the 12 px frame drawn into it (Mosaic §8 budget). */}
      <div ref={gridWrap} className="relative mt-6">
        {view === "grid" ? (
          <Grid
            // While the viewer's own last lines drain, the member-view board is held (spec §7 Release).
            cells={board.held ? [...board.held.cells] : cells}
            view={board.held ? board.held.view : p.boardView}
            kit={p.kit}
            heat={p.heat}
            lineCount={p.lineCount}
            // The count the bar shows (drops not yet landed included), so a screen reader hears what the bar says.
            label={`Lines, ${toGoText(shownOpen)}`}
            selected={selectedSet}
            struck={struckSet}
            moments={board.moments}
            from={board.from}
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
      {/* Between the board and the legend (recorded ruling 22). */}
      {p.status === "filled" && fullPlay !== null && (
        <div className="mt-3"><CallerBanner text={BOARD_FULL_CALL} kit={p.kit} play={fullPlay} /></div>
      )}
      {p.status === "drawing" && (
        <div className="mt-3"><CallerBanner text={drawStartCall(p.hostName)} kit={p.kit} play={drawPlay} /></div>
      )}
      {/* 12 px of frame, then the legend's 8 px gap (Mosaic §8 budget). The legend shows the board's view: while the
          viewer's own last lines drain it stays the member legend with their flight, then turns with the board. */}
      <div className="mt-5">
        <BoardLegend view={board.held ? board.held.view : p.boardView} flight={(board.held && heldLegendFlight(board.from)) || p.legendFlight} kit={p.kit} />
      </div>
      {p.underBoard}
      {/* Grid | List stands (first design §5.4); the budget has no row for it above the board, so it sits here (recorded ruling 23). */}
      <div className="mt-3 flex min-h-11 items-center justify-end">
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      {note && <p className="mt-2 inline-block rounded bg-[var(--board-cream)] px-2 py-1 text-small text-red" data-testid="bar-note">{note}</p>}
      <p role="status" aria-live="polite" className="sr-only"><span key={announce.n}>{announce.text}</span></p>
      {p.children}
      <ClaimBar
        bar={bar}
        status={p.status}
        toGo={barCheckout({ status: p.status, openCount: shownOpen })}
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
        breakTitle={p.title}
        photo={p.lead}
        commitment={p.commitment}
        retryMax={retryMax}
        onRetry={onRetry}
        onSent={pay.markSent}
        onGaveBack={() => pay.setPendingOwe(null)}
        payWithin={p.payWithin}
        flightLine={flightLine}
        /* Recorded before the action: the refresh that carries the give-back may land before its answer. */
        onGiveBackStart={(numbers) => { gaveBack.current = numbers; }}
        onGiveBackRefused={() => { gaveBack.current = []; }}
        error={pay.error}
        pending={pending}
      />
    </>
  );
}
