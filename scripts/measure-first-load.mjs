// Measures the first-load JS of a route from a Turbopack build (Next 16): the root main files, the polyfills,
// and the layout chain plus page entries of the route's client-reference manifest, each file gzipped once.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOWANCE_JS = 4036;

function readManifest(dist, route) {
  const file = join(dist, "server", "app", ...route.split("/").filter(Boolean), "page_client-reference-manifest.js");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`cannot read page_client-reference-manifest.js for ${route} at ${file}; run next build first`);
  }
  const sandbox = {};
  sandbox.globalThis = sandbox;
  runInNewContext(text, sandbox);
  const entries = Object.values(sandbox.__RSC_MANIFEST ?? {});
  if (entries.length !== 1) throw new Error(`expected one manifest entry in ${file}, found ${entries.length}`);
  return entries[0];
}

/** True for a layout or page entry on the route's path; false for error, global-error, loading, not-found. */
function isRouteEntry(key, routeDir) {
  const m = /^\[project\]\/src\/app\/(?:(.+)\/)?(layout|page)$/.exec(key);
  if (!m) return false;
  const dir = m[1] ?? "";
  return dir === "" || routeDir === dir || routeDir.startsWith(`${dir}/`);
}

export function measureFirstLoad(o = {}) {
  const dist = o.dist ?? ".next";
  const route = o.route ?? "/b/[id]";
  const forbid = o.forbid ?? [];
  const routeDir = route.split("/").filter(Boolean).join("/");
  const manifest = readManifest(dist, route);
  const build = JSON.parse(readFileSync(join(dist, "build-manifest.json"), "utf8"));

  const js = new Set([...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]);
  for (const [key, files] of Object.entries(manifest.entryJSFiles ?? {})) {
    if (isRouteEntry(key, routeDir)) for (const f of files) js.add(f);
  }
  const css = new Set();
  for (const [key, files] of Object.entries(manifest.entryCSSFiles ?? {})) {
    if (isRouteEntry(key, routeDir)) for (const f of files) css.add(typeof f === "string" ? f : f.path);
  }

  const chunks = [];
  const forbidden = [];
  const add = (file, kind) => {
    const buf = readFileSync(join(dist, file));
    chunks.push({ file, gz: gzipSync(buf, { level: 9 }).length, kind });
    if (kind === "js") {
      const text = buf.toString("utf8");
      for (const marker of forbid) if (text.includes(marker)) forbidden.push({ marker, file });
    }
  };
  for (const f of js) add(f, "js");
  for (const f of css) add(f, "css");
  const sum = (k) => chunks.filter((c) => c.kind === k).reduce((n, c) => n + c.gz, 0);
  return { js: sum("js"), css: sum("css"), chunks, forbidden };
}

export function checkAgainstBase(m, base) {
  const over = Math.max(0, m.js - (base.js + base.allowanceJs));
  return { ok: over === 0, over };
}

function parseArgs(argv) {
  const a = { forbid: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--json" || k === "--check") a[k.slice(2)] = true;
    else if (k === "--forbid" || ["--route", "--dist", "--write-base", "--commit", "--html-url"].includes(k)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`usage: ${k} needs a value`);
      if (k === "--forbid") a.forbid.push(v);
      else a[k.slice(2)] = v;
    } else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a["write-base"] && !a.commit) throw new Error("usage: --write-base needs --commit <sha>");
  const route = a.route ?? "/b/[id]";
  const m = measureFirstLoad({ dist: a.dist, route, forbid: a.forbid });
  let failed = false;
  if (a.json) console.log(JSON.stringify(m, null, 2));
  else {
    for (const c of [...m.chunks].sort((x, y) => y.gz - x.gz)) console.log(`${String(c.gz).padStart(8)}  ${c.kind}  ${c.file}`);
    console.log(`first-load js ${m.js} B gzip, css ${m.css} B gzip (${route})`);
  }
  for (const f of m.forbidden) {
    console.error(`forbidden marker ${f.marker} in first-load chunk ${f.file}`);
    failed = true;
  }
  // Optional: also prove the markers are absent from a served page (a running server), not only from the chunks.
  if (a["html-url"]) {
    const res = await fetch(a["html-url"]);
    if (!res.ok) throw new Error(`${a["html-url"]} answered ${res.status}; the served HTML was not checked`);
    const html = await res.text();
    for (const marker of a.forbid) {
      if (html.includes(marker)) {
        console.error(`forbidden marker ${marker} in served HTML of ${a["html-url"]}`);
        failed = true;
      }
    }
    console.log(`served HTML of ${a["html-url"]}: ${html.length} chars scanned`);
  }
  if (a["write-base"]) {
    writeFileSync(a["write-base"], `${JSON.stringify({ route, commit: a.commit, js: m.js, css: m.css, allowanceJs: ALLOWANCE_JS }, null, 2)}\n`);
  }
  if (a.check) {
    const base = JSON.parse(readFileSync(join(HERE, "first-load-base.json"), "utf8"));
    const r = checkAgainstBase(m, base);
    console.log(`base ${base.js} B (${base.commit}), allowance ${base.allowanceJs} B, now ${m.js} B`);
    if (!r.ok) {
      console.error(`first-load js is ${r.over} B over the allowance`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
