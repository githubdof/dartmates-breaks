export type HandleCheck =
  | { state: "idle" | "checking" | "free" | "taken" | "limited" | "unknown" }
  | { state: "invalid"; message: string };

/** Worth asking the server about: the shape onboarding accepts, after the same NFKC folding. */
export function looksLikeHandle(v: string): boolean {
  return /^[A-Za-z0-9_]{3,20}$/.test(v.normalize("NFKC").trim());
}

/** The endpoint's answer → what the field shows. Anything unexpected is "couldn't check", never "free". */
export function toCheck(status: number, body: { state?: string; message?: string }): HandleCheck {
  if (status === 429) return { state: "limited" };
  if (status !== 200) return { state: "unknown" };
  if (body.state === "free" || body.state === "taken") return { state: body.state };
  if (body.state === "invalid") return { state: "invalid", message: body.message ?? "Pick another handle" };
  return { state: "unknown" };
}

/** Red marks a problem; a free handle is plain ink (green means mine and confirmed money only, design §3). */
export function handleNote(c: HandleCheck, handle: string): { text: string; tone: "bad" | "quiet" } {
  switch (c.state) {
    case "free": return { text: `@${handle} is free.`, tone: "quiet" };
    case "taken": return { text: "That handle is taken. Try another.", tone: "bad" };
    case "invalid": return { text: `${c.message}.`, tone: "bad" };
    case "checking": return { text: "Checking.", tone: "quiet" };
    case "limited": return { text: "We'll check this handle when you continue.", tone: "quiet" };
    case "unknown": return { text: "Couldn't check right now. We'll check when you continue.", tone: "quiet" };
    case "idle": return { text: "", tone: "quiet" };
  }
}
