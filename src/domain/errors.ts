import { joinAnd, plural } from "@/lib/list";

/** State words buyers know (design §6): never "filled" or "drawing". */
export function notOpenMessage(s: string): string {
  switch (s) {
    case "draft": return "This break isn't open yet.";
    case "open": return "This break is already open.";
    case "filled": return "This break is closed. Every line is taken and paid.";
    case "drawing": return "The draw is running. The result is in about a minute.";
    case "drawn": return "This break has run. See the result.";
    case "cancelled": return "This break was cancelled.";
    default: return "This break isn't open.";
  }
}

export function takenMessage(numbers: number[]): string {
  if (numbers.length === 0) return "Those lines were just taken. Pick others.";
  if (numbers.length === 1) return `Line ${numbers[0]} was just taken. Pick another.`;
  return `Lines ${joinAnd(numbers)} were just taken. Pick others.`;
}

/** The four caps a claim or bonus can hit; `toFailure` maps each to a wire `CapKind`. */
export type CapName = "lines per person" | "host-held lines" | "open unpaid claims" | "bonus lines";

export function capMessage(kind: CapName, limit: number): string {
  const lines = `${limit} ${plural(limit, "line", "lines")}`;
  switch (kind) {
    case "lines per person": return `You can hold ${lines} in this break.`;
    case "host-held lines": return `Hosts can hold ${lines} in their own break.`;
    case "open unpaid claims": return `You can have ${limit} unpaid lines across breaks. Pay for some first.`;
    case "bonus lines": return `This break has used all ${limit} bonus ${plural(limit, "line", "lines")}.`;
    default: return `Limit of ${limit} reached.`;
  }
}

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = code; }
}
export class NotFound extends DomainError { constructor(what = "Not found") { super("NOT_FOUND", what, 404); } }
export class NotAuthorized extends DomainError { constructor(msg = "You can't do that") { super("NOT_AUTHORIZED", msg, 403); } }
export class NotOnboarded extends DomainError { constructor() { super("NOT_ONBOARDED", "Finish setting up your account first", 403); } }
export class NotOpen extends DomainError { constructor(status: string) { super("NOT_OPEN", notOpenMessage(status), 409); } }
export class NotFilled extends DomainError { constructor() { super("NOT_FILLED", "Every line must be paid before the draw", 409); } }
export class AlreadyDrawn extends DomainError { constructor() { super("ALREADY_DRAWN", "This break has already run", 409); } }
export class LineTaken extends DomainError { constructor(public numbers: number[]) { super("LINE_TAKEN", takenMessage(numbers), 409); } }
export class OwnerChanged extends DomainError { constructor() { super("OWNER_CHANGED", "This line changed hands; refresh and try again", 409); } }
export class CapExceeded extends DomainError { constructor(public kind: CapName, public limit: number) { super("CAP_EXCEEDED", capMessage(kind, limit), 409); } }
export class InvalidInput extends DomainError { constructor(msg: string) { super("INVALID_INPUT", msg, 400); } }
export class BeaconUnavailable extends DomainError { constructor() { super("BEACON_UNAVAILABLE", "Waiting for the public beacon — try again in a moment", 503); } }
