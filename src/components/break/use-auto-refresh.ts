"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh server props every `everyMs` while the tab is visible, and at once on returning to it (design §4). */
export function useAutoRefresh(enabled: boolean, everyMs = 20_000): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const start = () => { stop(); timer = window.setInterval(() => router.refresh(), everyMs); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { router.refresh(); start(); } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [enabled, everyMs, router]);
}
