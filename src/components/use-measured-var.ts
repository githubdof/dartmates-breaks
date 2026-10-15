"use client";
import { useLayoutEffect, type RefObject } from "react";

/**
 * Writes the element's height (padding included) into a CSS variable on the nearest <dialog>, else on <html>, and
 * keeps it current. Toasts read it so they sit above the element instead of at a guessed offset.
 * The ref must sit on an always-mounted element (a wrapper that measures 0 while its content is absent): the effect
 * runs once per mount, so an element that mounts later is never measured.
 */
export function useMeasuredVar(ref: RefObject<HTMLElement | null>, name: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host: HTMLElement = el.closest("dialog") ?? document.documentElement;
    const write = () => host.style.setProperty(name, `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => { ro.disconnect(); host.style.removeProperty(name); };
  }, [ref, name]);
}
