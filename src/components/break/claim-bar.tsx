"use client";
import { Button, ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { StickyBar } from "@/components/sticky-bar";
import { barShown, lastLabel, stepLabel, type Bar } from "./claim-bar-state";

type Props = {
  bar: Bar;
  /** The break's status: its pill sits beside the checkout count (Mosaic §8). */
  status: string;
  /** "12 to go" while open (barCheckout), else null. Plain text: never keyed, so a change is a text swap. */
  toGo: string | null;
  pending: boolean;
  count: number;
  onCount: (n: number) => void;
  onClaim: () => void;
  /** Sign-in link carrying the selection in ?pick= (also used by the idle bar's "Sign in to claim"). */
  signInHref: string;
  onStep: () => void;
  onLast: () => void;
  onSent: () => void;
  /** When set, the owed amount is a button that reopens the pay sheet. */
  onOweTap?: () => void;
  resultHref: string;
};

/** The checkout count over the status pill: Big Shoulders 800, 22/24, tabular. 24 + 2 + 24 px fits the 64 px bar. */
function Checkout({ status, toGo }: { status: string; toGo: string | null }) {
  return (
    <div data-testid="bar-meta" className="flex shrink-0 flex-col items-end gap-0.5">
      {toGo && <span data-testid="to-go" className="font-shoulders text-checkout font-extrabold tabular">{toGo}</span>}
      <StatusPill status={status} />
    </div>
  );
}

export function ClaimBar({ bar, status, toGo, pending, count, onCount, onClaim, signInHref, onStep, onLast, onSent, onOweTap, resultHref }: Props) {
  if (!barShown(bar)) return null;
  const meta = <Checkout status={status} toGo={toGo} />;
  return (
    <StickyBar id="claim-bar">
      {bar.kind === "message" && (
        <>
          <p className="flex-1 py-2 text-small" data-testid="bar-message">{bar.text}</p>
          {meta}
        </>
      )}
      {bar.kind === "result" && (
        <>
          <ButtonLink href={resultHref} full data-testid="bar-result">See the result</ButtonLink>
          {meta}
        </>
      )}
      {bar.kind === "selection" && (
        <>
          <div className="min-w-0 flex-1 py-1">
            <p className="truncate font-condensed text-[18px] leading-6 font-semibold tabular" data-testid="bar-summary">{bar.summary}</p>
            {/* Over the allowance (a refresh lowered it): the claim is disabled and the bar says which cap. */}
            {bar.hint && <p className="text-micro font-medium text-red" data-testid="bar-hint">{bar.hint}</p>}
          </div>
          {meta}
          {bar.action === "claim"
            ? <Button onClick={onClaim} disabled={pending || bar.disabled} data-testid="claim-submit">{bar.label}</Button>
            : <ButtonLink href={signInHref} data-testid="claim-signin">{bar.label}</ButtonLink>}
        </>
      )}
      {bar.kind === "owe" && (
        <>
          {onOweTap
            ? <button type="button" onClick={onOweTap} data-testid="owed" className="min-h-11 min-w-0 flex-1 text-left text-small font-semibold underline underline-offset-4">{bar.summary}</button>
            : <p data-testid="owed" className="min-w-0 flex-1 text-small font-semibold">{bar.summary}</p>}
          {meta}
          <Button onClick={onSent} disabled={pending} data-testid="bar-sent">I&apos;ve sent it</Button>
        </>
      )}
      {bar.kind === "idle" && (
        <div className="flex w-full items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
            {(bar.note || bar.hint || bar.signIn) && (
              <div className="flex items-center gap-3">
                {(bar.note ?? bar.hint) && <p className="min-w-0 flex-1 text-small" data-testid={bar.note ? "sent-note" : "bar-hint"}>{bar.note ?? bar.hint}</p>}
                {bar.signIn && <ButtonLink href={signInHref} data-testid="claim-signin">Sign in to claim</ButtonLink>}
              </div>
            )}
            {/* With 5 or fewer open, "Take the last N" leads and the stepper drops to a second row; otherwise one row. */}
            {bar.lastN !== null && <Button onClick={onLast} disabled={pending} data-testid="claim-rest">{lastLabel(bar.lastN)}</Button>}
            {bar.stepper && (
              <div className="flex items-end gap-2">
                <div className="flex flex-col">
                  <span className="text-micro font-medium text-ink-2">{bar.stepper.action === "next" ? "How many" : "Pick for me"}</span>
                  <Stepper label="Number of lines" value={count} min={1} max={bar.stepper.max} onChange={onCount} />
                </div>
                <Button variant="secondary" onClick={onStep} disabled={pending} data-testid="claim-step">{stepLabel(bar.stepper.action, count)}</Button>
              </div>
            )}
          </div>
          {meta}
        </div>
      )}
    </StickyBar>
  );
}
