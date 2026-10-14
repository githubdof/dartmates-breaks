import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { listHostBreaks } from "@/domain/breaks/queries";
import { ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { FillBar } from "@/components/fill-bar";

export const metadata = { title: "Your breaks" };

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const rows = await db.transaction((tx) => listHostBreaks(tx, caller.id));

  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-condensed text-title font-semibold">Your breaks</h1>
        <ButtonLink href="/host/new">New break</ButtonLink>
      </div>
      <ul className="mt-4 divide-y divide-wire rounded-card border border-wire bg-card">
        {rows.map((b) => (
          <li key={b.id}>
            <Link href={`/b/${b.id}`} className="block space-y-2 px-4 py-3">
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold">{b.title}</span>
                <StatusPill status={b.status} />
              </span>
              <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} />
              <span className="block text-small text-ink-2 tabular">{b.paid} of {b.lineCount} paid</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-3 text-small text-ink-2">No breaks yet. Start one with New break.</li>}
      </ul>
    </main>
  );
}
