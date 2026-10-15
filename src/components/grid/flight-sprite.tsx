import { FLIGHT_SHAPES, type FlightShape } from "@/domain/flights";

const SHAPES = Object.keys(FLIGHT_SHAPES) as FlightShape[];

/**
 * The flight glyphs as one sprite (Mosaic §4): every cell draws `<use href="#flight-<shape>">`. The stroke does not
 * scale, so a 1.25 px keyline stays 1.25 px at 10, 14, 16 and 20 px. Rendered once, in the root layout.
 */
export function FlightSprite() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      {SHAPES.map((s) => (
        <symbol key={s} id={`flight-${s}`} viewBox="0 0 16 16">
          <path d={FLIGHT_SHAPES[s].path} vectorEffect="non-scaling-stroke" />
        </symbol>
      ))}
    </svg>
  );
}
