"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest, sent } from "@/app/b/[id]/actions";
import { Grid } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { SegmentedControl } from "@/components/segmented-control";
import { clampStep } from "@/components/stepper-math";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import { PaySheet } from "./pay-sheet";
import { barShown, claimBar, failureNote, limitText } from "./claim-bar-state";
import { cellNote, isSelectable, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
import { useAutoRefresh } from "./use-auto-refresh";

/** What the viewer owes for unsent lines. The deadline travels as ISO plus the server's fallback text (LocalTime). */
export type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null };

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
  initialPick: number[];
  children?: React.ReactNode;
};

type ClaimData = { got: number[]; taken?: number[] };
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
  const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
  const [note, setNote] = useState<string | null>(initial.note);
  const [tapNote, setTapNote] = useState<TapNote | null>(null);
  const [outcome, setOutcome] = useState<{ got: number[]; taken: number[] } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The claim can resolve before the refreshed props arrive: the sheet shows a provisional amount until they do.
  const [pendingOwe, setPendingOwe] = useState<Owe | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [count, setCount] = useState(1);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const gridWrap = useRef<HTMLDivElement>(null);
  // The grid's single roving tab stop; null lets the grid choose (first selected, then first open).
  const [focusNumber, setFocusNumber] = useState<number | null>(null);

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
    }
    if (said.length > 0) setAnnounce((a) => ({ text: said.join(" "), n: a.n + 1 }));
  }, [freshCells, allowance]);

  // Fresh server props carry the real amount and deadline; drop the provisional one.
  useEffect(() => { setPendingOwe(null); }, [p.owe]);
  const owe = p.owe ?? pendingOwe;

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
  });
  // Closing the sheet hands focus back to the bar. The Sheet does it itself, but if the claim is still resolving it
  // may aim at the claim button that is about to be replaced; once the refresh has landed, look again.
  const restoreFocus = useRef(false);
  const closeSheet = () => { restoreFocus.current = true; setSheetOpen(false); };
  const barKind = bar.kind;
  useEffect(() => {
    if (sheetOpen || pending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !a.hasAttribute("disabled")) return;
    document.querySelector<HTMLElement>("[data-sticky-bar] button:not([disabled]), [data-sticky-bar] a")?.focus();
  }, [sheetOpen, pending, barKind]);

  const stepMax = bar.kind === "idle" && bar.stepper ? bar.stepper.max : 1;
  const stepCount = clampStep(count, 1, stepMax);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const struckSet = useMemo(() => new Set(struck), [struck]);
  const canPick = p.status === "open" && p.claimMode !== "straight";
  const retryMax = p.status === "open" && p.claimMode === "pick_or_random" ? Math.min(p.counts.open, p.allowance.remaining) : 0;

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
    say(selectionAnnouncement(r.next.length, p.priceCents));
  };

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setBatchId(crypto.randomUUID());
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setOutcome({ got: r.data.got, taken });
      say(outcomeText(r.data.got, taken));
      if (r.data.got.length > 0) {
        setPendingOwe({
          numbers: [...(p.owe?.numbers ?? []), ...r.data.got].sort((x, y) => x - y),
          cents: (p.owe?.cents ?? 0) + r.data.got.length * p.priceCents,
          payByIso: p.owe?.payByIso ?? null,
          payByFallback: p.owe?.payByFallback ?? null,
        });
      }
      setSheetOpen(true); // the claim is committed; now the pay step
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
    const text = failureNote(r);
    setNote(text);
    say(text);
  };

  const runClaim = (optimistic: number[], call: () => Promise<ActionResult<ClaimData>>) => {
    startTransition(async () => {
      if (optimistic.length > 0) markClaimed(optimistic);
      finish(await call(), optimistic);
    });
  };

  const onClaim = () => { const numbers = selected; runClaim(numbers, () => claim(p.breakId, numbers, batchId)); };
  const onStep = () => {
    if (bar.kind !== "idle" || !bar.stepper) return;
    const action = bar.stepper.action;
    const n = stepCount;
    runClaim([], () => (action === "next" ? claimNextAction(p.breakId, n, batchId) : claimRandomAction(p.breakId, n, batchId)));
  };
  const onLast = () => {
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    runClaim(open, () => claimRest(p.breakId, batchId));
  };
  const onRetry = (n: number) => runClaim([], () => claimRandomAction(p.breakId, n, batchId));
  const onSent = () => {
    if (!owe) return;
    const numbers = owe.numbers;
    startTransition(async () => {
      const r = await sent(p.breakId, numbers);
      if (r.ok) {
        setJustSent(true);
        setOutcome(null);
        closeSheet();
        say(`Sent. ${p.hostName} will tick you off when it arrives.`);
      } else {
        setNote(r.message);
        say(r.message);
      }
    });
  };

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
    const n = Number(buttons[next].dataset.testid?.replace("cell-", ""));
    if (Number.isInteger(n)) setFocusNumber(n);
    buttons[next].focus();
  };

  return (
    <>
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-2">{p.smallLine}</p>
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
        onCount={setCount}
        onClaim={onClaim}
        signInHref={loginHref(p.breakId, selected)}
        onStep={onStep}
        onLast={onLast}
        onSent={onSent}
        onOweTap={() => { setOutcome(null); setSheetOpen(true); }}
        resultHref={`/b/${p.breakId}/result`}
      />
      <PaySheet
        open={sheetOpen}
        onClose={closeSheet}
        breakId={p.breakId}
        outcome={outcome}
        owe={owe}
        payee={p.payee}
        handles={p.handles}
        instructions={p.instructions}
        hostName={p.hostName}
        commitment={p.commitment}
        retryMax={retryMax}
        onRetry={onRetry}
        onSent={onSent}
        pending={pending}
      />
    </>
  );
}
