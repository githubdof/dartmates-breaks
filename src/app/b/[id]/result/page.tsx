import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
import { QUICKNET } from "@/crypto/beacon";
import type { PublicInputs } from "@/crypto/verify";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatDateTime } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { shareText } from "@/lib/share-text";
import { LocalTime } from "@/components/local-time";
import { CopyField } from "@/components/copy-field";
import { getCaller } from "@/auth/session";
import { getBreakPage } from "@/domain/breaks/queries";
import { shapeGrid } from "@/domain/breaks/grid";
import { placesOf, type Place } from "@/domain/draws/places";
import { hostLabel } from "@/components/break/frame-copy";
import { withPlaces } from "./board-cells";
import { placeLabel, topSpotText } from "./reveal-plan";
import { ShareButton } from "./share-button";
import { Reveal } from "./reveal";
import { Verify } from "./verify";
import { wallViewport } from "@/app/wall";
import { breakPhotos } from "@/domain/photos/queries";
import { pagePhotos } from "@/photos/page-photos";
import { holderSet, photoAudience, photoViewer } from "@/photos/viewer";
import { photoStorage } from "@/storage/photo-storage";
import { PrizesBlock } from "@/components/photos/prizes-block";
import { placeRows } from "@/components/photos/prizes-model";
import { ViewerRoot } from "@/components/photos/viewer-root";

type Props = { params: Promise<{ id: string }> };

/** A wall route (Mosaic §8): its browser chrome follows the page (recorded ruling 12). */
export const viewport = wallViewport;

// The wall's text (Mosaic §4): titles 16.8:1, captions 11.5:1. Big Shoulders 800 for the headline (40/40).
const TEXT = "text-[color:var(--board-text)]";
const CAPTION = "text-[color:var(--board-text-2)]";
const DISPLAY = "font-shoulders text-wall-display font-extrabold";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  return res ? { title: `${res.breakTitle}: result`, description: `Top spot: line ${res.ranking[0]}. Check the draw yourself.` } : {};
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const caller = await getCaller();
  const now = new Date();
  const data = await db.transaction(async (tx) => {
    const res = await getDrawResult(tx, id);
    if (!res) return null;
    const page = await getBreakPage(tx, id);
    if (!page) return null;
    // The holders of a drawn break are the owners of its entries. No Storage call inside the transaction.
    const viewer = photoViewer(caller, { hostId: page.break.hostId, holderIds: holderSet(res.entries.map((e) => e.ownerId)) });
    return { res, page, viewer, photos: await breakPhotos(tx, id, viewer) };
  });
  if (!data) notFound();
  const { res, page, viewer, photos } = data;
  const handleOf: Record<number, string> = Object.fromEntries(res.entries.map((e) => [e.number, e.handleAtDraw]));
  // The viewer's view (§6): holders see flights, everyone else the host's kit. Won places are public here.
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid: 0 } : null, now);
  // The prize places (Task 6): every prize rank of 1 to 3 with its line; the reveal throws one dart per place.
  const placed = placesOf(res.ranking, res.awards.map((a) => a.rank));
  const places: Place[] = placed.map((x) => x.place);
  const cells = withPlaces(grid.cells, placed);
  const winner = res.awards.find((a) => a.rank === 1);
  const others = res.awards.filter((a) => a.rank > 1);
  const handle = (n: number) => (handleOf[n] ? `@${handleOf[n]}` : "");
  const publicInputs: PublicInputs = {
    breakId: id,
    version: res.draw.algorithmVersion,
    secret: res.draw.secret,
    beaconRound: res.draw.beaconRound,
    beaconRandomness: res.draw.beaconRandomness,
    entries: res.entries.map((e) => ({ number: e.number, ownerId: e.ownerId })),
    ranking: res.ranking,
    resultHash: res.draw.resultHash,
    seedCommitment: res.seedCommitment,
  };
  const top = res.ranking[0];
  const share = shareText({ state: "ran", topLine: top, topHandle: handleOf[top] || null, url: `${env().APP_URL}/b/${id}/result` });
  const relayUrl = `${QUICKNET.relays[0]}/${QUICKNET.chainHash}/public/${res.draw.beaconRound}`;
  const zone = await viewerZone();
  const audience = photoAudience(viewer);
  const pp = await pagePhotos(photoStorage(), photos, placeRows(page.prizes, page.items), { audience, tz: zone.tz });
  const when = (d: Date) => <LocalTime iso={d.toISOString()} fallback={formatDateTime(d, zone.tz, zone.labelled)} kind="datetime" />;

  return (
    <main data-wall className="mx-auto max-w-[600px] px-4 pb-8 sm:px-6">
      <ViewerRoot photos={pp.viewer}>
      {res.draw.beaconSignature === "fake" && (
        <div role="alert" data-testid="fake-beacon" className="mt-4 rounded-card border border-red bg-card px-4 py-3 text-small text-red">
          Test draw. This used stand-in randomness, so it proves nothing. Real draws never show this box.
        </div>
      )}
      <p className="mt-4 text-small"><Link href={`/b/${id}`} className={`${CAPTION} underline underline-offset-4`}>{res.breakTitle}</Link></p>
      <Reveal
        breakId={id}
        lineCount={page.break.lineCount}
        cells={cells}
        kit={grid.kit}
        heat={grid.heat}
        order={res.ranking}
        places={places}
        handleOf={handleOf}
        hostName={hostLabel(page.host)}
        view={grid.showHolders ? "member" : "kit"}
        headline={
          <>
            <h1 id="top-spot" data-testid="winner" className={`${DISPLAY} ${TEXT}`}>{topSpotText(top)}</h1>
            <p className={`mt-2 text-headline font-semibold ${TEXT}`}>{handle(top)}</p>
            {winner?.itemName && <p className={CAPTION}>Wins {winner.itemName}.</p>}
            {winner && !winner.itemName && <p className={CAPTION}>Picks one of the prize choices.</p>}
            {others.length > 0 && (
              <ul className={`mt-2 space-y-1 ${CAPTION}`}>
                {others.map((a) => <li key={a.rank}>{placeLabel(a.rank)} place: {a.winnerHandle ? `@${a.winnerHandle}` : "unknown"}{a.itemName ? `, ${a.itemName}` : ""}.</li>)}
              </ul>
            )}
          </>
        }
        after={
          <>
            <h2 className={`mt-6 text-headline font-semibold ${TEXT}`}>Full order</h2>
            <ol data-testid="full-order" className="mt-2 divide-y divide-wire-2 rounded-card border border-wire bg-card text-ink">
              {res.ranking.map((n, i) => (
                <li key={n} className="flex min-h-11 items-center gap-3 px-4 text-small">
                  <span className="w-20 text-ink-2">{placeLabel(i + 1)}</span>
                  <span className="w-16 font-condensed text-grid font-semibold tabular">Line {n}</span>
                  <span className="min-w-0 truncate">{handle(n)}</span>
                </li>
              ))}
            </ol>
            {(pp.places.length > 0 || pp.untagged.length > 0 || pp.removed.length > 0 || pp.notice) && (
              <PrizesBlock places={pp.places} untagged={pp.untagged} removed={pp.removed} notice={pp.notice} noticeFirst={audience === "holder"} count={pp.count} />
            )}
          </>
        }
      />
      <p className={`mt-4 max-w-[65ch] text-small ${CAPTION}`}>
        Ran {when(res.draw.createdAt)}. Requested by {res.hostHandle ? `@${res.hostHandle}` : "the host"}
        {res.request.onBehalfNote ? `, run by an admin: ${res.request.onBehalfNote}` : ""}.
      </p>
      <ShareButton value={share} />
      <Verify inputs={publicInputs} seed={res.draw.seed} relayUrl={relayUrl} />
      <details className="mt-3 rounded-card border border-wire bg-card text-ink" data-testid="technical-details">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Technical details</summary>
        <div className="space-y-3 px-4 pb-4">
          <CopyField label="Result hash" value={res.draw.resultHash} />
          <p className="text-small text-ink-2">Algorithm version {res.draw.algorithmVersion}.</p>
        </div>
      </details>
      {/* Handles as text, never a glyph: no surface puts a flight beside a handle (§6). */}
      <details className="mt-3 rounded-card border border-wire bg-card text-ink" data-testid="entries">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Entries</summary>
        <ol className="space-y-1 px-4 pb-4 text-small">
          {res.entries.map((e) => <li key={e.number}>Line {e.number}: {e.handleAtDraw ? `@${e.handleAtDraw}` : "unknown"}{e.isBonus ? ", bonus" : ""}</li>)}
        </ol>
      </details>
      {res.voided.length > 0 && (
        <section className={`mt-4 text-small ${TEXT}`}>
          <h2 className="font-semibold">Earlier draws, voided by an admin</h2>
          <ul className={`mt-1 space-y-1 ${CAPTION}`}>
            {res.voided.map((v, i) => <li key={i}>{when(v.createdAt)}: {v.voidReason ?? "no reason recorded"}</li>)}
          </ul>
        </section>
      )}
      </ViewerRoot>
    </main>
  );
}
