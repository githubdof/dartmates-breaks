import { plural } from "@/lib/list";

/**
 * "Ran 2 hours ago." under 48 hours (design §5.2), then "Ran on Tuesday." within the week, then "Ran on Oct 4.",
 * with the year once it is not this year ("Ran on Oct 4, 2025."), all in the viewer's zone.
 */
export function ranText(ranAt: Date, now: Date, tz: string): string {
  const mins = Math.max(0, Math.floor((now.getTime() - ranAt.getTime()) / 60_000));
  if (mins < 1) return "Ran just now.";
  if (mins < 60) return `Ran ${mins} ${plural(mins, "minute", "minutes")} ago.`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Ran ${hours} ${plural(hours, "hour", "hours")} ago.`;
  const yearOf = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d);
  const options: Intl.DateTimeFormatOptions = hours < 7 * 24 ? { weekday: "long" }
    : yearOf(ranAt) === yearOf(now) ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return `Ran on ${new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options }).format(ranAt)}.`;
}
