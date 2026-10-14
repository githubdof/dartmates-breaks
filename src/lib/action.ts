import { unstable_rethrow } from "next/navigation";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { DomainError } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";
import { toFailure, type ActionResult } from "./action-result";

export type { ActionResult, ActionFailure, FailureDetails, CapKind } from "./action-result";

export async function action<T>(fn: (tx: Tx, caller: Caller) => Promise<T>): Promise<ActionResult<T>> {
  const caller = await getCaller();
  if (!caller) return { ok: false, code: "NOT_SIGNED_IN", message: "Sign in to continue" };
  try {
    const data = await db.transaction((tx) => fn(tx, caller));
    return { ok: true, data };
  } catch (e) {
    // Let NEXT_REDIRECT / NEXT_NOT_FOUND propagate. Note a redirect thrown inside `fn` rolls the
    // transaction back; callers should redirect after `action` returns instead.
    unstable_rethrow(e);
    if (e instanceof DomainError) return toFailure(e);
    console.error(e);
    return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
  }
}
