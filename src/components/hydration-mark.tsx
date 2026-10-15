"use client";
import { useEffect } from "react";

/** Sets `data-hydrated` on <html> once React has hydrated the page, so the e2e can wait for it before a first click. */
export function HydrationMark() {
  useEffect(() => { document.documentElement.setAttribute("data-hydrated", ""); }, []);
  return null;
}
