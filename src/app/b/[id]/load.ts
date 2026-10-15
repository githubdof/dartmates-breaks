import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { readBreakView, type BreakView } from "@/domain/breaks/page-view";
import type { Caller } from "@/domain/types";

/** One transaction per request for the break page; React cache shares it between generateMetadata and the page. */
export const loadBreak = cache(async (breakId: string): Promise<{ view: BreakView | null; caller: Caller | null; now: Date }> => {
  const caller = await getCaller();
  const now = new Date();
  const view = await db.transaction((tx) => readBreakView(tx, breakId, caller ? { id: caller.id, role: caller.role } : null, now));
  return { view, caller, now };
});
