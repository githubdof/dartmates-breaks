import { isGeneratedInstructions, type DraftForEdit, type LastBreakDefaults } from "@/domain/breaks/queries";
import type { ClaimMode } from "@/domain/breaks/rules";
import { formatMoney } from "@/lib/money";

/** Everything the composer starts from, as the strings its fields hold. `breakId` is set when editing a draft. */
export type ComposerInitial = {
  breakId: string | null; title: string; description: string; lineCount: number; price: string;
  paymentWindowHours: string; maxLinesPerUser: string; claimMode: ClaimMode; paymentInstructions: string;
  venmo: string; paypal: string; prize1: string[]; prize2: string;
};

type Handles = { venmo?: string; paypal?: string };

/** 550 → "5.50", 125000 → "1250": what parseComposer reads back to the same cents. */
const dollars = (cents: number) => formatMoney(cents).replace(/[$,]/g, "");

/** A new break starts from the host's last one (design §5.6), or from 50 lines at $5. */
export function newComposerInitial(defaults: LastBreakDefaults | null, handles: Handles): ComposerInitial {
  return {
    breakId: null, title: "", description: "",
    lineCount: defaults?.lineCount ?? 50,
    price: defaults ? dollars(defaults.linePriceCents) : "5",
    paymentWindowHours: defaults ? String(defaults.paymentWindowHours) : "",
    maxLinesPerUser: defaults?.maxLinesPerUser != null ? String(defaults.maxLinesPerUser) : "",
    claimMode: defaults?.claimMode ?? "pick_or_random",
    paymentInstructions: defaults?.paymentInstructions ?? "",
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    prize1: [""], prize2: "",
  };
}

/** Editing a draft starts from the draft itself. */
export function draftComposerInitial(d: DraftForEdit, handles: Handles): ComposerInitial {
  return {
    breakId: d.id, title: d.title, description: d.description, lineCount: d.lineCount, price: dollars(d.linePriceCents),
    paymentWindowHours: String(d.paymentWindowHours),
    maxLinesPerUser: d.maxLinesPerUser != null ? String(d.maxLinesPerUser) : "",
    claimMode: d.claimMode,
    paymentInstructions: isGeneratedInstructions(d.paymentInstructions) ? "" : d.paymentInstructions,
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    // The composer has one 2nd-place field: a draft with several 2nd-place items (only possible through the API)
    // keeps every name in it rather than silently losing all but the first when it is saved again.
    // Task 3b replaces this: the composer keeps names only until it carries slots and conditions.
    prize1: d.topSpot.length > 0 ? d.topSpot.map((p) => p.name) : [""], prize2: d.secondPlace.map((p) => p.name).join(", "),
  };
}
