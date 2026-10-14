/** "4", "4 and 11", "4, 11 and 27" — how the design names lines (no serial comma, no middle dots). */
export function joinAnd(items: readonly (string | number)[]): string {
  const s = items.map(String);
  if (s.length <= 1) return s[0] ?? "";
  return `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}
