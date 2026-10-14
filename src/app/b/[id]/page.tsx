import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { shapeGrid } from "@/domain/breaks/grid";
import { bonusAllowance } from "@/domain/breaks/rules";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatMoney } from "@/lib/money";
import { daysSince, formatDeadline, formatLate } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { pageShare } from "@/lib/share-text";
import { GridPreview } from "@/components/grid/grid-preview";
import { Legend } from "@/components/legend";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import { ButtonLink } from "@/components/button";
import type { BreakStatus } from "@/components/status-word";
import { DetailsFold } from "@/components/break/details-fold";
import { BreakInteractive } from "@/components/break/break-interactive";
import { bonusGoesWith, commitmentShort } from "@/components/break/pay-copy";
import { onboardingHref, parsePick } from "@/components/break/selection";
import { closesText, hostLabel, leftText, perPersonText, pickingText, prizeLines, smallLineText, trustText, youHaveText } from "@/components/break/frame-copy";
import { HostTools } from "@/components/ledger/host-tools";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { loadBreak } from "./load";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const { view } = await loadBreak(id);
  if (!view || view.page.break.status === "draft") return {};
  const b = view.page.break;
  const description = `${b.lineCount} lines at ${formatMoney(b.linePriceCents)}.`;
  const url = `${env().APP_URL}/b/${id}`;
  const image = { url: `${url}/og`, width: 1200, height: 630, alt: `${b.title}, the board as it stands` };
  return {
    title: b.title,
    description,
    openGraph: { title: b.title, description, url, type: "website", siteName: "Breaks", images: [image] },
    twitter: { card: "summary_large_image", title: b.title, description, images: [image.url] },
  };
}

export default async function BreakPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // One transaction for everything below, shared with generateMetadata (React cache).
  const { view, caller, now } = await loadBreak(id);
  // A missing break and someone else's draft look the same: 404.
  if (!view) notFound();
  const { page, trust, globalUnpaid, top, ledger } = view;
  const b = page.break;
  const { pick } = await searchParams;
  const initialPick = parsePick(pick, b.lineCount);
  if (caller && !caller.onboarded && initialPick.length > 0) redirect(onboardingHref(id, initialPick));
  const zone = await viewerZone();
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const status = b.status as BreakStatus;
  const hostName = hostLabel(page.host);
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const handles = page.host.paymentHandles;
  const payee = handles.venmo ?? (handles.paypal ? `paypal.me/${handles.paypal}` : hostName);
  const url = `${env().APP_URL}/b/${id}`;
  const share = pageShare({ status, title: b.title, url, lineCount: b.lineCount, priceCents: b.linePriceCents, openCount: grid.counts.open, top });
  // The deadline goes down as ISO plus a fallback in the viewer's zone (tz cookie) or labelled New York time.
  const payBy = grid.viewer?.payBy ?? null;
  const owe = grid.viewer && grid.viewer.unsent.length > 0
    ? {
        numbers: grid.viewer.unsent, cents: grid.viewer.owedCents,
        payByIso: payBy ? payBy.toISOString() : null,
        payByFallback: payBy ? formatDeadline(payBy, now, zone.tz, zone.labelled) : null,
        late: payBy !== null && payBy.getTime() < now.getTime(),
        bonusLost: bonusGoesWith(grid.cells.filter((c) => c.mine), grid.viewer.unsent),
      }
    : null;
  const youHave = grid.viewer ? youHaveText(grid.viewer.held) : null;
  const ledgerRows: LedgerRowView[] = ledger.map((r) => ({
    ownerId: r.ownerId, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName,
    numbers: r.numbers, unpaid: r.unpaid, sent: r.sent, overdue: r.overdue, paid: r.paid, bonus: r.bonus,
    owedCents: r.owedCents, status: r.status, lateText: r.overdueSince ? formatLate(r.overdueSince, now) : null,
  }));

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

      {/* "See the result" lives in the bar (bar-result) on a drawn break, not in the page flow (pixel budget). */}
      <BreakInteractive
        breakId={id}
        status={status}
        claimMode={b.claimMode}
        priceCents={b.linePriceCents}
        lineCount={b.lineCount}
        title={b.title}
        shareUrl={url}
        smallLine={smallLineText(status, b.paymentWindowHours, hostRef, trustText(trust))}
        hostHref={page.host.handle ? `/h/${page.host.handle}` : null}
        cells={grid.cells}
        counts={grid.counts}
        signedIn={!!caller}
        allowance={grid.allowance}
        owe={owe}
        hostName={hostName}
        payee={payee}
        handles={handles}
        instructions={b.paymentInstructions}
        commitment={commitmentShort(b.seedCommitment)}
        closedDaysAgo={status === "filled" && b.filledAt ? daysSince(b.filledAt, now) : null}
        viewerIsHost={!!caller && caller.id === b.hostId}
        initialPick={initialPick}
      >
        <div className="mt-3"><Legend /></div>
        {youHave && <p className="mt-2 text-small" data-testid="you-have">{youHave}</p>}
        {b.seedCommitment && (
          <p className="mt-1 text-small text-ink-2">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
          {grid.hostView && status === "draft" && <ButtonLink href={`/host/${id}/edit`} variant="secondary" data-testid="edit-draft">Edit draft</ButtonLink>}
          {grid.hostView && (
            <HostTools
              breakId={id}
              status={status}
              rows={ledgerRows}
              counts={{ paid: grid.counts.paid, taken: grid.counts.taken + grid.counts.sent, total: b.lineCount }}
              bonus={{ used: grid.cells.filter((c) => c.bonus).length, max: bonusAllowance(b.lineCount) }}
              hostName={hostName}
              selfIsHost={!!caller && caller.id === b.hostId}
            />
          )}
        </div>
        <DetailsFold
          description={b.description}
          prizes={prizeLines(page.prizes, page.items)}
          perPerson={perPersonText(b.maxLinesPerUser)}
          picking={pickingText(b.claimMode)}
          closes={closesText(hostName)}
          handles={handles}
          instructions={b.paymentInstructions}
          hostName={hostName}
        />
      </BreakInteractive>
    </main>
  );
}
