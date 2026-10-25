import { z } from "zod";
import { MAX_LINES, CLAIM_MODES } from "@/domain/breaks/rules";
import { isItemCondition } from "@/domain/breaks/condition";
import type { CreateDraftInput, PrizeInput } from "@/domain/breaks/commands";
import { isUuid } from "@/lib/is-uuid";

const STALE_FORM = "This form is out of date. Reload the page and try again.";

const schema = z.object({
  title: z.string().trim().min(1, "Add a title").max(120, "Title: at most 120 characters"),
  description: z.string().max(2000, "Description: at most 2000 characters"),
  lineCount: z.coerce.number({ error: "Lines: enter a number" }).int("Lines: whole numbers only").min(2, "Lines: at least 2").max(MAX_LINES, `Lines: at most ${MAX_LINES}`),
  linePrice: z.coerce.number({ error: "Price per line: enter an amount" }).positive("Price per line: more than $0").min(0.01, "Price per line: at least $0.01").max(10000, "Price per line: at most $10,000"),
  paymentWindowHours: z.coerce.number({ error: "Hours to pay: enter a number" }).int("Hours to pay: whole hours").min(1, "Hours to pay: at least 1").max(336, "Hours to pay: at most 336"),
  maxLinesPerUser: z.coerce.number({ error: "Lines per person: enter a number" }).int("Lines per person: whole numbers").min(1, "Lines per person: at least 1").max(MAX_LINES, `Lines per person: at most ${MAX_LINES}`).nullable(),
  claimMode: z.enum(CLAIM_MODES, { error: "Choose how buyers get lines" }),
  paymentInstructions: z.string().max(500, "Payment instructions: at most 500 characters"),
  venmo: z.string().max(60, "Venmo: at most 60 characters"),
  paypal: z.string().max(60, "PayPal: at most 60 characters"),
  prize1: z.array(z.string().max(120, "Top spot: at most 120 characters")),
  prize2: z.string().max(120, "2nd place: at most 120 characters"),
  intent: z.enum(["draft", "open"]),
});

export type ComposerParsed = { ok: true; input: CreateDraftInput; open: boolean } | { ok: false; error: string };

/** FormData → createDraft input. Blank optional numbers take their defaults instead of becoming 0. */
export function parseComposer(form: FormData): ComposerParsed {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const optional = (k: string) => (text(k).trim() === "" ? undefined : text(k));
  const raw = {
    title: text("title"),
    description: text("description"),
    lineCount: optional("lineCount"),
    linePrice: optional("linePrice")?.replace(/[$,\s]/g, "") || undefined, // "$5" and "1,000" are fine
    paymentWindowHours: optional("paymentWindowHours") ?? 24,
    maxLinesPerUser: optional("maxLinesPerUser") ?? null,
    claimMode: text("claimMode") || "pick_or_random",
    paymentInstructions: text("paymentInstructions"),
    venmo: text("venmo"),
    paypal: text("paypal"),
    prize1: form.getAll("prize1").filter((v): v is string => typeof v === "string"),
    prize2: text("prize2"),
    intent: text("intent") || "open",
  };
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again" };
  const d = p.data;
  if (!d.prize1.some((s) => s.trim() !== "")) return { ok: false, error: "Top spot: name the prize" };
  const strings = (k: string) => form.getAll(k).filter((v): v is string => typeof v === "string");
  const slots1 = strings("prize1Slot");
  const conditions1 = strings("prize1Condition");
  if (slots1.length !== d.prize1.length || conditions1.length !== d.prize1.length) return { ok: false, error: STALE_FORM };
  const rows1 = d.prize1.map((name, i) => ({ name: name.trim(), slotKey: slots1[i], condition: conditions1[i] }));
  const row2 = { name: d.prize2.trim(), slotKey: text("prize2Slot"), condition: text("prize2Condition") };
  // Every posted slot is checked, blank rows included: a broken form is caught whichever row it is in.
  const allSlots = [...slots1, ...(row2.slotKey !== "" || row2.name !== "" ? [row2.slotKey] : [])];
  if (!allSlots.every(isUuid) || new Set(allSlots.map((s) => s.toLowerCase())).size !== allSlots.length) return { ok: false, error: STALE_FORM };
  const named = [...rows1.filter((r) => r.name !== ""), ...(row2.name !== "" ? [row2] : [])];
  const unconditioned = named.find((r) => !isItemCondition(r.condition));
  if (unconditioned) return { ok: false, error: `${unconditioned.name}: choose its condition` };
  const prize = (r: { name: string; slotKey: string; condition: string }): PrizeInput => ({ name: r.name, slotKey: r.slotKey, condition: r.condition as PrizeInput["condition"] });
  const items = rows1.filter((r) => r.name !== "").map(prize);
  const venmo = d.venmo.trim();
  const paypal = d.paypal.trim();
  if (d.intent === "open" && !venmo && !paypal && !d.paymentInstructions.trim()) {
    return { ok: false, error: "Add a Venmo or PayPal handle, or payment instructions, before opening" };
  }
  return {
    ok: true,
    open: d.intent === "open",
    input: {
      title: d.title,
      description: d.description,
      lineCount: d.lineCount,
      linePriceCents: Math.round(d.linePrice * 100),
      paymentWindowHours: d.paymentWindowHours,
      maxLinesPerUser: d.maxLinesPerUser,
      claimMode: d.claimMode,
      paymentInstructions: d.paymentInstructions,
      paymentHandles: { venmo, paypal }, // always sent, so clearing a handle sticks
      items,
      secondPlace: row2.name !== "" ? [prize(row2)] : [],
    },
  };
}

