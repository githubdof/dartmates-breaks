import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { DomainError } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function action<T>(fn: (tx: Tx, caller: Caller) => Promise<T>): Promise<ActionResult<T>> {
  const caller = await getCaller();
  if (!caller) return { ok: false, code: "NOT_SIGNED_IN", message: "Sign in to continue" };
  try {
    const data = await db.transaction((tx) => fn(tx, caller));
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, code: e.code, message: e.message };
    console.error(e);
    return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
  }
}
