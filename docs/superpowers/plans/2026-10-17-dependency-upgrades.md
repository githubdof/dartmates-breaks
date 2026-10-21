# Dependency upgrades roadmap (2026-10-17)

Policy (owner, 2026-10-17): move every dependency to its latest stable version, as long as the product keeps
the support it needs. A major moves only when everything that depends on it supports it; until then it waits
on the newest version that is supported, and this file names what it waits on.

Step 1, the patch and minor updates plus the pnpm 9 pin, is PR #3.

## Where each major stands

Checked 2026-10-17 against the npm registry (engines and peer ranges) and the Next.js release notes.

| Upgrade | Latest | Supported now? | What decides it |
|---|---|---|---|
| Node 22 → 24 LTS | 24.22.0 | Yes | Next 16 needs >=20.9, vitest 5 lists ^24, @noble/hashes 2 needs >=20.19. Node 26 is current, not LTS: wait for its LTS. |
| pnpm 9 → 12 | 12.14.0 | Yes, on Node 24 | Corepack 0.31 (Node 22.14) cannot run pnpm 12 (it looks for `bin/pnpm.cjs`); corepack 0.36 (Node 24.22) can. CI needs `pnpm/action-setup` >= v6.1.0. pnpm 12 blocks dependency build scripts unless `allowBuilds` in `pnpm-workspace.yaml` lists them. The lockfile stays at 9.0. |
| Next 15.5 → 16 | 16.4.2 | Yes, done in PR #5 | React 19 and Playwright peers met; @supabase/ssr is framework-agnostic. `next lint` is gone (lint runs the ESLint CLI), `middleware.ts` becomes `proxy.ts`, request APIs must be awaited. Done by hand, not the codemod (see Follow-ups for what the upgrade left). |
| ESLint 9 → 10 | 10.13.0 | **No** | eslint-config-next 16 pulls in eslint-plugin-react 7.37, eslint-plugin-import 2.32 and eslint-plugin-jsx-a11y 6.10, whose peers stop at ESLint 9 (rechecked 2026-10-21: still `^9`, `^9`, `^9`; react-hooks 7.1 and typescript-eslint 8.72 already list ^10). Next's upgrade guide says eslint-config-next 16.4 "supports ESLint 10", but that is Next's own plugin, not those three. Move when they list ^10. |
| TypeScript 5.9 → 6.0 | 6.0.3 | Yes | typescript-eslint 8.71 supports `<6.1.0`. |
| TypeScript → 7 | 7.0.2 | **No** | TS 7 ships no JS compiler API. Next runs it only behind `experimental.useTypeScriptCli`, and typescript-eslint still needs that API. Move when typescript-eslint supports TS 7 and Next makes the CLI path stable. |
| @noble/hashes 1 → 2 | 2.4.0 | Yes, done in PR #6 | Needs Node >=20.19. It is the draw's hashing (`src/crypto/*`): the draw and verify tests must pass unchanged, and an old draw must still verify. v2 is ESM-only, every module path ends in `.js`, `sha256` lives in `sha2.js`, and hash inputs must be `Uint8Array` (every call here already was). |
| @types/node | 26.6.5 | Follows Node | Tracks the runtime major: ^22 now, ^24 with step 2. Never ahead of the runtime. |

## Order

PR #2 (Plan C) touches `next.config.ts` and `src/domain/draws/*`. Steps that touch those wait until it lands.

2. **Node 24 LTS, pnpm 12, TypeScript 6.0, @types/node ^24, CI actions to their latest majors.** PR #4,
   stacked on PR #3. TypeScript 6 checks side-effect imports, so `src/css.d.ts` declares `*.css`.
3. **Next 16** (with eslint-config-next 16 and the lint script on the ESLint CLI). PR #5, after PR #2 landed.
4. **@noble/hashes 2.** PR #6, after PR #2 landed. Opus review: it is the draw's crypto.
5. **Blocked until support lands:** ESLint 10, TypeScript 7. Recheck at the start of each new plan.

## What step 4 (@noble/hashes 2, PR #6) changed

- `@noble/hashes` 2.4.0. Import paths only: `@noble/hashes/sha256` → `@noble/hashes/sha2.js`, `/utils` → `/utils.js`,
  `/hmac` → `/hmac.js`, in `src/crypto/*`, `src/domain/draws/commands.ts` and `scripts/fill-vectors.ts`. No call
  changes: `sha256(bytes)`, `hmac(sha256, key, msg)`, `bytesToHex`, `hexToBytes`, `concatBytes` and `utf8ToBytes` keep
  their signatures, and every input was already a `Uint8Array`.
- Evidence that an old draw still verifies: `scripts/fill-vectors.ts` recomputed `src/crypto/vectors.json` under v2 and
  the output is byte-for-byte the committed file (seed, ranking, resultHash for each vector); `draw.test.ts`,
  `beacon.test.ts` and `verify-stored.test.ts` pass unchanged; the e2e's draw journey (fake beacon, in-browser verify on
  the result page, which bundles the ESM-only package through Turbopack) passes.

Each step is its own PR with the full gates: lint, tsc, unit, concurrency, CI, e2e (incl. axe), `next build`.

## What step 3 (Next 16, PR #5) changed

- `next` 16.4.2 and `eslint-config-next` 16.4.2; `@eslint/eslintrc` dropped (the config imports Next's flat
  configs directly). `pnpm lint` runs `eslint .`; `next build` no longer lints, CI runs `pnpm lint` on its own.
- `src/middleware.ts` is `src/proxy.ts` with an exported `proxy` (the `edge` runtime is gone with it; the Supabase
  cookie refresh needs nothing from it). `next build` and `next dev` use Turbopack by default; there is no webpack
  config, so nothing to port. `next dev` now writes to `.next/dev`.
- `AppRouterInstance` gained `bfcacheId`; the three test router stubs carry it.
- `next build` rewrote `tsconfig.json`: `jsx` is `react-jsx` (Next 16's default) and `.next/dev/types/**/*.ts` joins
  `include`; the formatting is kept as it was.
- The Turbopack build writes no `.next/app-build-manifest.json`, which the Plan C Task 20 budget script read for the
  first-load JS of `/b/[id]`. When Mosaic §11 is next measured, list that route's client chunks from
  `.next/server/app/b/[id]/page_client-reference-manifest.js` (or build with `--webpack` once for the comparison).
- The Turbopack build warns "Failed to find font override values for font `Big Shoulders`": `next/font` has no
  fallback metrics for it, so there is no size-adjusted fallback while it loads (it is not preloaded; Mosaic ruling 11).
  Not checked whether the webpack build said the same; the e2e and axe passes are unchanged.

## Follow-ups

- **React Compiler lint rules: done in PR #7.** eslint-plugin-react-hooks 7 (with eslint-config-next 16) turns on
  `react-hooks/set-state-in-effect`, `react-hooks/refs` and `react-hooks/preserve-manual-memoization`. They flagged
  17 places in 10 files, every one a deliberate pattern with a comment; PR #5 had turned the three rules off. PR #7
  turns them on and rewrites the sites without changing what a component shows, with the e2e as the guard:
  - *State adjusted while rendering* (the prev-value pattern, as `use-board-moments.ts` already did): the stepper's
    draft following its value; the pay sheet's reset on close; the provisional owe dropped when fresh props arrive
    (`use-pay-sheet.ts`); the /me card closing a sheet whose owe vanished; the island clearing a landed claim and
    setting the landing count. Each now shows in the same commit, where the effect showed it one paint later.
  - *Browser-only reads as `useSyncExternalStore` snapshots* (the server snapshot matches the server HTML, the
    browser's replaces it right after hydration): `LocalTime`'s zone-local text; the pay sheet's "sent" hint from
    viewer memory; the result page's automatic in-browser check (`verify.tsx`, memoized per inputs object).
  - *`useEffectEvent`* for the latest props inside an effect: the island's reconcile of the selection against fresh
    props; the reveal's play from the gate.
  - *A ref written in an effect, not while rendering*: the reveal clock's handlers; the pay sheet's `openRef`.
  - *The "checking" state set with the value* in the change handler (`handle-field.tsx`); the effect only brings the
    server's answer. Idle at first, on the server too: a prefilled handle goes from idle to the answer.
  - *Opus review (one round):* the landed-claim clear is keyed on the identity of the landed array, as the effect was
    (a second claim within the auto-refresh window would otherwise have read the first claim's landing as its own and
    lost its drop); the /me card drops the failure from the page hand-off on every lost sheet, not only after an error
    had committed; `openRef` is written in a layout effect.
  - *The reveal's `shown` board* is computed each render (at most 50 cells; `Grid` never reads the array's identity):
    the compiler could not preserve the manual `useMemo`.
  - *Kept, with a reason on the line*: the board-fills call (`break-interactive.tsx`, `say(call)` in the layout
    effect that reads and marks the once-per-viewer flag): the read is the external system and nothing else sees it.
    The draw-starts effect beside it, of the same shape, the rules do not flag.
- **`window.location.assign` in the login form: done in PR #8.** "Use a different email" reloaded `/login` to reset
  the two `useActionState` results, which have no reset of their own. The steps now sit under a key the button bumps,
  so they remount with both states empty, without leaving the page; the email field takes focus, and when the page
  came from an expired link the URL drops `?error=link` with the banner. `e2e/pages.spec.ts` pins it (no reload, the
  code step gone, the field empty and focused, the banner and the param gone). Lint is clean, with no warning.
