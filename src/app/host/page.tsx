import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { listHostBreaks } from "@/domain/breaks/queries";
import { waitingOnHost } from "@/domain/lines/queries";
import { ButtonLink } from "@/components/button";
import { HostBreakRow } from "@/components/host/host-break-row";
import { leadPhotos } from "@/domain/photos/queries";
import { leadSrcs } from "@/photos/lead-srcs";
import { photoStorage } from "@/storage/photo-storage";
import { WaitingStrip } from "@/components/ledger/waiting-strip";
import { groupHostBreaks, toWaitingView, waitingStripText } from "./groups";

export const metadata = { title: "Your breaks" };

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { rows, waiting, leads } = await db.transaction(async (tx) => {
    const rows = await listHostBreaks(tx, caller.id);
    return { rows, waiting: await waitingOnHost(tx, caller.id), leads: await leadPhotos(tx, rows.map((r) => r.id)) };
  });
  // A draft's photos are in the private bucket, so leadPhotos has none for it and its row shows no plate.
  const srcs = await leadSrcs(photoStorage(), leads, 160);
  const groups = groupHostBreaks(rows);
  const strip = waitingStripText(waiting);

  return (
    <main className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-condensed text-title font-semibold">Your breaks</h1>
        <ButtonLink href="/host/new" data-testid="new-break">New break</ButtonLink>
      </div>
      <WaitingStrip text={strip} rows={waiting.map(toWaitingView)} />
      {groups.length === 0 && <p className="text-small text-ink-2">No breaks yet. Start one with New break.</p>}
      {groups.map((g) => (
        <section key={g.status} aria-labelledby={`group-${g.status}`} data-testid={`group-${g.status}`} className="space-y-2">
          <h2 id={`group-${g.status}`} className="text-headline font-semibold">
            {g.label} <span className="text-small font-normal text-ink-2 tabular">{g.rows.length}</span>
          </h2>
          <ul className="divide-y divide-wire rounded-card border border-wire bg-card">
            {g.rows.map((b) => <HostBreakRow key={b.id} b={b} photo={srcs.get(b.id) ?? null} />)}
          </ul>
        </section>
      ))}
    </main>
  );
}
