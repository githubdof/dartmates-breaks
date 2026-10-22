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
