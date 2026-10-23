export const UNDO_MS = 8000;
export type Schedule = (run: () => void, ms: number) => () => void; // returns a cancel
export const timers: Schedule = (run, ms) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};

export type RemovalQueue<T> = { remove(item: T): void; undo(): T | null; flush(): void; pending(): T | null };

/** Holds one removal for UNDO_MS. Each item is committed exactly once: by the timer, a second removal, or flush. */
export function removalQueue<T>(commit: (item: T) => void, schedule: Schedule): RemovalQueue<T> {
  let held: { item: T; cancel: () => void } | null = null;
  const flush = () => {
    const h = held;
    if (!h) return;
    held = null;
    h.cancel();
    commit(h.item);
  };
  return {
    remove(item) {
      flush();
      const entry = { item, cancel: () => {} };
      held = entry;
      entry.cancel = schedule(() => {
        if (held !== entry) return;
        held = null;
        commit(item);
      }, UNDO_MS);
    },
    undo() {
      const h = held;
      if (!h) return null;
      held = null;
      h.cancel();
      return h.item;
    },
    flush,
    pending: () => held?.item ?? null,
  };
}
