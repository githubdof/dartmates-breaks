"use client";
import { useEffect } from "react";

/** Writes the browser's zone to the tz cookie so the next server render already speaks local time. */
export function TzCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
      if (current === tz) return;
      // IANA names are [A-Za-z0-9/_+-], all valid cookie characters; the server validates the value anyway.
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // cookies blocked: the server keeps its labelled fallback
    }
  }, []);
  return null;
}
