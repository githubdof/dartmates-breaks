"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { action } from "@/lib/action";
import { safeNext } from "@/lib/safe-next";
import { completeOnboarding } from "@/domain/users/commands";

const schema = z.object({ handle: z.string(), displayName: z.string(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional() });

export async function finishOnboarding(_: unknown, form: FormData) {
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Please fill in every field" };
  const next = safeNext(form.get("next"));
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : undefined;
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName: p.data.displayName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on", ipHash }));
  if (!r.ok) return { error: r.message };
  redirect(next);
}
