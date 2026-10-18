"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilterChips } from "@/components/filter-chips";

type Option = { value: string; label: string; href: string };

/** Sort chips and the host filter. Every option carries its URL from the server, so the state lives in the address bar. */
export function FeedFilters({ sorts, sort, hosts, host }: { sorts: Option[]; sort: string; hosts: Option[] | null; host: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (options: Option[], value: string) => {
    const o = options.find((x) => x.value === value);
    if (o) start(() => router.push(o.href, { scroll: false }));
  };
  return (
    <div className="space-y-3" aria-busy={pending || undefined}>
      <FilterChips label="Sort" value={sort} options={sorts} onChange={(v) => go(sorts, v)} />
      {hosts && (
        <label className="flex items-center gap-3 text-small">
          <span className="font-semibold">Host</span>
          {/* The feed is on the wall (Mosaic §8): the select takes the wall inks. It inherits the page's cream text, which
              on the paper `bg-card` it had read at about 1:1. */}
          <select value={host} onChange={(e) => go(hosts, e.target.value)} data-testid="host-filter"
            className="h-11 min-w-0 flex-1 rounded-input border border-[var(--board-steel)] bg-[var(--board-wall-2)] px-3 text-body text-[var(--board-text)]">
            {hosts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
