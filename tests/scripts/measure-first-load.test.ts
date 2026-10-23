import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkAgainstBase, measureFirstLoad } from "../../scripts/measure-first-load.mjs";

type Spec = {
  root?: string[];
  polyfill?: string[];
  layout?: string[];
  page?: string[];
  error?: string[];
  lazy?: string[];
  text?: Record<string, string>;
};

const chunk = (f: string) => `static/chunks/${f}`;
const read = (d: string, f: string) => readFileSync(join(d, chunk(f)));

/** A dist laid out as Turbopack writes it: a build manifest and the route's client-reference manifest. */
function fakeDist(s: Spec): string {
  const d = mkdtempSync(join(tmpdir(), "nb-"));
  const all = new Set([...(s.root ?? []), ...(s.polyfill ?? []), ...(s.layout ?? []), ...(s.page ?? []), ...(s.error ?? []), ...(s.lazy ?? [])]);
  for (const f of all) {
    const p = join(d, chunk(f));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, (s.text?.[f] ?? "") + `console.log("${f}");`.repeat(40 + f.length * 7));
  }
  writeFileSync(
    join(d, "build-manifest.json"),
    JSON.stringify({ rootMainFiles: (s.root ?? []).map(chunk), polyfillFiles: (s.polyfill ?? []).map(chunk) }),
  );
  const m = (fs: string[] = []) => fs.map(chunk);
  const manifest = {
    entryJSFiles: {
      "[project]/src/app/layout": m(s.layout),
      "[project]/src/app/error": m(s.error),
      "[project]/src/app/b/[id]/error": m(s.error),
      "[project]/src/app/b/[id]/page": m(s.page),
      "[project]/src/app/other/page": m(s.lazy),
      "[project]/node_modules/.pnpm/next/dist/client/components/builtin/global-error": m(s.error),
    },
    entryCSSFiles: { "[project]/src/app/layout": [{ path: chunk("a.css"), inlined: false }] },
  };
  const dir = join(d, "server/app/b/[id]");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "page_client-reference-manifest.js"),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/b/[id]/page"] = ${JSON.stringify(manifest)};\n`,
  );
  writeFileSync(join(d, chunk("a.css")), "body{margin:0}".repeat(30));
  return d;
}

describe("measureFirstLoad", () => {
  it("sums the gzip level 9 size of the root files, polyfills, the layout chain and the page, each file once", () => {
    const d = fakeDist({ root: ["r1.js"], polyfill: ["p.js"], layout: ["r1.js", "l.js"], page: ["r1.js", "pg.js"], error: ["e.js"] });
    const m = measureFirstLoad({ dist: d });
    expect(m.chunks.filter((c) => c.kind === "js").map((c) => c.file).sort()).toEqual(["l.js", "p.js", "pg.js", "r1.js"].map((f) => `static/chunks/${f}`));
    expect(m.js).toBe(["r1.js", "p.js", "l.js", "pg.js"].reduce((n, f) => n + gzipSync(read(d, f), { level: 9 }).length, 0));
    expect(m.css).toBe(gzipSync(read(d, "a.css"), { level: 9 }).length);
  });

  it("leaves out the error entries and chunks reached only by a dynamic import", () => {
    const m = measureFirstLoad({ dist: fakeDist({ root: ["r1.js"], page: ["pg.js"], error: ["e.js"], lazy: ["viewer.js"] }) });
    const js = m.chunks.filter((c) => c.kind === "js").map((c) => c.file);
    expect(js.join()).not.toMatch(/e\.js|viewer\.js/);
    expect(js.sort()).toEqual(["static/chunks/pg.js", "static/chunks/r1.js"]);
  });

  it("reports a forbidden marker found in a first-load chunk, and none when it is only in a lazy chunk", () => {
    const d = fakeDist({ root: ["r1.js"], page: ["pg.js"], lazy: ["viewer.js"], text: { "viewer.js": "data-photo-viewer-root" } });
    expect(measureFirstLoad({ dist: d, forbid: ["data-photo-viewer-root"] }).forbidden).toEqual([]);
    const d2 = fakeDist({ root: ["r1.js"], page: ["pg.js"], text: { "pg.js": "data-photo-viewer-root" } });
    expect(measureFirstLoad({ dist: d2, forbid: ["data-photo-viewer-root"] }).forbidden).toEqual([{ marker: "data-photo-viewer-root", file: "static/chunks/pg.js" }]);
  });

  it("fails loudly when the manifest is missing, instead of measuring nothing", () => {
    expect(() => measureFirstLoad({ dist: mkdtempSync(join(tmpdir(), "nb-")) })).toThrow(/page_client-reference-manifest\.js/);
  });
});

describe("checkAgainstBase", () => {
  it("checks the allowance against the base", () => {
    expect(checkAgainstBase({ js: 10_000 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: true, over: 0 });
    expect(checkAgainstBase({ js: 12_036 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: true, over: 0 });
    expect(checkAgainstBase({ js: 12_100 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: false, over: 64 });
  });
});
