"use client";
import Link from "next/link";
import { useContext, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { giveBack } from "@/app/b/[id]/actions";
import { Button } from "@/components/button";
import { Cell } from "@/components/grid/cell";
import { StatusPill } from "@/components/status-pill";
import { LocalTime } from "@/components/local-time";
import { Plate } from "@/components/photos/plate";
import { PaySheet } from "@/components/break/pay-sheet";
import { usePaySheet } from "@/components/break/use-pay-sheet";
import { giveBackPrompt, lateReleaseText, releaseText } from "@/components/break/pay-copy";
import { sentNote } from "@/components/break/claim-bar-state";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { formatMoney } from "@/lib/money";
import { howToPayLabel, type MyBreakCardProps } from "./me-copy";
import { MeNoteContext } from "./me-notes";

/** Your lines on paper are drawn as on the board, so their wire is the board's steel (Mosaic §8); the ledger keeps wire-strong. */
const STEEL_WIRE = { "--wire-strong": "var(--board-steel)" } as CSSProperties;
/** One of your lines: the board cell (Task 7) at 42 px inside its 1 px steel edge, so the row keeps 44 px steps. */
const MY_CELL_PX = 42;

/** One break on /me (design §5.8). The pay block is the break page's own sheet. */
export function MyBreakCard(p: MyBreakCardProps) {
  const router = useRouter();
  // The live region: `n` re-keys the message so the same words twice are announced twice.
  const [noteState, setNoteState] = useState({ text: "", n: 0 });
  const setNote = (text: string) => setNoteState((s) => ({ text, n: s.n + 1 }));
  const pageNote = useContext(MeNoteContext);
  const titleRef = useRef<HTMLAnchorElement>(null);
  // A refused sent not yet shown anywhere that outlives the card. A sent is refused mostly because the lines were
  // released; if that was every line here, the refresh drops this card, so its unmount hands the reason to the page.
  const sentFail = useRef<string | null>(null);
  useEffect(() => () => { if (sentFail.current) pageNote?.(sentFail.current); }, [pageNote]);
  const [confirming, setConfirming] = useState(false);
  const [giving, startGive] = useTransition();
  const pay = usePaySheet({
    breakId: p.breakId,
    owe: p.owe,
    onNote: setNote,
    onFail: (forWhat, text) => { if (forWhat === "sent") sentFail.current = text; },
    onSentOk: () => { setNote(sentNote(p.hostName)); router.refresh(); },
  });
  const owe = pay.owe;
  // One flag for every transition on the card: marking sent and giving back disable the same controls.
  const pending = giving || pay.pending;
  const actionable = p.status === "open" || p.status === "filled";
  const prompt = owe ? giveBackPrompt(owe.numbers, owe.bonusLost) : null;

  // A refused "I've sent it" refreshes, which can clear the owe and so unmount the sheet mid-failure: carry its
  // failure to the note line, and close the sheet so it does not reopen when an owe comes back. Adjusted while
  // rendering (this card's own state, the sheet's included; the sheet passes no onClosed), so the lost sheet never
  // commits, and the close ends the condition. Shown on the surviving card, the page need not repeat the failure:
  // the effect on `lost` drops it from the hand-off whether or not an error had committed.
  const sheetLost = pay.open && !owe;
  const [lost, setLost] = useState(0);
  if (sheetLost) {
    if (pay.error) setNote(pay.error.text);
    pay.close();
    setLost((n) => n + 1);
  }
  useEffect(() => { if (lost > 0) sentFail.current = null; }, [lost]);
  const payError = pay.error;
  // Once the error is cleared (sheet closed, or a new attempt), it no longer belongs on the page either.
  useEffect(() => { if (!payError) sentFail.current = null; }, [payError]);

  // Once a sent or a give-back clears the owe, the buttons that had focus are gone: hand focus to the card's title
  // (as the break page restores focus after its refresh), unless it already sits somewhere live.
  const hadOwe = useRef(p.owe !== null);
  useEffect(() => {
    const had = hadOwe.current;
    hadOwe.current = p.owe !== null;
    if (!had || p.owe !== null) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !a.hasAttribute("disabled")) return;
    titleRef.current?.focus();
  }, [p.owe]);

  const doGiveBack = () => {
    if (!owe) return;
    const numbers = owe.numbers;
    startGive(async () => {
      setNote("");
      try {
        const r = await giveBack(p.breakId, numbers);
        if (r.ok) {
          setConfirming(false);
          const text = numbers.length === 1 ? `Gave back line ${numbers[0]}.` : `Gave back ${numbers.length} lines.`;
          // Every numbered line given back: the card leaves /me on the refresh, so the note goes to the page.
          const all = p.cells.every((c) => c.bonus || numbers.includes(c.number));
          if (all && pageNote) pageNote(text); else setNote(text);
        } else {
          setNote(r.message);
        }
      } catch {
        // The give-back may have gone through: the refresh shows what the server holds, unless offline.
        if (!canRefresh()) { setNote(OFFLINE_NOTE); return; }
        setNote(NETWORK_NOTE);
      }
      router.refresh();
    });
  };

  return (
    <li data-testid="my-break" className="space-y-3 rounded-card border border-wire bg-card p-4">
      <div className="flex items-start gap-3">
        {p.photo && <Plate photo={p.photo} size={40} surface="paper" decorative />}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <Link ref={titleRef} href={`/b/${p.breakId}`} className="min-w-0 font-semibold underline-offset-4 hover:underline">{p.title}</Link>
          <StatusPill status={p.status} />
        </div>
      </div>
      {p.photoNotice && (
        <p data-testid="my-photo-notice" role="status" className="text-small">
          {p.photoNotice.text}, <LocalTime iso={p.photoNotice.iso} fallback={p.photoNotice.fallback} kind="datetime" />.
        </p>
      )}
      {/* The board cell, not the paper MiniCells: your lines in your flight with the yours ring (Mosaic §8, recorded ruling 24). */}
      <ul aria-label="Your lines" style={STEEL_WIRE} className="flex flex-wrap gap-1">
        {p.cells.map((c) => (
          <li key={c.number} className="w-11 border border-wire-strong"><Cell cell={c} px={MY_CELL_PX} /></li>
        ))}
      </ul>
      <p className="text-small" data-testid="my-state">{p.stateLine}</p>
      {p.unpaidNote && <p className="text-small" data-testid="my-unpaid">{p.unpaidNote}</p>}
      {owe && (
        <p className="text-small" data-testid="my-owed">
          <span className="font-semibold">You owe {formatMoney(owe.cents)}.</span>{" "}
          {owe.payByIso && owe.payByFallback && (owe.late ? (
            <>Payment was due <LocalTime iso={owe.payByIso} fallback={owe.payByFallback} kind="deadline" />. {lateReleaseText(p.hostName)}</>
          ) : (
            <>Pay by <LocalTime iso={owe.payByIso} fallback={owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}</>
          ))}
        </p>
      )}
      {owe && actionable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={pay.show} disabled={pending} data-testid="how-to-pay">{howToPayLabel(p.hostName)}</Button>
          {confirming && prompt ? (
            <div className="w-full space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">{prompt.text}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={doGiveBack} disabled={pending} data-testid="give-back-yes">{prompt.confirm}</Button>
                <Button variant="text" onClick={() => setConfirming(false)} disabled={pending}>Keep</Button>
              </div>
            </div>
          ) : (
            <Button variant="text" onClick={() => setConfirming(true)} disabled={pending} data-testid="give-back">Give back unpaid lines</Button>
          )}
        </div>
      )}
      <p role="status" className="text-small" data-testid="my-note"><span key={noteState.n}>{noteState.text}</span></p>
      {/* Mounted only while open: with several owing cards, one closed PaySheet each would repeat its test ids on the page. */}
      {owe && pay.open && (
        <PaySheet
          open={pay.open}
          onClose={pay.close}
          breakId={p.breakId}
          outcome={null}
          owe={owe}
          payee={p.payee}
          handles={p.handles}
          instructions={p.instructions}
          hostName={p.hostName}
          breakTitle={p.title}
          photo={p.photo}
          commitment={p.commitment}
          retryMax={0}
          onRetry={() => {}}
          onSent={pay.markSent}
          onGaveBack={() => { pay.setPendingOwe(null); router.refresh(); }}
          error={pay.error}
          pending={pending}
        />
      )}
    </li>
  );
}
