# Plan B (new pages) — deferred findings and pre-deploy notes

Plan: `2026-10-14-plan-b-new-pages.md`. Specs: `../specs/2026-10-13-dart-breaks-platform-design.md`,
`../specs/2026-10-13-ui-design.md`. Every task was reviewed; the whole-branch review's fix wave applied both
Important items, its minors, and the per-task items ruled into the wave. What follows was deliberately deferred.

## Pre-deploy notes for the human

1. **Apply migrations 0002 (`users.payment_name`) and 0003 (`rate_limits`, RLS forced) to production before
   deploying this code**, over the direct connection, not the 6543 pooler: `ENV_FILE=.env.production pnpm db:migrate`.
   Both are additive, so the old code keeps working on the migrated schema. If the code goes first, `/api/tick`
   fails every minute at `pruneRateLimits`, and `/account`, the ledgers and `/api/handle` error.
2. **No new environment variables.** `APP_URL` must be the public origin: the `og:image` URL is built from it.
   `E2E_SECRET` and `BEACON` stay unset on Vercel (`assertDeployEnv` enforces it).
3. **Proxy assumption:** the handle check and onboarding trust the first `x-forwarded-for` entry. Correct on Vercel,
   which overwrites the header; revisit behind any other proxy.
4. **Developers:** `pnpm exec tsx scripts/create-db.ts breaks_e2e`, then migrate it, before `pnpm test:e2e`
   (README "E2E database"). `breaks_test` and `breaks_e2e` must be re-migrated after each new migration. The e2e
   needs port 3000 free: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill`.
5. **Link previews** are served with `public, max-age=300, s-maxage=300`, so a preview can be five minutes stale.
6. **Rulings recorded in the plan's Global Constraints:** admins see buyers' payment names in host view (they act as
   host on every break; `/account` copy says so); the link preview may reuse `getBreakPage` because its guarantee is
   `ogModel(shapeGrid(page, null))` emitting only number and tone, pinned by `og.test.ts`.

## For the next plans

### Minis plan
- `breaksRun` counts minis while `pastCount` does not (host profile vs `/host`); decide once minis have UI.
- `/host` filters `kind = 'main'`; the merged "waiting on you" ledger does the same.

### Reputation / reports / admin plan
- Banned or suspended hosts: the fix wave hides their breaks from the feed and the landing hero; their profile page,
  the suspended badge and the ban flow itself belong here (spec §11, §12).
- Admin *views* of host ledgers and payment names are not written to `admin_events` (spec §12 "everything").
- Bonus line numbers: after `line.bonus_removed` the next bonus line no longer reuses a number (fix wave), but
  reputation code reading events should still key on line ids, not numbers.
- `host.payment_handles_changed` events now exist (fix wave); the "payment handle last changed" trust signal can
  read them.

### Messaging plan
- Merged ledger: a refused action on an `OWNER_CHANGED` row refreshes the props (fix wave) but the frozen row keeps
  its Paid button until the sheet closes; a per-row "changed" marker would be nicer.

### Smaller items, any plan
- **Prize order on edit:** within-rank items share `created_at`, so their order on re-save is by uuid. Needs a
  `position` column (migration) read by the composer, `draftForEdit` and `getBreakPage`.
- **`/breaks` sort chips** are buttons calling `router.push`: dead without JS and one history entry per arrow
  press. Links with `role="radio"`, or `replace` for arrow moves. The host select navigates on every change.
- **`/me`:** a drawn break with unsent lines reads "Unpaid." with no amount and no action (design note); card
  errors share the neutral note style while the break page shows `text-red`.
- **OG image:** empty slots in the last row and boards under four lines show a grey filler; reserved cells differ
  from open ones by number colour only (design §6 table). A line-state-only query remains optional defence in
  depth (type `ogModel`'s parameter as the subset it needs).
- **Copy-audit rule** catches a state word only directly after `>`; widen if a miss slips through.
- **Rate limiter:** fixed window allows a 2x burst at the boundary; `pruneRateLimits` is a range delete the
  `(bucket, window_start)` index cannot serve (negligible at v1 volume); shared-NAT starvation is by design.
- **`last_seen_at` throttle** still takes the row lock on the write path; fine at v1 volume.
- **Tests worth adding later:** the cap-note suppression wiring (refused claim + reconcile → one announcement);
  `MyBreakCard` render tests (error, offline, disabled states); the host 3-day boundary of "Closed N days ago";
  merged-ledger Undo window end and a second Paid while one Undo is pending; the 24 h feed boundary; the handle
  limiter under concurrency.

## Open bug reports (not yet reproduced)

- **Safari, pay sheet mini cells:** carried from Plan A (`2026-10-13-plan-a-deferred-findings.md`); owner will send
  a screenshot next time it happens.
