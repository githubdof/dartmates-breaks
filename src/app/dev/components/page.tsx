import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { FLIGHT_COLOURS, type Flight, type Kit } from "@/domain/flights";
import { Grid, type BoardCell } from "@/components/grid/grid";
import { Cell } from "@/components/grid/cell";
import type { CellData } from "@/components/grid/cell-label";
import { KitThumb } from "@/components/kit-thumb";
import type { ThumbTone } from "@/components/kit-thumb-model";
import { MiniCells } from "@/components/mini-cells";
import { BoardLegend } from "@/components/board-legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };
// Read per request: the e2e build (E2E_SECRET set, never on Vercel) opens this page for the density check.
export const dynamic = "force-dynamic";

const KIT: Kit = { dark: "plum", light: "lime" };
const KIT_VARS = { "--kit-dark": FLIGHT_COLOURS[KIT.dark].face, "--kit-light": FLIGHT_COLOURS[KIT.light].face } as CSSProperties;
const WALL: CSSProperties = { ...KIT_VARS, background: "var(--board-wall)", color: "var(--board-text)" };
const YOU: Flight = { colour: "yellow", shape: "kite" };
const THEM: Flight[] = [
  { colour: "blue", shape: "standard" }, { colour: "petrol", shape: "pear" }, { colour: "orange", shape: "slim" },
  { colour: "pink", shape: "kite" }, { colour: "lime", shape: "pear" }, { colour: "plum", shape: "slim" },
];
const BASE = { state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, place: null } as const;
const cell = (number: number, o: Record<string, unknown> = {}) => ({ ...BASE, number, ...o }) as CellData;

/** Every §5 state in the member view (holders, the host and admins see these). */
const MEMBER: { name: string; cell: CellData; selected?: boolean; struck?: boolean }[] = [
  { name: "Open", cell: cell(1) },
  { name: "Selected", cell: cell(2), selected: true },
  { name: "Sniped", cell: cell(3, { state: "taken", flight: THEM[0] }), struck: true },
  { name: "Claimed, others", cell: cell(4, { state: "taken", flight: THEM[1] }) },
  { name: "Yours, not sent", cell: cell(5, { state: "taken", mine: true, flight: YOU }) },
  { name: "Yours, sent", cell: cell(6, { state: "sent", mine: true, flight: YOU }) },
  { name: "Overdue, host view", cell: cell(7, { state: "taken", overdue: true, flight: THEM[2] }) },
  { name: "Paid, others", cell: cell(8, { state: "paid", flight: THEM[3] }) },
  { name: "Yours, paid", cell: cell(9, { state: "paid", mine: true, flight: YOU }) },
  { name: "Reserved for a mini", cell: cell(10, { state: "reserved" }) },
  { name: "Bonus", cell: cell(51, { state: "paid", bonus: true, flight: THEM[4] }) },
  { name: "Won, top spot", cell: cell(23, { state: "paid", flight: THEM[0], place: 1 }) },
  { name: "Won, 2nd", cell: cell(14, { state: "paid", flight: THEM[1], place: 2 }) },
  // Yours and won: named by its place alone, with no yours ring (Mosaic §5, recorded ruling 19).
  { name: "Won, 3rd, yours", cell: cell(31, { state: "paid", mine: true, flight: YOU, place: 3 }) },
];
/** The kit view (anyone not holding a line, and every public surface): no flight on any cell. */
const KIT_VIEW: { name: string; cell: CellData }[] = [
  { name: "Open", cell: cell(1) },
  { name: "Taken", cell: cell(2, { state: "taken" }) },
  { name: "Sent, shown as taken", cell: cell(3, { state: "sent" }) },
  { name: "Paid", cell: cell(4, { state: "paid" }) },
  { name: "Reserved for a mini", cell: cell(5, { state: "reserved" }) },
  { name: "Won, top spot", cell: cell(23, { state: "paid", place: 1 }) },
];

/** The 50-line board at 390 (Review Focus 5): a two-digit top spot, 2nd and 3rd, and a mix of every claimed state. */
const STATES = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"] as const;
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 9: 2, 31: 3 };
const board: BoardCell[] = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1;
  const place = PLACES[n] ?? null;
  const state = place ? "paid" : STATES[i % STATES.length];
  const held = state !== "open" && state !== "reserved";
  const mine = held && n % 11 === 4;
  return { ...BASE, number: n, state, mine, place, holder: held ? "dev" : null, flight: held ? (mine ? YOU : THEM[n % THEM.length]) : null } as BoardCell;
});
/** The feed card's thumbnail of a ran 50-line break (96 px, about 12 px cells): the top spot's disc on the smallest cells. */
const thumb: ThumbTone[] = board.map((c) => ({ number: c.number, tone: c.place ? "won" : c.state === "sent" ? "taken" : c.state, place: c.place ?? null }));

function Swatch({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="flex w-[88px] flex-col items-start gap-1">
      <span className="block w-[44.75px]">{children}</span>
      <figcaption className="text-micro" style={{ color: "var(--board-text-2)" }}>{name}</figcaption>
    </figure>
  );
}

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && !process.env.E2E_SECRET) notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="density">
        <h2 className="text-headline font-semibold">Board at 50, member view</h2>
        <Grid cells={board} lineCount={50} label="Lines, 12 to go" view="member" kit={KIT} heat={2} />
        <BoardLegend view="member" flight={YOU} kit={KIT} />
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL}>
        <h2 className="text-headline font-semibold">Board at 12, kit view</h2>
        <Grid cells={board.slice(0, 12).map((c) => ({ ...c, holder: null, flight: null, mine: false }) as BoardCell)} lineCount={12} label="Lines, 4 to go" view="kit" kit={KIT} heat={1} />
        <BoardLegend view="kit" flight={null} kit={KIT} />
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="states-member">
        <h2 className="text-headline font-semibold">Every state, member view</h2>
        <div className="flex flex-wrap gap-3">
          {MEMBER.map((s) => <Swatch key={s.name} name={s.name}><Cell cell={s.cell} view="member" px={44.75} selected={s.selected} struck={s.struck} /></Swatch>)}
        </div>
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="states-kit">
        <h2 className="text-headline font-semibold">Every state, kit view</h2>
        <div className="flex flex-wrap gap-3">
          {KIT_VIEW.map((s) => <Swatch key={s.name} name={s.name}><Cell cell={s.cell} view="kit" px={44.75} /></Swatch>)}
        </div>
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="won-sizes">
        <h2 className="text-headline font-semibold">The top spot at 44, 56 and 68</h2>
        <div className="flex flex-wrap items-end gap-3">
          {[44, 56, 68].map((px) => <Cell key={px} cell={cell(23, { state: "paid", flight: THEM[0], place: 1 })} px={px} />)}
        </div>
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="thumb-sizes">
        <h2 className="text-headline font-semibold">Thumbnails at 96 and 112</h2>
        <div className="flex flex-wrap items-end gap-3">
          {[96, 112].map((size) => <KitThumb key={size} cells={thumb} kit={KIT} heat={4} size={size} />)}
        </div>
      </section>
      <section className="flex items-center gap-3">
        <MiniCells cells={MEMBER.slice(3, 9).map((s) => s.cell)} />
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
