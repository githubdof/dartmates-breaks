import { LocalTime } from "@/components/local-time";
import { Plate } from "./plate";
import type { PlateData, PrizePlace, PrizesBlockNotice, RemovedPlate } from "./prizes-model";

export type PrizesBlockProps = {
  places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: PrizesBlockNotice | null; noticeFirst: boolean; count: number;
};

function LivePlate({ plate }: { plate: PlateData }) {
  // Task 8b wraps these in the viewer's button; until then they are plain.
  return <span data-viewer-index={plate.index}><Plate photo={plate.photo} size={64} surface="paper" /></span>;
}

function Notice({ notice }: { notice: PrizesBlockNotice }) {
  return (
    <p className="text-small text-ink-2" data-testid="photo-notice-line">
      {`${notice.text} on `}<LocalTime iso={notice.iso} fallback={notice.fallback} kind="datetime" />.
    </p>
  );
}

function RemovedMark({ r }: { r: RemovedPlate }) {
  return (
    <li className="flex flex-col items-start gap-1" data-testid="removed-plate">
      {r.photo ? (
        <Plate photo={r.photo} size={64} surface="paper" />
      ) : (
        <span aria-hidden className="block box-border border border-wire-strong bg-board-wall-2" style={{ width: "66px", height: "66px" }} />
      )}
      <span className="text-[11px] text-ink-2">Removed <LocalTime iso={r.removedIso} fallback={r.removedFallback} kind="date" /></span>
    </li>
  );
}

/**
 * The prizes in rank order with the photos tagged to each (photos spec §8.2). A paper card like Details, always open.
 * It filters nothing: `pagePhotos` decides who may see what, and the result page renders this same block.
 */
export function PrizesBlock({ places, untagged, removed, notice, noticeFirst }: PrizesBlockProps) {
  return (
    <section className="mt-6 rounded-card border border-wire bg-card px-4 py-3" data-testid="prizes-block" aria-labelledby="prizes-heading">
      <h2 id="prizes-heading" className="font-semibold">Prizes</h2>
      {notice && noticeFirst && <div className="mt-1"><Notice notice={notice} /></div>}
      <ul className="mt-2 space-y-3">
        {places.map((p) => (
          <li key={p.key} data-testid="prize-place">
            <p>
              <span className="font-semibold">{p.word}</span>{" "}
              <span>{p.name}</span>
              {p.condition && <span className="text-ink-2">{`, ${p.condition}`}</span>}
            </p>
            {p.variants && <p className="text-small text-ink-2">{p.variants}</p>}
            {p.plates.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{p.plates.map((pl) => <LivePlate key={pl.id} plate={pl} />)}</div>}
          </li>
        ))}
      </ul>
      {untagged.length > 0 && (
        <div className="mt-3">
          <h3 className="text-small font-semibold">Also in the photos</h3>
          <div className="mt-2 flex flex-wrap gap-2">{untagged.map((pl) => <LivePlate key={pl.id} plate={pl} />)}</div>
        </div>
      )}
      {!(notice && noticeFirst) && notice && <div className="mt-3"><Notice notice={notice} /></div>}
      {removed.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{removed.map((r) => <RemovedMark key={r.id} r={r} />)}</ul>}
    </section>
  );
}
