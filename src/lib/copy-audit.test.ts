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

// Copy, not code (Mosaic §3): the text of string literals and of JSX between tags. Comments go first (a URL's "//" is
// kept), so prose in a comment never matches, and `${…}` inside a template literal is blanked, so only its words are
// read. Identifiers (`heatStep`, the domain's `filling` sort key) are never copy. JSX text is read in .tsx files only:
// the text after a ">" or a "}" up to the next "<" or "{", so words beside an expression ("Drawing {n} lines") count.
type Seg = { path: string; kind: "literal" | "jsx"; text: string };
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const SEG = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|[>}]([^<>{}`$=;|&\\]+)(?=[<{])/g;
const segmentsOf = (s: { path: string; text: string }): Seg[] =>
  [...stripComments(s.text).matchAll(SEG)]
    .filter((m) => m[4] === undefined || s.path.endsWith(".tsx"))
    .map((m) => ({
      path: s.path,
      kind: m[4] !== undefined ? "jsx" : "literal",
      text: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/\$\{[^}]*\}/g, " "),
    }));
const segments = sources.flatMap(segmentsOf);
const uiSegments = segments.filter((g) => /^src\/(components|app)\//.test(g.path));
// What a viewer reads: .tsx copy, plus the modules that build sentences for it.
const COPY_MODULE = /(-copy|share-text|claim-bar-state|reveal-plan|board-moments|selection|status-word)\.ts$|\/breaks\/og\.ts$/;
const shown = segments.filter((g) => g.path.endsWith(".tsx") || COPY_MODULE.test(g.path));

/**
 * Copy the rules allow on purpose, each with its reason. A new entry needs one too: a rule that keeps catching real
 * copy is worth more than an allowlist that grows.
 */
const ALLOW: { path: RegExp; text: RegExp; why: string }[] = [
  // Every share-text state line opens with the community's caps idiom: "CLOSED n RAN", and "CLOSED." before the draw lines.
  { path: /^src\/lib\/share-text\.ts$/, text: /^CLOSED\b/, why: "the community idiom quoted in share text, the one caps exception (Plan B Global Constraints)" },
  { path: /^src\/components\/handle-field(-copy)?\.tsx?$/, text: /^NFKC$/, why: "a Unicode normalisation form passed to String.normalize, not copy" },
  { path: /^src\/(app\/landing-copy|domain\/breaks\/og)\.ts$/, text: /^en-US$/, why: "an Intl locale tag passed to a date formatter, not copy" },
  { path: /^src\/app\/legal\/draw\/page\.tsx$/, text: /\b(SHA-256|HMAC)\b/, why: "algorithm names on the draw explainer, spelled as their standards spell them" },
];
const allowed = (g: Seg) => ALLOW.some((a) => a.path.test(g.path) && a.text.test(g.text));
const copyHits = (re: RegExp, list: Seg[] = segments) =>
  [...new Set(list.filter((g) => re.test(g.text) && !allowed(g)).map((g) => `${g.path}: ${g.text.trim().slice(0, 60)}`))];

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
  it("never shows Filled, Drawing or Drawn as JSX text either", () => {
    const ui = tsx.filter((s) => /^src\/(components|app)\//.test(s.path));
    expect(hits(/>\s*(Filled|Drawing|Drawn)\b/, ui)).toEqual([]);
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

describe("copy audit, Mosaic (spec §3, Plan C Global Constraints)", () => {
  it("never names heat: hot, heat, warm, fire, cold, on fire, filling fast", () => {
    expect(copyHits(/\b(hot|heat|warm|fire|cold|filling fast)\b/i)).toEqual([]);
  });
  it("has no streaks or levels", () => expect(copyHits(/\b(streaks?|levels?)\b/i)).toEqual([]));
  it("never says winnings, win rate or You won", () => expect(copyHits(/\b(winnings|win rates?|you won)\b/i)).toEqual([]));
  it("never calls a flight a lucky colour (the flight copy is 'This is your flight')", () => {
    expect(copyHits(/\blucky\s+colou?rs?\b/i)).toEqual([]);
  });
  it("has no caps chips or caps words in shown copy", () => {
    const words = shown.filter((g) => !/^#[0-9A-Fa-f]{3,8}$/.test(g.text.trim()));
    expect(copyHits(/\b[A-Z]{2,}\b/, words)).toEqual([]);
  });
  it("puts no betting word near a kit: back, favourite, pick your side", () => {
    const BET = /\b(back|backing|favou?rites?|pick your side)\b/i;
    const bad: string[] = [];
    const byFile = new Map<string, Seg[]>();
    for (const g of uiSegments) byFile.set(g.path, [...(byFile.get(g.path) ?? []), g]);
    for (const list of byFile.values()) {
      list.forEach((g, i) => {
        if (!/\bkits?\b/i.test(g.text)) return;
        for (const near of list.slice(Math.max(0, i - 2), i + 3)) {
          if (BET.test(near.text) && !allowed(near)) bad.push(`${near.path}: ${near.text.trim().slice(0, 60)}`);
        }
      });
    }
    expect([...new Set(bad)]).toEqual([]);
  });
  it("says N to go, never the retired counts and sorts", () => {
    expect(copyHits(/\bof\s+(\d+\s+)?(left|open)\b|\balmost full\b|\byou hold\b/i, uiSegments)).toEqual([]);
  });
  it("says the host's, never his", () => expect(copyHits(/\bhis\b/i)).toEqual([]));
  it("keeps state words out of JSX text, anywhere between the tags (widened from 'directly after >')", () => {
    expect(copyHits(/\b(filled|drawing|drawn)\b/i, uiSegments.filter((g) => g.kind === "jsx"))).toEqual([]);
  });
  it("keeps Filled, Drawing and Drawn out of UI string literals, wherever they sit in the string", () => {
    expect(copyHits(/\b(Filled|Drawing|Drawn)\b/, uiSegments.filter((g) => g.kind === "literal"))).toEqual([]);
  });
  it("reads every copy shape: attributes, expressions, templates, concatenation, comments excluded", () => {
    const fixture = [
      "// a hot comment, never read",
      "/* a cold block comment */",
      'const a = <p className="x" data-k=\'y\'>Drawing {n} lines</p>;',
      "const b = <p>{n} lines Filled here</p>;",
      "const c = <p>{n} drawn {m}</p>;",
      'const d = <button aria-label="Streak badge">{"Winnings"}</button>;',
      "const e = `You won ${n} of ${m} left`;",
      'const f = "Almost " + "full";',
      "const heatStep = 1; const url = 'https://x.test/a';",
    ].join("\n");
    const texts = segmentsOf({ path: "src/x.tsx", text: fixture }).map((g) => g.text);
    const joined = texts.join("|");
    for (const must of ["Drawing ", " lines Filled here", " drawn ", "Streak badge", "Winnings", "You won", "Almost ", "full", "https://x.test/a"]) {
      expect(joined, must).toContain(must);
    }
    expect(joined).not.toMatch(/comment|heatStep/);
  });
  it("reads copy, not code: the audit itself sees literals and JSX text", () => {
    // A guard against a parser that silently returns nothing: these strings exist in the app today.
    expect(segments.some((g) => g.text === "Browse breaks")).toBe(true);
    expect(segments.some((g) => g.kind === "jsx" && /Hosting on Facebook now\?/.test(g.text))).toBe(true);
    expect(segments.some((g) => /heatStep/.test(g.text))).toBe(false);
  });
});
