import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { hostProfile } from "@/domain/breaks/queries";
import { feedThumbs, listFeed } from "@/domain/breaks/feed";
import { formatMonthYear } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { BreakCard } from "@/components/break-card";
import { pastText, profileTrustText } from "@/components/break/frame-copy";

type Props = { params: Promise<{ handle: string }> };

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
    const open = await listFeed(tx, { sort: "newest", hostHandle: profile.handle, now: new Date() });
    return { profile, open, thumbs: await feedThumbs(tx, open.map((b) => b.id)) };
  }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const d = await loadProfile(handle);
  return d ? { title: `@${d.profile.handle}`, description: profileTrustText(d.profile) } : {};
}

export default async function HostProfilePage({ params }: Props) {
  const { handle } = await params;
  const d = await loadProfile(handle);
  if (!d) notFound();
  const { profile, open, thumbs } = d;
  return (
    <main className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
      <section className="flex items-center gap-4">
        <Avatar name={profile.displayName ?? profile.handle} size={56} />
        <div className="min-w-0">
          <h1 className="font-condensed text-title font-semibold">@{profile.handle}</h1>
          {profile.displayName && profile.displayName !== profile.handle && <p className="text-ink-2">{profile.displayName}</p>}
        </div>
      </section>
      <div className="space-y-1">
        <p data-testid="profile-trust">{profileTrustText(profile)}</p>
        {/* From 5 breaks on the trust sentence carries the date itself (profileTrustText). */}
        {profile.breaksRun < 5 && <p className="text-small text-ink-2" data-testid="profile-since">On Breaks since {formatMonthYear(profile.since)}.</p>}
      </div>
      <section aria-labelledby="open-breaks" className="space-y-3">
        <h2 id="open-breaks" className="text-headline font-semibold">Open breaks</h2>
        {open.length > 0 ? (
          <ul className="space-y-3">{open.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}</ul>
        ) : (
          <p className="text-ink-2">No open breaks right now.</p>
        )}
      </section>
      <p className="text-small text-ink-2" data-testid="profile-past">{pastText(profile.pastCount)}</p>
    </main>
  );
}
