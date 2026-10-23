import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { noticeFor } from "@/domain/photos/notice";
import { CONDITION_LABEL } from "@/domain/photos/types";
import { defaultAlt } from "@/components/photos/strip-state";

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
// Groups 1-3 are string literals. In .tsx, group 4 is JSX text after ">" and group 5 is JSX text after "}". An HTML entity
// ("We&apos;ll", which lint forces) is one token. A prose ";" is allowed after ">" only when it is followed by spaces and a
// lowercase word and is not the first character, so a code tail such as "(save, null);\n return (" is not read as copy.
const SEG_TS = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const SEG_TSX = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>(?!;)((?:;(?=[ \t]+[a-z])|[^<>{}`$=;|&\\]|&[a-zA-Z]+;|&#\d+;)+)(?=[<{])|\}((?:[^<>{}`$=;|&\\]|&[a-zA-Z]+;|&#\d+;)+)(?=[<{])/g;
// What a viewer reads: entities decoded, curly quotes straightened, so "You&apos;ve won" and "You’ve won" meet the rules.
const decode = (t: string) =>
  t.replace(/&(?:apos|rsquo|lsquo|#39|#x27);|[’‘]/g, "'").replace(/&(?:quot|ldquo|rdquo|#34);|[“”]/g, '"').replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&");
// .ts files have no JSX: reading ">" or "}" text there would swallow the literals that follow an arrow or a brace.
const segmentsOf = (s: { path: string; text: string }): Seg[] => {
  const src = stripComments(s.text);
  return [...src.matchAll(s.path.endsWith(".tsx") ? SEG_TSX : SEG_TS)].map((m) => {
    const jsx = m[4] ?? m[5];
    // An interpolation is a number token ("0"), so "{n} wins" and "1 in ${n}" keep the shape the rules read.
    let text = (m[1] ?? m[2] ?? m[3] ?? jsx ?? "").replace(/\$\{[^}]*\}/g, "0");
    if (m[5] !== undefined) text = "0" + text;
    if (jsx !== undefined && src[(m.index ?? 0) + m[0].length] === "{") text += "0";
    return { path: s.path, kind: jsx !== undefined ? "jsx" : "literal", text: decode(text) } as Seg;
  });
};
const segments = sources.flatMap(segmentsOf);
// UI copy: components and pages, plus the domain errors that reach the UI as messages.
const uiSegments = segments.filter((g) => /^src\/(components|app)\//.test(g.path) || g.path === "src/domain/errors.ts");
// What a viewer reads: .tsx copy, plus the modules that build sentences for it.
const COPY_MODULE = /(-copy|share-text|claim-bar-state|reveal-plan|board-moments|selection|status-word|network-note|messages|account\/actions|domain\/photos\/(types|notice)|components\/photos\/(shrink|strip-state)|app\/photos\/actions|api\/photos\/finalise\/route)\.ts$|\/breaks\/og\.ts$/;
const shown = segments.filter((g) => g.path.endsWith(".tsx") || COPY_MODULE.test(g.path));
// The count and state-word rules read UI copy and the copy modules, so share text (pasted into Facebook) counts too.
const countCopy = [...uiSegments, ...segments.filter((g) => COPY_MODULE.test(g.path) && !uiSegments.includes(g))];

/**
 * Copy the rules allow on purpose, each with its reason. A new entry needs one too: a rule that keeps catching real
 * copy is worth more than an allowlist that grows.
 */
const ALLOW: { path: RegExp; text: RegExp; why: string }[] = [
  // Every share-text state line opens with the community's caps idiom: "CLOSED n RAN", and "CLOSED." before the draw lines.
  { path: /^src\/lib\/share-text\.ts$/, text: /^CLOSED\b/, why: "the community idiom quoted in share text, the one caps exception (Plan B Global Constraints)" },
  { path: /^src\/components\/handle-field(-copy)?\.tsx?$/, text: /^NFKC$/, why: "a Unicode normalisation form passed to String.normalize, not copy" },
  { path: /^src\/(app\/landing-copy|domain\/breaks\/og)\.ts$/, text: /^en-US$/, why: "an Intl locale tag passed to a date formatter, not copy" },
  { path: /^src\/(app\/api\/photos\/finalise\/route|components\/photos\/strip-state)\.ts$/, text: /\b(?:JPEG|PNG|MB)\b/, why: "image format names and a size unit in the spec's own photo error sentences (spec §5.4, §7.1), spelled as the formats are" },
  { path: /^src\/app\/photos\/actions\.ts$/, text: /^INTERNAL$/, why: "an action failure code that sits beside the message, not copy" },
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

// The Mosaic bans as regexes, so the rules below and the rule-level fixtures read the same pattern.
const RE = {
  heat: /\b(hot(?:test|ter)?|heat(?:s|ing|ed)?|warm(?:s|ing|er|est)?|fires?|cold(?:er|est)?|filling fast)\b/i,
  streakLevel: /\b(streaks?|levels?)\b/i,
  winnings: /\b(winnings|win rates?|you(?:'ve| have)? won)\b/i,
  lucky: /\blucky\s+colou?rs?\b/i,
  caps: /\b[A-Z]{2,}\b/,
  bet: /\b(back|backing|favou?rites?|pick your side)\b/i,
  retired: /\bof\s+(\d+\s+)?(left|open)\b|\bspots?\s+left\b|\bonly\s+\d+(?:\s+\d+)?\s+(?:spots?\s+)?left\b|\balmost full\b|\byou hold\b/i,
  his: /\bhis\b/i,
  gold: /\bgold(?:en)?\b/i,
  oddsRatio: /\b\d+\s+in\s+\d+\b/i,
  winTotals: /\b(win totals?|total wins|\d+\s+wins)\b/i,
};

describe("copy audit, Mosaic (spec §3, Plan C Global Constraints)", () => {
  it("never names heat: hot, heat, warm, fire, cold, on fire, filling fast, in any word form", () => {
    expect(copyHits(RE.heat)).toEqual([]);
  });
  it("has no streaks or levels", () => expect(copyHits(RE.streakLevel)).toEqual([]));
  it("never says winnings, win rate or You won", () => expect(copyHits(RE.winnings)).toEqual([]));
  it("never calls a flight a lucky colour (the flight copy is 'This is your flight')", () => {
    expect(copyHits(RE.lucky)).toEqual([]);
  });
  it("never names gold, a '1 in N' ratio or a win total (spec §3)", () => {
    expect(copyHits(RE.gold)).toEqual([]);
    expect(copyHits(RE.oddsRatio, uiSegments)).toEqual([]);
    expect(copyHits(RE.winTotals)).toEqual([]);
  });
  it("has no caps chips or caps words in shown copy", () => {
    const words = shown.filter((g) => !/^#[0-9A-Fa-f]{3,8}$/.test(g.text.trim()));
    expect(copyHits(RE.caps, words)).toEqual([]);
  });
  it("puts no betting word near a kit: back, favourite, pick your side", () => {
    const bad: string[] = [];
    const byFile = new Map<string, Seg[]>();
    for (const g of uiSegments) byFile.set(g.path, [...(byFile.get(g.path) ?? []), g]);
    for (const list of byFile.values()) {
      list.forEach((g, i) => {
        if (!/\bkits?\b/i.test(g.text)) return;
        for (const near of list.slice(Math.max(0, i - 2), i + 3)) {
          if (RE.bet.test(near.text) && !allowed(near)) bad.push(`${near.path}: ${near.text.trim().slice(0, 60)}`);
        }
      });
    }
    expect([...new Set(bad)]).toEqual([]);
  });
  it("says N to go, never the retired counts and sorts (share text included)", () => {
    expect(countCopy.some((g) => g.path === "src/lib/share-text.ts")).toBe(true);
    expect(copyHits(RE.retired, countCopy)).toEqual([]);
  });
  it("says the host's, never his", () => expect(copyHits(RE.his)).toEqual([]));
  it("keeps state words out of JSX text, anywhere between the tags (widened from 'directly after >')", () => {
    expect(copyHits(/\b(filled|drawing|drawn)\b/i, uiSegments.filter((g) => g.kind === "jsx"))).toEqual([]);
  });
  it("keeps Filled, Drawing and Drawn out of UI string literals, wherever they sit in the string", () => {
    expect(copyHits(/\b(Filled|Drawing|Drawn)\b/, countCopy.filter((g) => g.kind === "literal"))).toEqual([]);
  });
  it("reads the domain errors that reach the UI as UI copy, state words in any case ('already been drawn')", () => {
    // Sentences only: the lone words are status keys in a switch, not copy.
    const errors = uiSegments.filter((g) => g.path === "src/domain/errors.ts" && /\s/.test(g.text.trim()));
    expect(errors.length).toBeGreaterThan(0);
    expect(copyHits(/\b(filled|drawing|drawn)\b/i, errors)).toEqual([]);
    expect(/\b(filled|drawing|drawn)\b/i.test("This break has already been drawn")).toBe(true);
  });
  it("keeps every copy module in COPY_MODULE (a new *copy*.ts fails here until it is listed)", () => {
    const unlisted = sources.map((s) => s.path).filter((p) => /copy[^/]*\.ts$/.test(p) && !COPY_MODULE.test(p));
    expect(unlisted).toEqual([]);
    for (const known of ["src/lib/share-text.ts", "src/components/break/claim-bar-state.ts", "src/app/b/[id]/result/reveal-plan.ts", "src/components/grid/board-moments.ts", "src/components/break/selection.ts", "src/domain/breaks/og.ts", "src/lib/network-note.ts", "src/app/account/actions.ts", "src/app/(auth)/login/messages.ts", "src/domain/photos/types.ts", "src/domain/photos/notice.ts", "src/components/photos/shrink.ts", "src/components/photos/strip-state.ts", "src/app/photos/actions.ts", "src/app/api/photos/finalise/route.ts"]) {
      expect(sources.some((s) => s.path === known), `${known} exists`).toBe(true);
      expect(COPY_MODULE.test(known), `${known} listed`).toBe(true);
    }
  });
  it("catches a banned sentence and lets its near-miss through, rule by rule", () => {
    const cases: [keyof typeof RE, string[], string[]][] = [
      ["heat", ["Heating up", "It's hot", "Warming up", "The hottest break", "Colder now", "On fire", "Filling fast", "A fire sale"], ["Heath Ledger", "Whether it runs", "Coldplay", "Hotel"]],
      ["streakLevel", ["3 week streak", "Level 2"], ["Stream it", "Levelled"]],
      ["winnings", ["Your winnings", "You won!", "You've won", "you have won", "Win rate"], ["Won the top spot.", "Wins a tin.", "Who won"]],
      ["lucky", ["Your lucky colour", "lucky color"], ["This is your flight"]],
      ["gold", ["Gold flight", "A golden kit"], ["Golding"]],
      ["oddsRatio", ["1 in 50", "a 3 in 10 chance"], ["Line 1, in the top row", "12 to go"]],
      ["winTotals", ["12 wins", "Win totals", "Total wins"], ["Wins a tin.", "Won 2nd place."]],
      ["caps", ["OPEN NOW", "HOT"], ["Open now", "A4 sheet"]],
      ["retired", ["19 of 50 left", "7 of 50 open", "Almost full", "You hold 3 lines", "Only 3 spots left.", "1 spot left", "Only 0 0 left."], ["12 to go", "You have line 4.", "You can hold 3", "Only 3 to go.", "Left to right"]],
      ["his", ["his break"], ["the host's break", "History"]],
      ["bet", ["Back this kit", "Your favourite", "Pick your side"], ["Backdrop", "Your kit"]],
    ];
    for (const [rule, bad, ok] of cases) {
      for (const t of bad) expect(RE[rule].test(t), `${rule} catches "${t}"`).toBe(true);
      for (const t of ok) expect(RE[rule].test(t), `${rule} lets "${t}" through`).toBe(false);
    }
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
      "const g = <p>You&apos;re on a streak</p>;",
      "const h = <p>Heating up; the &ldquo;board&rdquo; fills</p>;",
      "const heatStep = 1; const url = 'https://x.test/a';",
    ].join("\n");
    const texts = segmentsOf({ path: "src/x.tsx", text: fixture }).map((g) => g.text);
    const joined = texts.join("|");
    for (const must of ["Drawing ", " lines Filled here", " drawn ", "Streak badge", "Winnings", "You won", "Almost ", "full", "https://x.test/a", "You're on a streak", "Heating up; the \"board\" fills"]) {
      expect(joined, must).toContain(must);
    }
    expect(joined).not.toMatch(/comment|heatStep/);
  });
  it("does not read the code after a semicolon as copy, but keeps a prose semicolon", () => {
    const code = "const saved = () => save(account, null);\n  return (<p>x</p>);\ntype P = {\n  cold: boolean;\n  drawn: number;\n};\nconst q = <p>a</p>;";
    const texts = segmentsOf({ path: "src/x.tsx", text: code }).map((g) => g.text);
    expect(texts.filter((t) => /return|cold|drawn|save/.test(t)), texts.join("|")).toEqual([]);
    const prose = segmentsOf({ path: "src/x.tsx", text: "const a = <p>Heating up; the board fills</p>;" }).map((g) => g.text);
    expect(prose).toContain("Heating up; the board fills");
  });
  it("decodes entities and curly apostrophes before the rules run", () => {
    for (const jsx of ["<p>You&apos;ve won</p>", "<p>You’ve won</p>", "<p>You&#39;ve won</p>"]) {
      const texts = segmentsOf({ path: "src/x.tsx", text: jsx }).map((g) => g.text);
      expect(texts.some((t) => RE.winnings.test(t)), jsx).toBe(true);
    }
  });
  it("reads an interpolated count as a number, so '{n} wins' and '1 in ${n}' meet the rules", () => {
    const hit = (path: string, text: string, re: RegExp) => segmentsOf({ path, text }).some((g) => re.test(g.text));
    expect(hit("src/x.tsx", "const a = <p>{n} wins</p>;", RE.winTotals)).toBe(true);
    expect(hit("src/x.tsx", "const a = <p>1 in {n}</p>;", RE.oddsRatio)).toBe(true);
    expect(hit("src/x.ts", "const a = `${n} wins`;", RE.winTotals)).toBe(true);
    expect(hit("src/x.ts", "const a = `1 in ${n}`;", RE.oddsRatio)).toBe(true);
    expect(hit("src/x.tsx", "const a = <p>Wins {item}.</p>;", RE.winTotals)).toBe(false);
  });
  it("reads literals in .ts files, even after an arrow or a closing brace", () => {
    const fixture = 'export const f = () => z.int({ error: "Hot pick" }).min(1, "Level up");\nconst d = () => new Intl.DateTimeFormat("en-US", {});';
    const texts = segmentsOf({ path: "src/x.ts", text: fixture }).map((g) => g.text);
    for (const must of ["Hot pick", "Level up", "en-US"]) expect(texts, must).toContain(must);
  });
  it("reads copy, not code: the audit itself sees literals and JSX text", () => {
    // A guard against a parser that silently returns nothing: these strings exist in the app today.
    expect(segments.some((g) => g.text === "Browse breaks")).toBe(true);
    expect(segments.some((g) => g.kind === "jsx" && /Hosting on Facebook now\?/.test(g.text))).toBe(true);
    expect(segments.some((g) => /heatStep/.test(g.text))).toBe(false);
    expect(segments.some((g) => g.path === "src/app/host/new/parse.ts" && /^Hours to pay/.test(g.text))).toBe(true);
    expect(segments.some((g) => g.kind === "jsx" && /We'll send you/.test(g.text))).toBe(true);
  });
});

const PHOTO_PATH = /(^|\/)photos?(\/|-)|photo[^/]*\.tsx?$/;
const RE_PHOTO = { verified: /\b(verified|authentic(?:ated)?|genuine|certified|guaranteed|proof|checked by)\b/i };
const photoSegs = segments.filter((g) => PHOTO_PATH.test(g.path));

describe("copy audit, photos (spec §10, §11)", () => {
  it("reads the photo modules at all (a guard against a path that silently matches nothing)", () => {
    expect(photoSegs.some((g) => g.text === "Photo removed")).toBe(true);
    expect(photoSegs.some((g) => /can't be read here/.test(g.text))).toBe(true);
  });
  it("never implies the platform checked a photo", () => expect(copyHits(RE_PHOTO.verified, photoSegs)).toEqual([]));
  it("catches that claim and lets the near-misses through", () => {
    for (const t of ["Verified photo", "Photo checked by Breaks", "An authentic item", "Proof of the item", "Guaranteed real"]) expect(RE_PHOTO.verified.test(t), t).toBe(true);
    for (const t of ["Photos of the items.", "Rules and specs go in the description.", "Photo removed"]) expect(RE_PHOTO.verified.test(t), t).toBe(false);
  });
  it("keeps every notice sentence inside every Mosaic and photo rule", () => {
    const place = (s: string | null) => (s === null ? "" : s === "top" ? "Top spot" : s === "second" ? "2nd place" : "Phantom 24g");
    const sentences = [
      noticeFor([{ kind: "lead" }], place), noticeFor([{ kind: "removed", slot: null, wasLead: false }], place),
      noticeFor([{ kind: "removed", slot: "top", wasLead: true }], place), noticeFor([{ kind: "removed", slot: "second", wasLead: false }], place),
      noticeFor([{ kind: "removed", slot: "or", wasLead: false }], place),
      noticeFor([{ kind: "retagged", from: "top", to: "second" }], place),
      noticeFor([{ kind: "lead" }, { kind: "removed", slot: null, wasLead: false }], place),
    ];
    expect(sentences.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
    expect(new Set(sentences)).toEqual(new Set(["Lead photo replaced", "Photo removed", "Top-spot photo removed", "2nd-place photo removed", "Phantom 24g photo removed", "A photo moved from Top spot to 2nd place", "Photos changed"]));
    for (const s of sentences as string[]) for (const [rule, re] of Object.entries(RE)) expect(re.test(s), `${rule}: "${s}"`).toBe(false);
    for (const s of sentences as string[]) expect(RE_PHOTO.verified.test(s), s).toBe(false);
  });
  it("keeps the labels and the viewer's caption inside the rules", () => {
    const texts = [...Object.values(CONDITION_LABEL), "Updated", "Removed Oct 21", "5 photos", "Updated, 5 photos of the prizes", "Top spot: Taylor Chronos 24g. Photo 2 of 5.", "Photos of the items. Rules and specs go in the description.", "Buyers in this break will still see this photo, marked Removed.", "Buyers see the lead photo first in the feed."];
    for (const t of texts) { for (const [rule, re] of Object.entries(RE)) expect(re.test(t), `${rule}: "${t}"`).toBe(false); expect(RE_PHOTO.verified.test(t), t).toBe(false); }
  });
  it("gives every default alt text inside the rules, within 1 to 120 characters, even for a very long title", () => {
    for (const a of [defaultAlt({ itemName: "Taylor Chronos 24g", title: "Chronos night" }), defaultAlt({ itemName: null, title: "Chronos night" }), defaultAlt({ itemName: null, title: "x".repeat(300) })]) {
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(120);
      for (const [rule, re] of Object.entries(RE)) expect(re.test(a), `${rule}: "${a}"`).toBe(false);
      expect(RE_PHOTO.verified.test(a), a).toBe(false);
    }
  });
});
