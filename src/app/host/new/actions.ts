"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { createDraft, openBreak } from "@/domain/breaks/commands";
import { MAX_LINES } from "@/domain/breaks/rules";

const schema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  lineCount: z.coerce.number().int().min(2).max(MAX_LINES),
  linePrice: z.coerce.number().positive(), // dollars
  paymentWindowHours: z.coerce.number().int().min(1).max(336).default(24),
  maxLinesPerUser: z.coerce.number().int().min(1).optional(),
  allowRandomClaims: z.literal("on").optional(),
  paymentInstructions: z.string().max(500).default(""),
  venmo: z.string().max(60).default(""),
  paypal: z.string().max(60).default(""),
  items: z.string().min(1), // one item name per line
  openNow: z.literal("on").optional(),
});

export type ComposerState = { error?: string } | null;

export async function createAndOpen(_: ComposerState, form: FormData): Promise<ComposerState> {
  const raw = Object.fromEntries(form);
  if (raw.maxLinesPerUser === "") delete raw.maxLinesPerUser;
  const p = schema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form and try again" };
  const items = p.data.items.split("\n").map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  if (items.length === 0) return { error: "Add at least one item" };
  const venmo = p.data.venmo.trim();
  const paypal = p.data.paypal.trim();
  const r = await action(async (tx, caller) => {
    const { breakId } = await createDraft(tx, caller, {
      title: p.data.title,
      description: p.data.description,
      lineCount: p.data.lineCount,
      linePriceCents: Math.round(p.data.linePrice * 100),
      paymentWindowHours: p.data.paymentWindowHours,
      maxLinesPerUser: p.data.maxLinesPerUser ?? null,
      allowRandomClaims: p.data.allowRandomClaims === "on",
      paymentInstructions: p.data.paymentInstructions,
      paymentHandles: venmo || paypal ? { venmo, paypal } : undefined,
      items,
    });
    if (p.data.openNow === "on") await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message };
  redirect(`/b/${r.data}`);
}
