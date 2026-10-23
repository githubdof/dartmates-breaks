/** Registers one `beforeunload` handler while `active`; the returned cleanup removes that same handler. */
export function guardUnload(target: Pick<Window, "addEventListener" | "removeEventListener">, active: boolean): () => void {
  if (!active) return () => {};
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  target.addEventListener("beforeunload", handler);
  return () => target.removeEventListener("beforeunload", handler);
}

export const LEAVE_WHILE_UPLOADING = "Photos are still uploading. Leave this page? Photos that have not finished will not be added.";

type Anchor = { getAttribute(name: string): string | null; hasAttribute(name: string): boolean };

/**
 * While `active`, a click on a link that would leave this page in this tab asks first (photos spec §5.3). In-app
 * links navigate on the client, so `beforeunload` never fires for them. The listener runs in the capture phase on the
 * document, before the router's handler; when the host says no, the click is cancelled and stopped, so nothing moves.
 */
export function guardLinks(doc: Pick<Document, "addEventListener" | "removeEventListener">, active: boolean, ask: (message: string) => boolean): () => void {
  if (!active) return () => {};
  const handler = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as { closest?: (sel: string) => Anchor | null } | null)?.closest?.("a[href]");
    if (!a) return;
    const target = a.getAttribute("target");
    if ((target && target !== "_self") || a.hasAttribute("download") || (a.getAttribute("href") ?? "").startsWith("#")) return;
    if (ask(LEAVE_WHILE_UPLOADING)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  doc.addEventListener("click", handler, true);
  return () => doc.removeEventListener("click", handler, true);
}
