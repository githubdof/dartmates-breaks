import { FLIGHT_COLOURS, FLIGHT_SHAPES, type Flight } from "@/domain/flights";

/** A flight drawn outside a cell (the caller banner, "This is your flight", the /account picker): filled, with a keyline. */
export function FlightGlyph({ flight, size = 20, keyline = "var(--board-ink)", strokeWidth = 1.25 }: { flight: Flight; size?: number; keyline?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} className="shrink-0">
      <path d={FLIGHT_SHAPES[flight.shape].path} fill={FLIGHT_COLOURS[flight.colour].face} stroke={keyline} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
