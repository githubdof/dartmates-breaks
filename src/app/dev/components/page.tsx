import { notFound } from "next/navigation";
import type { GridCell } from "@/domain/breaks/grid";
import { Grid } from "@/components/grid/grid";
import { GridPreview } from "@/components/grid/grid-preview";
import { MiniCells } from "@/components/mini-cells";
import { Legend } from "@/components/legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };

const STATES: GridCell["state"][] = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"];
const cells: GridCell[] = [
  ...Array.from({ length: 50 }, (_, i): GridCell => ({
    number: i + 1, state: STATES[i % STATES.length], mine: i % 11 === 3, overdue: i % 13 === 1, bonus: false, holder: null, flight: null,
  })),
  ...Array.from({ length: 5 }, (_, i): GridCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null, flight: null })),
];

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 50 + 5 bonus</h2>
        <Grid cells={cells} lineCount={50} label="Lines, 7 of 50 open" />
        <Legend />
      </section>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 6</h2>
        <Grid cells={cells.slice(0, 6)} lineCount={6} label="Lines, 2 of 6 open" />
      </section>
      <section className="flex items-center gap-3">
        <GridPreview count={50} cells={cells} />
        <GridPreview count={12} size={64} />
        <MiniCells cells={cells.slice(0, 5)} />
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
