import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// src/auth throws messages the login and onboarding screens show, so it is buyer copy too.
const ROOTS = ["src/app", "src/components", "src/lib", "src/domain", "src/auth"];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}
const sources = ROOTS.flatMap(files).map((path) => ({ path, text: readFileSync(path, "utf8") }));
const tsx = sources.filter((s) => s.path.endsWith(".tsx"));
const hits = (re: RegExp, list = sources) => list.filter((s) => re.test(s.text)).map((s) => s.path);

describe("copy audit (design §6, §7)", () => {
  it("has no middle dots", () => expect(hits(/·/)).toEqual([]));
  it("uses gambling-neutral words only", () => expect(hits(/\b(raffle|lottery|odds|bets?|betting|tickets?|jackpot|lucky)\b/i)).toEqual([]));
  it("formats UI money with formatMoney (toFixed only in money.ts and pay-links.ts)", () => {
    expect(hits(/toFixed\(2\)/).filter((p) => !/src\/lib\/(money|pay-links)\.ts$/.test(p))).toEqual([]);
  });
  it("uses the board tokens, not Tailwind's default palette", () => {
    expect(hits(/\b(?:bg|text|border|ring|outline|decoration|fill|stroke|divide|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/, tsx)).toEqual([]);
    expect(hits(/\b(?:bg|text|border)-(?:white|black)\b/, tsx)).toEqual([]);
  });
  it("never builds class names at runtime", () => expect(hits(/(?:grid-cols|col-span|row-span)-\$\{/)).toEqual([]));
  it("has no exclamation marks in JSX text", () => {
    // Prose "!" follows a letter and ends a word; code ("!==", "!x", "x!.y") does not match.
    const bad = tsx.filter((s) => [...s.text.matchAll(/>([^<>{}]+)</g)].some((m) => /[A-Za-z]!(\s|$)/.test(m[1]))).map((s) => s.path);
    expect(bad).toEqual([]);
  });
  it("has no tailwind config file", () => expect(hits(/tailwind\.config/)).toEqual([]));
  it("never imports formatCents into a component (UI money is formatMoney)", () => expect(hits(/\bformatCents\(/, tsx)).toEqual([]));
  it("has no caps labels", () => expect(hits(/\buppercase\b|tracking-widest/, tsx)).toEqual([]));
  it("never labels a button Submit", () => expect(hits(/>\s*Submit\s*</, tsx)).toEqual([]));
  it("uses the community's state words in UI code, never Filled, Drawing or Drawn", () => {
    const ui = sources.filter((s) => /^src\/(components|app)\//.test(s.path));
    expect(hits(/["'`](Filled|Drawing|Drawn)\b/, ui)).toEqual([]);
  });
  it("has no bullet characters", () => expect(hits(/•/)).toEqual([]));
  it("has no exclamation marks in string literals (.ts and .tsx)", () => {
    expect(hits(/["'`][^"'`\n]*[A-Za-z]![\s"'`]/)).toEqual([]);
  });
  it("never writes a price per line as /line", () => expect(hits(/["'`][^"'`\n]*\/line(?![\w-])/)).toEqual([]));
  it("never writes money with .00 outside money.ts and pay-links.ts", () => {
    expect(hits(/["'`][^"'`\n]*[\d}]\.00\b/).filter((p) => !/src\/lib\/(money|pay-links)\.ts$/.test(p))).toEqual([]);
  });
});
