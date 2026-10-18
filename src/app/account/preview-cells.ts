import { DARK_COLOURS, FLIGHT_SHAPES, LIGHT_COLOURS, type Flight, type FlightShape } from "@/domain/flights";
import type { ResultCell } from "@/app/b/[id]/result/board-cells";

/** The picker's grid (§8): one row per shape, eight columns, the dark tier's three colours then the light tier's five. */
export function flightGrid(): Flight[][] {
  const shapes = Object.keys(FLIGHT_SHAPES) as FlightShape[];
  return shapes.map((shape) => [...DARK_COLOURS, ...LIGHT_COLOURS].map((colour) => ({ colour, shape })));
}

const cell = (number: number, o: Partial<ResultCell>): ResultCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, place: null, ...o });

/** One 88 px cell (paid: the flight's colour) and the seven states a member sees their flight in. Decorative. */
export function previewCells(f: Flight): { big: ResultCell; row: ResultCell[] } {
  return {
    big: cell(7, { state: "paid", flight: f }),
    row: [
      cell(1, {}),                                          // open
      cell(2, { state: "taken", flight: f }),               // taken
      cell(3, { state: "taken", mine: true, flight: f }),   // yours
      cell(4, { state: "sent", mine: true, flight: f }),    // yours, sent
      cell(5, { state: "paid", flight: f }),                // paid
      cell(6, { state: "paid", mine: true, flight: f }),    // yours, paid
      cell(7, { state: "paid", flight: f, place: 1 }),      // won
    ],
  };
}

/** The kit preview's four-cell board, in the kit view (no flight): open, taken, paid, the top spot. */
export const KIT_PREVIEW: ResultCell[] = [cell(1, {}), cell(2, { state: "taken" }), cell(3, { state: "paid" }), cell(4, { state: "paid", place: 1 })];
