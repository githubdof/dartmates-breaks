export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = code; }
}
export class NotFound extends DomainError { constructor(what = "Not found") { super("NOT_FOUND", what, 404); } }
export class NotAuthorized extends DomainError { constructor(msg = "You can't do that") { super("NOT_AUTHORIZED", msg, 403); } }
export class NotOnboarded extends DomainError { constructor() { super("NOT_ONBOARDED", "Finish setting up your account first", 403); } }
export class NotOpen extends DomainError { constructor(status: string) { super("NOT_OPEN", `This break is ${status}`, 409); } }
export class NotFilled extends DomainError { constructor() { super("NOT_FILLED", "Every line must be paid before the draw", 409); } }
export class AlreadyDrawn extends DomainError { constructor() { super("ALREADY_DRAWN", "This break has already been drawn", 409); } }
export class LineTaken extends DomainError { constructor(public numbers: number[]) { super("LINE_TAKEN", `Lines ${numbers.join(", ")} are taken`, 409); } }
export class OwnerChanged extends DomainError { constructor() { super("OWNER_CHANGED", "This line changed hands; refresh and try again", 409); } }
export class CapExceeded extends DomainError { constructor(public kind: string, public limit: number) { super("CAP_EXCEEDED", `Limit of ${limit} (${kind}) reached`, 409); } }
export class InvalidInput extends DomainError { constructor(msg: string) { super("INVALID_INPUT", msg, 400); } }
export class BeaconUnavailable extends DomainError { constructor() { super("BEACON_UNAVAILABLE", "Waiting for the public beacon — try again in a moment", 503); } }
