import { isFeedSort, type FeedSort } from "@/domain/breaks/feed";

export type FeedParams = { sort: FeedSort; host: string | null };

export const SORT_LABELS: Record<FeedSort, string> = { newest: "Newest", filling: "Filling fast", almost: "Almost full" };

const HANDLE = /^[a-z0-9_]{3,20}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?sort=&host= → what the feed shows. Unknown values fall back to the defaults; nothing throws. */
export function parseFeedParams(sp: { sort?: string | string[]; host?: string | string[] }): FeedParams {
  const sort = first(sp.sort);
  const host = first(sp.host)?.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");
  return { sort: isFeedSort(sort) ? sort : "newest", host: host && HANDLE.test(host) ? host : null };
}

/** The shortest URL for a choice: defaults are left out. */
export function feedHref(p: FeedParams): string {
  const q = new URLSearchParams();
  if (p.sort !== "newest") q.set("sort", p.sort);
  if (p.host) q.set("host", p.host);
  const s = q.toString();
  return s ? `/breaks?${s}` : "/breaks";
}
