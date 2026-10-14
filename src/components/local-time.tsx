"use client";
import { useEffect, useState } from "react";
import { formatDateTime, formatDeadline } from "@/lib/time";

/**
 * Renders the server's fallback on the first pass (hydration matches byte for byte), then reformats in
 * the browser's own zone, with the browser's own "now" deciding today and tomorrow. No JS: the fallback stays.
 */
export function LocalTime({ iso, fallback, kind }: { iso: string; fallback: string; kind: "deadline" | "datetime" }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    // Chrome reports "Etc/Unknown" when it cannot detect the system zone, and formatting with it throws.
    // Keep the server's fallback text in that case.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      setText(kind === "deadline" ? formatDeadline(new Date(iso), new Date(), tz) : formatDateTime(new Date(iso), tz));
    } catch {
      /* fallback stays */
    }
  }, [iso, kind]);
  return <time dateTime={iso}>{text}</time>;
}
