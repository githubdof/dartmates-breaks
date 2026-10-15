/**
 * Runs a give-back so that its announcement never depends on render order: the numbers are recorded synchronously,
 * before the action is called, so whichever lands first, the revalidated props or the answer, the reconcile says
 * "You gave back …" and never "Jim released …" for the buyer's own act (Mosaic §7, as recorded ruling 34 does for claims).
 * A refusal clears the record; a thrown action keeps it (the give-back may have gone through: the refresh says what did).
 */
export async function runGiveBack<R extends { ok: boolean }>(
  numbers: number[],
  call: (numbers: number[]) => Promise<R>,
  h: { onStart: (numbers: number[]) => void; onRefused: () => void },
): Promise<R> {
  h.onStart(numbers);
  const r = await call(numbers);
  if (!r.ok) h.onRefused();
  return r;
}
