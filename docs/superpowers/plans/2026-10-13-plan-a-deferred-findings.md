# Plan A (UI foundation) — deferred findings and pre-deploy notes

Plan: `2026-10-13-plan-a-ui-foundation.md`. Design: `../specs/2026-10-13-ui-design.md`.
Every task was reviewed; the whole-branch review's fix wave applied all
Important items and 28 small fixes. What follows was deliberately deferred,
triaged by the whole-branch reviewer and ruled by the controller.

## For the Plan B brief (new pages: feed, landing, /me, host profile, /host grouping, OG image)

1. **Pay block reuse for `/me`.** Extract the claim and pay logic in
   `src/components/break/break-interactive.tsx` (about 350 lines) into
   `useClaim` and `usePaySheet` hooks when `/me` needs "How to pay Jim" and
   "Give back unpaid lines". Include past-deadline wording ("Payment was
   due …").
2. **Perf.** `getBreakPage` runs twice per request (metadata and page): wrap
   it in `cache()`. The root layout upserts the user on every route, `/legal`
   included: throttle `last_seen_at`. The break page opens four transactions:
   fold them into one.
3. **Accessibility pass.** Ledger header row as a real table header above
   640; cap failures announced twice; render-level state tests for Cell, Grid
   and ledger rows; toast and snackbar offsets measured from the sheet's
   bottom action instead of 68 px, and `--tab-h` respected on `/host`.
4. **Copy pass.** Trust line casing to match feed cards ("New host"); "You
   started the draw" when the host views their own ledger; tiny-price
   wording; a JSX-text state-word audit rule.
5. **Tests.** `claimNext` on pick_or_random and a `claimNext` race; the 0001
   backfill; the owned+reserved grid case; `giveBack` and `unpaidForBuyer`
   rollback; `hostTrust` ignores other hosts; ledger-view edge cases (empty
   ledger, `applyOrder` drop); `dealGateScript` behaviour; Share fallback,
   Skip focus and Replay reset; `verifyOtp` → onboarding redirect;
   `suggestHandle` edge cases; query tests for other-host, minis and bonus
   exclusion.
6. **Journey 2 e2e.** Draft then open, prize choice, 2nd place, all three
   picking modes, a real check of result verification. Clean up the e2e's
   users and breaks in the dev DB, or point the e2e at its own database.
7. **E2E in CI.** CI runs lint, unit, concurrency, the RLS suite and the
   build, but no e2e (Playwright needs Supabase Auth). Consider
   `supabase start` in a CI job with `E2E_SECRET` and `BEACON=fake` set only
   there.
8. **Result page.** Bring back the "Technical details" fold with the result
   hash and algorithm version (platform spec §10).
9. **Ledger.** Chip counts stay live while the list is frozen (re-tapping the
   chip refreshes); `/host` lists minis (filter `kind = 'main'` until minis
   have UI); a bonus line outlives its holder's released numbered lines
   (decide whether release removes bonus lines or blocks); "Take the last N"
   can claim more than N if lines reopen in between (pass the expected count
   to `claimAllOpen` and refuse a mismatch).
10. **`/account`.** The half-set-up account dead end, and display-name
    editing.
11. **Payment name.** "Pays as John Smith" on ledger rows and in search needs
    `users.payment_name` (migration + onboarding field).
12. **Drop `allow_random_claims`** once `claim_mode` has been live for a
    while (kept beside it to avoid an interactive drizzle-kit rename).

## For later plans

- **Dark mode** (design §8): `bg-hatch` should use `color-mix` on `--ink-2`;
  tokens are already CSS variables.
- **Cancel transitions** (design §8): the empty bottom bar on cancelled, and
  "Refund received".
- **Messaging plan:** Remind / Remind all on overdue rows; "and Mike is told"
  in the release confirm; the "Questions? Ask Jim" slot.
- **Reputation plan:** trust percentage, late-payment history on ledger rows,
  median ship days, Mark shipped and Got it.
- **Photo storage plan:** photos per break; the grid thumbnail stays the
  fallback.

## Pre-deploy notes for the human

- Migration `0001_claim_mode.sql` adds `breaks.claim_mode` with a CHECK and a
  backfill from `allow_random_claims`; run `pnpm db:migrate` against
  production before deploying this build.
- Fonts are fetched from Google Fonts at build time (`next/font/google`);
  a build host without network needs the `next/font/local` fallback.
- `/test/login` and `/dev/components` refuse on any Vercel deploy; never set
  `E2E_SECRET` or `BEACON` there.
- Local development: tests use a separate `breaks_test` database (README
  "Test database" section); the concurrency suite truncates every table in
  whichever database `.env.test` points at.
- A manual Escape press on an open sheet in real Chrome, Safari and
  Firefox is still worth one check: the extension-driven Chrome tab used
  during development did not deliver dialog close events, so Escape was
  verified only in headless Chromium.
