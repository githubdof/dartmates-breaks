import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { unpaidByBuyer } from "@/domain/lines/queries";
import { getCaller } from "@/auth/session";
import { formatCents } from "@/lib/money";
import { isOverdue } from "@/domain/lines/rules";
import { isUuid } from "@/lib/is-uuid";
import { Grid, type GridLine } from "./grid";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

export default async function BreakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const caller = await getCaller();
  const isHost = !!caller && (caller.id === page.host.id || caller.role === "admin");
  const participant = !!caller && page.lines.some((l) => l.ownerId === caller.id);
  const numbered = page.lines.filter((l) => l.number <= page.break.lineCount);
  const openNumbers = numbered.filter((l) => !l.ownerId && !l.reservedForMiniId).map((l) => l.number);
  const paid = numbered.filter((l) => l.paidAt).length;
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const showHandles = isHost || participant;
  const gridLines: GridLine[] = page.lines.map((l) => ({
    number: l.number,
    isBonus: l.isBonus,
    mine: !!caller && l.ownerId === caller.id,
    label: showHandles && l.ownerId ? l.ownerHandle ?? "?" : null,
    state: l.reservedForMiniId ? "reserved" : !l.ownerId ? "open" : l.paidAt ? "paid"
      : isOverdue(l, { paymentWindowHours: page.break.paymentWindowHours }) ? "overdue" : l.sentAt ? "sent" : "claimed",
  }));
  const unpaid = isHost ? await db.transaction((tx) => unpaidByBuyer(tx, id)) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{page.break.title}</h1>
      <p className="text-sm text-neutral-600">{openNumbers.length} of {page.break.lineCount} open · {formatCents(page.break.linePriceCents)}/line · {paid} paid</p>
      <p className="text-sm">Host: {page.host.handle
        ? <Link href={`/h/${page.host.handle}`} className="underline">{page.host.displayName ?? page.host.handle}</Link>
        : <span>{page.host.displayName ?? "unknown"}</span>}</p>
      <ul className="mt-2 text-sm">{page.items.map((i) => <li key={i.id}>• {i.name}</li>)}</ul>
      {page.items.length > 1 && <p className="text-xs text-neutral-600">Winner picks one.</p>}
      {page.break.status === "drawn" && <Link href={`/b/${id}/result`} className="mt-3 block rounded bg-green-700 p-3 text-center text-white">See the result</Link>}
      {page.break.status === "drawing" && <p className="mt-3 rounded bg-amber-100 p-3 text-sm">Draw requested — waiting for the public beacon.</p>}

      <Grid lines={gridLines} lineCount={page.break.lineCount} />

      {caller && page.break.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={page.break.claimMode === "pick_or_random"}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={page.break.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={page.break.paymentInstructions} seedCommitment={page.break.seedCommitment} />
      )}
      {!caller && page.break.status === "open" && <Link href={`/login?next=/b/${id}`} className="mt-4 block rounded bg-black p-3 text-center text-white">Sign in to claim lines</Link>}
      {isHost && <HostPanel breakId={id} status={page.break.status} unpaid={unpaid.map((u) => ({ ownerId: u.owner_id, handle: u.handle, numbers: u.numbers, sent: u.sent, sentNumbers: u.sent_numbers, amountCents: u.amount_cents }))} />}
      {page.break.seedCommitment && <p className="mt-6 text-xs text-neutral-500">Draw locked before opening: <code>{page.break.seedCommitment.slice(0, 16)}…</code></p>}
    </main>
  );
}
