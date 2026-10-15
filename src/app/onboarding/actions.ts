"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { action } from "@/lib/action";
import { requestIpHash } from "@/lib/request-ip";
import { afterSignIn } from "@/lib/safe-next";
import { completeOnboarding } from "@/domain/users/commands";
import { hitHandleLimit, HANDLE_LIMITED_MESSAGE } from "@/domain/users/handle-check";

const schema = z.object({ handle: z.string(), displayName: z.string().optional(), paymentName: z.string().optional(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional() });

export async function finishOnboarding(_: unknown, form: FormData) {
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Fill in your handle and tick both boxes." };
  const next = afterSignIn(form.get("next"));
  const h = await headers();
  const ipHash = requestIpHash(h);
  // A submit answers "that handle is taken" too, so it counts on the live check's buckets. In its own transaction:
  // inside the onboarding one, a refusal would roll the hit back with it.
  const caller = await getCaller();
  if (caller) {
    const limited = await db.transaction((tx) => hitHandleLimit(tx, { callerId: caller.id, ipHash: requestIpHash(h, { bucket: true }) ?? null, now: new Date() }));
    if (limited) return { error: HANDLE_LIMITED_MESSAGE };
  }
  // Display name defaults to the handle; it can be changed later.
  const displayName = p.data.displayName?.trim() || p.data.handle.trim();
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName, paymentName: p.data.paymentName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on", ipHash }));
  if (!r.ok) return { error: r.message };
  redirect(next);
}
