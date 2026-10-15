import Link from "next/link";
import { db } from "@/db/client";
import { feedThumbs, latestRanBreak, listFeed } from "@/domain/breaks/feed";
import { viewerZone } from "@/lib/zone";
import { ButtonLink } from "@/components/button";
import { BreakCard } from "@/components/break-card";
import { thumbColumns } from "@/components/grid/layout";
import { heroNumbers, ranText } from "./landing-copy";

/** The board after a draw: every line paid (black), the winning line green. Decorative; the caption says it. */
function HeroGrid({ lineCount, topLine }: { lineCount: number; topLine: number }) {
  const numbers = heroNumbers(lineCount, topLine);
  return (
    <span aria-hidden className="grid shrink-0 border-t border-l border-wire-strong" style={{ width: 112, gridTemplateColumns: `repeat(${thumbColumns(numbers.length)}, minmax(0, 1fr))` }}>
      {numbers.map((n) => (
        <span key={n} className={`aspect-square border-r border-b border-wire-strong ${n === topLine ? "bg-green" : "bg-ink"}`} />
      ))}
    </span>
  );
}

export default async function Home() {
  const now = new Date();
  const zone = await viewerZone();
  const { hero, cards, thumbs } = await db.transaction(async (tx) => {
    const hero = await latestRanBreak(tx);
    const cards = await listFeed(tx, { sort: "newest", limit: 6, now });
    return { hero, cards, thumbs: await feedThumbs(tx, cards.map((c) => c.id)) };
  });
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      {hero && (
        <Link href={`/b/${hero.breakId}/result`} data-testid="hero" className="flex items-center gap-4 rounded-card border border-wire bg-card p-3">
          <HeroGrid lineCount={hero.lineCount} topLine={hero.topLine} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold">{hero.title}</span>
            <span className="block text-small">Top spot: line {hero.topLine}.</span>
            <span className="block text-small text-ink-2">{ranText(hero.ranAt, now, zone.tz)} Anyone can check the draw.</span>
          </span>
        </Link>
      )}
      <section className="space-y-4">
        <h1 className="font-condensed text-display font-semibold">Group buys for darts gear.</h1>
        <p className="max-w-[65ch]">See every host&apos;s record, and check every draw yourself.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/breaks" data-testid="browse-breaks">Browse breaks</ButtonLink>
          <ButtonLink href="/legal/draw" variant="secondary">How draws work</ButtonLink>
        </div>
      </section>
      {cards.length > 0 && (
        <section aria-labelledby="open-now" className="space-y-3">
          <h2 id="open-now" className="text-headline font-semibold">Open now</h2>
          <ul className="space-y-3">{cards.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}</ul>
        </section>
      )}
      {/* No contact address yet (design §8): the invite contact is deferred, so the line ends here. */}
      <p className="text-small text-ink-2">Hosting on Facebook now? Breaks is invite-only for hosts.</p>
    </main>
  );
}
