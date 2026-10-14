"use client";
import { useLayoutEffect, useRef } from "react";

/**
 * One job at a time at the bottom of the break page. The bar can grow (a note above the controls), so its
 * real height, safe area included, is written to --bar-total; globals.css reserves exactly that much body
 * padding and scroll padding, and keyboard hiding also lives there. Keep display utilities off the element
 * carrying data-sticky-bar (they would beat the hide rule in @layer base); layout goes on the inner wrapper.
 */
export function StickyBar({ id, children }: { id?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty("--bar-total", `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--bar-total"); };
  }, []);
  return (
    <div ref={ref} id={id} tabIndex={-1} data-sticky-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-wire bg-card pb-safe outline-none">
      <div className="mx-auto flex min-h-[var(--bar-h)] max-w-[600px] items-center gap-3 px-4 pt-2">{children}</div>
    </div>
  );
}
