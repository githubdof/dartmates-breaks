/**
 * Time strings. Pure and zone-explicit, so the same module runs on the server (fallback text) and in
 * the browser (LocalTime). Absolute times are shown in the viewer's zone; relative ones are zone-free.
 */
export const DEFAULT_TZ = "America/New_York";
export type Zone = { tz: string; labelled: boolean };

let known: Set<string> | null = null;
/** "UTC" or an IANA name this runtime knows (Intl.supportedValuesOf omits "UTC" in V8). */
export function isTimeZone(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 64) return false;
  if (v === "UTC") return true;
  known ??= new Set(Intl.supportedValuesOf("timeZone"));
  return known.has(v);
}

/** The server's fallback zone: the viewer's own (from the tz cookie), unlabelled; else the default, labelled. */
export function resolveZone(cookie: string | undefined): Zone {
  return isTimeZone(cookie) ? { tz: cookie, labelled: false } : { tz: DEFAULT_TZ, labelled: true };
}

/** Short zone name at a given instant ("EDT" in October, "EST" in November). */
export function zoneLabel(tz: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((x) => x.type === "timeZoneName");
  return part?.value ?? tz;
}

const dayKey = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayNumber = (d: Date, tz: string) => Date.parse(`${dayKey(d, tz)}T00:00:00Z`) / 86_400_000;

export function formatClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d).replace(/\s+/g, " ").toLowerCase();
}

/** "9:40 pm tomorrow"; labelled (server fallback without a tz cookie): "9:40 pm EDT tomorrow". */
export function formatDeadline(deadline: Date, now: Date, tz: string, labelled = false): string {
  const clock = labelled ? `${formatClock(deadline, tz)} ${zoneLabel(tz, deadline)}` : formatClock(deadline, tz);
  const days = dayNumber(deadline, tz) - dayNumber(now, tz);
  if (days === 0) return `${clock} today`;
  if (days === 1) return `${clock} tomorrow`;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(deadline);
  return `${clock} on ${date}`;
}

export function formatDateTime(d: Date, tz: string, labelled = false): string {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d);
  return `${date} at ${formatClock(d, tz)}${labelled ? ` ${zoneLabel(tz, d)}` : ""}`;
}

export function formatMonthYear(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "numeric" }).format(d);
}

export function formatLate(since: Date, now: Date): string {
  const mins = Math.max(1, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (mins < 60) return `${mins} min late`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h late`;
  return `${Math.floor(hours / 24)} days late`;
}

export function daysSince(d: Date, now: Date): number {
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}
