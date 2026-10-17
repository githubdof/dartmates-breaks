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
| Next 15.5 → 16 | 16.4.2 | Yes | React 19 and Playwright peers met; @supabase/ssr is framework-agnostic. `next lint` is gone (lint runs the ESLint CLI), `middleware.ts` becomes `proxy.ts`, request APIs must be awaited. Run `@next/codemod upgrade`. |
| ESLint 9 → 10 | 10.13.0 | **No** | eslint-config-next 16 pulls in eslint-plugin-react 7.37, eslint-plugin-import 2.32 and eslint-plugin-jsx-a11y 6.10, whose peers stop at ESLint 9. Move when they list ^10. |
| TypeScript 5.9 → 6.0 | 6.0.3 | Yes | typescript-eslint 8.71 supports `<6.1.0`. |
| TypeScript → 7 | 7.0.2 | **No** | TS 7 ships no JS compiler API. Next runs it only behind `experimental.useTypeScriptCli`, and typescript-eslint still needs that API. Move when typescript-eslint supports TS 7 and Next makes the CLI path stable. |
| @noble/hashes 1 → 2 | 2.4.0 | Yes | Needs Node >=20.19. It is the draw's hashing (`src/crypto/*`): the draw and verify tests must pass unchanged, and an old draw must still verify. |
| @types/node | 26.6.5 | Follows Node | Tracks the runtime major: ^22 now, ^24 with step 2. Never ahead of the runtime. |

## Order

PR #2 (Plan C) touches `next.config.ts` and `src/domain/draws/*`. Steps that touch those wait until it lands.

2. **Node 24 LTS, pnpm 12, TypeScript 6.0, @types/node ^24, CI actions to their latest majors.** PR #4,
   stacked on PR #3. TypeScript 6 checks side-effect imports, so `src/css.d.ts` declares `*.css`.
3. **Next 16** (with eslint-config-next 16 and the lint script on the ESLint CLI). After PR #2 lands.
4. **@noble/hashes 2.** After PR #2 lands. Opus review: it is the draw's crypto.
5. **Blocked until support lands:** ESLint 10, TypeScript 7. Recheck at the start of each new plan.

Each step is its own PR with the full gates: lint, tsc, unit, concurrency, CI, e2e (incl. axe), `next build`.
