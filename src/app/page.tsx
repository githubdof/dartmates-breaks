import Link from "next/link";
import { db } from "@/db/client";
import { feedThumbs, latestRanBreak, listFeed } from "@/domain/breaks/feed";
import { viewerZone } from "@/lib/zone";
import { ButtonLink } from "@/components/button";
import { leadPhotos } from "@/domain/photos/queries";
import { leadSrcs } from "@/photos/lead-srcs";
import { photoStorage } from "@/storage/photo-storage";
import { BreakCard } from "@/components/break-card";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";
import { ranText } from "./landing-copy";
import { wallViewport } from "./wall";

/** A wall route from this task on: its browser chrome follows the page (Mosaic §8, recorded ruling 12). */
export const viewport = wallViewport;

export default async function Home() {
  const now = new Date();
  const zone = await viewerZone();
  const { hero, cards, thumbs, leads } = await db.transaction(async (tx) => {
    const hero = await latestRanBreak(tx);
    const cards = await listFeed(tx, { sort: "newest", limit: 6, now });
    return { hero, cards, thumbs: await feedThumbs(tx, cards.map((c) => c.id)), leads: await leadPhotos(tx, cards.map((c) => c.id)) };
  });
  const srcs = await leadSrcs(photoStorage(), leads, 160);
  return (
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12), so its text takes the wall inks.
    <main data-wall className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6" style={{ color: "var(--board-text)" }}>
      {hero && (
        <Link href={`/b/${hero.breakId}/result`} data-testid="hero" className="flex items-center gap-4 py-2">
          {/* The kit board of the most recent ran break with its black bulls (Mosaic §8); a ran break is closed, so the lamp is up. */}
          <KitThumb cells={kitThumbCells(hero.cells, hero.places)} kit={hero.kit} heat={hero.heat} size={112} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold">{hero.title}</span>
            <span className="block text-small">Top spot: line {hero.topLine}.</span>
            <span className="block text-small" style={{ color: "var(--board-text-2)" }}>{ranText(hero.ranAt, now, zone.tz)} Anyone can check the draw.</span>
          </span>
        </Link>
      )}
      <section className="space-y-4">
        <h1 className="font-shoulders text-wall-display font-extrabold">Group buys for darts gear.</h1>
        <p className="max-w-[65ch]">See every host&apos;s record, and check every draw yourself.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/breaks" data-testid="browse-breaks">Browse breaks</ButtonLink>
          <ButtonLink href="/legal/draw" variant="secondary">How draws work</ButtonLink>
        </div>
      </section>
      {cards.length > 0 && (
        <section aria-labelledby="open-now" className="space-y-3">
          <h2 id="open-now" className="text-headline font-semibold">Open now</h2>
          <ul className="space-y-3">{cards.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} photo={srcs.get(b.id) ?? null} />)}</ul>
        </section>
      )}
      {/* No contact address yet (design §8): the invite contact is deferred, so the line ends here. */}
      <p className="text-small" style={{ color: "var(--board-text-3)" }}>Hosting on Facebook now? Breaks is invite-only for hosts.</p>
    </main>
  );
}
