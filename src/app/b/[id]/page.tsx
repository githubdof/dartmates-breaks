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
import { BoardLegend } from "@/components/board-legend";
import type { BoardView } from "@/components/grid/cell";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import { ButtonLink } from "@/components/button";
import type { BreakStatus } from "@/components/status-word";
import { DetailsFold } from "@/components/break/details-fold";
import { BreakInteractive } from "@/components/break/break-interactive";
import { bonusGoesWith, commitmentShort, payeeFor } from "@/components/break/pay-copy";
import { onboardingHref, parsePick } from "@/components/break/selection";
import { closesText, hostedByText, hostLabel, mediaText, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { KitSwatch } from "@/components/kit-swatch";
import { HostTools } from "@/components/ledger/host-tools";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { wallViewport } from "@/app/wall";
import { loadBreak } from "./load";

/** The break page is on the wall from this task on: its browser chrome follows (Mosaic §8, recorded ruling 12). */
export const viewport = wallViewport;

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
  const boardView: BoardView = grid.showHolders ? "member" : "kit";
  // The legend draws "yours" and "paid" in the viewer's own flight: the first line they hold here (recorded ruling 20).
  // Task 16 adds the viewer's stored flight as the fallback, once the page loads it.
  const legendFlight = grid.cells.find((c) => c.mine && c.flight)?.flight ?? null;

  const status = b.status as BreakStatus;
  const hostName = hostLabel(page.host);
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const handles = page.host.paymentHandles;
  const payee = payeeFor(handles, hostName);
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
    <main data-wall className="mx-auto max-w-[600px] px-4 pb-6 sm:px-6">
      {/* Mosaic §8: the title in Big Shoulders, two lines at most; one 24 px media row; no thumbnail while there are no photos. */}
      <section className="mt-3">
        <h1 className="line-clamp-2 font-shoulders text-wall-title font-extrabold text-[var(--board-text)]">{b.title}</h1>
        <p className="mt-1 flex min-h-6 flex-wrap items-center gap-x-3 text-small">
          <span className="text-[var(--board-text-2)]" data-testid="media-row">{mediaText(b.lineCount, b.linePriceCents)}</span>
          {/* A draft renders no claim bar, so its pill stays in the head; every other status has it in the bar. */}
          {status === "draft" && <span className="rounded-full bg-[var(--board-cream)]"><StatusPill status="draft" /></span>}
          {page.host.handle ? (
            <Link href={`/h/${page.host.handle}`} data-testid="host-line" className="inline-flex items-center gap-1.5 text-[var(--board-text-3)] hover:underline hover:underline-offset-4">
              {hostedByText(hostRef, trustText(trust))}<KitSwatch kit={grid.kit} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[var(--board-text-3)]">{hostedByText(hostRef, trustText(trust))}<KitSwatch kit={grid.kit} /></span>
          )}
        </p>
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
        cells={grid.cells}
        boardView={boardView}
        kit={grid.kit}
        heat={grid.heat}
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
        payWithin={status === "open" ? payWithinText(b.paymentWindowHours) : null}
        underBoard={
          <>
            {/* 12 px of frame, then the legend's 8 px gap (Mosaic §8 budget). */}
            <div className="mt-5"><BoardLegend view={boardView} flight={legendFlight} kit={grid.kit} /></div>
            {/* Plain text in this plan; it becomes the Show mine toggle in the game-structure plan (recorded ruling 1). */}
            {youHave && <p className="mt-1 text-small text-[var(--board-text-2)]" data-testid="you-have">{youHave}</p>}
          </>
        }
      >
        {b.seedCommitment && (
          <p className="mt-1 text-small text-[var(--board-text-2)]">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
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
