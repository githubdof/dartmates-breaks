import type { CSSProperties } from "react";
import type { Flight } from "@/domain/flights";
import { FlightGlyph } from "@/components/flight-glyph";

type Props = {
  /** One line of the caller copy set (§7), never anything else. */
  text: string;
  /** The 4 px left rule: the winner's flight colour (member view), --red / --green (kit view), else --kit-dark. */
  rule: string;
  /** Member view's call only: the winner's glyph at 24 px with a 1.5 px cream keyline (§6, the one exception). */
  flight?: Flight | null;
  /** Drop in (180 ms, a 2 px overshoot). False shows it still. */
  play?: boolean;
};

/** The caller's banner. Decorative: the page announces the same words in its own polite live region. */
export function CallerBanner({ text, rule, flight = null, play = false }: Props) {
  return (
    <div aria-hidden data-testid="caller" data-play={play || undefined} className="caller-banner" style={{ "--call": rule } as CSSProperties}>
      {flight && <FlightGlyph flight={flight} size={24} keyline="var(--board-cream)" strokeWidth={1.5} />}
      <p>{text}</p>
    </div>
  );
}
