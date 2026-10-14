import type { GridCell } from "@/domain/breaks/grid";
import { formatMoney } from "@/lib/money";
import { joinAnd, plural } from "@/lib/list";
import { cellStateWord } from "@/components/grid/cell-label";

/**
 * `?pick=4,7,11` → sorted, unique, in-range line numbers. Anything else is ignored.
 * Not trimmed to the allowance here: which picks are still open is known only in `reconcileSelection`, which trims,
 * so a taken pick never costs the buyer an open one.
 */
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

/** A line a buyer can select: open and not a bonus line. */
export const isSelectable = (c: Pick<GridCell, "state" | "bonus">): boolean => c.state === "open" && !c.bonus;

/**
 * After `?pick=` or fresh server props: keep selectable lines, then trim to the allowance, dropping the highest numbers first.
 * `taken`: lines someone else took (announce "was just taken"). `overLimit`: open lines dropped for the allowance (show the limit hint).
 * My own optimistic lines, bonus and reserved lines, and numbers not on the board drop silently.
 */
export function reconcileSelection(
  selected: readonly number[],
  cells: readonly GridCell[],
  remaining: number,
): { selected: number[]; taken: number[]; overLimit: number[] } {
  const byNumber = new Map(cells.map((c) => [c.number, c]));
  const open: number[] = [];
  const taken: number[] = [];
  for (const n of [...new Set(selected)].sort((a, b) => a - b)) {
    const c = byNumber.get(n);
    if (!c) continue;
    if (isSelectable(c)) open.push(n);
    else if (c.state !== "open" && c.state !== "reserved" && !c.mine) taken.push(n);
  }
  const cap = Math.max(0, remaining);
  return { selected: open.slice(0, cap), taken, overLimit: open.slice(cap) };
}

/** A tap on a cell. Deselecting always works (also when a refresh left the selection over the allowance). */
export function toggleSelection(selected: readonly number[], c: GridCell, remaining: number): { next: number[]; blocked: boolean } {
  if (selected.includes(c.number)) return { next: selected.filter((x) => x !== c.number), blocked: false };
  if (!isSelectable(c)) return { next: [...selected], blocked: false };
  if (selected.length >= remaining) return { next: [...selected], blocked: true };
  return { next: [...selected, c.number].sort((a, b) => a - b), blocked: false };
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

/** The same words said again within 3 s (a refused claim's cap note, then the refresh that trims the selection): skip the second. */
export function isRepeat(last: { text: string; at: number } | null, text: string, now: number): boolean {
  return last !== null && last.text === text && now - last.at < 3000;
}
