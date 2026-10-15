"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";

export type ClaimData = { got: number[]; taken?: number[] };

type Options = {
  /** useOptimistic's setter: marks lines as taken by the viewer while the claim is in flight. */
  markClaimed: (numbers: number[]) => void;
  /** Called synchronously, before the action: the island records the pending claim, so its drop never waits on render order (Plan C, recorded ruling 34). */
  onStart?: (requested: number[]) => void;
  /** Runs inside the claim's transition, so optimistic marks hold until refreshed props land. */
  onDone: (r: ActionResult<ClaimData>, requested: number[]) => void;
  /** The action threw (dropped connection, 5xx): it may have committed. The batch id is kept for the retry. */
  onUnreachable: () => void;
};

/**
 * One claim at a time. The batch id belongs to one request: kept across a thrown action (a retry returns the same
 * lines, not new ones), renewed after a successful result and whenever the caller changes the request (newBatch).
 */
export function useClaim(o: Options) {
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const newBatch = () => setBatchId(crypto.randomUUID());
  const run = (optimistic: number[], call: (batchId: string) => Promise<ActionResult<ClaimData>>) => {
    const id = batchId;
    o.onStart?.(optimistic);
    start(async () => {
      if (optimistic.length > 0) o.markClaimed(optimistic);
      let r: ActionResult<ClaimData>;
      try {
        r = await call(id);
      } catch {
        o.onUnreachable();
        return;
      }
      if (r.ok) setBatchId(crypto.randomUUID());
      o.onDone(r, optimistic);
    });
  };
  return { batchId, newBatch, pending, run };
}
