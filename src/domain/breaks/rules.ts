import { InvalidInput } from "@/domain/errors";

export function validateDraftInput(i: { lineCount: number; linePriceCents: number; title: string; kind?: string }): void {
  if (!i.title.trim()) throw new InvalidInput("Title is required");
  if (!Number.isInteger(i.lineCount) || i.lineCount < 2) throw new InvalidInput("At least 2 lines");
  if (i.lineCount > 1000) throw new InvalidInput("At most 1000 lines");
  const free = i.kind === "free";
  if (!Number.isInteger(i.linePriceCents) || (free ? i.linePriceCents !== 0 : i.linePriceCents <= 0)) {
    throw new InvalidInput(free ? "Free draws have a price of 0" : "Price per line must be above 0");
  }
}

export function validateDraftForOpen(b: { status: string; lineCount: number }, rank1PrizeCount: number): void {
  if (rank1PrizeCount < 1) throw new InvalidInput("Add at least one item before opening");
}

export const SELF_CLAIM_SHARE = 0.1;
export const BONUS_SHARE = 0.1;
export const GLOBAL_UNPAID_CAP = 30;
