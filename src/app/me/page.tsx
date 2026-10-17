import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { myLines } from "@/domain/lines/queries";
import { myFlight } from "@/domain/users/queries";
import { viewerZone } from "@/lib/zone";
import { MyBreakCard } from "@/components/me/my-break-card";
import { MeNotes } from "@/components/me/me-notes";
import { MyHistoryRow } from "@/components/me/my-history-row";
import { toCardProps } from "./card-props";

export const metadata = { title: "My lines" };

export default async function MyLinesPage() {
  const caller = await requireCaller("/me");
  const now = new Date();
  const zone = await viewerZone();
  const { groups, flight } = await db.transaction(async (tx) => ({ groups: await myLines(tx, caller.id, now), flight: await myFlight(tx, caller.id) }));
  const current = groups.filter((g) => !g.earlier).map((g) => toCardProps(g, now, zone, flight));
  const earlier = groups.filter((g) => g.earlier).map((g) => toCardProps(g, now, zone, flight));
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">My lines</h1>
      <MeNotes>
      {groups.length === 0 && (
        <p className="text-ink-2" data-testid="me-empty">
          No lines yet. <Link href="/breaks" className="inline-flex min-h-11 items-center underline underline-offset-4">Browse breaks</Link> to find one.
        </p>
      )}
      {current.length > 0 && <ul className="space-y-3">{current.map((c) => <MyBreakCard key={c.breakId} {...c} />)}</ul>}
      {earlier.length > 0 && (
        <details className="rounded-card border border-wire bg-card" data-testid="me-earlier">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Earlier</summary>
          <ul className="divide-y divide-wire px-4 pb-2">
            {earlier.map((c) => <MyHistoryRow key={c.breakId} breakId={c.breakId} title={c.title} status={c.status} stateLine={c.stateLine} />)}
          </ul>
        </details>
      )}
      </MeNotes>
    </main>
  );
}
