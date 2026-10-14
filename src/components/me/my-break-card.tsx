"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { giveBack } from "@/app/b/[id]/actions";
import { Button } from "@/components/button";
import { MiniCells } from "@/components/mini-cells";
import { StatusPill } from "@/components/status-pill";
import { LocalTime } from "@/components/local-time";
import { PaySheet } from "@/components/break/pay-sheet";
import { usePaySheet } from "@/components/break/use-pay-sheet";
import { giveBackPrompt, lateReleaseText, releaseText } from "@/components/break/pay-copy";
import { sentNote } from "@/components/break/claim-bar-state";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { formatMoney } from "@/lib/money";
import { howToPayLabel, type MyBreakCardProps } from "./me-copy";

/** One break on /me (design §5.8). The pay block is the break page's own sheet. */
export function MyBreakCard(p: MyBreakCardProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [giving, startGive] = useTransition();
  const pay = usePaySheet({
    breakId: p.breakId,
    owe: p.owe,
    onNote: setNote,
    onSentOk: () => { setNote(sentNote(p.hostName)); router.refresh(); },
  });
  const owe = pay.owe;
  // One flag for every transition on the card: marking sent and giving back disable the same controls.
  const pending = giving || pay.pending;
  const actionable = p.status === "open" || p.status === "filled";
  const prompt = owe ? giveBackPrompt(owe.numbers) : null;

  const doGiveBack = () => {
    if (!owe) return;
    const numbers = owe.numbers;
    startGive(async () => {
      setNote("");
      try {
        const r = await giveBack(p.breakId, numbers);
        if (r.ok) {
          setConfirming(false);
          setNote(numbers.length === 1 ? `Gave back line ${numbers[0]}.` : `Gave back ${numbers.length} lines.`);
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
      <div className="flex items-start justify-between gap-3">
        <Link href={`/b/${p.breakId}`} className="min-w-0 font-semibold underline-offset-4 hover:underline">{p.title}</Link>
        <StatusPill status={p.status} />
      </div>
      <MiniCells label="Your lines" cells={p.cells} />
      <p className="text-small" data-testid="my-state">{p.stateLine}</p>
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
      <p role="status" className="text-small" data-testid="my-note">{note}</p>
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
