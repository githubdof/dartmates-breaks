/** Every Storage request is aborted after this long (panel ruling 28). */
export const STORAGE_TIMEOUT_MS = 5000;

/** `fetch` with `AbortSignal.timeout(ms)` on every request, combined (`AbortSignal.any`) with a caller's own signal. */
export function timedFetch(ms: number): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms),
    });
}
