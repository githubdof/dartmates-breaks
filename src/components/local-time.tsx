"use client";
import { useSyncExternalStore } from "react";
import { formatDateTime, formatDeadline, formatShortDate } from "@/lib/time";

const never = () => () => {};
const onServer = () => null;

/** The browser's own text, or null when it cannot format: no zone, or Chrome's "Etc/Unknown", with which formatting throws. */
function browserText(iso: string, kind: "deadline" | "datetime" | "date"): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    const d = new Date(iso);
    if (kind === "date") return formatShortDate(d, tz);
    return kind === "deadline" ? formatDeadline(d, new Date(), tz) : formatDateTime(d, tz);
  } catch {
    return null;
  }
}

/**
 * Renders the server's fallback on the first pass (hydration matches byte for byte), then reformats in
 * the browser's own zone, with the browser's own "now" deciding today and tomorrow. No JS: the fallback stays.
 * The browser's text is an external snapshot (useSyncExternalStore): the server snapshot is the fallback, and the
 * browser's replaces it right after hydration, in the same pass, with no effect in between.
 */
export function LocalTime({ iso, fallback, kind }: { iso: string; fallback: string; kind: "deadline" | "datetime" | "date" }) {
  const local = useSyncExternalStore(never, () => browserText(iso, kind), onServer);
  return <time dateTime={iso}>{local ?? fallback}</time>;
}
