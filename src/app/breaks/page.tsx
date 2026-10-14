import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { FEED_SORTS, feedHosts, feedThumbs, listFeed } from "@/domain/breaks/feed";
import { BreakCard } from "@/components/break-card";
import { FeedFilters } from "@/components/feed-filters";
import { feedHref, parseFeedParams, SORT_LABELS } from "./params";

export const metadata: Metadata = { title: "Browse breaks" };

type Props = { searchParams: Promise<{ sort?: string | string[]; host?: string | string[] }> };

export default async function FeedPage({ searchParams }: Props) {
  const params = parseFeedParams(await searchParams);
  const now = new Date();
  const { rows, thumbs, hosts } = await db.transaction(async (tx) => {
    const rows = await listFeed(tx, { sort: params.sort, hostHandle: params.host, now });
    return { rows, thumbs: await feedThumbs(tx, rows.map((r) => r.id)), hosts: await feedHosts(tx) };
  });
  const sorts = FEED_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s], href: feedHref({ ...params, sort: s }) }));
  const hostOptions = [
    { value: "", label: "All hosts", href: feedHref({ ...params, host: null }) },
    ...hosts.map((h) => ({ value: h.handle, label: `@${h.handle}`, href: feedHref({ ...params, host: h.handle }) })),
  ];
  // A filtered host with no open break right now still shows as the selected option.
  if (params.host && !hosts.some((h) => h.handle === params.host)) {
    hostOptions.push({ value: params.host, label: `@${params.host}`, href: feedHref(params) });
  }
  const showHosts = hostOptions.length > 2 || params.host !== null;
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Browse breaks</h1>
      <FeedFilters sorts={sorts} sort={params.sort} hosts={showHosts ? hostOptions : null} host={params.host ?? ""} />
      {rows.length > 0 ? (
        <ul aria-label="Open breaks" className="space-y-3">
          {rows.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}
        </ul>
      ) : (
        <p className="text-ink-2" data-testid="feed-empty">
          {params.host ? (
            <>@{params.host} has no open breaks right now. <Link href={feedHref({ ...params, host: null })} className="inline-flex min-h-11 items-center underline underline-offset-4">See all open breaks</Link></>
          ) : "No open breaks right now. Hosts post most evenings."}
        </p>
      )}
    </main>
  );
}
