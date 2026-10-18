import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { hostProfile } from "@/domain/breaks/queries";
import { feedThumbs, listFeed } from "@/domain/breaks/feed";
import { formatMonthYear } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { BreakCard } from "@/components/break-card";
import { hostRecordLines, hostRecordText, pastText } from "@/components/break/frame-copy";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";
import { wallViewport } from "@/app/wall";

type Props = { params: Promise<{ handle: string }> };

/** A wall route from this task on: its browser chrome follows the page (Mosaic §8, recorded ruling 12). */
export const viewport = wallViewport;

/** The decorative board over the record: sixteen open cells in the host's kit (recorded ruling 20: no break is named for it). */
const KIT_BOARD = kitThumbCells(Array.from({ length: 16 }, (_, i) => ({ number: i + 1, state: "open" as const, bonus: false })));

function cleanHandle(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* keep the raw segment */ }
  return s.replace(/^@/, "").slice(0, 40);
}

/** One transaction per request, shared by the metadata and the page. Public data only (hostProfile). */
const loadProfile = cache(async (raw: string) =>
  db.transaction(async (tx) => {
    const profile = await hostProfile(tx, cleanHandle(raw));
    if (!profile) return null;
    const now = new Date();
    const open = await listFeed(tx, { sort: "newest", hostHandle: profile.handle, now });
    return { profile, open, now, thumbs: await feedThumbs(tx, open.map((b) => b.id)) };
  }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const d = await loadProfile(handle);
  return d ? { title: `@${d.profile.handle}`, description: hostRecordText(d.profile) } : {};
}

export default async function HostProfilePage({ params }: Props) {
  const { handle } = await params;
  const d = await loadProfile(handle);
  if (!d) notFound();
  const { profile, open, thumbs, now } = d;
  const [record, stall] = hostRecordLines(profile, now);
  return (
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12), so its text takes the wall inks.
    <main data-wall className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6" style={{ color: "var(--board-text)" }}>
      <section className="flex items-center gap-4">
        <Avatar name={profile.displayName ?? profile.handle} size={56} />
        <div className="min-w-0">
          {/* Wall titles are Big Shoulders 800 (Mosaic §1.1). */}
          <h1 className="font-shoulders text-wall-title font-extrabold">@{profile.handle}</h1>
          {profile.displayName && profile.displayName !== profile.handle && <p style={{ color: "var(--board-text-2)" }}>{profile.displayName}</p>}
        </div>
      </section>
      {/* The record under a board in the host's kit (Mosaic §8): the board first, the record stacked beneath it. */}
      <section aria-label="Record" className="flex flex-col items-start gap-3">
        <KitThumb cells={KIT_BOARD} kit={profile.kit} heat={0} size={64} />
        <div className="min-w-0 space-y-1">
          {/* Counts only (Mosaic §9): no other state words, no money, no ranking against other hosts. */}
          <p data-testid="host-record">{record}</p>
          {stall && <p className="text-small" style={{ color: "var(--board-text-2)" }} data-testid="host-stall">{stall}</p>}
          {/* Once a break has run, the record carries the date itself, so it is never said twice. */}
          {profile.breaksRun === 0 && <p className="text-small" style={{ color: "var(--board-text-3)" }} data-testid="profile-since">On Breaks since {formatMonthYear(profile.since)}.</p>}
        </div>
      </section>
      <section aria-labelledby="open-breaks" className="space-y-3">
        <h2 id="open-breaks" className="text-headline font-semibold">Open breaks</h2>
        {open.length > 0 ? (
          <ul className="space-y-3">{open.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}</ul>
        ) : (
          <p style={{ color: "var(--board-text-2)" }}>No open breaks right now.</p>
        )}
      </section>
      <p className="text-small" style={{ color: "var(--board-text-3)" }} data-testid="profile-past">{pastText(profile.pastCount)}</p>
    </main>
  );
}
