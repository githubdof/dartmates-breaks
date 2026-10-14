import { CapExceeded, LineTaken, type DomainError } from "@/domain/errors";

export type CapKind = "per_person" | "host" | "global" | "bonus";
export type FailureDetails = { taken?: number[]; limit?: number; capKind?: CapKind };
export type ActionFailure = { ok: false; code: string; message: string; details?: FailureDetails };
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

const CAP_KIND: Record<string, CapKind> = {
  "lines per person": "per_person",
  "host-held lines": "host",
  "open unpaid claims": "global",
  "bonus lines": "bonus",
};

/** Domain error → the wire shape clients branch on. Typed details let the grid clear exactly the taken cells. */
export function toFailure(e: DomainError): ActionFailure {
  const base: ActionFailure = { ok: false, code: e.code, message: e.message };
  if (e instanceof LineTaken) return { ...base, details: { taken: [...e.numbers] } };
  if (e instanceof CapExceeded) return { ...base, details: { limit: e.limit, capKind: CAP_KIND[e.kind] } };
  return base;
}
