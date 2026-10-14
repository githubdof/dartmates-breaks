import type { GridCell } from "@/domain/breaks/grid";
import { formatMoney } from "@/lib/money";
import { joinAnd, plural } from "@/lib/list";
import { cellStateWord } from "@/components/grid/cell-label";

/** `?pick=4,7,11` → sorted, unique, in-range line numbers. Anything else is ignored. */
export function parsePick(raw: string | string[] | undefined, lineCount: number): number[] {
  const s = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const t = part.trim();
    if (!/^\d{1,3}$/.test(t)) continue;
    const n = Number(t);
    if (n >= 1 && n <= lineCount) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** After fresh server props: keep open lines; announce lines someone else took; drop my own optimistic lines quietly. */
export function reconcileSelection(selected: readonly number[], cells: readonly GridCell[]): { kept: number[]; dropped: number[] } {
  const byNumber = new Map(cells.map((c) => [c.number, c]));
  const kept: number[] = [];
  const dropped: number[] = [];
  for (const n of selected) {
    const c = byNumber.get(n);
    if (c && c.state === "open" && !c.bonus) kept.push(n);
    else if (c && !c.mine) dropped.push(n);
  }
  return { kept, dropped };
}

export function toggleSelection(selected: readonly number[], n: number, remaining: number): { next: number[]; blocked: boolean } {
  if (selected.includes(n)) return { next: selected.filter((x) => x !== n), blocked: false };
  if (selected.length >= remaining) return { next: [...selected], blocked: true };
  return { next: [...selected, n].sort((a, b) => a - b), blocked: false };
}

/** "Lines 7, 12, 31, $15"; past three: "Lines 7, 12, 31 +2, $25". */
export function selectionSummary(numbers: readonly number[], priceCents: number, maxShown = 3): string {
  const total = formatMoney(numbers.length * priceCents);
  if (numbers.length === 1) return `Line ${numbers[0]}, ${total}`;
  const more = numbers.length > maxShown ? ` +${numbers.length - maxShown}` : "";
  return `Lines ${numbers.slice(0, maxShown).join(", ")}${more}, ${total}`;
}

export function selectionAnnouncement(count: number, priceCents: number): string {
  if (count === 0) return "No lines selected";
  return `${count} ${plural(count, "line", "lines")} selected, ${formatMoney(count * priceCents)}`;
}

export function takenAnnouncement(numbers: readonly number[]): string {
  return numbers.length === 1 ? `Line ${numbers[0]} was just taken.` : `Lines ${joinAnd(numbers)} were just taken.`;
}

/** Partial success is normal: "You have lines 4 and 11. Line 7 was just taken." */
export function outcomeText(got: readonly number[], taken: readonly number[]): string {
  const have = got.length === 0 ? "" : got.length === 1 ? `You have line ${got[0]}.` : `You have lines ${joinAnd(got)}.`;
  const lost = taken.length === 0 ? "" : takenAnnouncement(taken);
  return [have, lost].filter(Boolean).join(" ");
}

/** The popover text shown when a taken cell is tapped (also announced in the live region). The handle appears only if the server sent it. */
export function cellNote(c: GridCell): string {
  if (!c.mine && c.holder) return `Line ${c.number}: @${c.holder}, ${cellStateWord(c)}`;
  return `Line ${c.number}: ${cellStateWord(c)}`;
}

const breakPath = (breakId: string, pick: readonly number[]) => (pick.length ? `/b/${breakId}?pick=${pick.join(",")}` : `/b/${breakId}`);
export const loginHref = (breakId: string, pick: readonly number[]) => `/login?next=${encodeURIComponent(breakPath(breakId, pick))}`;
export const onboardingHref = (breakId: string, pick: readonly number[]) => `/onboarding?next=${encodeURIComponent(breakPath(breakId, pick))}`;
