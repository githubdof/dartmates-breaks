/** Confirmation text for releasing a buyer's lines; warns when some of them are marked sent. */
export function releasePrompt(u: { handle: string | null; numbers: number[]; sentNumbers: number[] }): string {
  const who = u.handle ? `@${u.handle}` : "this buyer";
  const plural = (n: number) => (n === 1 ? "" : "s");
  const base = `Release line${plural(u.numbers.length)} ${u.numbers.join(", ")} from ${who}?`;
  if (u.sentNumbers.length === 0) return base;
  return `${base}\n\nWarning: ${who} marked line${plural(u.sentNumbers.length)} ${u.sentNumbers.join(", ")} as sent. Check your payments before releasing.`;
}
