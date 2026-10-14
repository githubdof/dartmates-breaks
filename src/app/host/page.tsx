import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { listHostBreaks } from "@/domain/breaks/queries";
import { waitingOnHost } from "@/domain/lines/queries";
import { ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { FillBar } from "@/components/fill-bar";
import { WaitingStrip } from "@/components/ledger/waiting-strip";
import { groupHostBreaks, toWaitingView, waitingStripText } from "./groups";

export const metadata = { title: "Your breaks" };

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { rows, waiting } = await db.transaction(async (tx) => ({
    rows: await listHostBreaks(tx, caller.id),
    waiting: await waitingOnHost(tx, caller.id),
  }));
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
            {g.rows.map((b) => (
              <li key={b.id}>
                <Link href={b.status === "draft" ? `/host/${b.id}/edit` : `/b/${b.id}`} className="block space-y-2 px-4 py-3">
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{b.title}</span>
                    <StatusPill status={b.status} />
                  </span>
                  <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} />
                  <span className="block text-small text-ink-2 tabular">{b.paid} of {b.lineCount} paid</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
