import type { FeedSort } from "@/domain/breaks/feed";

/**
 * The feed's sort chips (Mosaic §8): Newest, and Closest to full, which is the domain's "almost" sort (fewest open
 * numbered lines first). "Filling fast" is retired; an old ?sort=filling link falls back to Newest.
 */
export const FEED_CHIPS = ["newest", "almost"] as const satisfies readonly FeedSort[];
export type FeedChip = (typeof FEED_CHIPS)[number];
const isFeedChip = (v: unknown): v is FeedChip => typeof v === "string" && (FEED_CHIPS as readonly string[]).includes(v);

export type FeedParams = { sort: FeedChip; host: string | null };

export const SORT_LABELS: Record<FeedChip, string> = { newest: "Newest", almost: "Closest to full" };

const HANDLE = /^[a-z0-9_]{3,20}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?sort=&host= → what the feed shows. Unknown and retired values fall back to the defaults; nothing throws. */
export function parseFeedParams(sp: { sort?: string | string[]; host?: string | string[] }): FeedParams {
  const sort = first(sp.sort);
  const host = first(sp.host)?.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");
  return { sort: isFeedChip(sort) ? sort : "newest", host: host && HANDLE.test(host) ? host : null };
}

/** The shortest URL for a choice: defaults are left out. */
export function feedHref(p: FeedParams): string {
  const q = new URLSearchParams();
  if (p.sort !== "newest") q.set("sort", p.sort);
  if (p.host) q.set("host", p.host);
  const s = q.toString();
  return s ? `/breaks?${s}` : "/breaks";
}
