"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { Sheet } from "@/components/sheet";
import { Button, buttonClass } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { MiniCells } from "@/components/mini-cells";
import { LocalTime } from "@/components/local-time";
import { payLinks, type PayLink } from "@/lib/pay-links";
import { giveBack } from "@/app/b/[id]/actions";
import { runGiveBack } from "./give-back";
import { outcomeText } from "./selection";
import { giveBackPrompt, lateReleaseText, payHeadline, releaseText, retryRandomLabel, SENT_HINT, SENT_HINT_KEY } from "./pay-copy";
import type { Owe } from "./use-pay-sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  breakId: string;
  outcome: { got: number[]; taken: number[] } | null;
  owe: Owe | null;
  payee: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  hostName: string;
  commitment: string | null;
  /** How many random lines may replace taken ones (0 hides the offer). */
  retryMax: number;
  onRetry: (count: number) => void;
  /** `done` runs only once the server accepted it. */
  onSent: (done: () => void) => void;
  /** The lines just given back, once the server accepted it. */
  onGaveBack: (numbers: number[]) => void;
  /** Before the give-back action is called: the island records the lines, so the refresh says "You gave back …" in either render order. */
  onGiveBackStart?: (numbers: number[]) => void;
  /** The server refused the give-back: nothing was given back. */
  onGiveBackRefused?: () => void;
  /** A failure from onSent or onRetry, shown here because the page behind a modal is inert. */
  error: { for: "sent" | "retry"; text: string } | null;
  pending: boolean;
  /** "Pay within 24 hours." while the break is open, else null: it moved here from the page head (Mosaic §8, §1.1). */
  payWithin?: string | null;
};

/** Try the app; if the page is still visible after a moment (scheme blocked), open the web profile instead. */
function openPayLink(link: PayLink) {
  if (link.app === link.web) { window.location.href = link.web; return; }
  let left = false;
  const onHide = () => { if (document.visibilityState === "hidden") left = true; };
  document.addEventListener("visibilitychange", onHide);
  window.location.href = link.app;
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left) window.location.href = link.web;
  }, 1200);
}

export function PaySheet(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFails, setCopyFails] = useState(0);
  const [giving, startGive] = useTransition();
  const fieldRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    try { setShowHint(window.localStorage.getItem(SENT_HINT_KEY) !== "1"); } catch { setShowHint(true); }
  }, []);
  useEffect(() => { if (!p.open) { setConfirming(false); setError(null); setCopyFails(0); } }, [p.open]);
  // The clipboard is blocked (some in-app browsers): show the value selected so a long press can copy it.
  useEffect(() => {
    if (copyFails > 0) { fieldRef.current?.focus(); fieldRef.current?.select(); }
  }, [copyFails]);

  const links = p.owe ? payLinks(p.handles, p.owe.cents) : {};
  const prompt = p.owe ? giveBackPrompt(p.owe.numbers, p.owe.bonusLost) : null;
  const retryCount = p.outcome ? Math.min(p.outcome.taken.length, p.retryMax) : 0;
  const copyValue = p.handles.venmo ?? (p.handles.paypal ? `paypal.me/${p.handles.paypal}` : null);

  const markSent = () => p.onSent(() => {
    try { window.localStorage.setItem(SENT_HINT_KEY, "1"); } catch { /* storage blocked: the hint shows again next time */ }
    setShowHint(false);
  });
  const doGiveBack = () => {
    if (!p.owe) return;
    const numbers = p.owe.numbers;
    startGive(async () => {
      setError(null);
      try {
        const r = await runGiveBack(numbers, (n) => giveBack(p.breakId, n), {
          onStart: (n) => p.onGiveBackStart?.(n),
          onRefused: () => p.onGiveBackRefused?.(),
        });
        if (r.ok) { setConfirming(false); p.onGaveBack(numbers); p.onClose(); return; }
        setError(r.message);
      } catch {
        // The give-back may have gone through: the refresh shows what the server holds. Offline, a refresh would
        // fall back to a hard navigation, so keep the note instead.
        if (!canRefresh()) { setError(OFFLINE_NOTE); return; }
        setError(NETWORK_NOTE);
      }
      // Actions revalidate only on success: catch the owe and the board up with the server now.
      router.refresh();
    });
  };

  return (
    <Sheet open={p.open} onClose={p.onClose} title={p.owe ? "Pay for your lines" : "Your lines"} testId="pay-sheet">
      <div className="space-y-4 pb-2">
        {p.outcome && (p.outcome.got.length > 0 || p.outcome.taken.length > 0) && (
          <div className="space-y-1">
            <p className="font-semibold" data-testid="pay-outcome">{outcomeText(p.outcome.got, p.outcome.taken)}</p>
            {retryCount > 0 && (
              <Button variant="text" onClick={() => p.onRetry(retryCount)} disabled={p.pending}>{retryRandomLabel(retryCount)}</Button>
            )}
            {p.error?.for === "retry" && <p role="alert" className="text-small text-red" data-testid="pay-error">{p.error.text}</p>}
          </div>
        )}
        {/* Outside the owe branch: a refused sent refreshes, and the owe it cleared must not take the reason with it. */}
        {p.error?.for === "sent" && <p role="alert" className="text-small text-red" data-testid="pay-error">{p.error.text}</p>}
        {p.owe ? (
          <>
            <MiniCells label="Your unpaid lines" cells={p.owe.numbers.map((n) => ({ number: n, state: "taken" as const, mine: true, overdue: false, bonus: false }))} />
            <p className="font-condensed text-headline font-semibold tabular" data-testid="pay-amount">{payHeadline(p.owe.cents, p.payee)}</p>
            <div className="space-y-2">
              {copyValue && (
                <CopyButton
                  value={copyValue}
                  label={p.handles.venmo ? "Copy handle" : "Copy PayPal link"}
                  copiedLabel={p.handles.venmo ? "Handle copied" : "Link copied"}
                  full
                  testId="pay-copy"
                  onFail={() => setCopyFails((n) => n + 1)}
                />
              )}
              {copyFails > 0 && copyValue && (
                <input ref={fieldRef} readOnly value={copyValue} aria-label={p.handles.venmo ? "Handle to copy" : "PayPal link to copy"} onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-input border border-wire-strong bg-card px-3 font-mono text-body" />
              )}
              {links.venmo && (
                <a href={links.venmo.app} onClick={(e) => { e.preventDefault(); openPayLink(links.venmo!); }} className={buttonClass("secondary", true)}>Pay with Venmo</a>
              )}
              {links.paypal && <a href={links.paypal.web} target="_blank" rel="noreferrer" className={buttonClass("secondary", true)}>Pay with PayPal</a>}
            </div>
            <p className="text-small font-semibold">Leave the note blank.</p>
            {p.instructions && <p className="whitespace-pre-line text-small text-ink-2">{p.instructions}</p>}
            {p.commitment && (
              <p className="text-small text-ink-2">
                Draw locked before you joined: <code className="font-mono">{p.commitment}</code>. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link>
              </p>
            )}
            <div className="space-y-2">
              <Button full onClick={markSent} disabled={p.pending} data-testid="pay-sent">I&apos;ve sent it</Button>
              {showHint && <p className="text-small text-ink-2">{SENT_HINT}</p>}
              {/* The pay window, then the absolute deadline under it (Mosaic §8 claim sheet). */}
              {p.payWithin && !p.owe.late && <p className="text-small" data-testid="pay-within">{p.payWithin}</p>}
              {p.owe.payByIso && p.owe.payByFallback && (
                <p className="text-small" data-testid="pay-by">
                  {p.owe.late ? (
                    <>Payment was due <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" />. {lateReleaseText(p.hostName)}</>
                  ) : (
                    <>Pay by <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}</>
                  )}
                </p>
              )}
              <Button variant="text" full onClick={p.onClose}>I&apos;ll pay later</Button>
              {confirming && prompt ? (
                <div className="space-y-2 rounded-card border border-wire p-3">
                  <p className="text-small">{prompt.text}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={doGiveBack} disabled={giving} data-testid="give-back-confirm">{prompt.confirm}</Button>
                    <Button variant="text" onClick={() => setConfirming(false)}>Keep</Button>
                  </div>
                </div>
              ) : (
                <Button variant="text" full onClick={() => setConfirming(true)}>Give back these lines</Button>
              )}
              {error && <p role="alert" className="text-small text-red">{error}</p>}
            </div>
          </>
        ) : (
          <Button variant="secondary" full onClick={p.onClose}>Close</Button>
        )}
      </div>
    </Sheet>
  );
}
