import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getBreakPage, hostTrust } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getCaller } from "@/auth/session";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatMoney } from "@/lib/money";
import { pageShare } from "@/lib/share-text";
import { Grid } from "@/components/grid/grid";
import { GridPreview } from "@/components/grid/grid-preview";
import { Legend } from "@/components/legend";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import { ButtonLink, buttonClass } from "@/components/button";
import { DetailsFold } from "@/components/break/details-fold";
import { closesText, leftText, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page || page.break.status === "draft") return {};
  return { title: page.break.title, description: `${page.break.lineCount} lines at ${formatMoney(page.break.linePriceCents)}.` };
}

export default async function BreakPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const b = page.break;
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(b.status, isHostView(b.hostId, caller))) notFound();
  const now = new Date();
  const { trust, globalUnpaid } = await db.transaction(async (tx) => ({
    trust: await hostTrust(tx, page.host.id),
    globalUnpaid: caller ? await globalUnpaidCount(tx, caller.id) : 0,
  }));
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const hostName = page.host.displayName ?? page.host.handle ?? "the host";
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const url = `${env().APP_URL}/b/${id}`;
  let top: { line: number; handle: string | null } | null = null;
  if (b.status === "drawn") {
    const res = await db.transaction((tx) => getDrawResult(tx, id));
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
  const share = pageShare({ status: b.status, title: b.title, url, lineCount: b.lineCount, priceCents: b.linePriceCents, openCount: grid.counts.open, top });
  const openNumbers = grid.cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const youHave = grid.viewer ? youHaveText(grid.viewer.held) : null;
  const ledger = grid.hostView ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];

  return (
    <main className="mx-auto max-w-[600px] px-4 pb-6 sm:px-6">
      <section className="mt-3 flex gap-3">
        <GridPreview count={b.lineCount} cells={grid.cells} />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 font-condensed text-title font-semibold">{b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" data-testid="left-count">{leftText(grid.counts.open, b.lineCount)}</span>
            <span className="text-small text-ink-2">{formatMoney(b.linePriceCents)} a line</span>
            <StatusPill status={b.status} />
          </div>
        </div>
      </section>
      <p className="mt-2 flex min-h-11 items-center text-small text-ink-2">
        {payWithinText(b.paymentWindowHours)} Hosted by {hostRef}, {trustText(trust)}.
      </p>
      {b.status === "drawn" && <div className="mt-2"><ButtonLink href={`/b/${id}/result`} full data-testid="see-result">See the result</ButtonLink></div>}

      <div className="mt-3">
        <Grid cells={grid.cells} lineCount={b.lineCount} label={`Lines, ${grid.counts.open} of ${b.lineCount} open`} />
      </div>
      <div className="mt-3"><Legend /></div>
      {youHave && <p className="mt-2 text-small" data-testid="you-have">{youHave}</p>}
      {b.seedCommitment && (
        <p className="mt-1 text-small text-ink-2">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
        {grid.hostView && <a href="#host-tools" className={buttonClass("secondary")}>Host tools</a>}
      </div>

      {caller && b.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={b.claimMode === "pick_or_random"}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={b.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={b.paymentInstructions} seedCommitment={b.seedCommitment} />
      )}
      {!caller && b.status === "open" && <div className="mt-4"><ButtonLink href={`/login?next=/b/${id}`} full>Sign in to claim lines</ButtonLink></div>}

      <DetailsFold
        description={b.description}
        prizes={prizeLines(page.prizes, page.items)}
        perPerson={perPersonText(b.maxLinesPerUser)}
        picking={pickingText(b.claimMode)}
        closes={closesText(hostName)}
        handles={page.host.paymentHandles}
        instructions={b.paymentInstructions}
        hostName={hostName}
      />

      {grid.hostView && (
        <section id="host-tools" className="mt-6 space-y-2">
          <h2 className="text-headline font-semibold">Host tools</h2>
          <p className="text-small tabular" data-testid="paid-count">{grid.counts.paid} of {b.lineCount} paid</p>
          <HostPanel breakId={id} status={b.status} rows={ledger.map((u) => ({ ownerId: u.ownerId, handle: u.handle, unpaid: u.unpaid, sent: u.sent, overdue: u.overdue, owedCents: u.owedCents, status: u.status }))} />
        </section>
      )}
    </main>
  );
}
