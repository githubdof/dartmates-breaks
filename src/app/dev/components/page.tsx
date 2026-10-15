import { notFound } from "next/navigation";
import { FLIGHT_COLOURS, type Flight, type FlightColour, type FlightShape, type Kit } from "@/domain/flights";
import type { GridCell } from "@/domain/breaks/grid";
import { Grid, type BoardCell } from "@/components/grid/grid";
import { Cell } from "@/components/grid/cell";
import { GridPreview } from "@/components/grid/grid-preview";
import { MiniCells } from "@/components/mini-cells";
import { BoardLegend } from "@/components/board-legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };

const SHAPES: FlightShape[] = ["standard", "pear", "kite", "slim"];
const FLIGHTS: Flight[] = (Object.keys(FLIGHT_COLOURS) as FlightColour[]).map((colour, i) => ({ colour, shape: SHAPES[i % SHAPES.length] }));
const KIT: Kit = { dark: "petrol", light: "orange" };
const STATES: GridCell["state"][] = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"];
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 9: 2, 31: 3 }; // the top spot on a two-digit line (Mosaic §5)

const board = (won: boolean): BoardCell[] => [
  ...Array.from({ length: 50 }, (_, i): BoardCell => {
    const number = i + 1;
    const place = won ? PLACES[number] ?? null : null;
    const state = place ? "paid" : STATES[i % STATES.length];
    const held = state !== "open" && state !== "reserved";
    return {
      number, state, place, bonus: false, holder: null,
      mine: held && i % 11 === 3, overdue: !place && state === "taken" && i % 13 === 1,
      flight: held ? FLIGHTS[i % FLIGHTS.length] : null,
    };
  }),
  ...Array.from({ length: 3 }, (_, i): BoardCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null, flight: FLIGHTS[i] })),
];

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      {/* The 390 × 664 density check (Review Focus 5, Task 20): the board at phone width on the wall, every §5 state. */}
      <section data-testid="density" className="-mx-4 w-[390px] max-w-[100vw] space-y-5 bg-[var(--board-wall)] px-4 py-6 sm:mx-0">
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Member view, 50 + 3 bonus</h2>
        <Grid cells={board(false)} lineCount={50} label="Lines, 7 to go" view="member" kit={KIT} heat={2} />
        <BoardLegend view="member" flight={FLIGHTS[1]} kit={KIT} />
        <p className="text-small text-[var(--board-text-2)]">You have 4, 11 and 27.</p>
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Kit view</h2>
        <Grid cells={board(false)} lineCount={50} label="Lines, 7 to go" view="kit" kit={KIT} heat={1} />
        <BoardLegend view="kit" flight={null} kit={KIT} />
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Ran, with the three bulls</h2>
        <Grid cells={board(true)} lineCount={50} label="Lines" view="member" kit={KIT} heat={4} />
        <div className="flex items-end gap-3">
          {[44, 56, 68].map((px) => <Cell key={px} cell={{ number: 23, state: "paid", mine: false, overdue: false, bonus: false, flight: FLIGHTS[2], place: 1 }} px={px} />)}
        </div>
        <div className="flex items-center gap-4">
          <GridPreview count={50} cells={board(false)} kit={KIT} heat={2} />
          <GridPreview count={12} size={64} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 6</h2>
        <div className="bg-[var(--board-wall)] p-4"><Grid cells={board(false).slice(0, 6)} lineCount={6} label="Lines, 2 to go" heat={0} /></div>
      </section>
      <section className="flex items-center gap-3">
        <MiniCells cells={board(false).slice(0, 5)} />
      </section>
      <section className="space-y-2">
        <FillBar total={50} paid={19} taken={12} />
        <div className="flex flex-wrap gap-2">{["draft", "open", "filled", "drawing", "drawn", "cancelled"].map((s) => <StatusPill key={s} status={s} />)}</div>
        <div className="flex items-center gap-2"><Avatar name="Jim" /><Avatar name={null} size={44} /></div>
      </section>
      <section className="space-y-2">
        <Banner>Neutral banner.</Banner>
        <Banner tone="success">You have lines 4 and 11.</Banner>
        <Banner tone="error">Line 7 was just taken. Pick another.</Banner>
        <div className="flex flex-wrap gap-2"><Button>Claim 2 lines</Button><Button variant="secondary">Pay with Venmo</Button><Button variant="text">I&apos;ll pay later</Button></div>
      </section>
      <Demo />
    </main>
  );
}
