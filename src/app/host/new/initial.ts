import { isGeneratedInstructions, type DraftForEdit, type LastBreakDefaults } from "@/domain/breaks/queries";
import type { ClaimMode } from "@/domain/breaks/rules";
import { formatMoney } from "@/lib/money";
import { blankRow, type PrizeRow } from "./prize-rows";

/**
 * Everything the composer starts from, as the strings its fields hold. `breakId` is set when editing a draft;
 * `newBreakId` is the server-made id of a new break (ruling 22), null when editing.
 */
export type ComposerInitial = {
  breakId: string | null; newBreakId: string | null; title: string; description: string; lineCount: number; price: string;
  paymentWindowHours: string; maxLinesPerUser: string; claimMode: ClaimMode; paymentInstructions: string;
  venmo: string; paypal: string; prize1: PrizeRow[]; prize2: PrizeRow | null;
};

type Handles = { venmo?: string; paypal?: string };

/** The composer's id: the new break's, else the draft's. Always the server's, never a client-made one (ruling 22). */
export function composerBreakId(initial: ComposerInitial): string {
  return (initial.newBreakId ?? initial.breakId) as string;
}

/** 550 → "5.50", 125000 → "1250": what parseComposer reads back to the same cents. */
const dollars = (cents: number) => formatMoney(cents).replace(/[$,]/g, "");

/** A new break starts from the host's last one (design §5.6), or from 50 lines at $5. */
export function newComposerInitial(defaults: LastBreakDefaults | null, handles: Handles, newId: () => string): ComposerInitial {
  const newBreakId = newId();
  return {
    breakId: null, newBreakId, title: "", description: "",
    lineCount: defaults?.lineCount ?? 50,
    price: defaults ? dollars(defaults.linePriceCents) : "5",
    paymentWindowHours: defaults ? String(defaults.paymentWindowHours) : "",
    maxLinesPerUser: defaults?.maxLinesPerUser != null ? String(defaults.maxLinesPerUser) : "",
    claimMode: defaults?.claimMode ?? "pick_or_random",
    paymentInstructions: defaults?.paymentInstructions ?? "",
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    prize1: [blankRow(newId)], prize2: null,
  };
}

/** Editing a draft starts from the draft itself. */
export function draftComposerInitial(d: DraftForEdit, handles: Handles, newId: () => string): ComposerInitial {
  const row = (p: DraftForEdit["topSpot"][number]): PrizeRow => ({ slotKey: p.slotKey, name: p.name, condition: p.condition ?? "" });
  const [firstSecond] = d.secondPlace;
  return {
    breakId: d.id, newBreakId: null, title: d.title, description: d.description, lineCount: d.lineCount, price: dollars(d.linePriceCents),
    paymentWindowHours: String(d.paymentWindowHours),
    maxLinesPerUser: d.maxLinesPerUser != null ? String(d.maxLinesPerUser) : "",
    claimMode: d.claimMode,
    paymentInstructions: isGeneratedInstructions(d.paymentInstructions) ? "" : d.paymentInstructions,
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    // draftForEdit already orders prizes by rank, then creation order within the rank: that is the composer's order.
    prize1: d.topSpot.length > 0 ? d.topSpot.map(row) : [blankRow(newId)],
    // The composer has one 2nd-place row: a draft with several 2nd-place items (only possible through the API)
    // keeps every name in it, under the first one's slot and condition, rather than losing all but the first.
    prize2: firstSecond ? { ...row(firstSecond), name: d.secondPlace.map((p) => p.name).join(", ") } : null,
  };
}
