# Plan B — New pages (feed, landing, My lines, host profile, /host grouping, draft editing, handle check, link preview, accessibility, journey 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every v1 screen the UI design draws exists and wears the board design: the feed `/breaks` with its three sorts and host filter, the landing page with a real ran break as its hero, My lines `/me` with the pay block, the host profile `/h/{handle}`, `/host` grouped by state with the "waiting on you" strip, draft editing, live handle availability, the link-preview image per break, an accessibility and copy pass, and a second end-to-end journey; plus everything Plan A deferred to Plan B (one cached transaction per break page, throttled `last_seen_at`, payment names, `/account`, the claim and pay hooks, the "Take the last N" guard, the test backlog).

**Architecture:** Domain first, as in Plan A: new read queries (`listFeed`, `feedThumbs`, `latestRanBreak`, `myLines`, `hostProfile`, `waitingOnHost`, `readBreakView`) and commands (`updateProfile`, `updateDraft`, `giveBackLines`, `unmarkPaidLines`) keep the `(tx, caller, input)` shape (`updateDraft` takes the break id as its own argument, like `openBreak`), never open transactions, and append an `events` row for every state change. Two forward-only migrations: `0002_payment_name` (a column) and `0003_rate_limits` (a table with forced RLS). Pages are server components that open one `db.transaction` each and pass serialisable props to small client islands; pure view logic (`parseFeedParams`, `groupHostBreaks`, `stateLine`, `ogModel`, `signedInTarget`, `handleNote`) lives in `.ts` modules with vitest tests. Holder data stays behind `shapeGrid`: thumbnails and the link preview are built from line state only (no owner ids or handles are even selected). `BreakInteractive` is split into `useClaim` and `usePaySheet` so `/me` reuses the pay sheet. The e2e suite moves to its own `breaks_e2e` database, truncated before every run.

**Tech Stack:** Next.js 15.5 (App Router, TypeScript, `next/og` `ImageResponse`), React 19.1, Tailwind CSS 4 via `@tailwindcss/postcss`, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres-js, Supabase (Postgres, Auth), zod 4, vitest 5 (Vite 8, oxc), Playwright, `@axe-core/playwright` (added in Task 14b).

**Spec:** `docs/superpowers/specs/2026-10-13-ui-design.md` (§5.1 shell, §5.2 landing, §5.3 feed, §5.5 last paragraph, §5.6 last line, §5.8 My lines, §5.9 host profile, §5.10 handle availability, §6 last paragraph link preview, §7 quality floor, §9 Plan B list), `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md` (§2, §5–§7, §11 interim trust only, §12 accounts, §13 pages and feed sorts) and `docs/superpowers/plans/2026-10-13-plan-a-deferred-findings.md` (every "For the Plan B brief" item; "For later plans" stays out).

**Recorded rulings** (where the documents were ambiguous or disagreed with the code; this plan follows them):
1. The feed lists `open` main breaks only. Platform §13 names no status set for the feed; the old `open, filled, drawing` set came from Plan A's `listOpenBreaks` code, not from the spec. Design §1 ("Find a break worth joining") and the §5.3 empty state both mean breaks you can still join. "Almost full" is platform §13's "closing soon": fewest open numbered lines first.
2. `/me` state line per break: "Unpaid." / "Sent. Jim will tick you off when it arrives." / "Paid." / "Won …" / "Shipped." / "Cancelled."; the break's own status pill carries Open, Closed, Ran. Design §5.8's word "open" maps to the pill. "Earlier" holds breaks that ran, or were cancelled, more than 7 days ago, and only while the viewer has nothing pending there: a break with unpaid lines (sent or not) or an unanswered choice win stays in the recent group whatever its age (an unconfirmed refund joins this rule when cancel transitions ship). A ran break's time is its active draw's; a cancelled break's is its latest `break.cancelled` event, and a cancelled break with no such event stays current (no cancel command exists yet).
3. "7 sent, waiting for you, across 3 breaks" counts buyer rows (one per buyer per break), like the ledger's chip counts; with one break it reads "2 sent, waiting for you".
4. The trust line is "New host" (capital N) everywhere; the break page's small line becomes "Hosted by @jim. New host." Design §5.3 writes "12 breaks run, since Oct 2026" and §5.9 "12 breaks run since Oct 2026"; this plan uses the comma-free §5.9 form everywhere.
5. **Recorded deviation (owner sign-off):** deferred item 3 asks for "a real table header above 640". This plan makes the ledger's column header row visual-only above 640 (`aria-hidden`, outside the list) instead, so screen readers no longer count it as a buyer; rows keep list semantics. A list on phones that flattens into a table above 640 (`sm:contents`) cannot switch ARIA roles by CSS, a real `<table>` would mean rendering two structures, and every row already names its own parts ("Mark Alice paid, $5", the state word, the handle).
6. A bonus line goes with holding a numbered line: when a release or give-back leaves a buyer with no numbered line in the break, their bonus lines are removed (event `line.bonus_removed`). The host's release confirm and the buyer's give-back prompt say so ("Their bonus line 51 goes too." / "Your bonus line 51 goes too."), so no line disappears from the grid unannounced.
7. There is no contact address yet (design §8 defers it), so the landing page's hosts line reads "Hosting on Facebook now? Breaks is invite-only for hosts." with no "Ask for an invite." sentence; the invite contact is on the deferred list below.
8. The link preview uses `next/og`'s bundled Noto Sans (no font fetch per request) and draws taken and sent cells as one tone: crawlers are anonymous viewers, and the image only needs open, taken, paid. That tone is `wire` (`#C9C6BE`) with the number on a white chip (design §4), not the near-white `wire-2`, which repeated the 1.27:1 open-versus-taken problem (design §10).
9. "Tiny-price wording" (deferred list, copy pass) is read as sub-dollar prices: they stay "$0.25", "50 lines at $0.25 = $12.50"; Task 14a pins it with tests.
10. `allow_random_claims` is not dropped yet (deferred item 12 says "once claim_mode has been live for a while"); live chip counts in a frozen ledger stay as they are (re-tapping a chip already refreezes); E2E in CI stays out (it needs Supabase Auth in CI).

**Branch:** execute on a feature branch or worktree named `plan-b-new-pages`; never commit to `main`.

## Global Constraints

Plan A's list, verbatim (task numbers inside it are Plan A's), then the Plan B additions.

- Platform never handles break money; no payment code anywhere (spec §2).
- Host triggers every draw; no automatic draws (spec §2). Cron only *finalises* a host-filed request.
- Gambling-neutral copy: use "group buy", "lines", "allocation", "host tools"; never "raffle", "lottery", "odds", "bet" in UI, code comments, package name or commit messages (spec §2).
- Text + CHECK columns, never Postgres enums; UUID ids; `created_at timestamptz default now()` on every table (spec §6).
- Drizzle over the Supabase transaction-mode pooler (port 6543) with `prepare: false`; no session-level advisory locks, only `pg_try_advisory_xact_lock`/row locks (spec §5).
- RLS enabled on every table with deny-all policies; service-role key only in server env, never `NEXT_PUBLIC_*` (spec §5, §12).
- Commands never open transactions; the caller owns `db.transaction` (spec §5).
- Every state change appends an `events` row in the same transaction (spec §5).
- Lock order: `breaks` row first (`FOR UPDATE`), then `lines` (spec §5, §7).
- Line price and count frozen after open; `seed_commitment` immutable (spec §6.1).
- Commits: Conventional Commits `type(scope): subject`; no AI attribution footers.
- Node 20+, pnpm 9+.

Added for this plan:

- Node 22.12+ is the floor since Plan 1 Task 17 (`.nvmrc`); it supersedes the line above.
- Commands keep the shape `(tx, caller, input)`, lock the break row first (via `lockBreak`/`assertHostOf`), then the per-user advisory lock where claims are involved, then `lines`. Server actions stay thin: `parseInput(zodSchema, raw)` → `action((tx, caller) => command(...))` → `revalidatePath`. Server-only modules import `"server-only"`. The app still connects as `postgres` (BYPASSRLS); new columns need no policy because every table already has forced deny-all RLS.
- Migrations are forward-only: never edit `0000_init.sql`. New SQL comes from `pnpm db:generate --name <name>` plus hand SQL appended to the generated file after a `--> statement-breakpoint` line.
- No state by colour alone: every cell, row and pill state also has a shape, a glyph or a word (design §4, §7).
- Tap targets are at least 44 pt: whole cells, whole row buttons, `min-h-11` on every button and text action.
- No middle dots (`·`) anywhere in copy; use sentences and commas ("3 lines, $15"; "$5 a line. Pay within 24 hours.").
- Sentence case everywhere. No caps labels, except the quoted community idiom in share text ("CLOSED n RAN").
- Money is shown only through `formatMoney`: "$5", "$5.50", "$1,250". Never "$5.00", never "/line".
- State words are the community's: Draft, Open, Closed (`filled`), Running draw (`drawing`), Ran (`drawn`), Cancelled.
- Gambling-neutral vocabulary extends to: never raffle, lottery, odds, bet, ticket, jackpot, lucky. No exclamation marks in copy. (Pinned by the copy audit test, `src/lib/copy-audit.test.ts`, which Task 14a extends.)
- No animation library. Motion is CSS only (120 ms cell fill, the result deal), and honours `prefers-reduced-motion`.
- No `tailwind.config.*`. Tokens are CSS variables in `src/app/tokens.css`, mapped through Tailwind v4 `@theme inline`. Never build class names at runtime (`grid-cols-${n}`): use literal class maps or inline `style`.
- Sheets are native `<dialog>` with `showModal()`. Use `dvh`, never `vh`. Bars and sheets pad with `max(12px, env(safe-area-inset-bottom))`. The viewport sets `viewport-fit=cover`. The sticky bar hides while a text input outside it is focused (never for its own stepper). The grid has `touch-action: manipulation`; the root has `scroll-padding-bottom` equal to the bar's measured height (`--bar-total`).
- Relative times ("4 h late", "Closed 3 days ago", "Pay within 24 hours.") and overdue flags are computed on the server and passed to the client as strings and booleans, so hydration never disagrees. Absolute times (deadlines, draw times) are passed as an ISO string plus a server fallback string and rendered through `LocalTime` (Task 5): the fallback renders first (byte-identical hydration), then the client reformats in the browser's zone. The server fallback uses the zone from the `tz` cookie (validated against `Intl.supportedValuesOf("timeZone")`), unlabelled; with no valid cookie it uses `DEFAULT_TZ` (America/New_York), labelled with its short name ("9:40 pm EDT tomorrow").
- Selected cells use the inset ring and the check, at weight 600; 700 is not loaded (D§3 wins over D§4; recorded erratum 2).
- Before every `pnpm test:e2e`, make sure nothing listens on :3000 (`lsof -ti tcp:3000 | xargs -r kill`). The e2e must build and start the current code itself.
- "Check by hand" steps are optional: only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report the check as not performed if you cannot do it. Never block on it.
- Holders (other buyers' handles) and the overdue flag are decided only in `shapeGrid` on the server. Client components import domain types with `import type` only and never receive data the server did not decide the viewer may see.
- Fonts: `next/font/google` Barlow (400, 500, 600) and Barlow Condensed (600), fetched at build time from Task 6 on. If the build fails or hangs fetching fonts.googleapis.com or fonts.gstatic.com (symptom: the build sits in, or errors from, `next-font-loader`; in CI the same symptom), stop and report BLOCKED: fonts. Do not vendor fonts or change `fonts.ts`.
- E2E selectors use `data-testid` and roles. Any task that changes an element `e2e/journey-1.spec.ts` keys on updates that file in the same commit and says so.

Added for Plan B (these supersede the Plan A lines they name):

- Port rule (supersedes Plan A's `lsof -ti tcp:3000 | xargs -r kill`): before every `pnpm test:e2e` and every `pnpm start`, run `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill`. Plain `lsof` may be off `PATH`, and without `-sTCP:LISTEN` it also kills browsers that merely hold a connection to :3000. The e2e must build and start the current code itself.
- Tests run against a separate `breaks_test` database (README "Test database"); `.env.test`'s `DATABASE_URL` ends in `/breaks_test`. Plan A Task 1's note that `.env.local` and `.env.test` share one database no longer holds: every migration step applies to both. From Task 15 on, a third database, `breaks_e2e`, serves the Playwright suite and is migrated too.
- Drafts never leave their host. Every query that lists breaks for other people filters by status: the feed lists `open` only, the landing hero `drawn` only, the host profile never a draft, the link preview refuses what an anonymous viewer may not see (`canViewBreak(status, false)`). A draft's edit page 404s for anyone but its host and admins, exactly like a missing break.
- Holders never reach anonymous viewers. Thumbnails (`feedThumbs`) are built from line state only: their query does not select `owner_id` or handles. The link preview's guarantee is that `ogModel(shapeGrid(page, null))` emits only number and tone per cell and the route never reads the session (pinned by `og.test.ts`); its query may be `getBreakPage`. On the break grid `shapeGrid` stays the only gate for holders and the overdue flag.
- The host profile shows public data only: handle, display name, member since, breaks run, open breaks, a count of past ones. Never email, payment name or payment handles (a break page's details fold keeps showing that break's payment handles, as Plan A built it).
- `users.payment_name` is shown only in host view (the break's host and admins), in the ledgers and the "waiting on you" sheet, and to the owner in `/account`.
- Every redirect target goes through `safeNext`; after sign-in or onboarding with no `next`, a member lands on `/breaks` (`afterSignIn`, `signedInTarget`, Task 9).
- Rate limits key on `hashIp(ipBucket(ip))` (IPv6 bucketed by /64, HMAC with `IP_HASH_KEY`) and on a per-user bucket for signed-in callers, never on the raw address. The handle check answers only `free`, `taken`, `invalid` or `limited`: no id, name or other detail of a holder.
- Search params are parsed by pure, tested functions; an unknown value falls back to the default and never throws.
- Lists of breaks for buyers use one card, `BreakCard` (Task 8), on the feed, the landing page and the host profile.
- Green keeps its two meanings (design §3): mine, and money the host confirmed. A free handle, a selected chip or a success note is never green.
- `e2e/pages.spec.ts` (created in Task 5) holds one test per new page. Any task that changes copy or an element `e2e/journey-1.spec.ts`, `e2e/layout.spec.ts`, `e2e/pages.spec.ts` or `e2e/journey-2.spec.ts` keys on updates that file in the same commit and says so in the step.
- Vitest's include pattern is `src/**/*.test.ts` and `tests/**/*.test.ts`: test files are `.ts`. Render tests (Task 14b) build elements with `createElement`, never JSX.
- Migrations (supersedes the per-task rule): any `pnpm db:generate` that prompts, or writes SQL other than the task states, or leaves a journal whose last `when` is not the largest: stop and report BLOCKED: migration. Never answer drizzle-kit's prompts.
- The Supabase CLI lives in `node_modules/.bin`, not on `PATH`: always run it as `pnpm exec supabase …` (or the `pnpm supabase:start` script), never bare `supabase`. `psql` is not installed either: databases are created with `scripts/create-db.ts` (Task 15) through the repo's own `postgres` package.
- Rate-limit counters (`hitRateLimit`, `pruneRateLimits`, Task 7a) are the one exemption from "every state change appends an `events` row": they are throwaway counters, not domain state, and an event per keystroke check would itself be an enumeration log.
- Commands keep `(tx, caller, input)`; a command that acts on one existing break takes its id as a separate argument, `(tx, caller, breakId, input)`, as Plan 1's `openBreak(tx, caller, breakId)` already does (`updateDraft`, Task 6a).
- Open-ended fix loops (render tests, axe, backlog tests): fix what the listed checks report; if a finding needs a design decision, record it in the report and move on; never spend more than one round.
- Every gate run builds the app inside `pnpm test:e2e` (two to three minutes): run gate commands with the Bash tool's 10-minute timeout.

## Review Focus

1. Filling fast with a bonus line and old payments: break A's numbered lines were paid 25 h ago and its only payment in the last 24 h is a bonus line; break B has one numbered line paid an hour ago; break C has nothing paid and opened last. "Filling fast" must order B, C, A (A's bonus line and stale payments count for nothing; the C/A tie falls to newest opened), "Almost full" A, B, C, and "Newest" C, B, A. Test added to Task 1 (`feed.test.ts`, "sorts: filling fast counts numbered lines paid in the last 24 h only").
2. `/me` owes only what is still to send, and wins only from the active draw: a buyer holds line 3 (sent), line 5 (unsent, claimed 30 h ago on a 24 h window), line 8 (paid) and a bonus line; owed is line 5's price alone, `late` is true and `payBy` is line 5's claim plus 24 h; in a drawn break the buyer's award shows until the draw is voided, then the award and `ranAt` are gone. An unanswered choice win viewed 8 days on is still not `earlier`. Tests added to Task 3 (`lines/queries.test.ts`, "owes only unsent lines and wins only from the active draw" and "shows a choice prize as a choice until the winner picks, and never hides it under Earlier").
3. Handle availability in its hostile forms: with `jim_x` taken, `JIM_X` and the full-width `ｊｉｍ＿ｘ` both answer `taken`, `admin` answers `invalid` (reserved) rather than `taken`, the caller's own handle answers `free`, a `taken` answer carries no field but `state`, the 31st check in a minute from one IP hash answers `limited` even for a different handle while another IP hash still gets answers, and one signed-in user rotating IP hashes is `limited` after 60 checks in a minute. Tests added to Task 7a (`users/handle-check.test.ts`).
4. The link preview is anonymous by construction: for an open break where alice holds a sent line, an overdue line and a bonus line, `ogModel` output contains neither "alice" nor her user id, every cell carries only `number` and `tone`, bonus lines are left out, and a draft yields `null` (the route answers 404 even to the draft's own host, because it never reads the session). Tests added to Task 13 (`breaks/og.test.ts`, and the draft-host request in `e2e/pages.spec.ts`).
5. "Take the last 3" pressed after a line reopened: the bar offered 3, but 4 are open when the claim lands; `claimAllOpen` with `expected: 3` must claim nothing and say the open lines changed, while a same-batch retry of a claim that already succeeded still returns its lines. Test added to Task 16 (`lines/commands.test.ts`, "take the last N refuses when the open count changed").

## Before any task

(0) In a fresh worktree run `pnpm install` first. (1) The local Supabase stack is running: `pnpm exec supabase status` shows the DB on 54322; if not, run `pnpm supabase:start` (the CLI is only in `node_modules/.bin`; bare `supabase` is not on `PATH`). (2) `.env.local` and `.env.test` exist in the working tree; in a new worktree, copy them from the main checkout. `grep DATABASE_URL .env.test` must end in `/breaks_test`; if it does not, stop and report BLOCKED: environment (the concurrency suite truncates every table in the database it runs against). (3) `ENV_FILE=.env.local pnpm db:migrate` and `ENV_FILE=.env.test pnpm db:migrate` each print `migrated`; once Task 15 has created `breaks_e2e` (with `pnpm exec tsx scripts/create-db.ts breaks_e2e`), `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate` prints `migrated` too. (4) `pnpm exec playwright install chromium` has been run once. (5) Nothing listens on :3000: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill`. If any of these fails, stop and report BLOCKED: environment.

Execute on a feature branch or worktree named `plan-b-new-pages`; never commit to `main`.

---

## File structure

```
src/db/migrations/0002_payment_name.sql      # users.payment_name + length check (Task 2)
src/db/migrations/0003_rate_limits.sql       # rate_limits table + forced RLS (Task 7a)
src/domain/breaks/feed.ts                    # FEED_SORTS, listFeed, feedThumbs, feedHosts, latestRanBreak (Task 1)
src/domain/breaks/page-view.ts               # readBreakView: the break page's reads in one transaction (Task 4)
src/domain/breaks/og.ts                      # ogModel, ogCaption: the link preview, anonymous by construction (Task 13)
src/domain/lines/queries.ts                  # + myLines, waitingOnHost (Task 3), ledgerByBuyer.paymentName (Task 2)
src/domain/users/queries.ts                  # accountOf (Task 5), handleStatus (Task 7a)
src/domain/users/handle-check.ts             # checkHandle: per-IP and per-user rate limits + status (Task 7a)
src/domain/rate-limit.ts                     # hitRateLimit, pruneRateLimits (Task 7a)
src/lib/ip-bucket.ts                         # ipBucket: IPv6 to its /64 before hashing (Task 7a)
src/app/b/[id]/load.ts                       # loadBreak: React-cached, one transaction (Task 4)
src/app/b/[id]/og/route.tsx                  # the link-preview PNG (Task 13)
src/app/api/handle/route.ts                  # GET ?h= → { state } (Task 7b)
src/app/account/{page.tsx,form.tsx,actions.ts,parse.ts}          # (Task 5)
src/app/host/[id]/edit/page.tsx              # draft editing (Task 6b)
src/app/host/new/initial.ts                  # ComposerInitial builders (Task 6a)
src/app/host/groups.ts                       # groupHostBreaks, waitingStripText, toWaitingView (Task 12)
src/app/breaks/{page.tsx,params.ts}          # the feed (Task 8)
src/app/h/[handle]/page.tsx                  # host profile (Task 8)
src/app/me/{page.tsx,card-props.ts}          # My lines (Task 11)
src/app/landing-copy.ts                      # ranText, heroNumbers (Task 9)
src/components/break-card.tsx, feed-filters.tsx, handle-field.tsx, handle-field-copy.ts
src/components/break/{use-claim.ts,use-pay-sheet.ts}             # (Task 10)
src/components/me/{me-copy.ts,my-break-card.tsx}                 # (Task 11)
src/components/ledger/waiting-strip.tsx      # the merged "waiting on you" sheet, built from LedgerRow (Task 12)
src/components/use-measured-var.ts           # writes a measured height into a CSS variable (Task 14b)
e2e/pages.spec.ts                            # one test per new page (Tasks 5 to 13)
e2e/journey-2.spec.ts, e2e/global-setup.ts   # (Task 15)
scripts/create-db.ts                         # creates a local database and applies the auth stub, no psql needed (Task 15)
```

Deferred beyond Plan B, unchanged from the design's fallbacks: photos, the trust percentage and late history, median ship days, Remind and the question thread, Mark shipped and Got it, Cancelled transitions (and with them "Refund received" and the unconfirmed-refund rule for `/me`'s Earlier), reserved-for-mini cells, dark mode, the contact address and with it the hosts' invite contact on the landing page ("Ask for an invite."), dropping `allow_random_claims`, e2e in CI.

---

### Task 1: Feed, landing-hero and host-list queries (model: opus)

The feed, the landing page and the host profile all read open breaks with their counts; the landing hero reads the newest ran break; `/host` must stop listing minis. This task adds those reads with their ordering semantics and nothing visible. It also adds a `drawnBreak` test fixture the later domain tasks use, and removes `listOpenBreaks` (unused: `grep -rn listOpenBreaks src` finds only its definition), whose status set the feed no longer follows (recorded ruling 1).

**Files:**
- Create: `src/domain/breaks/feed.ts`, `src/domain/breaks/feed.test.ts`
- Modify: `src/domain/breaks/queries.ts` (delete `listOpenBreaks`, lines 28-34; `HostBreakRow` and `listHostBreaks`, lines 67-76)
- Modify: `src/domain/breaks/queries.test.ts` (append two `describe` blocks)
- Modify: `tests/helpers/fixtures.ts` (imports; append `drawnBreak`)

**Interfaces:**
- Consumes: `claimLines`, `markPaid`, `markSent`, `addBonusLine` (`src/domain/lines/commands.ts`), `requestDraw`, `finaliseDraw` (`src/domain/draws/commands.ts`), `FakeBeacon` (`src/crypto/beacon.ts`), `encryptSecret` (`src/crypto/secrets.ts`), `CellState` (`src/domain/breaks/grid.ts`), `SYSTEM` (`src/domain/types.ts`).
- Produces (all in `src/domain/breaks/feed.ts`):
  - `FEED_SORTS = ["newest", "filling", "almost"] as const`, `type FeedSort`, `isFeedSort(v: unknown): v is FeedSort`.
  - `type FeedHost = { id: string; handle: string | null; displayName: string | null; breaksRun: number; since: Date }`.
  - `type FeedBreak = { id: string; title: string; lineCount: number; linePriceCents: number; openedAt: Date; open: number; taken: number; paid: number; paidLastDay: number; host: FeedHost }` (counts are numbered lines only; `taken` = owned and unpaid, sent included).
  - `listFeed(tx, p: { sort: FeedSort; hostHandle?: string | null; limit?: number; now: Date }): Promise<FeedBreak[]>` — `status = 'open'` and `kind = 'main'` only; default limit 50.
  - `type ThumbCell = { number: number; state: CellState; bonus: boolean }`; `feedThumbs(tx, breakIds: readonly string[]): Promise<Map<string, ThumbCell[]>>` — never selects owners.
  - `feedHosts(tx): Promise<{ handle: string }[]>` — hosts with an open main break, by handle.
  - `type LatestRan = { breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date }`; `latestRanBreak(tx): Promise<LatestRan | null>`.
- Changes: `HostBreakRow` gains `openedAt: Date | null`; `listHostBreaks` lists `kind = 'main'` only.
- Test fixture: `drawnBreak(tx, { hostId: string; buyerIds: string[]; lineCount?: number; extraTopChoice?: string })` returns the break row plus `{ status: "drawn", secret, drawId: string, ranking: number[] }`.

- [ ] **Step 1: Add the `drawnBreak` fixture**

In `tests/helpers/fixtures.ts`, replace the import block (lines 1-6)

```ts
import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, breaks, breakItems, prizes, lines } from "@/db/schema";
import { commitment } from "@/crypto/commit";
import type { ClaimMode } from "@/domain/breaks/rules";
```

with

```ts
import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, breaks, breakItems, breakSecrets, prizes, lines } from "@/db/schema";
import { commitment } from "@/crypto/commit";
import { encryptSecret } from "@/crypto/secrets";
import { FakeBeacon } from "@/crypto/beacon";
import type { ClaimMode } from "@/domain/breaks/rules";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { SYSTEM, type Caller } from "@/domain/types";
```

and append at the end of the file:

```ts
/**
 * A drawn break: every numbered line claimed by `buyerIds` in turn and paid, then the draw requested and finalised
 * with the fake beacon. `extraTopChoice` adds a second top-spot item before the draw, so the top prize is a choice.
 */
export async function drawnBreak(tx: Tx, opts: { hostId: string; buyerIds: string[]; lineCount?: number; extraTopChoice?: string }) {
  const b = await openBreakWithLines(tx, { hostId: opts.hostId, lineCount: opts.lineCount ?? 4 });
  const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
  await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
  if (opts.extraTopChoice) {
    const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: opts.extraTopChoice }).returning();
    await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  }
  const as = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });
  for (let n = 1; n <= b.lineCount; n++) {
    const owner = opts.buyerIds[(n - 1) % opts.buyerIds.length];
    await claimLines(tx, as(owner), { breakId: b.id, numbers: [n], batchId: randomUUID() });
    await markPaid(tx, as(opts.hostId, "host"), { breakId: b.id, number: n, expectedOwnerId: owner });
  }
  await requestDraw(tx, as(opts.hostId, "host"), { breakId: b.id });
  const { drawId, ranking } = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
  return { ...b, status: "drawn", drawId, ranking };
}
```

- [ ] **Step 2: Write the failing feed tests**

Create `src/domain/breaks/feed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid, markSent, addBonusLine } from "@/domain/lines/commands";
import { draws } from "@/db/schema";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";
import { listFeed, feedThumbs, feedHosts, latestRanBreak, isFeedSort, type FeedSort } from "./feed";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const claim = (tx: Tx, u: { id: string }, breakId: string, numbers: number[]) => claimLines(tx, c(u), { breakId, numbers, batchId: randomUUID() });
const pay = (tx: Tx, host: { id: string }, breakId: string, number: number, owner: { id: string }) =>
  markPaid(tx, c(host, "host"), { breakId, number, expectedOwnerId: owner.id });
const openedMinutesAgo = (tx: Tx, id: string, minutes: number) =>
  tx.execute(sql`update breaks set opened_at = now() - make_interval(mins => ${minutes}::int) where id = ${id}`);

describe("listFeed", () => {
  it("sorts: filling fast counts numbered lines paid in the last 24 h only (Review Focus 1)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      // A: lines 1 and 2 paid 25 h ago, plus a bonus line paid now. Open: 2.
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4, linePriceCents: 500 });
      await claim(tx, buyer, a.id, [1, 2]);
      await pay(tx, host, a.id, 1, buyer); await pay(tx, host, a.id, 2, buyer);
      await tx.execute(sql`update lines set paid_at = now() - interval '25 hours' where break_id = ${a.id} and number in (1, 2)`);
      await addBonusLine(tx, c(host, "host"), { breakId: a.id, ownerId: buyer.id });
      // B: line 1 paid now, line 2 sent. Open: 4.
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      await claim(tx, buyer, b.id, [1, 2]);
      await pay(tx, host, b.id, 1, buyer);
      await markSent(tx, c(buyer), { breakId: b.id, numbers: [2] });
      // C: nothing claimed, opened last. Open: 6.
      const cc = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      await openedMinutesAgo(tx, a.id, 30); await openedMinutesAgo(tx, b.id, 20); await openedMinutesAgo(tx, cc.id, 10);

      const ids = async (sort: FeedSort) => (await listFeed(tx, { sort, hostHandle: host.handle, now: new Date() })).map((r) => r.id);
      expect(await ids("filling")).toEqual([b.id, cc.id, a.id]);
      expect(await ids("almost")).toEqual([a.id, b.id, cc.id]);
      expect(await ids("newest")).toEqual([cc.id, b.id, a.id]);

      const rows = await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() });
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[a.id]).toMatchObject({ open: 2, taken: 0, paid: 2, paidLastDay: 0, lineCount: 4, linePriceCents: 500 });
      expect(by[b.id]).toMatchObject({ open: 4, taken: 1, paid: 1, paidLastDay: 1 });
      expect(by[cc.id]).toMatchObject({ open: 6, taken: 0, paid: 0, paidLastDay: 0 });
      expect(by[a.id].host).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 0 });
      expect(by[a.id].host.since).toBeInstanceOf(Date);
      expect(by[a.id].openedAt).toBeInstanceOf(Date);
    });
  });

  it("lists open main breaks only: never drafts, closed, ran or mini breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await makeBreak(tx, { hostId: host.id }); // a draft
      const mini = await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await tx.execute(sql`update breaks set status = 'open', opened_at = now() where id = ${mini.id}`);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const closed = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await claim(tx, buyer, closed.id, [1, 2]);
      await pay(tx, host, closed.id, 1, buyer); await pay(tx, host, closed.id, 2, buyer);
      const rows = await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() });
      expect(rows.map((r) => r.id)).toEqual([open.id]);
      expect(rows[0].host.breaksRun).toBe(1);
    });
  });

  it("filters by host handle, ignoring case, and answers nothing for an unknown handle", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { role: "host" }); const ann = await makeUser(tx, { role: "host" });
      const j = await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      const a = await openBreakWithLines(tx, { hostId: ann.id, lineCount: 4 });
      const now = new Date();
      expect((await listFeed(tx, { sort: "newest", hostHandle: jim.handle.toUpperCase(), now })).map((r) => r.id)).toEqual([j.id]);
      expect((await listFeed(tx, { sort: "newest", hostHandle: ann.handle, now })).map((r) => r.id)).toEqual([a.id]);
      expect(await listFeed(tx, { sort: "newest", hostHandle: "nobody_here_x", now })).toEqual([]);
      expect((await listFeed(tx, { sort: "newest", now, limit: 200 })).map((r) => r.id)).toEqual(expect.arrayContaining([j.id, a.id]));
    });
  });
});

describe("feedThumbs", () => {
  it("returns each line's state and nothing about who holds it", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, b.id, [2, 3, 4]);
      await markSent(tx, c(buyer), { breakId: b.id, numbers: [3] });
      await pay(tx, host, b.id, 4, buyer);
      await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: buyer.id });
      const missing = randomUUID();
      const thumbs = await feedThumbs(tx, [b.id, missing]);
      expect(thumbs.get(b.id)).toEqual([
        { number: 1, state: "open", bonus: false },
        { number: 2, state: "taken", bonus: false },
        { number: 3, state: "sent", bonus: false },
        { number: 4, state: "paid", bonus: false },
        { number: 5, state: "paid", bonus: true },
      ]);
      expect(thumbs.get(missing)).toEqual([]);
      const text = JSON.stringify([...thumbs.entries()]);
      expect(text).not.toContain(buyer.id);
      expect(text).not.toContain(buyer.handle);
      expect(await feedThumbs(tx, [])).toEqual(new Map());
    });
  });
});

describe("feedHosts", () => {
  it("lists the handles of hosts with an open main break, once each", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { role: "host" }); const idle = await makeUser(tx, { role: "host" });
      await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      await makeBreak(tx, { hostId: idle.id });
      const hosts = (await feedHosts(tx)).map((h) => h.handle);
      expect(hosts.filter((h) => h === jim.handle)).toHaveLength(1);
      expect(hosts).not.toContain(idle.handle);
    });
  });
});

describe("latestRanBreak", () => {
  it("is the newest break with an active draw, and forgets a voided one", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 4 });
      const hero = await latestRanBreak(tx);
      expect(hero).toMatchObject({ breakId: d.id, title: d.title, lineCount: 4, topLine: d.ranking[0] });
      expect(hero!.ranAt).toBeInstanceOf(Date);
      await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "test" }).where(eq(draws.id, d.drawId));
      expect((await latestRanBreak(tx))?.breakId).not.toBe(d.id);
    });
  });
});

describe("isFeedSort", () => {
  it("accepts the three sorts and nothing else", () => {
    expect(["newest", "filling", "almost"].every(isFeedSort)).toBe(true);
    expect(isFeedSort("closing")).toBe(false);
    expect(isFeedSort(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Write the failing host-list tests**

In `src/domain/breaks/queries.test.ts`, change the two import lines

```ts
import { makeUser, makeBreak, openBreakWithLines } from "../../../tests/helpers/fixtures";
```
```ts
import { claimLines, markPaid } from "@/domain/lines/commands";
```

to

```ts
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
```
```ts
import { claimLines, markPaid, addBonusLine } from "@/domain/lines/commands";
```

and append at the end of the file:

```ts
describe("listHostBreaks scope", () => {
  it("lists only this host's main breaks and counts numbered lines only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const mine = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(buyer), { breakId: mine.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, asCaller(host, "host"), { breakId: mine.id, number: 1, expectedOwnerId: buyer.id });
      await addBonusLine(tx, asCaller(host, "host"), { breakId: mine.id, ownerId: buyer.id }); // paid, but above N
      await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await makeBreak(tx, { hostId: other.id });
      const rows = await listHostBreaks(tx, host.id);
      expect(rows.map((r) => r.id)).toEqual([mine.id]);
      expect(rows[0]).toMatchObject({ status: "open", lineCount: 4, paid: 1, taken: 0 });
      expect(rows[0].openedAt).toBeInstanceOf(Date);
    });
  });
});

describe("hostTrust scope", () => {
  it("ignores other hosts' drawn breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: other.id, buyerIds: [buyer.id] });
      expect((await hostTrust(tx, host.id)).breaksRun).toBe(0);
      expect((await hostTrust(tx, other.id)).breaksRun).toBe(1);
    });
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `pnpm test src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts`
Expected: FAIL. `feed.test.ts` fails to import `./feed` (file not found); in `queries.test.ts` the "listHostBreaks scope" test fails because the mini break is listed (`expected [ …2 ids ] to equal [ …1 id ]`). "hostTrust scope" already passes (it pins existing behaviour).

- [ ] **Step 5: Write the feed queries**

Create `src/domain/breaks/feed.ts`:

```ts
import { sql, eq, and, asc, desc, inArray, isNull, isNotNull, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws, lines, users } from "@/db/schema";
import type { CellState } from "./grid";

export const FEED_SORTS = ["newest", "filling", "almost"] as const;
/**
 * newest: opened_at desc. filling: numbered lines paid in the last 24 h, most first. almost: fewest open numbered
 * lines first (platform spec §13 "closing soon", design §6 "Almost full"). Ties fall to the newest opened.
 */
export type FeedSort = (typeof FEED_SORTS)[number];
export const isFeedSort = (v: unknown): v is FeedSort => typeof v === "string" && (FEED_SORTS as readonly string[]).includes(v);

export type FeedHost = { id: string; handle: string | null; displayName: string | null; breaksRun: number; since: Date };
export type FeedBreak = {
  id: string; title: string; lineCount: number; linePriceCents: number; openedAt: Date;
  /** Numbered lines only (bonus lines never count). open: unowned and not reserved; taken: owned and unpaid, sent included. */
  open: number; taken: number; paid: number; paidLastDay: number;
  host: FeedHost;
};

const DAY_MS = 86_400_000;

/** Open main breaks for the feed, the landing page and the host profile. Drafts, closed, ran and mini breaks never appear. */
export async function listFeed(tx: Tx, p: { sort: FeedSort; hostHandle?: string | null; limit?: number; now: Date }): Promise<FeedBreak[]> {
  const since = new Date(p.now.getTime() - DAY_MS).toISOString();
  const open = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is null and l.reserved_for_mini_id is null and l.number <= ${breaks.lineCount})`;
  const taken = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`;
  const paid = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`;
  const paidLastDay = sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at > ${since}::timestamptz and l.number <= ${breaks.lineCount})`;
  // Same rule as hostTrust: the host's drawn breaks, of any kind.
  const breaksRun = sql<number>`(select count(*)::int from breaks b2 where b2.host_id = ${breaks.hostId} and b2.status = 'drawn')`;
  const order: SQL[] =
    p.sort === "filling" ? [desc(paidLastDay), desc(breaks.openedAt), desc(breaks.id)]
    : p.sort === "almost" ? [asc(open), desc(breaks.openedAt), desc(breaks.id)]
    : [desc(breaks.openedAt), desc(breaks.id)];
  const where: SQL[] = [eq(breaks.status, "open"), eq(breaks.kind, "main")];
  if (p.hostHandle) where.push(sql`lower(${users.handle}) = lower(${p.hostHandle})`);
  const rows = await tx.select({
    id: breaks.id, title: breaks.title, lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, openedAt: breaks.openedAt,
    open, taken, paid, paidLastDay,
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, hostSince: users.createdAt, breaksRun,
  }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId)).where(and(...where)).orderBy(...order).limit(p.limit ?? 50);
  return rows.map((r) => ({
    id: r.id, title: r.title, lineCount: r.lineCount, linePriceCents: r.linePriceCents,
    openedAt: r.openedAt ?? new Date(0), // an open break always has opened_at
    open: r.open, taken: r.taken, paid: r.paid, paidLastDay: r.paidLastDay,
    host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, breaksRun: r.breaksRun, since: r.hostSince },
  }));
}

export type ThumbCell = { number: number; state: CellState; bonus: boolean };

/**
 * State-only cells for thumbnails. Owner ids and handles are not even selected, so nothing about who holds a line can
 * reach a card (on the break grid, holders stay shapeGrid's call). Every requested id gets an entry.
 */
export async function feedThumbs(tx: Tx, breakIds: readonly string[]): Promise<Map<string, ThumbCell[]>> {
  const out = new Map<string, ThumbCell[]>(breakIds.map((id) => [id, []]));
  if (breakIds.length === 0) return out;
  const rows = await tx.select({
    breakId: lines.breakId, number: lines.number, isBonus: lines.isBonus,
    owned: sql<boolean>`${lines.ownerId} is not null`,
    sent: sql<boolean>`${lines.sentAt} is not null`,
    paid: sql<boolean>`${lines.paidAt} is not null`,
    reserved: sql<boolean>`${lines.reservedForMiniId} is not null`,
  }).from(lines).where(inArray(lines.breakId, [...breakIds])).orderBy(asc(lines.breakId), asc(lines.number));
  for (const r of rows) {
    const state: CellState = r.reserved && !r.owned ? "reserved" : !r.owned ? "open" : r.paid ? "paid" : r.sent ? "sent" : "taken";
    out.get(r.breakId)?.push({ number: r.number, state, bonus: r.isBonus });
  }
  return out;
}

/** Hosts with at least one open main break, for the feed's host filter. */
export async function feedHosts(tx: Tx): Promise<{ handle: string }[]> {
  const rows = await tx.selectDistinct({ handle: users.handle }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId))
    .where(and(eq(breaks.status, "open"), eq(breaks.kind, "main"), isNotNull(users.handle))).orderBy(asc(users.handle));
  return rows.flatMap((r) => (r.handle ? [{ handle: r.handle }] : []));
}

export type LatestRan = { breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date };

/** The landing hero (design §5.2): the most recent main break that ran, read from its active (not voided) draw. */
export async function latestRanBreak(tx: Tx): Promise<LatestRan | null> {
  const [r] = await tx.select({ breakId: breaks.id, title: breaks.title, lineCount: breaks.lineCount, ranking: draws.ranking, ranAt: draws.createdAt })
    .from(draws).innerJoin(breaks, eq(breaks.id, draws.breakId))
    .where(and(isNull(draws.voidedAt), eq(breaks.status, "drawn"), eq(breaks.kind, "main")))
    .orderBy(desc(draws.createdAt), desc(draws.id)).limit(1);
  if (!r || r.ranking.length === 0) return null;
  return { breakId: r.breakId, title: r.title, lineCount: r.lineCount, topLine: r.ranking[0], ranAt: r.ranAt };
}
```

- [ ] **Step 6: Scope the host list and drop `listOpenBreaks`**

In `src/domain/breaks/queries.ts`, delete `listOpenBreaks` (lines 28-34, from `export async function listOpenBreaks` to its closing `}`), then replace the `HostBreakRow` type and `listHostBreaks` (lines 67-76) with:

```ts
export type HostBreakRow = { id: string; title: string; status: string; lineCount: number; openedAt: Date | null; paid: number; taken: number };

/** The host's main breaks for /host, newest first (minis wait for their own UI). Paid and taken count numbered lines only. */
export async function listHostBreaks(tx: Tx, hostId: string): Promise<HostBreakRow[]> {
  return tx.select({
    id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount, openedAt: breaks.openedAt,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`,
    taken: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id));
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts tests/helpers`
Expected: PASS, including "sorts: filling fast counts numbered lines paid in the last 24 h only (Review Focus 1)".

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. Nothing visible changed; `/host` (`src/app/host/page.tsx`) still compiles because `HostBreakRow` only gained a field.

- [ ] **Step 9: Commit**

```bash
git add src/domain/breaks/feed.ts src/domain/breaks/feed.test.ts src/domain/breaks/queries.ts src/domain/breaks/queries.test.ts tests/helpers/fixtures.ts
git commit -m "feat(feed): feed, thumbnail, landing-hero and host-list queries"
```

---

### Task 2: Payment name (migration 0002), profile edits, the half-set-up account, and "pays as" in the ledger (model: opus)

A Venmo notice says "$10 from John Smith"; the host's ledger must match that to @dave (design §5.5). This task adds `users.payment_name`, lets onboarding store it, adds `updateProfile` (display name, locked 30 days after sign-up as platform spec §6 rules, and payment name, always editable), fixes the half-set-up dead end (a user with a handle but no display name or age confirmation could never finish onboarding: `completeOnboarding` only updated rows whose handle was null), and shows "pays as John Smith" on ledger rows, where search matches it too. The `/account` page and the onboarding field come in Task 5.

**Files:**
- Modify: `src/db/schema.ts:9-26` (`users`: `paymentName` column and `users_payment_name_chk`)
- Create (generated): `src/db/migrations/0002_payment_name.sql`, `src/db/migrations/meta/0002_snapshot.json`; Modify (generated): `src/db/migrations/meta/_journal.json`
- Modify: `src/domain/users/commands.ts` (`cleanPaymentName`, `NAME_LOCK_DAYS`, `nameLocked`, `completeOnboarding`, `updateProfile`)
- Modify: `src/domain/users/commands.test.ts`
- Modify: `src/domain/lines/queries.ts` (`LedgerBuyer.paymentName`, `ledgerByBuyer`)
- Modify: `src/domain/lines/commands.test.ts` (the `ledgerByBuyer` test)
- Modify: `src/components/ledger/ledger-view.ts` (`LedgerRowView.paymentName`, `matchesQuery`), `src/components/ledger/ledger-view.test.ts`, `src/components/ledger/ledger-row.tsx`
- Modify: `src/app/b/[id]/page.tsx:85-89` (map `paymentName`)

**Interfaces:**
- Consumes: `assertOnboarded` (`src/auth/authz.ts`), `appendEvent`, `InvalidInput`, `NotFound`.
- Produces:
  - Column `users.payment_name text` (nullable), CHECK `users_payment_name_chk` (`char_length(payment_name) <= 60`). Drizzle: `users.paymentName: string | null`.
  - In `src/domain/users/commands.ts`: `cleanPaymentName(raw: string | null | undefined): string | null` (NFKC, trimmed, inner whitespace collapsed, "" → null, over 60 → `InvalidInput("Payment name: at most 60 characters")`); `NAME_LOCK_DAYS = 30`; `nameLocked(createdAt: Date, now: Date): boolean`; `completeOnboarding(tx, caller, { handle, displayName, ageConfirmed, acceptedTerms, paymentName?: string, ipHash? })`; `updateProfile(tx, caller, { displayName: string; paymentName: string }): Promise<{ changed: ("displayName" | "paymentName")[] }>` (event `user.profile_updated` with `{ changed }`, no names in the payload).
  - `LedgerBuyer` and `LedgerRowView` gain `paymentName: string | null`.

- [ ] **Step 1: Write the failing domain tests**

In `src/domain/users/commands.test.ts`, change the import line

```ts
import { completeOnboarding, normalizeHandle, TERMS_VERSION } from "./commands";
```

to

```ts
import { cleanPaymentName, completeOnboarding, nameLocked, normalizeHandle, TERMS_VERSION, updateProfile } from "./commands";
```

and append at the end of the file:

```ts
const onboarded = (id: string) => ({ id, role: "member" as const, onboarded: true, banned: false });

describe("payment name", () => {
  it("is cleaned: trimmed, inner spaces collapsed, blank is none, at most 60 characters", () => {
    expect(cleanPaymentName("  John   Smith ")).toBe("John Smith");
    expect(cleanPaymentName("   ")).toBeNull();
    expect(cleanPaymentName(undefined)).toBeNull();
    expect(cleanPaymentName("Ｊｏｈｎ")).toBe("John");
    expect(() => cleanPaymentName("x".repeat(61))).toThrow(/at most 60/);
  });
  it("is stored by onboarding when given", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null, displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: `p${u.handle}`.slice(0, 20), displayName: "Pat", ageConfirmed: true, acceptedTerms: true, paymentName: " Patricia  Lee " });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row.paymentName).toBe("Patricia Lee");
    });
  });
  it("is refused by the database above 60 characters", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      // Drizzle wraps the driver error; the constraint name is on `.cause`. Last statement: the failure aborts the transaction.
      const err = await tx.execute(sql`update users set payment_name = ${"x".repeat(61)} where id = ${u.id}`).catch((e: unknown) => e);
      expect(String((err as { cause?: unknown })?.cause ?? err)).toMatch(/users_payment_name_chk/);
    });
  });
});

describe("completeOnboarding, half set up", () => {
  it("finishes an account that has a handle but no display name or age confirmation", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: u.handle, displayName: "Half Done", ageConfirmed: true, acceptedTerms: true });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ handle: u.handle, displayName: "Half Done" });
      expect(row.ageConfirmedAt).not.toBeNull();
      expect(row.paymentName).toBeNull();
    });
  });
});

describe("updateProfile", () => {
  it("changes the display name and payment name, logs what changed, and is a no-op when nothing did", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await updateProfile(tx, onboarded(u.id), { displayName: "Dave R", paymentName: "David Roberts" })).toEqual({ changed: ["displayName", "paymentName"] });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ displayName: "Dave R", paymentName: "David Roberts" });
      expect(row.nameChangedAt).not.toBeNull();
      expect(await updateProfile(tx, onboarded(u.id), { displayName: "Dave R", paymentName: " David  Roberts" })).toEqual({ changed: [] });
      const evs = await tx.select().from(events).where(sql`${events.actorId} = ${u.id} and ${events.type} = 'user.profile_updated'`);
      expect(evs.map((e) => e.payload)).toEqual([{ changed: ["displayName", "paymentName"] }]);
    });
  });
  it("locks the display name 30 days after sign-up but keeps the payment name editable", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set created_at = now() - interval '31 days' where id = ${u.id}`);
      await expect(updateProfile(tx, onboarded(u.id), { displayName: "New Name", paymentName: "" })).rejects.toThrow(/locked 30 days/);
      expect(await updateProfile(tx, onboarded(u.id), { displayName: u.handle, paymentName: "Pat Lee" })).toEqual({ changed: ["paymentName"] });
      await expect(updateProfile(tx, onboarded(u.id), { displayName: "", paymentName: "" })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("tells when a name is locked", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(nameLocked(new Date("2026-09-14T11:00:00Z"), now)).toBe(true);
    expect(nameLocked(new Date("2026-09-15T12:00:00Z"), now)).toBe(false);
  });
});
```

In `src/domain/lines/commands.test.ts`, inside the test `"lists every buyer in ledger order with per-buyer numbers, owed and overdue"`, replace

```ts
      const rows = await ledgerByBuyer(tx, b.id, new Date());
```

with

```ts
      await tx.execute(sql`update users set payment_name = 'Dave Payer' where id = ${dave.id}`);
      const rows = await ledgerByBuyer(tx, b.id, new Date());
      expect(rows.find((r) => r.ownerId === dave.id)?.paymentName).toBe("Dave Payer");
      expect(rows.find((r) => r.ownerId === alice.id)?.paymentName).toBeNull();
```

In `src/components/ledger/ledger-view.test.ts`, replace the `row` helper

```ts
const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
  handle: null, displayName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
});
```

with

```ts
const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
  handle: null, displayName: null, paymentName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
});
```

and add inside `describe("filters and search", …)`, after the test `"matches an amount written with thousands commas"`:

```ts
  it("matches the name a buyer pays with", () => {
    const pat = row({ ownerId: "p", handle: "pat", displayName: "Pat", paymentName: "Patricia Lee", owedCents: 500, status: "unpaid" });
    expect(matchesQuery(pat, "patricia")).toBe(true);
    expect(matchesQuery(pat, "lee")).toBe(true);
    expect(matchesQuery(dave, "patricia")).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/users/commands.test.ts src/domain/lines/commands.test.ts src/components/ledger/ledger-view.test.ts`
Expected: FAIL. `cleanPaymentName`, `nameLocked` and `updateProfile` are not exported (`TypeError: … is not a function`); the ledger test fails with `column "payment_name" of relation "users" does not exist`; "half set up" fails with "Your account is already set up"; the ledger-view search test fails on `matchesQuery(pat, "patricia")`.

- [ ] **Step 3: Add the column to the schema**

In `src/db/schema.ts`, in the `users` table replace

```ts
  displayName: text("display_name"),
```

with

```ts
  displayName: text("display_name"),
  /** The name on the buyer's Venmo or PayPal, when it differs; hosts match payments by it. Hosts and the owner only. */
  paymentName: text("payment_name"),
```

and in the `users` check list, after

```ts
  check("users_role_chk", sql`${t.role} in ('member','host','admin')`),
```

add

```ts
  check("users_payment_name_chk", sql`char_length(${t.paymentName}) <= 60`),
```

- [ ] **Step 4: Generate migration 0002**

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name payment_name`
Expected: drizzle-kit writes `src/db/migrations/0002_payment_name.sql`, `src/db/migrations/meta/0002_snapshot.json`, and a `_journal.json` entry with `"tag": "0002_payment_name"`, without prompting. The SQL file must contain exactly these two statements (whitespace aside):

```sql
ALTER TABLE "users" ADD COLUMN "payment_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_payment_name_chk" CHECK (char_length("users"."payment_name") <= 60);
```

If drizzle-kit prompts, or the SQL differs, answer nothing, stop and report BLOCKED: migration. No hand SQL is appended: the column needs no backfill, and the existing forced deny-all RLS on `users` covers it.

Then check the journal order (Drizzle applies a migration only when its `when` is later than the last applied one): `node -e 'const j=require("./src/db/migrations/meta/_journal.json");const e=j.entries;console.log(e[2].when>e[1].when?"ok":"BAD")'` must print `ok`; if it prints `BAD`, stop and report BLOCKED: migration.

- [ ] **Step 5: Apply it to both databases**

Run: `ENV_FILE=.env.local pnpm db:migrate && ENV_FILE=.env.test pnpm db:migrate`
Expected: `migrated` twice.

- [ ] **Step 6: Write the user commands**

In `src/domain/users/commands.ts`, replace the import block (lines 1-6) with:

```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, legalAcceptances } from "@/db/schema";
import { InvalidInput, NotFound } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { appendEvent } from "@/domain/events";
import { assertOnboarded } from "@/auth/authz";
```

Replace `completeOnboarding` (from `export async function completeOnboarding` to the end of the file) with:

```ts
/** "  John   Smith " → "John Smith"; blank → null. At most 60 characters (users_payment_name_chk). */
export function cleanPaymentName(raw: string | null | undefined): string | null {
  const s = (raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > 60) throw new InvalidInput("Payment name: at most 60 characters");
  return s;
}

/** Handle and display name are editable for 30 days after sign-up, then locked (platform spec §6). */
export const NAME_LOCK_DAYS = 30;
export const nameLocked = (createdAt: Date, now: Date): boolean => now.getTime() - createdAt.getTime() > NAME_LOCK_DAYS * 86_400_000;

function cleanDisplayName(raw: string): string {
  const s = raw.normalize("NFKC").trim();
  if (s.length < 1 || s.length > 40) throw new InvalidInput("Display name must be 1–40 characters");
  return s;
}

export async function completeOnboarding(tx: Tx, caller: Caller, p: { handle: string; displayName: string; ageConfirmed: boolean; acceptedTerms: boolean; paymentName?: string; ipHash?: string }): Promise<void> {
  if (!p.ageConfirmed) throw new InvalidInput("You must confirm you are 18 or older");
  if (!p.acceptedTerms) throw new InvalidInput("You must accept the terms");
  const handle = normalizeHandle(p.handle);
  const displayName = cleanDisplayName(p.displayName);
  const payment = p.paymentName !== undefined ? { paymentName: cleanPaymentName(p.paymentName) } : {};
  let updated: { id: string }[];
  try {
    // Any account that is not fully set up may finish here, including one that already has a handle
    // (the half-set-up account: handle, but no display name or age confirmation).
    updated = await tx.update(users).set({ handle, displayName, ...payment, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` })
      .where(sql`${users.id} = ${caller.id} and (${users.handle} is null or ${users.displayName} is null or ${users.ageConfirmedAt} is null)`)
      .returning({ id: users.id });
  } catch (e) {
    // drizzle wraps the driver error (DrizzleQueryError); the postgres error is on `.cause`
    const pg = (e instanceof Error && "cause" in e ? (e as { cause?: unknown }).cause : undefined) ?? e;
    const code = typeof pg === "object" && pg !== null && "code" in pg ? (pg as { code?: string }).code : undefined;
    if (code === "23505") throw new InvalidInput("That handle is taken");
    throw e;
  }
  if (updated.length === 0) throw new InvalidInput("Your account is already set up");
  await tx.insert(legalAcceptances).values({ userId: caller.id, docKind: "terms", version: TERMS_VERSION, ipHash: p.ipHash ?? null });
  await appendEvent(tx, { actorId: caller.id, type: "user.onboarded", payload: { handle } });
}

/** /account: the display name (locked 30 days after sign-up) and the payment name (always editable). */
export async function updateProfile(tx: Tx, caller: Caller, p: { displayName: string; paymentName: string }): Promise<{ changed: ("displayName" | "paymentName")[] }> {
  assertOnboarded(caller);
  const displayName = cleanDisplayName(p.displayName);
  const paymentName = cleanPaymentName(p.paymentName);
  const [cur] = await tx.select({ displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(sql`${users.id} = ${caller.id}`).for("update");
  if (!cur) throw new NotFound("Account not found");
  const changed: ("displayName" | "paymentName")[] = [];
  const set: Partial<typeof users.$inferInsert> = {};
  if (displayName !== cur.displayName) {
    if (nameLocked(cur.createdAt, new Date())) throw new InvalidInput("Your display name is locked 30 days after sign-up.");
    set.displayName = displayName;
    set.nameChangedAt = new Date();
    changed.push("displayName");
  }
  if (paymentName !== cur.paymentName) {
    set.paymentName = paymentName;
    changed.push("paymentName");
  }
  if (changed.length === 0) return { changed };
  await tx.update(users).set(set).where(sql`${users.id} = ${caller.id}`);
  // Which fields changed, never the names themselves: events are append-only and outlive an account's deletion.
  await appendEvent(tx, { actorId: caller.id, type: "user.profile_updated", payload: { changed } });
  return { changed };
}
```

- [ ] **Step 7: Carry the payment name through the ledger**

In `src/domain/lines/queries.ts`, replace the `LedgerBuyer` type with:

```ts
export type LedgerBuyer = {
  ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; firstClaimAt: Date; overdueSince: Date | null; status: BuyerStatus;
};
```

In `ledgerByBuyer`, replace

```ts
    number: lines.number, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName,
```

with

```ts
    number: lines.number, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName, paymentName: users.paymentName,
```

and replace

```ts
      ownerId, handle: r.handle, displayName: r.displayName, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [],
```

with

```ts
      ownerId, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [],
```

In `src/components/ledger/ledger-view.ts`, replace the `LedgerRowView` type with:

```ts
/** One buyer as the host ledger shows it; dates already turned into strings on the server. */
export type LedgerRowView = {
  ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; status: BuyerStatus; lateText: string | null;
};
```

and in `matchesQuery` replace

```ts
  return [r.handle, r.displayName].some((v) => v?.toLowerCase().includes(s) ?? false);
```

with

```ts
  return [r.handle, r.displayName, r.paymentName].some((v) => v?.toLowerCase().includes(s) ?? false);
```

In `src/components/ledger/ledger-row.tsx`, replace

```tsx
            {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
          </button>
```

with

```tsx
            {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
            {r.paymentName && <span className="truncate text-small text-ink-2" data-testid="pays-as">pays as {r.paymentName}</span>}
          </button>
```

In `src/app/b/[id]/page.tsx`, replace

```ts
    ownerId: r.ownerId, handle: r.handle, displayName: r.displayName,
```

with

```ts
    ownerId: r.ownerId, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName,
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm test src/domain/users src/domain/lines src/components/ledger src/auth`
Expected: PASS.

- [ ] **Step 9: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The e2e buyers have no payment name, so no row shows "pays as" and nothing the journey keys on moved.

- [ ] **Step 10: Commit**

```bash
git add src/db/schema.ts src/db/migrations src/domain/users src/domain/lines src/components/ledger "src/app/b/[id]/page.tsx"
git commit -m "feat(users): payment name, profile edits and the half-set-up onboarding fix"
```

---

### Task 3: My lines, host profile and "waiting on you" queries (model: opus)

Three reads for three pages. `myLines` replaces Plan 1's unused version, which counted sent lines as owed, knew nothing of wins and never aged a break out of the list (deferred list: "myLines fix"); a break the viewer still has something to do in (unpaid lines, a choice to name) never ages out (recorded ruling 2). `hostProfile` reads the public figures for `/h/{handle}`. `waitingOnHost` feeds the `/host` strip "7 sent, waiting for you, across 3 breaks" and its merged ledger (design §5.5, last paragraph). Nothing visible changes.

**Files:**
- Modify: `src/domain/lines/queries.ts` (imports; replace `myLines`, lines 7-24; append `waitingOnHost`)
- Create: `src/domain/lines/queries.test.ts`
- Modify: `src/domain/breaks/queries.ts` (import `SYSTEM`; append `hostProfile`), `src/domain/breaks/queries.test.ts` (append tests)

**Interfaces:**
- Consumes: `drawnBreak`, `openBreakWithLines`, `makeBreak`, `makeUser` (fixtures, Task 1), `users.paymentName` (Task 2).
- Produces, in `src/domain/lines/queries.ts`:
  - `type MyLineState = "taken" | "sent" | "paid"`; `type MyAward = { rank: number; itemName: string | null; choice: boolean; shippedAt: Date | null }`.
  - `type MyBreak = { breakId: string; title: string; status: string; openedAt: Date | null; lineCount: number; linePriceCents: number; seedCommitment: string | null; paymentWindowHours: number; paymentInstructions: string; host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } }; lines: { number: number; state: MyLineState; bonus: boolean }[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null; late: boolean; award: MyAward | null; ranAt: Date | null; earlier: boolean }`.
  - `EARLIER_DAYS = 7`; `myLines(tx, userId: string, now: Date): Promise<MyBreak[]>` — most recently opened first; `owedCents` counts unsent unpaid lines only; `payBy` = first unsent claim + window; awards and `ranAt` from the active draw only; `earlier` = ran (active draw time) or cancelled (latest `break.cancelled` event; none means current) more than 7 days before `now`, and nothing pending: no unpaid line (sent or not) and no unanswered choice win.
  - `type WaitingRow = { breakId: string; breakTitle: string; ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null; sent: number[]; sentCents: number; firstSentAt: Date }`; `waitingOnHost(tx, hostId: string): Promise<WaitingRow[]>` — sent and unpaid lines in the host's `open` and `filled` main breaks, one row per buyer per break, oldest sent first.
- Produces, in `src/domain/breaks/queries.ts`: `type HostProfile = { id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number }`; `hostProfile(tx, handle: string): Promise<HostProfile | null>` — case-insensitive; reads the user first, then counts with the id bound as a parameter (as `hostTrust` does); null for unknown handles, the SYSTEM user, and anyone who is not a `host` and never listed a break; `pastCount` = main breaks that ran or were cancelled.

- [ ] **Step 1: Write the failing line-query tests**

Create `src/domain/lines/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid, markSent, addBonusLine } from "./commands";
import { myLines, waitingOnHost } from "./queries";
import { breaks, draws, events, lines } from "@/db/schema";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const claim = (tx: Tx, u: { id: string }, breakId: string, numbers: number[]) => claimLines(tx, c(u), { breakId, numbers, batchId: randomUUID() });
const pay = (tx: Tx, host: { id: string }, breakId: string, number: number, owner: { id: string }) =>
  markPaid(tx, c(host, "host"), { breakId, number, expectedOwnerId: owner.id });

describe("myLines", () => {
  it("owes only unsent lines and wins only from the active draw (Review Focus 2)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx); const other = await makeUser(tx);
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10, linePriceCents: 500 });
      await claim(tx, buyer, a.id, [3, 5, 8]);
      await markSent(tx, c(buyer), { breakId: a.id, numbers: [3] });
      await pay(tx, host, a.id, 8, buyer);
      await tx.execute(sql`update lines set claimed_at = now() - interval '30 hours' where break_id = ${a.id} and number = 5`);
      await addBonusLine(tx, c(host, "host"), { breakId: a.id, ownerId: buyer.id }); // line 11, free and paid
      await claim(tx, other, a.id, [1]);
      await tx.execute(sql`update breaks set opened_at = now() - interval '2 hours' where id = ${a.id}`);
      const won = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2 });

      const now = new Date();
      const groups = await myLines(tx, buyer.id, now);
      expect(groups.map((g) => g.breakId)).toEqual([won.id, a.id]);
      const ga = groups[1];
      expect(ga).toMatchObject({ status: "open", unsent: [5], sent: [3], paid: [8, 11], owedCents: 500, late: true, award: null, ranAt: null, earlier: false });
      expect(ga.lines).toEqual([
        { number: 3, state: "sent", bonus: false },
        { number: 5, state: "taken", bonus: false },
        { number: 8, state: "paid", bonus: false },
        { number: 11, state: "paid", bonus: true },
      ]);
      const [five] = await tx.select({ claimedAt: lines.claimedAt }).from(lines).where(sql`${lines.breakId} = ${a.id} and ${lines.number} = 5`);
      expect(ga.payBy?.getTime()).toBe(five.claimedAt!.getTime() + 24 * 3_600_000);
      expect(ga.host).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle });

      const gw = groups[0];
      expect(gw).toMatchObject({ status: "drawn", owedCents: 0, payBy: null, late: false, award: { rank: 1, itemName: "Darts", choice: false, shippedAt: null } });
      expect(gw.ranAt).toBeInstanceOf(Date);
      // Eight days on, the ran break has moved under "Earlier"; the open one never does.
      const later = await myLines(tx, buyer.id, new Date(now.getTime() + 8 * 86_400_000));
      expect(later.map((g) => g.earlier)).toEqual([true, false]);

      await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "test" }).where(eq(draws.id, won.drawId));
      const voided = (await myLines(tx, buyer.id, now)).find((g) => g.breakId === won.id)!;
      expect(voided.award).toBeNull();
      expect(voided.ranAt).toBeNull();
      expect((await myLines(tx, other.id, now)).map((g) => g.breakId)).toEqual([a.id]);
    });
  });

  it("shows a choice prize as a choice until the winner picks, and never hides it under Earlier", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2, extraTopChoice: "Chronos 24g" });
      const [g] = await myLines(tx, buyer.id, new Date());
      expect(g.breakId).toBe(d.id);
      expect(g.award).toMatchObject({ rank: 1, itemName: null, choice: true });
      // "Won. Tell Jim your choice." is the winner's only call to action: eight days on it is still in the recent group.
      const [later] = await myLines(tx, buyer.id, new Date(Date.now() + 8 * 86_400_000));
      expect(later.earlier).toBe(false);
    });
  });

  it("dates a cancelled break by its cancel event, and keeps one with lines still unpaid in the recent group", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
      // Opened 8 days ago, cancelled 8 days ago, every line of the buyer's paid: Earlier.
      const old = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, old.id, [1]); await pay(tx, host, old.id, 1, buyer);
      // Opened 8 days ago, cancelled today, paid: current (the cancel time counts, not the open time).
      const fresh = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, fresh.id, [1]); await pay(tx, host, fresh.id, 1, buyer);
      // Cancelled 8 days ago but line 1 never paid: current (something is still pending).
      const unpaid = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, unpaid.id, [1]);
      // Cancelled with no cancel event (no cancel command exists yet): current.
      const silent = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, silent.id, [1]); await pay(tx, host, silent.id, 1, buyer);
      for (const b of [old, fresh, unpaid, silent]) {
        await tx.update(breaks).set({ status: "cancelled", openedAt: eightDaysAgo }).where(eq(breaks.id, b.id));
      }
      await tx.insert(events).values([
        { breakId: old.id, actorId: host.id, type: "break.cancelled", createdAt: eightDaysAgo },
        { breakId: fresh.id, actorId: host.id, type: "break.cancelled" },
        { breakId: unpaid.id, actorId: host.id, type: "break.cancelled", createdAt: eightDaysAgo },
      ]);
      const by = Object.fromEntries((await myLines(tx, buyer.id, new Date())).map((g) => [g.breakId, g.earlier]));
      expect(by).toEqual({ [old.id]: true, [fresh.id]: false, [unpaid.id]: false, [silent.id]: false });
    });
  });

  it("is empty for someone who holds no line", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await myLines(tx, u.id, new Date())).toEqual([]);
    });
  });
});

describe("waitingOnHost", () => {
  it("groups sent, unpaid lines by buyer and break across the host's breaks, oldest sent first", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const otherHost = await makeUser(tx, { role: "host" });
      const alice = await makeUser(tx); const bob = await makeUser(tx); const carol = await makeUser(tx);
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 700 });
      const elsewhere = await openBreakWithLines(tx, { hostId: otherHost.id, lineCount: 4 });
      await claim(tx, alice, a.id, [1, 2]); await markSent(tx, c(alice), { breakId: a.id, numbers: [1, 2] });
      await claim(tx, bob, b.id, [3, 4]); await markSent(tx, c(bob), { breakId: b.id, numbers: [3] });
      await claim(tx, carol, a.id, [5]); await markSent(tx, c(carol), { breakId: a.id, numbers: [5] }); await pay(tx, host, a.id, 5, carol);
      await claim(tx, alice, elsewhere.id, [1]); await markSent(tx, c(alice), { breakId: elsewhere.id, numbers: [1] });
      await tx.execute(sql`update lines set sent_at = now() - interval '2 hours' where break_id = ${b.id} and number = 3`);
      await tx.execute(sql`update lines set sent_at = now() - interval '1 hour' where break_id = ${a.id} and number in (1, 2)`);
      await tx.execute(sql`update users set payment_name = 'Robert B' where id = ${bob.id}`);

      const rows = await waitingOnHost(tx, host.id);
      expect(rows.map((r) => [r.breakId, r.ownerId])).toEqual([[b.id, bob.id], [a.id, alice.id]]);
      expect(rows[0]).toMatchObject({ breakTitle: b.title, handle: bob.handle, paymentName: "Robert B", sent: [3], sentCents: 700 });
      expect(rows[1]).toMatchObject({ breakTitle: a.title, sent: [1, 2], sentCents: 1000, paymentName: null });
      expect(await waitingOnHost(tx, otherHost.id)).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Write the failing profile tests**

In `src/domain/breaks/queries.test.ts`, change the import line

```ts
import { hostTrust, lastBreakDefaults, listHostBreaks } from "./queries";
```

to

```ts
import { hostProfile, hostTrust, lastBreakDefaults, listHostBreaks } from "./queries";
```

and append at the end of the file:

```ts
describe("hostProfile", () => {
  it("shows a host's public figures by handle, ignoring case, and nothing private", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await makeBreak(tx, { hostId: host.id }); // a draft: neither run nor past
      const cancelled = await makeBreak(tx, { hostId: host.id });
      await tx.update(breaks).set({ status: "cancelled" }).where(sql`${breaks.id} = ${cancelled.id}`);
      await tx.execute(sql`update users set payment_name = 'Secret Name' where id = ${host.id}`);
      const p = await hostProfile(tx, host.handle.toUpperCase());
      // Non-zero counts prove the subqueries see this host's breaks (a bare "id" inside `from breaks b` would mean b.id).
      expect(p).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 1, pastCount: 2 });
      expect(p!.breaksRun).toBeGreaterThan(0);
      expect(p!.since).toBeInstanceOf(Date);
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "handle", "id", "pastCount", "since"]);
      expect(JSON.stringify(p)).not.toMatch(/example\.com|Secret Name/);
    });
  });
  it("is null for an unknown handle, the SYSTEM user, and anyone not a host who never listed a break", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx); const admin = await makeUser(tx, { role: "admin" }); const newHost = await makeUser(tx, { role: "host" });
      expect(await hostProfile(tx, member.handle)).toBeNull();
      expect(await hostProfile(tx, admin.handle)).toBeNull();
      expect(await hostProfile(tx, "system")).toBeNull();
      expect(await hostProfile(tx, "nobody_here_x")).toBeNull();
      // A host with nothing listed yet still has a profile page.
      expect(await hostProfile(tx, newHost.handle)).toMatchObject({ id: newHost.id, breaksRun: 0, pastCount: 0 });
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/domain/lines/queries.test.ts src/domain/breaks/queries.test.ts`
Expected: FAIL. `myLines` has the old signature (its groups have no `unsent`, `award` or `earlier`), `waitingOnHost` and `hostProfile` are not exported (`TypeError: … is not a function`).

- [ ] **Step 4: Write `myLines` and `waitingOnHost`**

In `src/domain/lines/queries.ts`, replace the first three lines

```ts
import { sql, eq, desc, asc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines, users, hostProfiles } from "@/db/schema";
```

with

```ts
import { sql, eq, asc, and, inArray, isNull, isNotNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { awards, breakItems, breaks, draws, events, lines, users, hostProfiles } from "@/db/schema";
```

Replace the old `myLines` (from `/** Lines a user holds across breaks` to its closing `}`) with:

```ts
export type MyLineState = "taken" | "sent" | "paid";
export type MyAward = { rank: number; itemName: string | null; choice: boolean; shippedAt: Date | null };
export type MyBreak = {
  breakId: string; title: string; status: string; openedAt: Date | null; lineCount: number; linePriceCents: number;
  seedCommitment: string | null; paymentWindowHours: number; paymentInstructions: string;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } };
  lines: { number: number; state: MyLineState; bonus: boolean }[];
  unsent: number[]; sent: number[]; paid: number[];
  /** Unsent unpaid lines only: a sent line waits on the host and is not owed twice (design §5.4). */
  owedCents: number;
  /** First unsent claim plus the payment window; null when nothing is owed. */
  payBy: Date | null;
  late: boolean;
  /** From the active draw only: a voided draw's award is gone. */
  award: MyAward | null;
  ranAt: Date | null;
  /**
   * Ran or cancelled more than EARLIER_DAYS ago with nothing pending: listed under "Earlier" (design §5.8). Unpaid
   * lines (sent or not) and an unanswered choice win keep a break in the recent group whatever its age.
   */
  earlier: boolean;
};

export const EARLIER_DAYS = 7;

/** /me: the caller's lines grouped by break, most recently opened first. */
export async function myLines(tx: Tx, userId: string, now: Date): Promise<MyBreak[]> {
  const rows = await tx.select({
    breakId: breaks.id, title: breaks.title, status: breaks.status, openedAt: breaks.openedAt, createdAt: breaks.createdAt,
    lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, seedCommitment: breaks.seedCommitment,
    paymentWindowHours: breaks.paymentWindowHours, paymentInstructions: breaks.paymentInstructions,
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, paymentHandles: hostProfiles.paymentHandles,
    number: lines.number, claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents, isBonus: lines.isBonus,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(and(eq(lines.ownerId, userId), sql`${breaks.status} <> 'draft'`))
    .orderBy(sql`${breaks.openedAt} desc nulls last`, asc(breaks.id), asc(lines.number));
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.breakId))];
  const ran = await tx.select({ breakId: draws.breakId, ranAt: draws.createdAt }).from(draws)
    .where(and(inArray(draws.breakId, ids), isNull(draws.voidedAt)));
  const won = await tx.select({ breakId: awards.breakId, rank: awards.rank, itemId: awards.itemId, itemName: breakItems.name, shippedAt: awards.shippedAt })
    .from(awards).innerJoin(draws, eq(draws.id, awards.drawId)).leftJoin(breakItems, eq(breakItems.id, awards.itemId))
    .where(and(eq(awards.winnerId, userId), isNull(draws.voidedAt), inArray(awards.breakId, ids))).orderBy(asc(awards.rank));
  // A cancelled break is dated by its latest cancel event; with none (no cancel command exists yet) it stays current.
  const cancels = await tx.select({ breakId: events.breakId, at: sql<Date>`max(${events.createdAt})`.mapWith(events.createdAt) }).from(events)
    .where(and(inArray(events.breakId, ids), eq(events.type, "break.cancelled"))).groupBy(events.breakId);
  const ranAt = new Map(ran.map((r) => [r.breakId, r.ranAt]));
  const cancelledAt = new Map(cancels.map((c) => [c.breakId, c.at]));
  const awardOf = new Map<string, MyAward>();
  for (const a of won) {
    if (!awardOf.has(a.breakId)) awardOf.set(a.breakId, { rank: a.rank, itemName: a.itemName, choice: a.itemId === null, shippedAt: a.shippedAt });
  }
  const cutoff = now.getTime() - EARLIER_DAYS * 86_400_000;
  const groups = new Map<string, MyBreak & { firstUnsent: Date | null; endedAt: Date | null }>();
  for (const r of rows) {
    let g = groups.get(r.breakId);
    if (!g) {
      const ra = ranAt.get(r.breakId) ?? null;
      const endedAt = r.status === "drawn" ? (ra ?? r.openedAt ?? r.createdAt)
        : r.status === "cancelled" ? (cancelledAt.get(r.breakId) ?? null)
        : null;
      g = {
        breakId: r.breakId, title: r.title, status: r.status, openedAt: r.openedAt, lineCount: r.lineCount, linePriceCents: r.linePriceCents,
        seedCommitment: r.seedCommitment, paymentWindowHours: r.paymentWindowHours, paymentInstructions: r.paymentInstructions,
        host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, paymentHandles: r.paymentHandles ?? {} },
        lines: [], unsent: [], sent: [], paid: [], owedCents: 0, payBy: null, late: false,
        award: awardOf.get(r.breakId) ?? null, ranAt: ra, earlier: false, firstUnsent: null, endedAt,
      };
      groups.set(r.breakId, g);
    }
    const state: MyLineState = r.paidAt ? "paid" : r.sentAt ? "sent" : "taken";
    g.lines.push({ number: r.number, state, bonus: r.isBonus });
    if (state === "paid") g.paid.push(r.number);
    else if (state === "sent") g.sent.push(r.number);
    else {
      g.unsent.push(r.number);
      g.owedCents += r.priceCents ?? r.linePriceCents;
      if (r.claimedAt && (!g.firstUnsent || r.claimedAt < g.firstUnsent)) g.firstUnsent = r.claimedAt;
    }
  }
  return [...groups.values()].map(({ firstUnsent, endedAt, ...g }) => {
    const payBy = firstUnsent ? new Date(firstUnsent.getTime() + g.paymentWindowHours * 3_600_000) : null;
    // Something still to do here keeps the break in the recent group: unpaid lines, or a choice to name.
    const pending = g.unsent.length > 0 || g.sent.length > 0 || (g.award !== null && g.award.choice && g.award.shippedAt === null);
    const earlier = endedAt !== null && endedAt.getTime() < cutoff && !pending;
    return { ...g, payBy, late: payBy !== null && payBy.getTime() < now.getTime(), earlier };
  });
}
```

Append at the end of the file:

```ts
export type WaitingRow = {
  breakId: string; breakTitle: string; ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null;
  sent: number[]; sentCents: number; firstSentAt: Date;
};

/** "Sent, waiting for you" (design §5.5): sent, unpaid lines in the host's open and closed main breaks, per buyer per break, oldest first. */
export async function waitingOnHost(tx: Tx, hostId: string): Promise<WaitingRow[]> {
  const rows = await tx.select({
    breakId: breaks.id, breakTitle: breaks.title, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName, paymentName: users.paymentName,
    number: lines.number, sentAt: lines.sentAt, priceCents: lines.priceCents, linePriceCents: breaks.linePriceCents,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, lines.ownerId))
    .where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"), inArray(breaks.status, ["open", "filled"]), isNotNull(lines.sentAt), isNull(lines.paidAt)))
    .orderBy(asc(lines.number));
  const by = new Map<string, WaitingRow>();
  for (const r of rows) {
    const key = `${r.breakId}:${r.ownerId}`;
    const sentAt = r.sentAt!; // filtered: sent_at is not null
    const g = by.get(key) ?? {
      breakId: r.breakId, breakTitle: r.breakTitle, ownerId: r.ownerId!, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName,
      sent: [], sentCents: 0, firstSentAt: sentAt,
    };
    g.sent.push(r.number);
    g.sentCents += r.priceCents ?? r.linePriceCents;
    if (sentAt < g.firstSentAt) g.firstSentAt = sentAt;
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) =>
    a.firstSentAt.getTime() - b.firstSentAt.getTime() || a.breakId.localeCompare(b.breakId) || a.ownerId.localeCompare(b.ownerId));
}
```

- [ ] **Step 5: Write `hostProfile`**

Append to `src/domain/breaks/queries.ts`:

```ts
export type HostProfile = { id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number };

/**
 * /h/{handle} (design §5.9): public figures only. Never email, payment name or payment handles. Null for an unknown
 * handle, for the SYSTEM user, and for anyone who is not a host and never listed a break (a buyer's or an admin's
 * handle is not a host profile).
 */
export async function hostProfile(tx: Tx, handle: string): Promise<HostProfile | null> {
  const [u] = await tx.select({ id: users.id, handle: users.handle, displayName: users.displayName, since: users.createdAt, role: users.role })
    .from(users).where(sql`lower(${users.handle}) = lower(${handle})`);
  if (!u || !u.handle || u.id === SYSTEM.id) return null;
  // The id is bound as a parameter, as hostTrust does. Drizzle writes a single-table select's columns unqualified,
  // so `${users.id}` inside `from breaks b` would render as a bare "id" and Postgres would read it as b.id.
  const [c] = await tx.select({
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.status = 'drawn')`,
    pastCount: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.kind = 'main' and b.status in ('drawn','cancelled'))`,
    listed: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.status <> 'draft')`,
  }).from(users).where(eq(users.id, u.id));
  if (c.listed === 0 && u.role !== "host") return null;
  return { id: u.id, handle: u.handle, displayName: u.displayName, since: u.since, breaksRun: c.breaksRun, pastCount: c.pastCount };
}
```

At the top of `src/domain/breaks/queries.ts`, below `import type { ClaimMode } from "./rules";`, add:

```ts
import { SYSTEM } from "@/domain/types";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/domain/lines src/domain/breaks`
Expected: PASS, including "owes only unsent lines and wins only from the active draw (Review Focus 2)".

- [ ] **Step 7: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green (no page reads these queries yet).

- [ ] **Step 8: Commit**

```bash
git add src/domain/lines/queries.ts src/domain/lines/queries.test.ts src/domain/breaks/queries.ts src/domain/breaks/queries.test.ts
git commit -m "feat(queries): my lines with wins and earlier, host profile, and sent lines waiting on the host"
```

---

### Task 4: Break page in one cached transaction, and a throttled `last_seen_at` (model: opus)

Deferred list item 2. Today `getBreakPage` runs twice per request (once for `generateMetadata`, once for the page) and the page opens four transactions (page, trust and unpaid count, draw result, ledger). And the root layout's `syncUser` upserts the user with `last_seen_at = now()` on every request, `/legal` included, so every page view writes a row. This task moves the break page's reads into one domain function run in one transaction, wraps it in React `cache()` so metadata and page share it, and makes `syncUser` write only when `last_seen_at` is more than five minutes old, the email changed, or a promotion is due. The page renders exactly as before.

**Files:**
- Create: `src/domain/breaks/page-view.ts`, `src/domain/breaks/page-view.test.ts`
- Create: `src/app/b/[id]/load.ts`
- Modify: `src/app/b/[id]/page.tsx` (whole file)
- Modify: `src/auth/session.ts:27-44` (`syncUser`), `src/auth/session.test.ts` (append tests)

**Interfaces:**
- Consumes: `getBreakPage`, `hostTrust` (`src/domain/breaks/queries.ts`), `canViewBreak`, `isHostView` (`src/domain/breaks/grid.ts`), `globalUnpaidCount`, `ledgerByBuyer` (`src/domain/lines/queries.ts`, with `paymentName` from Task 2), `getDrawResult` (`src/domain/draws/queries.ts`), `getCaller` (`src/auth/session.ts`).
- Produces:
  - `src/domain/breaks/page-view.ts`: `type BreakViewer = { id: string; role: Role }`; `type BreakView = { page: BreakPage; trust: { breaksRun: number; since: Date }; globalUnpaid: number; top: { line: number; handle: string | null } | null; ledger: LedgerBuyer[] }`; `readBreakView(tx, breakId, viewer: BreakViewer | null, now: Date): Promise<BreakView | null>` — null for a missing break and for a draft the viewer may not see (no further query runs then); `ledger` is empty unless host view.
  - `src/app/b/[id]/load.ts` (server-only): `loadBreak(breakId: string): Promise<{ view: BreakView | null; caller: Caller | null; now: Date }>`, React-cached per request.
  - `src/auth/session.ts`: `LAST_SEEN_EVERY = "5 minutes"`; `syncUser` keeps its signature and return value.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/breaks/page-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines } from "@/domain/lines/commands";
import type { Caller } from "@/domain/types";
import { readBreakView } from "./page-view";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const now = () => new Date();

describe("readBreakView", () => {
  it("hides a draft from everyone but its host and admins, and a missing break from everyone", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const member = await makeUser(tx); const admin = await makeUser(tx, { role: "admin" });
      const draft = await makeBreak(tx, { hostId: host.id });
      expect(await readBreakView(tx, draft.id, null, now())).toBeNull();
      expect(await readBreakView(tx, draft.id, { id: member.id, role: "member" }, now())).toBeNull();
      expect((await readBreakView(tx, draft.id, { id: host.id, role: "host" }, now()))?.page.break.id).toBe(draft.id);
      expect((await readBreakView(tx, draft.id, { id: admin.id, role: "admin" }, now()))?.page.break.id).toBe(draft.id);
      expect(await readBreakView(tx, randomUUID(), { id: host.id, role: "host" }, now())).toBeNull();
    });
  });

  it("gives the ledger to the host only, and the viewer's unpaid count across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      const elsewhere = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(buyer), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, c(buyer), { breakId: elsewhere.id, numbers: [4], batchId: randomUUID() });
      const anon = await readBreakView(tx, b.id, null, now());
      expect(anon).toMatchObject({ globalUnpaid: 0, top: null, ledger: [] });
      expect(anon!.trust.breaksRun).toBe(0);
      const asBuyer = await readBreakView(tx, b.id, { id: buyer.id, role: "member" }, now());
      expect(asBuyer).toMatchObject({ globalUnpaid: 3, ledger: [] });
      const asHost = await readBreakView(tx, b.id, { id: host.id, role: "host" }, now());
      expect(asHost!.ledger.map((r) => r.ownerId)).toEqual([buyer.id]);
    });
  });

  it("reads the top spot of a ran break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const v = await readBreakView(tx, d.id, null, now());
      expect(v!.top).toEqual({ line: d.ranking[0], handle: buyer.handle });
      expect(v!.trust.breaksRun).toBe(1);
    });
  });
});
```

In `src/auth/session.test.ts`, append at the end of the file:

```ts
describe("syncUser throttling", () => {
  const lastSeenIsNow = async (tx: Tx, id: string) =>
    (await tx.execute<{ fresh: boolean }>(sql`select last_seen_at = now() as fresh from users where id = ${id}`))[0].fresh;

  it("writes last_seen_at at most every five minutes and still returns the row", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      const email = `${u.handle}@example.com`;
      await tx.execute(sql`update users set email = ${email}, last_seen_at = now() - interval '2 minutes' where id = ${u.id}`);
      const row = await syncUser(tx, u.id, email, false);
      expect(row).toMatchObject({ id: u.id, handle: u.handle, email, role: "member" });
      expect(await lastSeenIsNow(tx, u.id)).toBe(false); // two minutes old: left alone
      await tx.execute(sql`update users set last_seen_at = now() - interval '10 minutes' where id = ${u.id}`);
      await syncUser(tx, u.id, email, false);
      expect(await lastSeenIsNow(tx, u.id)).toBe(true);
    });
  });

  it("writes at once when the email changes or a promotion is due", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set last_seen_at = now() where id = ${u.id}`);
      expect((await syncUser(tx, u.id, `new-${u.handle}@example.com`, false)).email).toBe(`new-${u.handle}@example.com`);
      expect((await syncUser(tx, u.id, `new-${u.handle}@example.com`, true)).role).toBe("admin");
      expect(await roleEventsOf(tx, u.id)).toHaveLength(1);
    });
  });

  it("stamps last_seen_at when it creates a user", async () => {
    await withTx(async (tx) => {
      const id = randomUUID();
      await syncUser(tx, id, `${id}@example.com`, false);
      expect(await lastSeenIsNow(tx, id)).toBe(true);
    });
  });
});

const roleEventsOf = (tx: Tx, id: string) =>
  tx.select({ payload: events.payload }).from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'user.role_changed'`);
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/breaks/page-view.test.ts src/auth/session.test.ts`
Expected: FAIL. `./page-view` does not exist; "writes last_seen_at at most every five minutes" fails at `expect(await lastSeenIsNow(tx, u.id)).toBe(false)` (today every call writes); "stamps last_seen_at when it creates a user" fails (the insert leaves it null).

- [ ] **Step 3: Write `readBreakView`**

Create `src/domain/breaks/page-view.ts`:

```ts
import type { Tx } from "@/db/client";
import type { Role } from "@/domain/types";
import { globalUnpaidCount, ledgerByBuyer, type LedgerBuyer } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getBreakPage, hostTrust, type BreakPage } from "./queries";
import { canViewBreak, isHostView } from "./grid";

export type BreakViewer = { id: string; role: Role };
export type BreakView = {
  page: BreakPage;
  trust: { breaksRun: number; since: Date };
  globalUnpaid: number;
  top: { line: number; handle: string | null } | null;
  ledger: LedgerBuyer[];
};

/**
 * Everything the break page reads, in the caller's one transaction. Null for a missing break and for a draft the
 * viewer may not see: that check comes straight after the first read, so a hidden draft costs no further query.
 */
export async function readBreakView(tx: Tx, breakId: string, viewer: BreakViewer | null, now: Date): Promise<BreakView | null> {
  const page = await getBreakPage(tx, breakId);
  if (!page) return null;
  const hostView = isHostView(page.break.hostId, viewer);
  if (!canViewBreak(page.break.status, hostView)) return null;
  const trust = await hostTrust(tx, page.host.id);
  const globalUnpaid = viewer ? await globalUnpaidCount(tx, viewer.id) : 0;
  let top: BreakView["top"] = null;
  if (page.break.status === "drawn") {
    const res = await getDrawResult(tx, breakId);
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
  // Rows arrive in the ledger order (compareLedger); the sheet freezes that order.
  const ledger = hostView ? await ledgerByBuyer(tx, breakId, now) : [];
  return { page, trust, globalUnpaid, top, ledger };
}
```

- [ ] **Step 4: Write the cached loader**

Create `src/app/b/[id]/load.ts`:

```ts
import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { readBreakView, type BreakView } from "@/domain/breaks/page-view";
import type { Caller } from "@/domain/types";

/** One transaction per request for the break page; React cache shares it between generateMetadata and the page. */
export const loadBreak = cache(async (breakId: string): Promise<{ view: BreakView | null; caller: Caller | null; now: Date }> => {
  const caller = await getCaller();
  const now = new Date();
  const view = await db.transaction((tx) => readBreakView(tx, breakId, caller ? { id: caller.id, role: caller.role } : null, now));
  return { view, caller, now };
});
```

- [ ] **Step 5: Read the page through the loader**

Replace the whole of `src/app/b/[id]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { shapeGrid } from "@/domain/breaks/grid";
import { bonusAllowance } from "@/domain/breaks/rules";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatMoney } from "@/lib/money";
import { daysSince, formatDeadline, formatLate } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { pageShare } from "@/lib/share-text";
import { GridPreview } from "@/components/grid/grid-preview";
import { Legend } from "@/components/legend";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import type { BreakStatus } from "@/components/status-word";
import { DetailsFold } from "@/components/break/details-fold";
import { BreakInteractive } from "@/components/break/break-interactive";
import { commitmentShort } from "@/components/break/pay-copy";
import { onboardingHref, parsePick } from "@/components/break/selection";
import { closesText, hostLabel, leftText, perPersonText, pickingText, prizeLines, smallLineText, trustText, youHaveText } from "@/components/break/frame-copy";
import { HostTools } from "@/components/ledger/host-tools";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { loadBreak } from "./load";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const { view } = await loadBreak(id);
  if (!view || view.page.break.status === "draft") return {};
  const b = view.page.break;
  return { title: b.title, description: `${b.lineCount} lines at ${formatMoney(b.linePriceCents)}.` };
}

export default async function BreakPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // One transaction for everything below, shared with generateMetadata (React cache).
  const { view, caller, now } = await loadBreak(id);
  // A missing break and someone else's draft look the same: 404.
  if (!view) notFound();
  const { page, trust, globalUnpaid, top, ledger } = view;
  const b = page.break;
  const { pick } = await searchParams;
  const initialPick = parsePick(pick, b.lineCount);
  if (caller && !caller.onboarded && initialPick.length > 0) redirect(onboardingHref(id, initialPick));
  const zone = await viewerZone();
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const status = b.status as BreakStatus;
  const hostName = hostLabel(page.host);
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const handles = page.host.paymentHandles;
  const payee = handles.venmo ?? (handles.paypal ? `paypal.me/${handles.paypal}` : hostName);
  const url = `${env().APP_URL}/b/${id}`;
  const share = pageShare({ status, title: b.title, url, lineCount: b.lineCount, priceCents: b.linePriceCents, openCount: grid.counts.open, top });
  // The deadline goes down as ISO plus a fallback in the viewer's zone (tz cookie) or labelled New York time.
  const payBy = grid.viewer?.payBy ?? null;
  const owe = grid.viewer && grid.viewer.unsent.length > 0
    ? {
        numbers: grid.viewer.unsent, cents: grid.viewer.owedCents,
        payByIso: payBy ? payBy.toISOString() : null,
        payByFallback: payBy ? formatDeadline(payBy, now, zone.tz, zone.labelled) : null,
      }
    : null;
  const youHave = grid.viewer ? youHaveText(grid.viewer.held) : null;
  const ledgerRows: LedgerRowView[] = ledger.map((r) => ({
    ownerId: r.ownerId, handle: r.handle, displayName: r.displayName, paymentName: r.paymentName,
    numbers: r.numbers, unpaid: r.unpaid, sent: r.sent, overdue: r.overdue, paid: r.paid, bonus: r.bonus,
    owedCents: r.owedCents, status: r.status, lateText: r.overdueSince ? formatLate(r.overdueSince, now) : null,
  }));

  return (
    <main className="mx-auto max-w-[600px] px-4 pb-6 sm:px-6">
      <section className="mt-3 flex gap-3">
        <GridPreview count={b.lineCount} cells={grid.cells} />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 font-condensed text-title font-semibold">{b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" data-testid="left-count">{leftText(grid.counts.open, b.lineCount)}</span>
            <span className="text-small text-ink-2">{formatMoney(b.linePriceCents)} a line</span>
            <StatusPill status={b.status} />
          </div>
        </div>
      </section>

      {/* "See the result" lives in the bar (bar-result) on a drawn break, not in the page flow (pixel budget). */}
      <BreakInteractive
        breakId={id}
        status={status}
        claimMode={b.claimMode}
        priceCents={b.linePriceCents}
        lineCount={b.lineCount}
        title={b.title}
        shareUrl={url}
        smallLine={smallLineText(status, b.paymentWindowHours, hostRef, trustText(trust))}
        cells={grid.cells}
        counts={grid.counts}
        signedIn={!!caller}
        allowance={grid.allowance}
        owe={owe}
        hostName={hostName}
        payee={payee}
        handles={handles}
        instructions={b.paymentInstructions}
        commitment={commitmentShort(b.seedCommitment)}
        closedDaysAgo={status === "filled" && b.filledAt ? daysSince(b.filledAt, now) : null}
        initialPick={initialPick}
      >
        <div className="mt-3"><Legend /></div>
        {youHave && <p className="mt-2 text-small" data-testid="you-have">{youHave}</p>}
        {b.seedCommitment && (
          <p className="mt-1 text-small text-ink-2">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
          {grid.hostView && (
            <HostTools
              breakId={id}
              status={status}
              rows={ledgerRows}
              counts={{ paid: grid.counts.paid, taken: grid.counts.taken + grid.counts.sent, total: b.lineCount }}
              bonus={{ used: grid.cells.filter((c) => c.bonus).length, max: bonusAllowance(b.lineCount) }}
              hostName={hostName}
            />
          )}
        </div>
        <DetailsFold
          description={b.description}
          prizes={prizeLines(page.prizes, page.items)}
          perPerson={perPersonText(b.maxLinesPerUser)}
          picking={pickingText(b.claimMode)}
          closes={closesText(hostName)}
          handles={handles}
          instructions={b.paymentInstructions}
          hostName={hostName}
        />
      </BreakInteractive>
    </main>
  );
}
```

- [ ] **Step 6: Throttle `syncUser`**

In `src/auth/session.ts`, replace `syncUser` (from `/** Upsert the signed-in user` to its closing `}`) with:

```ts
/** How stale last_seen_at may get before a request writes it again. */
export const LAST_SEEN_EVERY = "5 minutes";

/**
 * Upsert the signed-in user; a promotion to admin also appends `user.role_changed`. The root layout calls this on
 * every request, so an existing row is written only when last_seen_at is older than LAST_SEEN_EVERY, the email
 * changed, or a promotion is due; otherwise it is only read.
 */
export async function syncUser(tx: Tx, id: string, email: string, promote: boolean): Promise<SessionUser> {
  // A promotion needs the previous role: ensure the row exists, then lock it so concurrent
  // sign-ins record exactly one role change.
  let prev: { role: string } | undefined;
  if (promote) {
    await tx.insert(users).values({ id, email, lastSeenAt: sql`now()` }).onConflictDoNothing({ target: users.id });
    [prev] = await tx.select({ role: users.role }).from(users).where(sql`${users.id} = ${id}`).for("update");
  }
  const set = promote ? { role: "admin" } : {};
  const cols = { id: users.id, email: users.email, role: users.role, handle: users.handle, displayName: users.displayName, ageConfirmedAt: users.ageConfirmedAt, bannedAt: users.bannedAt };
  const due = promote
    ? sql`${users.lastSeenAt} is null or ${users.lastSeenAt} < now() - ${LAST_SEEN_EVERY}::interval or ${users.email} <> excluded.email or ${users.role} <> 'admin'`
    : sql`${users.lastSeenAt} is null or ${users.lastSeenAt} < now() - ${LAST_SEEN_EVERY}::interval or ${users.email} <> excluded.email`;
  const [written] = await tx.insert(users).values({ id, email, lastSeenAt: sql`now()`, ...set })
    .onConflictDoUpdate({ target: users.id, set: { email, lastSeenAt: sql`now()`, ...set }, setWhere: due })
    .returning(cols);
  const row = written ?? (await tx.select(cols).from(users).where(sql`${users.id} = ${id}`))[0];
  if (prev && prev.role !== "admin") {
    await appendEvent(tx, { actorId: id, type: "user.role_changed", payload: { from: prev.role, to: "admin", reason: "admin_emails" } });
  }
  return row;
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test src/domain/breaks src/auth`
Expected: PASS, the existing `syncUser` tests included.

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The journey and the layout spec pass unchanged: the page renders the same markup.

- [ ] **Step 9: Commit**

```bash
git add src/domain/breaks/page-view.ts src/domain/breaks/page-view.test.ts "src/app/b/[id]/load.ts" "src/app/b/[id]/page.tsx" src/auth/session.ts src/auth/session.test.ts
git commit -m "perf(break): one cached transaction per break page and a throttled last_seen_at"
```

---

### Task 5: `/account` and the payment-name field in onboarding (model: sonnet)

Deferred items 10 and 11. `/account` shows the handle, lets a member edit the display name (read-only once locked) and the payment name, and signs out; the header avatar links to it. Onboarding gains the optional payment-name field beside the display name. A half-set-up account reaching `/account` is sent to onboarding by `requireCaller`, which Task 2 made able to finish it. This task also creates `e2e/pages.spec.ts`, the file every later page task adds to.

**Files:**
- Create: `src/domain/users/queries.ts`, `src/domain/users/queries.test.ts`
- Create: `src/app/account/parse.ts`, `src/app/account/parse.test.ts`, `src/app/account/actions.ts`, `src/app/account/form.tsx`, `src/app/account/page.tsx`
- Modify: `src/app/onboarding/form.tsx`, `src/app/onboarding/actions.ts:10`, `:20`
- Modify: `src/components/shell/app-header.tsx:16-20`
- Create: `e2e/pages.spec.ts`

**Interfaces:**
- Consumes: `updateProfile`, `nameLocked`, `completeOnboarding` (`paymentName`) from Task 2; `requireCaller`; `createServerSupabase`; `action`.
- Produces:
  - `src/domain/users/queries.ts`: `type Account = { handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date }`; `accountOf(tx, userId: string): Promise<Account | null>`.
  - `src/app/account/parse.ts`: `parseAccount(form: FormData): { ok: true; input: { displayName: string; paymentName: string } } | { ok: false; error: string }`.
  - `src/app/account/actions.ts`: `type AccountState = { error?: string; saved?: boolean; values?: { displayName: string; paymentName: string } } | null`; `saveAccount(prev, form)`; `signOutAction()`.
  - Test ids: `account-link` (header avatar link), `account-save`, `sign-out`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/users/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { accountOf } from "./queries";

describe("accountOf", () => {
  it("reads the editable account fields, or null", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set payment_name = 'Pat Lee' where id = ${u.id}`);
      const a = await accountOf(tx, u.id);
      expect(a).toMatchObject({ handle: u.handle, displayName: u.handle, paymentName: "Pat Lee" });
      expect(a!.createdAt).toBeInstanceOf(Date);
      expect(await accountOf(tx, randomUUID())).toBeNull();
    });
  });
});
```

Create `src/app/account/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAccount } from "./parse";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

describe("parseAccount", () => {
  it("trims both names and allows a blank payment name", () => {
    expect(parseAccount(form({ displayName: "  Pat ", paymentName: " " }))).toEqual({ ok: true, input: { displayName: "Pat", paymentName: "" } });
    expect(parseAccount(form({ displayName: "Pat", paymentName: "Patricia Lee" }))).toEqual({ ok: true, input: { displayName: "Pat", paymentName: "Patricia Lee" } });
  });
  it("names the field in every error", () => {
    expect(parseAccount(form({ displayName: " ", paymentName: "" }))).toEqual({ ok: false, error: "Display name: at least 1 character" });
    expect(parseAccount(form({ displayName: "x".repeat(41), paymentName: "" }))).toEqual({ ok: false, error: "Display name: at most 40 characters" });
    expect(parseAccount(form({ displayName: "Pat", paymentName: "x".repeat(61) }))).toEqual({ ok: false, error: "Payment name: at most 60 characters" });
    expect(parseAccount(form({}))).toEqual({ ok: false, error: "Display name: at least 1 character" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/users/queries.test.ts src/app/account/parse.test.ts`
Expected: FAIL: `./queries` and `./parse` do not exist.

- [ ] **Step 3: Write the query and the parser**

Create `src/domain/users/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";

export type Account = { handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date };

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({ handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId));
  return r ?? null;
}
```

Create `src/app/account/parse.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  displayName: z.string().trim().min(1, "Display name: at least 1 character").max(40, "Display name: at most 40 characters"),
  paymentName: z.string().trim().max(60, "Payment name: at most 60 characters"),
});

export type AccountInput = { displayName: string; paymentName: string };

/** FormData → updateProfile input. A missing field reads as blank. */
export function parseAccount(form: FormData): { ok: true; input: AccountInput } | { ok: false; error: string } {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const p = schema.safeParse({ displayName: text("displayName"), paymentName: text("paymentName") });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again" };
  return { ok: true, input: p.data };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/domain/users/queries.test.ts src/app/account/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the account page**

Create `src/app/account/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { createServerSupabase } from "@/auth/supabase";
import { updateProfile } from "@/domain/users/commands";
import { parseAccount, type AccountInput } from "./parse";

export type AccountState = { error?: string; saved?: boolean; values?: AccountInput } | null;

function submitted(form: FormData): AccountInput {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  return { displayName: text("displayName"), paymentName: text("paymentName") };
}

export async function saveAccount(_: AccountState, form: FormData): Promise<AccountState> {
  const p = parseAccount(form);
  if (!p.ok) return { error: p.error, values: submitted(form) };
  const r = await action((tx, caller) => updateProfile(tx, caller, p.input));
  if (!r.ok) return { error: r.message, values: submitted(form) };
  revalidatePath("/account");
  return { saved: true };
}

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
```

Create `src/app/account/form.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { saveAccount, type AccountState } from "./actions";

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3 read-only:bg-wire-2";

type Props = { handle: string; displayName: string; paymentName: string; locked: boolean };

export function AccountForm({ handle, displayName, paymentName, locked }: Props) {
  const [state, submit, pending] = useActionState<AccountState, FormData>(saveAccount, null);
  return (
    <form action={submit} className="space-y-5">
      <div className="space-y-1">
        <p className="text-small font-semibold">Handle</p>
        <p className="font-semibold">@{handle}</p>
        <p className="text-small text-ink-2">Handles can&apos;t be changed.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
        {/* Read-only (not disabled) when locked, so the form still sends the current name. */}
        <input id="displayName" name="displayName" required maxLength={40} readOnly={locked} defaultValue={state?.values?.displayName ?? displayName}
          aria-describedby={locked ? "display-name-help" : undefined} className={field} />
        {locked && <p id="display-name-help" className="text-small text-ink-2">Locked 30 days after sign-up.</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="paymentName" className="block text-small font-semibold">Name on your payments (optional)</label>
        <input id="paymentName" name="paymentName" maxLength={60} autoComplete="name" defaultValue={state?.values?.paymentName ?? paymentName}
          aria-describedby="payment-name-help" className={field} />
        <p id="payment-name-help" className="text-small text-ink-2">If your Venmo or PayPal shows another name, hosts can match your payment by it. Only hosts you buy from see it.</p>
      </div>
      <Button type="submit" disabled={pending} data-testid="account-save">Save changes</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
```

Create `src/app/account/page.tsx`:

```tsx
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { accountOf } from "@/domain/users/queries";
import { nameLocked } from "@/domain/users/commands";
import { Button } from "@/components/button";
import { AccountForm } from "./form";
import { signOutAction } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  // A half-set-up account goes to onboarding first (requireCaller), which can now finish it.
  const caller = await requireCaller("/account");
  const account = await db.transaction((tx) => accountOf(tx, caller.id));
  return (
    <main className="mx-auto max-w-[400px] space-y-8 px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Your account</h1>
      <AccountForm
        handle={account?.handle ?? ""}
        displayName={account?.displayName ?? ""}
        paymentName={account?.paymentName ?? ""}
        locked={account ? nameLocked(account.createdAt, new Date()) : false}
      />
      <form action={signOutAction}>
        <Button type="submit" variant="secondary" data-testid="sign-out">Sign out</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Link the avatar to `/account`**

In `src/components/shell/app-header.tsx`, replace

```tsx
          {viewer ? (
            <span className="inline-flex min-h-11 items-center">
              <Avatar name={viewer.displayName ?? viewer.handle} />
              <span className="sr-only">Signed in as {viewer.handle ? `@${viewer.handle}` : "a new account"}</span>
            </span>
          ) : (
```

with

```tsx
          {viewer ? (
            <Link href="/account" data-testid="account-link" className="inline-flex min-h-11 min-w-11 items-center justify-center">
              <Avatar name={viewer.displayName ?? viewer.handle} />
              <span className="sr-only">Your account, signed in as {viewer.handle ? `@${viewer.handle}` : "a new account"}</span>
            </Link>
          ) : (
```

- [ ] **Step 7: Ask for the payment name in onboarding**

In `src/app/onboarding/form.tsx`, replace

```tsx
        {showName ? (
          <div className="space-y-1">
            <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
            <input id="displayName" name="displayName" maxLength={40} placeholder="Leave blank to use your handle" className={field} />
          </div>
        ) : (
          <Button variant="text" onClick={() => setShowName(true)}>Add a display name</Button>
        )}
```

with

```tsx
        {showName ? (
          <>
            <div className="space-y-1">
              <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
              <input id="displayName" name="displayName" maxLength={40} placeholder="Leave blank to use your handle" className={field} />
            </div>
            <div className="space-y-1">
              <label htmlFor="paymentName" className="block text-small font-semibold">Name on your payments (optional)</label>
              <input id="paymentName" name="paymentName" maxLength={60} autoComplete="name" aria-describedby="payment-name-help" className={field} />
              <p id="payment-name-help" className="text-small text-ink-2">If your Venmo or PayPal shows another name, hosts can match your payment by it.</p>
            </div>
          </>
        ) : (
          <Button variant="text" onClick={() => setShowName(true)}>Add your name</Button>
        )}
```

In `src/app/onboarding/actions.ts`, replace line 10

```ts
const schema = z.object({ handle: z.string(), displayName: z.string().optional(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional() });
```

with

```ts
const schema = z.object({ handle: z.string(), displayName: z.string().optional(), paymentName: z.string().optional(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional() });
```

and replace line 20

```ts
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on", ipHash }));
```

with

```ts
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName, paymentName: p.data.paymentName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on", ipHash }));
```

- [ ] **Step 8: Add the page spec (creates `e2e/pages.spec.ts`)**

Create `e2e/pages.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

// One test per page Plan B adds. Each test makes its own users and breaks; `run` keeps them unique per run.
const run = Date.now();

async function as(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

test("a member edits their display name and payment name in /account", async ({ browser }) => {
  const page = await as(browser, `acct${run}@e2e.test`);
  await page.getByTestId("account-link").click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(`@acct${run}`, { exact: true })).toBeVisible();
  await page.getByLabel("Display name").fill("Acct Person");
  await page.getByLabel("Name on your payments").fill("Jon  Payer");
  await page.getByTestId("account-save").click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Acct Person");
  await expect(page.getByLabel("Name on your payments")).toHaveValue("Jon Payer");
});
```

- [ ] **Step 9: Optional: check by hand**

If you have a browser tool: start `pnpm dev` in the background, sign in at `/login` with any address (the 6-digit code arrives in Mailpit, http://127.0.0.1:54324), open `/account` from the avatar, save a payment name, then sign out. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 10: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green, including `e2e/pages.spec.ts`. The header change keeps `loginAs` working (it waits for `/`, not for the avatar).

- [ ] **Step 11: Commit**

```bash
git add src/domain/users/queries.ts src/domain/users/queries.test.ts src/app/account src/app/onboarding src/components/shell/app-header.tsx e2e/pages.spec.ts
git commit -m "feat(account): display and payment name editing, sign out, and the payment name at onboarding"
```

---

### Task 6a: Draft editing, the domain half (model: opus)

Design §5.6, last line: "Drafts can be edited; they are not viewable by anyone but the host." Today a saved draft can only be opened. This task adds the domain half: `updateDraft` (host or admin, draft only, replaces settings and prizes in one transaction, logs `break.updated`), a read for the form, and the composer's starting values as one `ComposerInitial` object, built from the host's last break for a new break and from the draft when editing. Nothing consumes them yet, so every gate stays green; Task 6b adds the edit route and the button.

**Files:**
- Modify: `src/domain/breaks/commands.ts` (extract `insertPrizes`; add `updateDraft`), `src/domain/breaks/commands.test.ts`
- Modify: `src/domain/breaks/queries.ts` (`isGeneratedInstructions`; `lastBreakDefaults` uses it; add `DraftForEdit`, `draftForEdit`), `src/domain/breaks/queries.test.ts`
- Create: `src/app/host/new/initial.ts`, `src/app/host/new/initial.test.ts`

**Interfaces:**
- Consumes: `assertHostOf`, `assertOnboarded`, `cleanHandles`, `savePaymentHandles`, `defaultPaymentInstructions` (in `src/domain/breaks/commands.ts`); `validateDraftInput`, `isClaimMode` (in `src/domain/breaks/rules.ts`, already imported by `commands.ts`); `getBreakPage`, `LastBreakDefaults` (`queries.ts`); `formatMoney`.
- Produces:
  - `updateDraft(tx, caller, breakId: string, input: CreateDraftInput): Promise<{ breakId: string }>` — `NotAuthorized` for non-hosts, `NotOpen(status)` ("This break is already open.") once opened, `InvalidInput` as `createDraft`. The break id is its own argument, like `openBreak(tx, caller, breakId)`.
  - `isGeneratedInstructions(s: string): boolean`; `type DraftForEdit = { id: string; hostId: string; status: string; title: string; description: string; lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null; claimMode: ClaimMode; paymentInstructions: string; topSpot: string[]; secondPlace: string[] }`; `draftForEdit(tx, breakId: string): Promise<DraftForEdit | null>`.
  - `src/app/host/new/initial.ts`: `type ComposerInitial = { breakId: string | null; title: string; description: string; lineCount: number; price: string; paymentWindowHours: string; maxLinesPerUser: string; claimMode: ClaimMode; paymentInstructions: string; venmo: string; paypal: string; prize1: string[]; prize2: string }`; `newComposerInitial(defaults: LastBreakDefaults | null, handles: { venmo?: string; paypal?: string }): ComposerInitial`; `draftComposerInitial(draft: DraftForEdit, handles: { venmo?: string; paypal?: string }): ComposerInitial` (the composer has one 2nd-place field, so several 2nd-place items, possible only through the API, come back joined with ", " rather than silently dropped).

- [ ] **Step 1: Write the failing domain tests**

In `src/domain/breaks/commands.test.ts`, change the import line

```ts
import { createDraft, openBreak } from "./commands";
```

to

```ts
import { createDraft, openBreak, updateDraft } from "./commands";
```

and append at the end of the file:

```ts
describe("updateDraft", () => {
  it("replaces a draft's settings and prizes and logs break.updated", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, secondPlace: [{ name: "Flight pack" }] });
      await updateDraft(tx, asHost(host), breakId, {
        title: "Target Chronos v2", lineCount: 20, linePriceCents: 500, claimMode: "straight",
        items: [{ name: "Chronos 26g" }], secondPlace: [], paymentHandles: { venmo: "Jim-R" },
      });
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.break).toMatchObject({
        title: "Target Chronos v2", lineCount: 20, linePriceCents: 500, claimMode: "straight", allowRandomClaims: false,
        status: "draft", paymentInstructions: "Venmo @Jim-R. Leave the note blank.",
      });
      expect(page.items.map((i) => i.name)).toEqual(["Chronos 26g"]);
      expect(page.prizes.map((p) => p.rank)).toEqual([1]);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.updated'`);
      expect(evs).toHaveLength(1);
    });
  });
  it("refuses anyone but the host and changes nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const otherHost = await makeUser(tx, { role: "host" }); const member = await makeUser(tx);
      const { breakId } = await createDraft(tx, asHost(host), input);
      await expect(updateDraft(tx, asMember(member), breakId, { ...input, title: "Hijacked" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateDraft(tx, asHost(otherHost), breakId, { ...input, title: "Hijacked" })).rejects.toBeInstanceOf(NotAuthorized);
      expect((await getBreakPage(tx, breakId))!.break.title).toBe("Target Chronos");
    });
  });
  it("refuses a break that is already open and leaves its prizes alone", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, items: [{ name: "Other" }] })).rejects.toBeInstanceOf(NotOpen);
      expect((await getBreakPage(tx, breakId))!.items.map((i) => i.name).sort()).toEqual(["Chronos 22g", "Chronos 24g"]);
    });
  });
  it("validates like createDraft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, lineCount: 51 })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateDraft(tx, asHost(host), breakId, { ...input, claimMode: "random_only" as never })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
});
```

In `src/domain/breaks/queries.test.ts`, change the import line

```ts
import { hostProfile, hostTrust, lastBreakDefaults, listHostBreaks } from "./queries";
```

to

```ts
import { draftForEdit, hostProfile, hostTrust, isGeneratedInstructions, lastBreakDefaults, listHostBreaks } from "./queries";
import { createDraft } from "./commands";
```

and append at the end of the file:

```ts
describe("draftForEdit", () => {
  it("reads a draft's settings and its prize names by rank", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asCaller(host, "host"), {
        title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight",
        items: [{ name: "22g" }, { name: "24g" }], secondPlace: [{ name: "Flights" }],
      });
      const d = await draftForEdit(tx, breakId);
      expect(d).toMatchObject({ id: breakId, hostId: host.id, status: "draft", title: "Edit me", lineCount: 10, linePriceCents: 500, claimMode: "straight", maxLinesPerUser: null, secondPlace: ["Flights"] });
      expect([...d!.topSpot].sort()).toEqual(["22g", "24g"]);
      expect(await draftForEdit(tx, randomUUID())).toBeNull();
    });
  });
  it("knows instructions built from handles", () => {
    expect(isGeneratedInstructions("Venmo @Jim. PayPal paypal.me/Jim. Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Leave the note blank.")).toBe(true);
    expect(isGeneratedInstructions("Zelle only. Leave the note blank.")).toBe(false);
  });
});
```

Create `src/app/host/new/initial.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftComposerInitial, newComposerInitial } from "./initial";

describe("composer initial values", () => {
  it("starts a new break from the host's last one, or from the defaults", () => {
    expect(newComposerInitial(null, {})).toEqual({
      breakId: null, title: "", description: "", lineCount: 50, price: "5", paymentWindowHours: "", maxLinesPerUser: "",
      claimMode: "pick_or_random", paymentInstructions: "", venmo: "", paypal: "", prize1: [""], prize2: "",
    });
    expect(newComposerInitial(
      { lineCount: 20, linePriceCents: 550, paymentWindowHours: 12, maxLinesPerUser: 3, claimMode: "straight", paymentInstructions: "Zelle only." },
      { venmo: "@Jim", paypal: "JimR" },
    )).toMatchObject({ lineCount: 20, price: "5.50", paymentWindowHours: "12", maxLinesPerUser: "3", claimMode: "straight", paymentInstructions: "Zelle only.", venmo: "@Jim", paypal: "JimR" });
  });
  it("fills the form from a draft, dropping instructions that were built from handles", () => {
    const d = {
      id: "b1", hostId: "h1", status: "draft", title: "Chronos", description: "Mint", lineCount: 30, linePriceCents: 125000,
      paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const,
      paymentInstructions: "Venmo @Jim. Leave the note blank.", topSpot: ["22g", "24g"], secondPlace: ["Flights"],
    };
    expect(draftComposerInitial(d, { venmo: "@Jim" })).toEqual({
      breakId: "b1", title: "Chronos", description: "Mint", lineCount: 30, price: "1250", paymentWindowHours: "24", maxLinesPerUser: "",
      claimMode: "pick_only", paymentInstructions: "", venmo: "@Jim", paypal: "", prize1: ["22g", "24g"], prize2: "Flights",
    });
    expect(draftComposerInitial({ ...d, topSpot: [], secondPlace: [], paymentInstructions: "Zelle only." }, {}))
      .toMatchObject({ prize1: [""], prize2: "", paymentInstructions: "Zelle only." });
  });
  it("keeps every 2nd-place name a draft holds in the one 2nd-place field", () => {
    const d = {
      id: "b1", hostId: "h1", status: "draft", title: "Chronos", description: "", lineCount: 30, linePriceCents: 500,
      paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_only" as const,
      paymentInstructions: "", topSpot: ["22g"], secondPlace: ["Flights", "Darts case"],
    };
    expect(draftComposerInitial(d, {}).prize2).toBe("Flights, Darts case");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/breaks src/app/host/new`
Expected: FAIL: `updateDraft`, `draftForEdit`, `isGeneratedInstructions` are not exported, and `./initial` does not exist.

- [ ] **Step 3: Write `updateDraft`**

In `src/domain/breaks/commands.ts`, replace the two prize loops at the end of `createDraft`

```ts
  for (const item of input.items) {
    const [it] = await tx.insert(breakItems).values({
      breakId: b.id, name: item.name.trim(), variantSchema: item.variantSchema ?? null, expectedShipAt: item.expectedShipAt ?? null,
    }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: it.id });
  }
  for (const item of input.secondPlace ?? []) {
    if (!item.name.trim()) continue;
    const [it] = await tx.insert(breakItems).values({ breakId: b.id, name: item.name.trim() }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId: b.id, rank: 2, itemId: it.id });
  }
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.created", payload: { claimMode } });
```

with

```ts
  await insertPrizes(tx, b.id, input);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.created", payload: { claimMode } });
```

Then add, directly above `export async function createDraft`:

```ts
/** Rank-1 items (several make a choice) and rank-2 items (blank names skipped), each with its prize row. */
async function insertPrizes(tx: Tx, breakId: string, input: Pick<CreateDraftInput, "items" | "secondPlace">): Promise<void> {
  for (const item of input.items) {
    const [it] = await tx.insert(breakItems).values({
      breakId, name: item.name.trim(), variantSchema: item.variantSchema ?? null, expectedShipAt: item.expectedShipAt ?? null,
    }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId, rank: 1, itemId: it.id });
  }
  for (const item of input.secondPlace ?? []) {
    if (!item.name.trim()) continue;
    const [it] = await tx.insert(breakItems).values({ breakId, name: item.name.trim() }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId, rank: 2, itemId: it.id });
  }
}
```

and add, directly below `createDraft`:

```ts
/**
 * Design §5.6: drafts can be edited, by their host (or an admin) only. Replaces the settings and every prize in one
 * transaction; payment handles go to the break's host's profile, as createDraft does for the caller.
 */
export async function updateDraft(tx: Tx, caller: Caller, breakId: string, input: CreateDraftInput): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, breakId); // locks the break row first
  if (b.status !== "draft") throw new NotOpen(b.status);
  validateDraftInput(input);
  const claimMode = input.claimMode ?? "pick_or_random";
  if (!isClaimMode(claimMode)) throw new InvalidInput("Choose how buyers get lines");
  let paymentInstructions = input.paymentInstructions?.trim() ?? "";
  if (input.paymentHandles) {
    const handles = cleanHandles(input.paymentHandles);
    await savePaymentHandles(tx, b.hostId, handles);
    if (!paymentInstructions) paymentInstructions = defaultPaymentInstructions(handles);
  }
  await tx.update(breaks).set({
    title: input.title.trim(), description: input.description ?? "", lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    claimMode, allowRandomClaims: claimMode === "pick_or_random", paymentInstructions,
  }).where(eq(breaks.id, b.id));
  // Prizes reference items: delete them first. A draft has no paid line, so the items guard allows both.
  await tx.delete(prizes).where(eq(prizes.breakId, b.id));
  await tx.delete(breakItems).where(eq(breakItems.breakId, b.id));
  await insertPrizes(tx, b.id, input);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.updated", payload: { claimMode } });
  return { breakId: b.id };
}
```

- [ ] **Step 4: Write the draft read**

In `src/domain/breaks/queries.ts`, in `lastBreakDefaults` replace

```ts
  // Instructions built from handles ("Venmo @x. Leave the note blank.") go stale when a handle changes: carry only typed ones.
  const generated = /^(Venmo \S+\. )?(PayPal paypal\.me\/\S+\. )?Leave the note blank\.$/.test(r.paymentInstructions.trim());
  return { ...r, paymentInstructions: generated ? "" : r.paymentInstructions };
```

with

```ts
  return { ...r, paymentInstructions: isGeneratedInstructions(r.paymentInstructions) ? "" : r.paymentInstructions };
```

add, directly above `export type LastBreakDefaults`:

```ts
/** Instructions built from handles ("Venmo @x. Leave the note blank.") go stale when a handle changes: forms carry only typed ones. */
export const isGeneratedInstructions = (s: string): boolean => /^(Venmo \S+\. )?(PayPal paypal\.me\/\S+\. )?Leave the note blank\.$/.test(s.trim());
```

and append at the end of the file:

```ts
export type DraftForEdit = {
  id: string; hostId: string; status: string; title: string; description: string; lineCount: number; linePriceCents: number;
  paymentWindowHours: number; maxLinesPerUser: number | null; claimMode: ClaimMode; paymentInstructions: string;
  topSpot: string[]; secondPlace: string[];
};

/** A break's editable fields and prize names by rank. The caller decides who may see it (drafts: the host and admins). */
export async function draftForEdit(tx: Tx, breakId: string): Promise<DraftForEdit | null> {
  const page = await getBreakPage(tx, breakId);
  if (!page) return null;
  const nameOf = new Map(page.items.map((i) => [i.id, i.name]));
  const names = (rank: number) => page.prizes.flatMap((p) => (p.rank === rank && p.itemId && nameOf.has(p.itemId) ? [nameOf.get(p.itemId)!] : []));
  const b = page.break;
  return {
    id: b.id, hostId: b.hostId, status: b.status, title: b.title, description: b.description, lineCount: b.lineCount, linePriceCents: b.linePriceCents,
    paymentWindowHours: b.paymentWindowHours, maxLinesPerUser: b.maxLinesPerUser, claimMode: b.claimMode, paymentInstructions: b.paymentInstructions,
    topSpot: names(1), secondPlace: names(2),
  };
}
```

- [ ] **Step 5: Write the composer's starting values**

Create `src/app/host/new/initial.ts`:

```ts
import { isGeneratedInstructions, type DraftForEdit, type LastBreakDefaults } from "@/domain/breaks/queries";
import type { ClaimMode } from "@/domain/breaks/rules";
import { formatMoney } from "@/lib/money";

/** Everything the composer starts from, as the strings its fields hold. `breakId` is set when editing a draft. */
export type ComposerInitial = {
  breakId: string | null; title: string; description: string; lineCount: number; price: string;
  paymentWindowHours: string; maxLinesPerUser: string; claimMode: ClaimMode; paymentInstructions: string;
  venmo: string; paypal: string; prize1: string[]; prize2: string;
};

type Handles = { venmo?: string; paypal?: string };

/** 550 → "5.50", 125000 → "1250": what parseComposer reads back to the same cents. */
const dollars = (cents: number) => formatMoney(cents).replace(/[$,]/g, "");

/** A new break starts from the host's last one (design §5.6), or from 50 lines at $5. */
export function newComposerInitial(defaults: LastBreakDefaults | null, handles: Handles): ComposerInitial {
  return {
    breakId: null, title: "", description: "",
    lineCount: defaults?.lineCount ?? 50,
    price: defaults ? dollars(defaults.linePriceCents) : "5",
    paymentWindowHours: defaults ? String(defaults.paymentWindowHours) : "",
    maxLinesPerUser: defaults?.maxLinesPerUser != null ? String(defaults.maxLinesPerUser) : "",
    claimMode: defaults?.claimMode ?? "pick_or_random",
    paymentInstructions: defaults?.paymentInstructions ?? "",
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    prize1: [""], prize2: "",
  };
}

/** Editing a draft starts from the draft itself. */
export function draftComposerInitial(d: DraftForEdit, handles: Handles): ComposerInitial {
  return {
    breakId: d.id, title: d.title, description: d.description, lineCount: d.lineCount, price: dollars(d.linePriceCents),
    paymentWindowHours: String(d.paymentWindowHours),
    maxLinesPerUser: d.maxLinesPerUser != null ? String(d.maxLinesPerUser) : "",
    claimMode: d.claimMode,
    paymentInstructions: isGeneratedInstructions(d.paymentInstructions) ? "" : d.paymentInstructions,
    venmo: handles.venmo ?? "", paypal: handles.paypal ?? "",
    // The composer has one 2nd-place field: a draft with several 2nd-place items (only possible through the API)
    // keeps every name in it rather than silently losing all but the first when it is saved again.
    prize1: d.topSpot.length > 0 ? d.topSpot : [""], prize2: d.secondPlace.join(", "),
  };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/domain/breaks src/app/host/new`
Expected: PASS.

- [ ] **Step 7: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. Nothing consumes the new functions yet; `createDraft` behaves as before (its prize loops only moved into `insertPrizes`).

- [ ] **Step 8: Commit**

```bash
git add src/domain/breaks src/app/host/new/initial.ts src/app/host/new/initial.test.ts
git commit -m "feat(host): updateDraft, the draft read and the composer's starting values"
```

---

### Task 6b: Draft editing, the pages (model: sonnet)

The UI half of design §5.6's last line: the composer takes its starting values from `ComposerInitial` (Task 6a) and posts a hidden `breakId` when editing, the edit route `/host/{id}/edit` 404s for anyone but the host and admins (like the draft itself), and the draft's page gets an "Edit draft" button. The e2e suite gains a `composeBreak` helper that every later page test uses.

**Files:**
- Modify: `src/app/host/new/form.tsx` (whole file), `src/app/host/new/actions.ts` (whole file), `src/app/host/new/page.tsx` (whole file)
- Create: `src/app/host/[id]/edit/page.tsx`
- Modify: `src/app/b/[id]/page.tsx` (Edit draft button)
- Modify: `e2e/helpers.ts` (add `composeBreak`), `e2e/pages.spec.ts` (draft test)

**Interfaces:**
- Consumes (Task 6a): `updateDraft(tx, caller, breakId: string, input: CreateDraftInput): Promise<{ breakId: string }>`; `draftForEdit(tx, breakId: string): Promise<DraftForEdit | null>`; `type ComposerInitial = { breakId: string | null; title: string; description: string; lineCount: number; price: string; paymentWindowHours: string; maxLinesPerUser: string; claimMode: ClaimMode; paymentInstructions: string; venmo: string; paypal: string; prize1: string[]; prize2: string }`; `type DraftForEdit = { id: string; hostId: string; status: string; title: string; description: string; lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null; claimMode: ClaimMode; paymentInstructions: string; topSpot: string[]; secondPlace: string[] }`; `newComposerInitial(defaults, handles)`, `draftComposerInitial(draft, handles)` (`src/app/host/new/initial.ts`). Also `createDraft`, `openBreak`, `hostPaymentHandles`, `lastBreakDefaults`, `isHostView`, `MAX_LINES`, `isUuid`, `parseComposer`, `ButtonLink`.
- Produces:
  - `ComposerForm({ initial: ComposerInitial; maxLines: number })`; the form posts a hidden `breakId` when editing.
  - Test id `edit-draft`; e2e helper `composeBreak(page: Page, o: { title: string; lineCount?: number; price?: string; intent?: "open" | "draft"; mode?: PickingMode }): Promise<string>`.

- [ ] **Step 1: Make the composer edit drafts**

Replace the whole of `src/app/host/new/form.tsx` with:

```tsx
"use client";
import { useActionState, useState } from "react";
import { saveBreak, type ComposerState } from "./actions";
import { previewText } from "./preview";
import type { ComposerInitial } from "./initial";
import { Button } from "@/components/button";
import { Stepper } from "@/components/stepper";
import { GridPreview } from "@/components/grid/grid-preview";

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";
const area = "w-full rounded-input border border-wire-strong bg-card px-3 py-2";
const label = "block text-small font-semibold";
const MODES = [
  { value: "pick_or_random", title: "Pick or random", help: "Buyers pick lines or take random ones." },
  { value: "pick_only", title: "Pick only, no randoms", help: "Buyers pick every line themselves." },
  { value: "straight", title: "Straight fill", help: "Buyers say how many and get the next open numbers." },
] as const;

type Props = {
  /** Starting values: the host's last break for a new break, the draft itself when editing (initial.breakId set). */
  initial: ComposerInitial;
  /** MAX_LINES, passed from the server page so this client file imports no domain values. */
  maxLines: number;
};

export function ComposerForm({ initial, maxLines }: Props) {
  const [state, submit, pending] = useActionState<ComposerState, FormData>(saveBreak, null);
  const [lineCount, setLineCount] = useState(initial.lineCount);
  const [price, setPrice] = useState(initial.price);
  const [choices, setChoices] = useState<string[]>(initial.prize1);
  const [second, setSecond] = useState(initial.prize2 !== "");
  const preview = previewText(lineCount, price);
  const val = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form action={submit} className="mt-4 space-y-8">
      {/* Enter in a text field presses the first submit button in the DOM: make that a harmless draft save. */}
      <button type="submit" name="intent" value="draft" hidden aria-hidden tabIndex={-1} />
      {initial.breakId && <input type="hidden" name="breakId" value={initial.breakId} />}
      <div className="space-y-1">
        <label htmlFor="title" className={label}>Title</label>
        <input id="title" name="title" defaultValue={val("title", initial.title)} required maxLength={120} placeholder="Target Phil Taylor Chronos" className={field} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-headline font-semibold">Prize</legend>
        {choices.map((value, i) => (
          <div key={i} className="space-y-1">
            <label htmlFor={`prize1-${i}`} className={label}>{i === 0 ? "Top spot gets" : "or"}</label>
            <div className="flex gap-2">
              <input id={`prize1-${i}`} name="prize1" required={i === 0} value={value} maxLength={120}
                onChange={(e) => setChoices((cur) => cur.map((c, j) => (j === i ? e.target.value : c)))}
                placeholder={i === 0 ? "Chronos 22g steel" : "Chronos 18g soft"} className={field} />
              {i > 0 && <Button variant="text" onClick={() => setChoices((cur) => cur.filter((_, j) => j !== i))}>Remove</Button>}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-4">
          <Button variant="text" onClick={() => setChoices((cur) => [...cur, ""])}>Add a choice</Button>
          {!second && <Button variant="text" onClick={() => setSecond(true)}>Add 2nd place</Button>}
        </div>
        {second && (
          <div className="space-y-1">
            <label htmlFor="prize2" className={label}>2nd place gets</label>
            <input id="prize2" name="prize2" defaultValue={val("prize2", initial.prize2)} maxLength={120} placeholder="Flight pack" className={field} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-headline font-semibold">Lines</legend>
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <span className={label}>Lines</span>
            <Stepper label="Lines" name="lineCount" value={lineCount} min={2} max={maxLines} onChange={setLineCount} />
          </div>
          <div className="space-y-1">
            <label htmlFor="linePrice" className={label}>Price per line, $</label>
            <input id="linePrice" name="linePrice" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} w-32`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="paymentWindowHours" className={label}>Hours to pay</label>
            <input id="paymentWindowHours" name="paymentWindowHours" inputMode="numeric" placeholder="24" defaultValue={val("paymentWindowHours", initial.paymentWindowHours)} className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="maxLinesPerUser" className={label}>Lines per person</label>
            <input id="maxLinesPerUser" name="maxLinesPerUser" inputMode="numeric" placeholder="No limit" defaultValue={val("maxLinesPerUser", initial.maxLinesPerUser)} className={field} />
          </div>
        </div>
        <div role="radiogroup" aria-label="Picking mode" className="space-y-2">
          <span className={label}>Picking mode</span>
          {MODES.map((m) => (
            <label key={m.value} className="flex min-h-11 items-start gap-3 rounded-input border border-wire-strong bg-card px-3 py-2">
              <input type="radio" name="claimMode" value={m.value} defaultChecked={m.value === val("claimMode", initial.claimMode)} className="mt-1 size-5 accent-[var(--ink)]" />
              <span><span className="block font-semibold">{m.title}</span><span className="block text-small text-ink-2">{m.help}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-headline font-semibold">Payment</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="venmo" className={label}>Venmo handle</label>
            <input id="venmo" name="venmo" defaultValue={val("venmo", initial.venmo)} placeholder="@Jim-Roberts-36" autoCapitalize="none" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="paypal" className={label}>PayPal.me name</label>
            <input id="paypal" name="paypal" defaultValue={val("paypal", initial.paypal)} placeholder="JamesRoberts603182" autoCapitalize="none" className={field} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="paymentInstructions" className={label}>Payment instructions</label>
          <textarea id="paymentInstructions" name="paymentInstructions" rows={2} maxLength={500} placeholder="Leave blank to build them from your handles" defaultValue={val("paymentInstructions", initial.paymentInstructions)} className={area} />
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-headline font-semibold">About</legend>
        <label htmlFor="description" className="sr-only">Description</label>
        <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={val("description", initial.description)} placeholder="Condition, shipping, anything buyers should know" className={area} />
      </fieldset>

      <div className="flex items-center gap-4 rounded-card border border-wire bg-card p-3">
        <GridPreview count={lineCount} size={64} />
        <p className="font-condensed text-headline font-semibold tabular" aria-live="polite">{preview}</p>
      </div>

      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" name="intent" value="open" disabled={pending} data-testid="composer-open">Open break</Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending} data-testid="composer-draft">Save draft</Button>
      </div>
    </form>
  );
}
```

Replace the whole of `src/app/host/new/actions.ts` with:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { isUuid } from "@/lib/is-uuid";
import { createDraft, openBreak, updateDraft } from "@/domain/breaks/commands";
import { parseComposer } from "./parse";

/** On error the submitted values come back so the form can refill its fields (React 19 resets uncontrolled ones). */
export type ComposerState = { error?: string; values?: Record<string, string> } | null;

function submitted(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "intent" && !k.startsWith("$") && !(k in out)) out[k] = v;
  return out;
}

/** Save draft or Open break, decided by the submit button's `intent`; a hidden `breakId` means "this draft". */
export async function saveBreak(_: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = parseComposer(form);
  if (!parsed.ok) return { error: parsed.error, values: submitted(form) };
  const rawId = form.get("breakId");
  const editing = typeof rawId === "string" && rawId !== "" ? rawId : null;
  if (editing !== null && !isUuid(editing)) return { error: "This draft could not be found.", values: submitted(form) };
  const r = await action(async (tx, caller) => {
    const { breakId } = editing ? await updateDraft(tx, caller, editing, parsed.input) : await createDraft(tx, caller, parsed.input);
    if (parsed.open) await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message, values: submitted(form) };
  revalidatePath("/host");
  revalidatePath(`/b/${r.data}`);
  redirect(`/b/${r.data}`);
}
```

Replace the whole of `src/app/host/new/page.tsx` with:

```tsx
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { hostPaymentHandles, lastBreakDefaults } from "@/domain/breaks/queries";
import { MAX_LINES } from "@/domain/breaks/rules";
import { ComposerForm } from "./form";
import { newComposerInitial } from "./initial";

export const metadata = { title: "New break" };

export default async function NewBreakPage() {
  const caller = await requireCaller("/host/new");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { handles, defaults } = await db.transaction(async (tx) => ({
    handles: await hostPaymentHandles(tx, caller.id),
    defaults: await lastBreakDefaults(tx, caller.id),
  }));
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">New break</h1>
      <ComposerForm initial={newComposerInitial(defaults, handles)} maxLines={MAX_LINES} />
    </main>
  );
}
```

Create `src/app/host/[id]/edit/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { draftForEdit, hostPaymentHandles } from "@/domain/breaks/queries";
import { isHostView } from "@/domain/breaks/grid";
import { MAX_LINES } from "@/domain/breaks/rules";
import { isUuid } from "@/lib/is-uuid";
import { ComposerForm } from "../../new/form";
import { draftComposerInitial } from "../../new/initial";

export const metadata = { title: "Edit draft" };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const caller = await requireCaller(`/host/${id}/edit`);
  const data = await db.transaction(async (tx) => {
    const draft = await draftForEdit(tx, id);
    if (!draft || !isHostView(draft.hostId, caller)) return null;
    return { draft, handles: await hostPaymentHandles(tx, draft.hostId) };
  });
  // Drafts are private: anyone but the host (or an admin) gets the same 404 as a missing break.
  if (!data) notFound();
  if (data.draft.status !== "draft") redirect(`/b/${id}`);
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Edit draft</h1>
      <ComposerForm initial={draftComposerInitial(data.draft, data.handles)} maxLines={MAX_LINES} />
    </main>
  );
}
```

- [ ] **Step 2: Put "Edit draft" on the draft's page**

In `src/app/b/[id]/page.tsx`, replace

```tsx
import { CopyButton } from "@/components/copy-button";
```

with

```tsx
import { CopyButton } from "@/components/copy-button";
import { ButtonLink } from "@/components/button";
```

and replace

```tsx
          {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
```

with

```tsx
          {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
          {grid.hostView && status === "draft" && <ButtonLink href={`/host/${id}/edit`} variant="secondary" data-testid="edit-draft">Edit draft</ButtonLink>}
```

- [ ] **Step 3: Add the e2e helper and the draft test (updates `e2e/helpers.ts` and `e2e/pages.spec.ts`)**

Replace the whole of `e2e/helpers.ts` with:

```ts
import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, role: "member" | "host" = "member") {
  await page.goto(`/test/login?email=${encodeURIComponent(email)}&role=${role}&secret=e2e`);
  await page.waitForURL("/");
}

export type PickingMode = "Pick or random" | "Pick only, no randoms" | "Straight fill";

/** Fills /host/new as a signed-in host and submits it; returns the break's URL. */
export async function composeBreak(page: Page, o: { title: string; lineCount?: number; price?: string; intent?: "open" | "draft"; mode?: PickingMode }): Promise<string> {
  await page.goto("/host/new");
  await page.fill("input[name=title]", o.title);
  await page.fill("input[name=prize1]", "Chronos 22g");
  await page.fill("input[name=venmo]", "@e2e-host");
  await page.fill("input[name=lineCount]", String(o.lineCount ?? 4));
  await page.fill("input[name=linePrice]", o.price ?? "5");
  if (o.mode) await page.getByRole("radio", { name: new RegExp(`^${o.mode}`) }).check();
  await page.getByTestId(o.intent === "draft" ? "composer-draft" : "composer-open").click();
  await page.waitForURL(/\/b\/[0-9a-f-]{36}$/);
  return page.url();
}
```

In `e2e/pages.spec.ts`, change the import line

```ts
import { loginAs } from "./helpers";
```

to

```ts
import { composeBreak, loginAs } from "./helpers";
```

and append at the end of the file:

```ts
test("a host saves a draft and edits it; nobody else can see either page", async ({ browser }) => {
  const host = await as(browser, `dh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Draft ${run}`, intent: "draft" });
  const id = url.split("/b/")[1];
  await host.getByTestId("edit-draft").click();
  await host.waitForURL(new RegExp(`/host/${id}/edit$`));
  await expect(host.locator("input[name=title]")).toHaveValue(`Draft ${run}`);
  await host.fill("input[name=title]", `Edited ${run}`);
  await host.getByTestId("composer-draft").click();
  await host.waitForURL(url);
  await expect(host.getByRole("heading", { level: 1 })).toHaveText(`Edited ${run}`);
  const stranger = await as(browser, `ds${run}@e2e.test`);
  expect((await stranger.goto(url))?.status()).toBe(404);
  expect((await stranger.goto(`/host/${id}/edit`))?.status()).toBe(404);
});
```

- [ ] **Step 4: Optional: check by hand**

If you have a browser tool: as a host in `pnpm dev`, save a draft, use Edit draft, add a choice and a 2nd place, then Open break from the edit page. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 5: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. `journey-1` and `layout.spec` still create breaks through `/host/new` with the same field names and test ids.

- [ ] **Step 6: Commit**

```bash
git add src/app/host "src/app/b/[id]/page.tsx" e2e/helpers.ts e2e/pages.spec.ts
git commit -m "feat(host): edit drafts, private to their host"
```

---

### Task 7a: Handle availability, the domain half: rate limits by IP hash and by user (model: opus)

Design §5.10: the onboarding handle field shows live availability. An open "is this handle taken" endpoint is an enumeration oracle, so it is limited: signed-in callers only (onboarding always has a session), at most 30 checks a minute per IP hash and 60 a minute per user whatever address they come from (fixed windows, counted in a new `rate_limits` table, migration 0003). An IPv6 address is bucketed by its /64 before hashing, so rotating through one subscriber's prefix buys nothing. Handles are normalised exactly as onboarding stores them (`normalizeHandle`: NFKC, lower case, reserved names), and the answer is `free`, `taken`, `invalid` or `limited` and nothing else. Onboarding still decides for real: the unique index and `completeOnboarding` stay the source of truth. The tick job prunes windows older than a day. This task is the domain half; Task 7b adds the endpoint and the field. The counters are the recorded exemption from "every state change appends an events row" (Global Constraints).

**Files:**
- Modify: `src/db/schema.ts` (append `rateLimits`)
- Create (generated, then appended): `src/db/migrations/0003_rate_limits.sql`; Create (generated): `src/db/migrations/meta/0003_snapshot.json`; Modify (generated): `src/db/migrations/meta/_journal.json`
- Create: `src/domain/rate-limit.ts`, `src/domain/rate-limit.test.ts`
- Create: `src/lib/ip-bucket.ts`, `src/lib/ip-bucket.test.ts`
- Modify: `src/domain/users/queries.ts` (append `handleStatus`)
- Create: `src/domain/users/handle-check.ts`, `src/domain/users/handle-check.test.ts`
- Modify: `src/jobs/tick.ts` (prune)
- Modify: `tests/concurrency/setup.ts` (truncate `rate_limits` too)

**Interfaces:**
- Consumes: `normalizeHandle` (`src/domain/users/commands.ts`), `accountOf` (`src/domain/users/queries.ts`, Task 5, kept verbatim).
- Produces:
  - Table `rate_limits(id uuid pk, bucket text, window_start timestamptz, hits int default 0, created_at)`, unique `(bucket, window_start)`, RLS enabled and forced. Drizzle: `rateLimits`.
  - `hitRateLimit(tx, { bucket: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; hits: number; retryAfter: number }>`; `pruneRateLimits(tx, now: Date): Promise<number>`.
  - `src/lib/ip-bucket.ts`: `ipBucket(ip: string): string` — IPv4 whole, IPv4-mapped IPv6 as its IPv4, IPv6 as `"<first four hextets>::/64"`, anything unparseable unchanged.
  - `type HandleState = { state: "free" | "taken" } | { state: "invalid"; message: string }`; `handleStatus(tx, raw: string, selfId: string): Promise<HandleState>`.
  - `HANDLE_CHECKS_PER_MINUTE = 30` (per IP hash), `HANDLE_CHECKS_PER_USER_PER_MINUTE = 60`; `checkHandle(tx, { raw: string; callerId: string; ipHash: string | null; now: Date }): Promise<HandleState | { state: "limited"; retryAfter: number }>` — every call counts against `handle:user:<id>`, and against `handle:ip:<hash>` when the request carries an IP.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/rate-limit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { hitRateLimit, pruneRateLimits } from "./rate-limit";

describe("hitRateLimit", () => {
  it("counts hits per bucket in fixed windows and says when to retry", async () => {
    await withTx(async (tx) => {
      const bucket = `test:${randomUUID()}`;
      const now = new Date("2026-10-14T12:00:10Z");
      const hit = (at = now) => hitRateLimit(tx, { bucket, limit: 2, windowSeconds: 60, now: at });
      expect(await hit()).toEqual({ allowed: true, hits: 1, retryAfter: 50 });
      expect((await hit()).allowed).toBe(true);
      expect(await hit()).toEqual({ allowed: false, hits: 3, retryAfter: 50 });
      expect((await hitRateLimit(tx, { bucket: `${bucket}:other`, limit: 2, windowSeconds: 60, now })).allowed).toBe(true);
      expect(await hit(new Date("2026-10-14T12:01:00Z"))).toEqual({ allowed: true, hits: 1, retryAfter: 60 });
    });
  });
  it("prunes windows older than a day", async () => {
    await withTx(async (tx) => {
      const bucket = `test:${randomUUID()}`;
      await hitRateLimit(tx, { bucket, limit: 5, windowSeconds: 60, now: new Date("2026-10-12T12:00:00Z") });
      await hitRateLimit(tx, { bucket, limit: 5, windowSeconds: 60, now: new Date("2026-10-14T11:59:00Z") });
      expect(await pruneRateLimits(tx, new Date("2026-10-14T12:00:00Z"))).toBeGreaterThanOrEqual(1);
      const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from rate_limits where bucket = ${bucket}`);
      expect(r.n).toBe(1);
    });
  });
});
```

Create `src/domain/users/handle-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { checkHandle, HANDLE_CHECKS_PER_MINUTE, HANDLE_CHECKS_PER_USER_PER_MINUTE } from "./handle-check";

const fullwidth = (s: string) => [...s].map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join("");

describe("checkHandle (Review Focus 3)", () => {
  it("answers taken, free or invalid, normalising like onboarding, and says nothing else", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { handle: `jim_${randomUUID().slice(0, 8)}` });
      const me = await makeUser(tx);
      const ipHash = `ip-${randomUUID()}`;
      const now = new Date();
      const ask = (raw: string, callerId = me.id) => checkHandle(tx, { raw, callerId, ipHash, now });
      expect(await ask(jim.handle)).toEqual({ state: "taken" });
      expect(await ask(jim.handle.toUpperCase())).toEqual({ state: "taken" });
      expect(await ask(fullwidth(jim.handle))).toEqual({ state: "taken" });
      expect(await ask(`free_${randomUUID().slice(0, 8)}`)).toEqual({ state: "free" });
      expect(await ask(me.handle)).toEqual({ state: "free" }); // your own handle is yours to keep
      expect(await ask("admin")).toEqual({ state: "invalid", message: "That handle is reserved" });
      expect(await ask("ab")).toEqual({ state: "invalid", message: "Handle must be 3–20 letters, numbers or underscores" });
    });
  });

  it("limits each IP hash to 30 checks a minute, whatever the handle", async () => {
    await withTx(async (tx) => {
      const me = await makeUser(tx);
      const ipHash = `ip-${randomUUID()}`;
      const now = new Date("2026-10-14T12:00:00Z");
      for (let i = 0; i < HANDLE_CHECKS_PER_MINUTE; i++) {
        expect((await checkHandle(tx, { raw: `try_${i}_x`, callerId: me.id, ipHash, now })).state).not.toBe("limited");
      }
      expect(await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash, now })).toEqual({ state: "limited", retryAfter: 60 });
      expect((await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).state).toBe("free");
      expect((await checkHandle(tx, { raw: "another_one", callerId: me.id, ipHash: null, now })).state).toBe("free");
    });
  });

  it("limits one user to 60 checks a minute however many addresses they rotate through", async () => {
    await withTx(async (tx) => {
      const me = await makeUser(tx);
      const now = new Date("2026-10-14T12:00:00Z");
      for (let i = 0; i < HANDLE_CHECKS_PER_USER_PER_MINUTE; i++) {
        expect((await checkHandle(tx, { raw: `rot_${i}_x`, callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).state).not.toBe("limited");
      }
      expect(await checkHandle(tx, { raw: "one_more", callerId: me.id, ipHash: `ip-${randomUUID()}`, now })).toEqual({ state: "limited", retryAfter: 60 });
    });
  });
});
```

Create `src/lib/ip-bucket.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ipBucket } from "./ip-bucket";

describe("ipBucket", () => {
  it("keeps an IPv4 address whole", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
  it("folds an IPv6 address to its /64, however it is written", () => {
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:0DB8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
  it("leaves anything it cannot read unchanged", () => {
    expect(ipBucket("not-an-ip")).toBe("not-an-ip");
    expect(ipBucket("fe80::1%eth0")).toBe("fe80::1%eth0");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/rate-limit.test.ts src/domain/users/handle-check.test.ts src/lib/ip-bucket.test.ts`
Expected: FAIL: the three modules do not exist.

- [ ] **Step 3: Add the table to the schema**

Append to `src/db/schema.ts`:

```ts
/** Fixed-window counters for rate limits (handle checks). Buckets carry an IP hash or a user id, never a raw address. */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  bucket: text("bucket").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("rate_limits_bucket_window_uq").on(t.bucket, t.windowStart)]);
```

- [ ] **Step 4: Generate migration 0003 and append its RLS**

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name rate_limits`
Expected: drizzle-kit writes `src/db/migrations/0003_rate_limits.sql`, `meta/0003_snapshot.json` and a `_journal.json` entry tagged `0003_rate_limits`, without prompting. The SQL must hold exactly two statements: `CREATE TABLE "rate_limits"` with the columns `id` (uuid primary key, default `gen_random_uuid()`), `bucket` (text not null), `window_start` (timestamptz not null), `hits` (integer default 0 not null), `created_at` (timestamptz default now() not null), and `CREATE UNIQUE INDEX "rate_limits_bucket_window_uq" ON "rate_limits" USING btree ("bucket","window_start")`. If drizzle-kit prompts or writes anything else, stop and report BLOCKED: migration (Global Constraints). Check the journal order: `node -e 'const j=require("./src/db/migrations/meta/_journal.json");const e=j.entries;console.log(e[3].when>e[2].when?"ok":"BAD")'` must print `ok`; if it prints `BAD`, stop and report BLOCKED: migration.

Append to the end of `src/db/migrations/0003_rate_limits.sql`:

```sql
--> statement-breakpoint
-- Deny-all RLS backstop, as 0000 did for every table that existed then (tests/ci/rls.test.ts checks every public table).
alter table rate_limits enable row level security;
--> statement-breakpoint
alter table rate_limits force row level security;
```

Run: `ENV_FILE=.env.local pnpm db:migrate && ENV_FILE=.env.test pnpm db:migrate`
Expected: `migrated` twice.

- [ ] **Step 5: Write the limiter, the bucket, the status and the check**

Create `src/domain/rate-limit.ts`:

```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { rateLimits } from "@/db/schema";

/** Fixed-window counter: records this hit and says whether it is within `limit` for the window `now` falls in. */
export async function hitRateLimit(tx: Tx, p: { bucket: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; hits: number; retryAfter: number }> {
  const windowMs = p.windowSeconds * 1000;
  const start = new Date(Math.floor(p.now.getTime() / windowMs) * windowMs);
  const [r] = await tx.insert(rateLimits).values({ bucket: p.bucket, windowStart: start, hits: 1 })
    .onConflictDoUpdate({ target: [rateLimits.bucket, rateLimits.windowStart], set: { hits: sql`${rateLimits.hits} + 1` } })
    .returning({ hits: rateLimits.hits });
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - p.now.getTime()) / 1000));
  return { allowed: r.hits <= p.limit, hits: r.hits, retryAfter };
}

/** Run by the tick job: windows older than a day are of no use to any limit. */
export async function pruneRateLimits(tx: Tx, now: Date): Promise<number> {
  const before = new Date(now.getTime() - 86_400_000).toISOString();
  const rows = await tx.delete(rateLimits).where(sql`${rateLimits.windowStart} < ${before}::timestamptz`).returning({ id: rateLimits.id });
  return rows.length;
}
```

Create `src/lib/ip-bucket.ts`:

```ts
/**
 * The part of an address a rate limit keys on (before hashIp): an IPv4 address whole, an IPv6 address by its /64,
 * since one subscriber usually holds a whole /64 and could rotate through it. Anything unparseable comes back as is.
 */
export function ipBucket(ip: string): string {
  const s = ip.trim().toLowerCase();
  if (!s.includes(":")) return s;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  const parts = s.split("::");
  if (parts.length > 2) return s;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const groups = parts.length === 2 ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return s;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
```

Replace the whole of `src/domain/users/queries.ts` (created in Task 5) with:

```ts
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";
import { normalizeHandle } from "./commands";

export type Account = { handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date };

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({ handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId));
  return r ?? null;
}

export type HandleState = { state: "free" | "taken" } | { state: "invalid"; message: string };

/**
 * Live availability for onboarding (design §5.10), normalised exactly as onboarding stores handles. Says only
 * taken or free: no id, name or other detail of whoever holds it. The caller's own handle reads as free.
 */
export async function handleStatus(tx: Tx, raw: string, selfId: string): Promise<HandleState> {
  let handle: string;
  try {
    handle = normalizeHandle(raw);
  } catch (e) {
    if (e instanceof InvalidInput) return { state: "invalid", message: e.message };
    throw e;
  }
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`lower(${users.handle}) = ${handle} and ${users.id} <> ${selfId}`);
  return { state: r.n > 0 ? "taken" : "free" };
}
```

Create `src/domain/users/handle-check.ts`:

```ts
import type { Tx } from "@/db/client";
import { hitRateLimit } from "@/domain/rate-limit";
import { handleStatus, type HandleState } from "./queries";

/** Per IP hash: enough for typing a handle with a debounce; far too few to walk the handle space. */
export const HANDLE_CHECKS_PER_MINUTE = 30;
/** Per signed-in user, whatever address they come from, so rotating addresses buys nothing past this. */
export const HANDLE_CHECKS_PER_USER_PER_MINUTE = 60;

/** One handle check: counted against the caller's user id always and their IP hash when there is one, then answered. */
export async function checkHandle(tx: Tx, p: { raw: string; callerId: string; ipHash: string | null; now: Date }): Promise<HandleState | { state: "limited"; retryAfter: number }> {
  const user = await hitRateLimit(tx, { bucket: `handle:user:${p.callerId}`, limit: HANDLE_CHECKS_PER_USER_PER_MINUTE, windowSeconds: 60, now: p.now });
  const ip = p.ipHash ? await hitRateLimit(tx, { bucket: `handle:ip:${p.ipHash}`, limit: HANDLE_CHECKS_PER_MINUTE, windowSeconds: 60, now: p.now }) : null;
  const refused = [user, ip].flatMap((l) => (l && !l.allowed ? [l.retryAfter] : []));
  if (refused.length > 0) return { state: "limited", retryAfter: Math.max(...refused) };
  return handleStatus(tx, p.raw, p.callerId);
}
```

- [ ] **Step 6: Prune in the tick job, and empty the table in the concurrency suite**

In `src/jobs/tick.ts`, add the import

```ts
import { pruneRateLimits } from "@/domain/rate-limit";
```

below `import { finalisePendingDraws } from "./finalise-draws";`, and replace

```ts
  const draws = await withJobLock("finalise-draws", (tx) => finalisePendingDraws(tx, beacon, round));
  return { draws };
```

with

```ts
  const draws = await withJobLock("finalise-draws", (tx) => finalisePendingDraws(tx, beacon, round));
  const pruned = await withJobLock("prune-rate-limits", (tx) => pruneRateLimits(tx, now));
  return { draws, pruned };
```

In `tests/concurrency/setup.ts`, replace

```ts
  await db.execute(sql`truncate awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, legal_acceptances, idempotency_keys, users restart identity cascade`);
```

with

```ts
  await db.execute(sql`truncate awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, legal_acceptances, idempotency_keys, rate_limits, users restart identity cascade`);
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test src/domain/rate-limit.test.ts src/domain/users src/lib/ip-bucket.test.ts`
Expected: PASS, including the three "checkHandle (Review Focus 3)" tests.

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm test:ci && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. `pnpm test:ci` (reads `.env.test`, so `breaks_test`) confirms `rate_limits` has forced RLS and no policy. Nothing calls `checkHandle` yet.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/migrations src/domain/rate-limit.ts src/domain/rate-limit.test.ts src/lib/ip-bucket.ts src/lib/ip-bucket.test.ts src/domain/users src/jobs/tick.ts tests/concurrency/setup.ts
git commit -m "feat(users): handle status behind per-IP and per-user rate limits"
```

---

### Task 7b: Handle availability, the endpoint and the onboarding field (model: sonnet)

The visible half of design §5.10: `GET /api/handle` answers signed-in callers through `checkHandle` (Task 7a), and the onboarding handle field asks it as the member types, with a debounce. A free handle reads in plain ink, never green (design §3); a taken or reserved one in red. The submit still decides.

**Files:**
- Create: `src/app/api/handle/route.ts`
- Create: `src/components/handle-field-copy.ts`, `src/components/handle-field-copy.test.ts`, `src/components/handle-field.tsx`
- Modify: `src/app/onboarding/form.tsx` (use `HandleField`)
- Modify: `e2e/pages.spec.ts` (the endpoint)

**Interfaces:**
- Consumes: `checkHandle(tx, { raw: string; callerId: string; ipHash: string | null; now: Date }): Promise<HandleState | { state: "limited"; retryAfter: number }>` (`src/domain/users/handle-check.ts`, Task 7a); `ipBucket(ip: string): string` (`src/lib/ip-bucket.ts`, Task 7a); `hashIp` (`src/lib/ip-hash.ts`); `getCaller`.
- Produces:
  - `GET /api/handle?h=<handle>` → 200 `{ state }` (`invalid` adds `message`), 401 `{ state: "signed-out" }`, 429 `{ state: "limited" }` with `Retry-After`; always `Cache-Control: no-store`.
  - `src/components/handle-field-copy.ts`: `type HandleCheck = { state: "idle" | "checking" | "free" | "taken" | "limited" | "unknown" } | { state: "invalid"; message: string }`, `looksLikeHandle(v: string): boolean`, `toCheck(status: number, body: { state?: string; message?: string }): HandleCheck`, `handleNote(check: HandleCheck, handle: string): { text: string; tone: "bad" | "quiet" }`. `HandleField({ defaultValue })` renders `input#handle[name=handle]` and `data-testid="handle-status"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/handle-field-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handleNote, looksLikeHandle, toCheck } from "./handle-field-copy";

describe("handle field copy", () => {
  it("checks only handle-shaped values", () => {
    expect(looksLikeHandle("jim_r")).toBe(true);
    expect(looksLikeHandle("ｊｉｍ＿ｒ")).toBe(true);
    expect(looksLikeHandle("ab")).toBe(false);
    expect(looksLikeHandle("has space")).toBe(false);
  });
  it("reads the endpoint's answers", () => {
    expect(toCheck(200, { state: "free" })).toEqual({ state: "free" });
    expect(toCheck(200, { state: "taken" })).toEqual({ state: "taken" });
    expect(toCheck(200, { state: "invalid", message: "That handle is reserved" })).toEqual({ state: "invalid", message: "That handle is reserved" });
    expect(toCheck(429, { state: "limited" })).toEqual({ state: "limited" });
    expect(toCheck(401, { state: "signed-out" })).toEqual({ state: "unknown" });
    expect(toCheck(200, {})).toEqual({ state: "unknown" });
  });
  it("says what it found, with red only for a problem", () => {
    expect(handleNote({ state: "free" }, "jim_r")).toEqual({ text: "@jim_r is free.", tone: "quiet" });
    expect(handleNote({ state: "taken" }, "jim_r")).toEqual({ text: "That handle is taken. Try another.", tone: "bad" });
    expect(handleNote({ state: "invalid", message: "That handle is reserved" }, "admin")).toEqual({ text: "That handle is reserved.", tone: "bad" });
    expect(handleNote({ state: "limited" }, "jim_r")).toEqual({ text: "We'll check this handle when you continue.", tone: "quiet" });
    expect(handleNote({ state: "unknown" }, "jim_r")).toEqual({ text: "Couldn't check right now. We'll check when you continue.", tone: "quiet" });
    expect(handleNote({ state: "checking" }, "jim_r")).toEqual({ text: "Checking.", tone: "quiet" });
    expect(handleNote({ state: "idle" }, "")).toEqual({ text: "", tone: "quiet" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/components/handle-field-copy.test.ts`
Expected: FAIL: `./handle-field-copy` does not exist.

- [ ] **Step 3: Write the field's copy**

Create `src/components/handle-field-copy.ts`:

```ts
export type HandleCheck =
  | { state: "idle" | "checking" | "free" | "taken" | "limited" | "unknown" }
  | { state: "invalid"; message: string };

/** Worth asking the server about: the shape onboarding accepts, after the same NFKC folding. */
export function looksLikeHandle(v: string): boolean {
  return /^[A-Za-z0-9_]{3,20}$/.test(v.normalize("NFKC").trim());
}

/** The endpoint's answer → what the field shows. Anything unexpected is "couldn't check", never "free". */
export function toCheck(status: number, body: { state?: string; message?: string }): HandleCheck {
  if (status === 429) return { state: "limited" };
  if (status !== 200) return { state: "unknown" };
  if (body.state === "free" || body.state === "taken") return { state: body.state };
  if (body.state === "invalid") return { state: "invalid", message: body.message ?? "Pick another handle" };
  return { state: "unknown" };
}

/** Red marks a problem; a free handle is plain ink (green means mine and confirmed money only, design §3). */
export function handleNote(c: HandleCheck, handle: string): { text: string; tone: "bad" | "quiet" } {
  switch (c.state) {
    case "free": return { text: `@${handle} is free.`, tone: "quiet" };
    case "taken": return { text: "That handle is taken. Try another.", tone: "bad" };
    case "invalid": return { text: `${c.message}.`, tone: "bad" };
    case "checking": return { text: "Checking.", tone: "quiet" };
    case "limited": return { text: "We'll check this handle when you continue.", tone: "quiet" };
    case "unknown": return { text: "Couldn't check right now. We'll check when you continue.", tone: "quiet" };
    case "idle": return { text: "", tone: "quiet" };
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test src/components/handle-field-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the endpoint and the field**

Create `src/app/api/handle/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { hashIp } from "@/lib/ip-hash";
import { ipBucket } from "@/lib/ip-bucket";
import { checkHandle } from "@/domain/users/handle-check";

const noStore = { "Cache-Control": "no-store" };

/** GET /api/handle?h=jim_r → { state: "free" | "taken" | "invalid" | "limited" }. Signed-in callers only; counted per IP (/64 for IPv6) hash and per user. */
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ state: "signed-out" }, { status: 401, headers: noStore });
  const raw = (req.nextUrl.searchParams.get("h") ?? "").slice(0, 64);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const r = await db.transaction((tx) => checkHandle(tx, { raw, callerId: caller.id, ipHash: ip ? hashIp(ipBucket(ip)) : null, now: new Date() }));
  if (r.state === "limited") {
    return NextResponse.json({ state: "limited" }, { status: 429, headers: { ...noStore, "Retry-After": String(r.retryAfter) } });
  }
  return NextResponse.json(r, { headers: noStore });
}
```

Create `src/components/handle-field.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { handleNote, looksLikeHandle, toCheck, type HandleCheck } from "./handle-field-copy";

/** The onboarding handle input with live availability (design §5.10). The submit still decides: this only informs. */
export function HandleField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [check, setCheck] = useState<HandleCheck>({ state: "idle" });
  const seq = useRef(0);

  useEffect(() => {
    const v = value.trim();
    if (!looksLikeHandle(v)) { setCheck({ state: "idle" }); return; } // the help text already gives the shape
    const n = ++seq.current;
    const ctrl = new AbortController();
    setCheck({ state: "checking" });
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/handle?h=${encodeURIComponent(v)}`, { signal: ctrl.signal, cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { state?: string; message?: string };
        if (n === seq.current) setCheck(toCheck(res.status, body));
      } catch {
        if (n === seq.current && !ctrl.signal.aborted) setCheck({ state: "unknown" });
      }
    }, 400);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [value]);

  const note = handleNote(check, value.normalize("NFKC").trim().toLowerCase());
  const bad = check.state === "taken" || check.state === "invalid";
  return (
    <div className="space-y-1">
      <label htmlFor="handle" className="block text-small font-semibold">Handle</label>
      <input id="handle" name="handle" required value={value} onChange={(e) => setValue(e.target.value)} pattern="[A-Za-z0-9_]{3,20}"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-help handle-status" aria-invalid={bad || undefined}
        className="h-12 w-full rounded-input border border-wire-strong bg-card px-3" />
      <p id="handle-help" className="text-small text-ink-2">3 to 20 letters, numbers or underscores.</p>
      <p id="handle-status" role="status" aria-live="polite" data-testid="handle-status" className={`min-h-5 text-small ${note.tone === "bad" ? "text-red" : "text-ink"}`}>{note.text}</p>
    </div>
  );
}
```

In `src/app/onboarding/form.tsx`, add the import

```tsx
import { HandleField } from "@/components/handle-field";
```

below `import { Button } from "@/components/button";`, and replace

```tsx
        <div className="space-y-1">
          <label htmlFor="handle" className="block text-small font-semibold">Handle</label>
          <input id="handle" name="handle" required defaultValue={suggested} pattern="[A-Za-z0-9_]{3,20}" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-help" className={field} />
          <p id="handle-help" className="text-small text-ink-2">3 to 20 letters, numbers or underscores.</p>
        </div>
```

with

```tsx
        <HandleField defaultValue={suggested} />
```

- [ ] **Step 6: Pin the endpoint in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("the handle check answers signed-in callers with taken or free, and nobody else", async ({ browser }) => {
  const taken = await as(browser, `hk${run}@e2e.test`);
  const me = await as(browser, `hm${run}@e2e.test`);
  const ask = async (h: string) => (await me.request.get(`/api/handle?h=${encodeURIComponent(h)}`)).json();
  expect(await ask(`hk${run}`)).toEqual({ state: "taken" });
  expect(await ask(`HK${run}`)).toEqual({ state: "taken" });
  expect(await ask(`hm${run}`)).toEqual({ state: "free" });
  expect(await ask("admin")).toEqual({ state: "invalid", message: "That handle is reserved" });
  const anon = await (await browser.newContext()).request.get(`/api/handle?h=hk${run}`);
  expect(anon.status()).toBe(401);
  await taken.close();
});
```

- [ ] **Step 7: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green, including the handle-check test in `e2e/pages.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/handle src/components/handle-field.tsx src/components/handle-field-copy.ts src/components/handle-field-copy.test.ts src/app/onboarding/form.tsx e2e/pages.spec.ts
git commit -m "feat(onboarding): live handle availability in the handle field"
```

---

### Task 8: The feed `/breaks` and the host profile `/h/{handle}` (model: sonnet)

Design §5.3 and §5.9. The feed: sort chips (Newest, Filling fast, Almost full) and a host filter, both in the URL (`?sort=filling&host=jim`), horizontal cards with the 96-pt mini grid, "19 of 50 left" with the two-tone fill bar, "$5 a line" and the host with the trust line; the empty state "No open breaks right now. Hosts post most evenings." (filtered to a host: "@jim has no open breaks right now." with a link to all open breaks). The profile: handle, since-when, the trust sentence (never "0 breaks run", never the same date twice), the host's open breaks as the same cards and a count of past ones. The trust line becomes "New host" (deferred copy pass, recorded ruling 4), and the break page's small line now links to the host's profile (design §5.4: "the whole line a 44-pt link").

**Files:**
- Create: `src/app/breaks/params.ts`, `src/app/breaks/params.test.ts`, `src/app/breaks/page.tsx`
- Create: `src/components/break-card.tsx`, `src/components/feed-filters.tsx`
- Create: `src/app/h/[handle]/page.tsx`
- Modify: `src/components/break/frame-copy.ts` (`trustText`, `hostedByText`, `smallLineText`, `profileTrustText`, `pastText`), `src/components/break/frame-copy.test.ts`
- Modify: `src/components/break/break-interactive.tsx` (`hostHref` prop), `src/app/b/[id]/page.tsx` (pass it)
- Modify: `e2e/pages.spec.ts` (feed and profile tests)

**Interfaces:**
- Consumes: `listFeed`, `feedThumbs`, `feedHosts`, `FEED_SORTS`, `isFeedSort`, `FeedBreak`, `ThumbCell` (Task 1); `hostProfile(tx, handle: string): Promise<HostProfile | null>` (Task 3); `composeBreak` (`e2e/helpers.ts`, Task 6b); `GridPreview`, `FillBar`, `FilterChips`, `Avatar`; `formatMonthYear`, `formatMoney`.
- Produces:
  - `src/app/breaks/params.ts`: `type FeedParams = { sort: FeedSort; host: string | null }`; `parseFeedParams(sp: { sort?: string | string[]; host?: string | string[] }): FeedParams`; `feedHref(p: FeedParams): string`; `SORT_LABELS: Record<FeedSort, string>`.
  - `BreakCard({ b: FeedBreak; cells: ThumbCell[] })` (server-safe, `li[data-testid=break-card]`).
  - `FeedFilters({ sorts, sort, hosts, host })` (client; options carry their own `href`, so the client imports no domain or params code).
  - In `frame-copy.ts`: `trustText` → "New host" or "12 breaks run since Oct 2026"; `hostedByText(hostRef, trust)` → "Hosted by @jim. New host."; `smallLineText` uses it; `profileTrustText(t: { breaksRun: number; since: Date }): string` → "New host. No breaks run yet." / "New host. 3 breaks run." / "12 breaks run since Oct 2026."; `pastText(n: number): string`.
  - `BreakInteractiveProps.hostHref: string | null`.
  - Test ids: `break-card`, `feed-empty`, `host-filter`, `profile-trust`, `profile-since`, `profile-past`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/breaks/params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { feedHref, parseFeedParams } from "./params";

describe("feed params", () => {
  it("reads the sort and the host, falling back to newest and no host", () => {
    expect(parseFeedParams({})).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ sort: "filling", host: "Jim_R" })).toEqual({ sort: "filling", host: "jim_r" });
    expect(parseFeedParams({ sort: "almost", host: "@jim_r" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: ["almost", "filling"], host: ["ann", "bob"] })).toEqual({ sort: "almost", host: "ann" });
    expect(parseFeedParams({ sort: "closing", host: "x" })).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ host: "<script>" })).toEqual({ sort: "newest", host: null });
  });
  it("writes the shortest URL for a choice", () => {
    expect(feedHref({ sort: "newest", host: null })).toBe("/breaks");
    expect(feedHref({ sort: "filling", host: null })).toBe("/breaks?sort=filling");
    expect(feedHref({ sort: "newest", host: "jim_r" })).toBe("/breaks?host=jim_r");
    expect(feedHref({ sort: "almost", host: "jim_r" })).toBe("/breaks?sort=almost&host=jim_r");
  });
});
```

In `src/components/break/frame-copy.test.ts`, change the import line to

```ts
import { closesText, hostedByText, hostLabel, leftText, orList, pastText, payWithinText, perPersonText, pickingText, prizeLines, profileTrustText, smallLineText, trustText, youHaveText } from "./frame-copy";
```

replace the test `"uses the interim trust line until the reputation plan lands"` with

```ts
  it("uses the interim trust line until the reputation plan lands", () => {
    const since = new Date("2026-10-01T12:00:00Z");
    expect(trustText({ breaksRun: 0, since })).toBe("New host");
    expect(trustText({ breaksRun: 4, since })).toBe("New host");
    expect(trustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026");
    expect(hostedByText("@jim", "New host")).toBe("Hosted by @jim. New host.");
    expect(profileTrustText({ breaksRun: 0, since })).toBe("New host. No breaks run yet.");
    expect(profileTrustText({ breaksRun: 1, since })).toBe("New host. 1 break run.");
    expect(profileTrustText({ breaksRun: 3, since })).toBe("New host. 3 breaks run.");
    expect(profileTrustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026.");
    expect(pastText(0)).toBe("No past breaks yet.");
    expect(pastText(1)).toBe("1 past break.");
    expect(pastText(7)).toBe("7 past breaks.");
  });
```

and replace the test `"shows the pay window only while the break is open"` with

```ts
  it("shows the pay window only while the break is open", () => {
    expect(smallLineText("open", 24, "@jim", "New host")).toBe("Pay within 24 hours. Hosted by @jim. New host.");
    for (const s of ["draft", "filled", "drawing", "drawn", "cancelled"]) {
      expect(smallLineText(s, 24, "@jim", "New host")).toBe("Hosted by @jim. New host.");
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/app/breaks src/components/break/frame-copy.test.ts`
Expected: FAIL: `./params` does not exist; `trustText` still says "new host"; `hostedByText`, `profileTrustText`, `pastText` are not exported.

- [ ] **Step 3: Write the params and the copy**

Create `src/app/breaks/params.ts`:

```ts
import { isFeedSort, type FeedSort } from "@/domain/breaks/feed";

export type FeedParams = { sort: FeedSort; host: string | null };

export const SORT_LABELS: Record<FeedSort, string> = { newest: "Newest", filling: "Filling fast", almost: "Almost full" };

const HANDLE = /^[a-z0-9_]{3,20}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?sort=&host= → what the feed shows. Unknown values fall back to the defaults; nothing throws. */
export function parseFeedParams(sp: { sort?: string | string[]; host?: string | string[] }): FeedParams {
  const sort = first(sp.sort);
  const host = first(sp.host)?.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");
  return { sort: isFeedSort(sort) ? sort : "newest", host: host && HANDLE.test(host) ? host : null };
}

/** The shortest URL for a choice: defaults are left out. */
export function feedHref(p: FeedParams): string {
  const q = new URLSearchParams();
  if (p.sort !== "newest") q.set("sort", p.sort);
  if (p.host) q.set("host", p.host);
  const s = q.toString();
  return s ? `/breaks?${s}` : "/breaks";
}
```

In `src/components/break/frame-copy.ts`, replace

```ts
/** "Pay within 24 hours. Hosted by @jim, new host." The pay window only means something while the break is open. */
export function smallLineText(status: string, paymentWindowHours: number, hostRef: string, trust: string): string {
  const hosted = `Hosted by ${hostRef}, ${trust}.`;
  return status === "open" ? `${payWithinText(paymentWindowHours)} ${hosted}` : hosted;
}
```

with

```ts
/** "Hosted by @jim. New host." on the break page and on feed cards. */
export const hostedByText = (hostRef: string, trust: string) => `Hosted by ${hostRef}. ${trust}.`;

/** "Pay within 24 hours. Hosted by @jim. New host." The pay window only means something while the break is open. */
export function smallLineText(status: string, paymentWindowHours: number, hostRef: string, trust: string): string {
  const hosted = hostedByText(hostRef, trust);
  return status === "open" ? `${payWithinText(paymentWindowHours)} ${hosted}` : hosted;
}
```

and replace

```ts
/** Interim trust line (design §5.3) until the reputation plan adds "98% would buy again". */
export function trustText(t: { breaksRun: number; since: Date }): string {
  return t.breaksRun < 5 ? "new host" : `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}`;
}
```

with

```ts
/** Interim trust line (design §5.3) until the reputation plan adds "98% would buy again". */
export function trustText(t: { breaksRun: number; since: Date }): string {
  return t.breaksRun < 5 ? "New host" : `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}`;
}

/**
 * The profile's one-sentence trust line (design §5.9, interim). Never "0 breaks run"; the date only from 5 breaks on,
 * where the page drops its separate "On Breaks since" line so the date is never said twice.
 */
export function profileTrustText(t: { breaksRun: number; since: Date }): string {
  if (t.breaksRun === 0) return "New host. No breaks run yet.";
  if (t.breaksRun < 5) return `New host. ${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run.`;
  return `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}.`;
}

export const pastText = (n: number) => (n === 0 ? "No past breaks yet." : `${n} past ${plural(n, "break", "breaks")}.`);
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/app/breaks src/components/break/frame-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the card and the filters**

Create `src/components/break-card.tsx`:

```tsx
import Link from "next/link";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import { GridPreview } from "@/components/grid/grid-preview";
import { FillBar } from "@/components/fill-bar";
import { formatMoney } from "@/lib/money";
import { hostedByText, leftText, trustText } from "@/components/break/frame-copy";

/** A feed card (design §5.3): 96-pt mini grid, title, "19 of 50 left" with the fill bar, "$5 a line", host and trust line. */
export function BreakCard({ b, cells }: { b: FeedBreak; cells: ThumbCell[] }) {
  const hostRef = b.host.handle ? `@${b.host.handle}` : b.host.displayName ?? "the host";
  return (
    <li data-testid="break-card" className="rounded-card border border-wire bg-card">
      <Link href={`/b/${b.id}`} className="flex gap-3 p-3">
        <GridPreview count={b.lineCount} cells={cells.map((c) => ({ ...c, mine: false, overdue: false }))} size={96} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-semibold">{b.title}</span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular">{leftText(b.open, b.lineCount)}</span>
            <span className="text-small text-ink-2">{formatMoney(b.linePriceCents)} a line</span>
          </span>
          <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} label={`${b.paid} of ${b.lineCount} paid, ${b.taken} taken`} />
          <span className="text-small text-ink-2">{hostedByText(hostRef, trustText(b.host))}</span>
        </span>
      </Link>
    </li>
  );
}
```

Create `src/components/feed-filters.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilterChips } from "@/components/filter-chips";

type Option = { value: string; label: string; href: string };

/** Sort chips and the host filter. Every option carries its URL from the server, so the state lives in the address bar. */
export function FeedFilters({ sorts, sort, hosts, host }: { sorts: Option[]; sort: string; hosts: Option[] | null; host: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (options: Option[], value: string) => {
    const o = options.find((x) => x.value === value);
    if (o) start(() => router.push(o.href, { scroll: false }));
  };
  return (
    <div className="space-y-3" aria-busy={pending || undefined}>
      <FilterChips label="Sort" value={sort} options={sorts} onChange={(v) => go(sorts, v)} />
      {hosts && (
        <label className="flex items-center gap-3 text-small">
          <span className="font-semibold">Host</span>
          <select value={host} onChange={(e) => go(hosts, e.target.value)} data-testid="host-filter"
            className="h-11 min-w-0 flex-1 rounded-input border border-wire-strong bg-card px-3 text-body">
            {hosts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the two pages**

Create `src/app/breaks/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { FEED_SORTS, feedHosts, feedThumbs, listFeed } from "@/domain/breaks/feed";
import { BreakCard } from "@/components/break-card";
import { FeedFilters } from "@/components/feed-filters";
import { feedHref, parseFeedParams, SORT_LABELS } from "./params";

export const metadata: Metadata = { title: "Browse breaks" };

type Props = { searchParams: Promise<{ sort?: string | string[]; host?: string | string[] }> };

export default async function FeedPage({ searchParams }: Props) {
  const params = parseFeedParams(await searchParams);
  const now = new Date();
  const { rows, thumbs, hosts } = await db.transaction(async (tx) => {
    const rows = await listFeed(tx, { sort: params.sort, hostHandle: params.host, now });
    return { rows, thumbs: await feedThumbs(tx, rows.map((r) => r.id)), hosts: await feedHosts(tx) };
  });
  const sorts = FEED_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s], href: feedHref({ ...params, sort: s }) }));
  const hostOptions = [
    { value: "", label: "All hosts", href: feedHref({ ...params, host: null }) },
    ...hosts.map((h) => ({ value: h.handle, label: `@${h.handle}`, href: feedHref({ ...params, host: h.handle }) })),
  ];
  // A filtered host with no open break right now still shows as the selected option.
  if (params.host && !hosts.some((h) => h.handle === params.host)) {
    hostOptions.push({ value: params.host, label: `@${params.host}`, href: feedHref(params) });
  }
  const showHosts = hostOptions.length > 2 || params.host !== null;
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Browse breaks</h1>
      <FeedFilters sorts={sorts} sort={params.sort} hosts={showHosts ? hostOptions : null} host={params.host ?? ""} />
      {rows.length > 0 ? (
        <ul aria-label="Open breaks" className="space-y-3">
          {rows.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}
        </ul>
      ) : (
        <p className="text-ink-2" data-testid="feed-empty">
          {params.host ? (
            <>@{params.host} has no open breaks right now. <Link href={feedHref({ ...params, host: null })} className="inline-flex min-h-11 items-center underline underline-offset-4">See all open breaks</Link></>
          ) : "No open breaks right now. Hosts post most evenings."}
        </p>
      )}
    </main>
  );
}
```

Create `src/app/h/[handle]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { hostProfile } from "@/domain/breaks/queries";
import { feedThumbs, listFeed } from "@/domain/breaks/feed";
import { formatMonthYear } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { BreakCard } from "@/components/break-card";
import { pastText, profileTrustText } from "@/components/break/frame-copy";

type Props = { params: Promise<{ handle: string }> };

function cleanHandle(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* keep the raw segment */ }
  return s.replace(/^@/, "").slice(0, 40);
}

/** One transaction per request, shared by the metadata and the page. Public data only (hostProfile). */
const loadProfile = cache(async (raw: string) =>
  db.transaction(async (tx) => {
    const profile = await hostProfile(tx, cleanHandle(raw));
    if (!profile) return null;
    const open = await listFeed(tx, { sort: "newest", hostHandle: profile.handle, now: new Date() });
    return { profile, open, thumbs: await feedThumbs(tx, open.map((b) => b.id)) };
  }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const d = await loadProfile(handle);
  return d ? { title: `@${d.profile.handle}`, description: profileTrustText(d.profile) } : {};
}

export default async function HostProfilePage({ params }: Props) {
  const { handle } = await params;
  const d = await loadProfile(handle);
  if (!d) notFound();
  const { profile, open, thumbs } = d;
  return (
    <main className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
      <section className="flex items-center gap-4">
        <Avatar name={profile.displayName ?? profile.handle} size={56} />
        <div className="min-w-0">
          <h1 className="font-condensed text-title font-semibold">@{profile.handle}</h1>
          {profile.displayName && profile.displayName !== profile.handle && <p className="text-ink-2">{profile.displayName}</p>}
        </div>
      </section>
      <div className="space-y-1">
        <p data-testid="profile-trust">{profileTrustText(profile)}</p>
        {/* From 5 breaks on the trust sentence carries the date itself (profileTrustText). */}
        {profile.breaksRun < 5 && <p className="text-small text-ink-2" data-testid="profile-since">On Breaks since {formatMonthYear(profile.since)}.</p>}
      </div>
      <section aria-labelledby="open-breaks" className="space-y-3">
        <h2 id="open-breaks" className="text-headline font-semibold">Open breaks</h2>
        {open.length > 0 ? (
          <ul className="space-y-3">{open.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}</ul>
        ) : (
          <p className="text-ink-2">No open breaks right now.</p>
        )}
      </section>
      <p className="text-small text-ink-2" data-testid="profile-past">{pastText(profile.pastCount)}</p>
    </main>
  );
}
```

- [ ] **Step 7: Link the break page's small line to the profile**

In `src/components/break/break-interactive.tsx`, add the import

```tsx
import Link from "next/link";
```

above `import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";`; in `BreakInteractiveProps`, after the `smallLine: string;` line add

```ts
  /** The host's profile (/h/handle): the whole small line links there (design §5.4). Null when the host has no handle. */
  hostHref: string | null;
```

and replace

```tsx
        <p className="min-w-0 flex-1 text-small text-ink-2">{p.smallLine}</p>
```

with

```tsx
        <p className="min-w-0 flex-1 text-small text-ink-2">
          {p.hostHref ? <Link href={p.hostHref} className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4" data-testid="host-line">{p.smallLine}</Link> : p.smallLine}
        </p>
```

In `src/app/b/[id]/page.tsx`, replace

```tsx
        smallLine={smallLineText(status, b.paymentWindowHours, hostRef, trustText(trust))}
```

with

```tsx
        smallLine={smallLineText(status, b.paymentWindowHours, hostRef, trustText(trust))}
        hostHref={page.host.handle ? `/h/${page.host.handle}` : null}
```

- [ ] **Step 8: Pin both pages in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("the feed lists an open break and never a draft; the host filter and sorts live in the URL", async ({ browser }) => {
  const handle = `fh${run}`;
  const host = await as(browser, `${handle}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Feed open ${run}` });
  await composeBreak(host, { title: `Feed draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/breaks?host=${handle}`);
  const card = visitor.getByTestId("break-card").filter({ hasText: `Feed open ${run}` });
  await expect(card).toContainText("4 of 4 left");
  await expect(card).toContainText("$5 a line");
  await expect(card).toContainText(`Hosted by @${handle}. New host.`);
  await expect(visitor.getByText(`Feed draft ${run}`)).toHaveCount(0);
  await expect(visitor.getByTestId("host-filter")).toHaveValue(handle);
  await visitor.getByRole("radio", { name: "Almost full" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/breaks\\?sort=almost&host=${handle}$`));
  await expect(visitor.getByRole("radio", { name: "Almost full" })).toHaveAttribute("aria-checked", "true");
  await card.click();
  await expect(visitor).toHaveURL(url);
  await visitor.getByTestId("host-line").click();
  await expect(visitor).toHaveURL(new RegExp(`/h/${handle}$`));
  // A host with nothing open: the empty state points at every open break.
  await visitor.goto(`/breaks?host=nobody_here_x`);
  await expect(visitor.getByTestId("feed-empty")).toContainText("@nobody_here_x has no open breaks right now.");
  await visitor.getByRole("link", { name: "See all open breaks" }).click();
  await expect(visitor).toHaveURL(/\/breaks$/);
});

test("a host profile shows public figures, the open breaks and a past count, and nothing private", async ({ browser }) => {
  const handle = `ph${run}`;
  const host = await as(browser, `${handle}@e2e.test`, "host");
  await composeBreak(host, { title: `Profile open ${run}` });
  await composeBreak(host, { title: `Profile draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/h/${handle}`);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(`@${handle}`);
  await expect(visitor.getByTestId("profile-trust")).toHaveText("New host. No breaks run yet.");
  await expect(visitor.getByTestId("profile-since")).toContainText("On Breaks since");
  await expect(visitor.getByTestId("break-card")).toHaveCount(1);
  await expect(visitor.getByText(`Profile draft ${run}`)).toHaveCount(0);
  await expect(visitor.getByTestId("profile-past")).toHaveText("No past breaks yet.");
  await expect(visitor.getByText("@e2e.test")).toHaveCount(0);
  await expect(visitor.getByText("e2e-host")).toHaveCount(0);
  expect((await visitor.goto("/h/nobody_here_x"))?.status()).toBe(404);
});
```

- [ ] **Step 9: Optional: check by hand**

If you have a browser tool: open `/breaks` in `pnpm dev` at 390 wide and at 1024, try the three chips and the host select, and open a profile from a break page's small line. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 10: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The journey and the layout spec key on nothing in the small line; the layout spec's 390 × 664 budget still holds (the small line keeps its one row; `min-h-11` was already the row's height).

- [ ] **Step 11: Commit**

```bash
git add src/app/breaks src/app/h src/components/break-card.tsx src/components/feed-filters.tsx src/components/break/frame-copy.ts src/components/break/frame-copy.test.ts src/components/break/break-interactive.tsx "src/app/b/[id]/page.tsx" e2e/pages.spec.ts
git commit -m "feat(feed): /breaks with sorts and a host filter, and the host profile"
```

---

### Task 9: Landing page, the feed as a member's home, Browse pointing at `/breaks` (model: opus)

Design §5.2. The hero is a real break: the most recent ran, not voided break, its grid small and fully black with the one green winning cell, linking to its result, captioned "Ran 2 hours ago. Anyone can check the draw." (or "Ran on Tuesday" past 48 h). Then one sentence, two buttons (Browse breaks, How draws work), the feed's first six cards and one quiet line for hosts. A signed-in member who signs in or finishes onboarding with no `next` now lands on `/breaks` instead of the placeholder home; the post-sign-in target is one pure, tested function used by all three sign-in paths (this also covers the deferred "verifyOtp → onboarding redirect" test). The shell's Browse goes to `/breaks`. The model is opus because Step 5 rewrites the post-sign-in redirect in every sign-in path (auth); the landing page itself is plain UI.

**Files:**
- Create: `src/app/landing-copy.ts`, `src/app/landing-copy.test.ts`
- Modify: `src/app/page.tsx` (whole file)
- Modify: `src/lib/safe-next.ts` (append `afterSignIn`, `signedInTarget`), `src/lib/safe-next.test.ts` (append)
- Modify: `src/app/(auth)/login/actions.ts:29-32`, `src/app/auth/callback/actions.ts:21`, `src/app/onboarding/actions.ts:7`, `:22`, `src/app/onboarding/page.tsx:18`
- Modify: `src/components/shell/nav.ts:5-10`, `src/components/shell/nav.test.ts`
- Modify: `e2e/pages.spec.ts` (landing test)

**Interfaces:**
- Consumes: `latestRanBreak`, `listFeed`, `feedThumbs` (Task 1); `BreakCard` (Task 8); `composeBreak` (`e2e/helpers.ts`, Task 6b); `viewerZone`; `ButtonLink`; `safeNext`.
- Produces:
  - `src/lib/safe-next.ts`: `afterSignIn(raw: unknown): string` ("/" and anything unsafe → "/breaks"); `signedInTarget(onboarded: boolean, raw: unknown): string`.
  - `src/app/landing-copy.ts`: `ranText(ranAt: Date, now: Date, tz: string): string`; `heroNumbers(lineCount: number, topLine: number): number[]`.
  - `navItems` Browse → `/breaks` (still active on `/` and `/breaks`, and now on `/h/…`).
  - Test ids: `hero`, `browse-breaks`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/landing-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { heroNumbers, ranText } from "./landing-copy";

const now = new Date("2026-10-14T18:00:00Z"); // a Wednesday
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("ranText", () => {
  it("says how long ago under 48 hours, then the day", () => {
    expect(ranText(ago(20_000), now, "America/New_York")).toBe("Ran just now.");
    expect(ranText(ago(1 * MIN), now, "America/New_York")).toBe("Ran 1 minute ago.");
    expect(ranText(ago(45 * MIN), now, "America/New_York")).toBe("Ran 45 minutes ago.");
    expect(ranText(ago(2 * HOUR), now, "America/New_York")).toBe("Ran 2 hours ago.");
    expect(ranText(ago(47 * HOUR), now, "America/New_York")).toBe("Ran 47 hours ago.");
    expect(ranText(ago(72 * HOUR), now, "America/New_York")).toBe("Ran on Sunday.");
    expect(ranText(ago(10 * 24 * HOUR), now, "America/New_York")).toBe("Ran on Oct 4.");
    expect(ranText(new Date("2025-10-04T18:00:00Z"), now, "America/New_York")).toBe("Ran on Oct 4, 2025.");
  });
  it("names the day in the viewer's zone", () => {
    const lateSunday = new Date("2026-10-12T02:30:00Z"); // Sunday evening in New York, Monday morning in London
    expect(ranText(lateSunday, now, "America/New_York")).toBe("Ran on Sunday.");
    expect(ranText(lateSunday, now, "Europe/London")).toBe("Ran on Monday.");
  });
});

describe("heroNumbers", () => {
  it("is every numbered line, plus the winner when it is a bonus line", () => {
    expect(heroNumbers(4, 2)).toEqual([1, 2, 3, 4]);
    expect(heroNumbers(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
```

In `src/lib/safe-next.test.ts`, change the import line `import { safeNext } from "./safe-next";` to `import { afterSignIn, safeNext, signedInTarget } from "./safe-next";` and append at the end of the file:

```ts
describe("after sign-in", () => {
  it("lands a member on the feed when there is no safe next", () => {
    expect(afterSignIn(undefined)).toBe("/breaks");
    expect(afterSignIn("/")).toBe("/breaks");
    expect(afterSignIn("//evil.com")).toBe("/breaks");
    expect(afterSignIn("https://evil.com/x")).toBe("/breaks");
    expect(afterSignIn("/h/jim")).toBe("/h/jim");
  });
  it("sends an unfinished account to onboarding first, keeping next and its ?pick=", () => {
    expect(signedInTarget(false, "/b/x?pick=1,2")).toBe("/onboarding?next=%2Fb%2Fx%3Fpick%3D1%2C2");
    expect(signedInTarget(false, undefined)).toBe("/onboarding?next=%2Fbreaks");
    expect(signedInTarget(true, "/b/x?pick=1,2")).toBe("/b/x?pick=1,2");
    expect(signedInTarget(true, "/")).toBe("/breaks");
  });
});
```

In `src/components/shell/nav.test.ts`, add inside `describe("navItems", …)` after the test `"marks the active destination"`:

```ts
  it("points Browse at the feed, and keeps it active on the landing page and profiles", () => {
    const [browse] = navItems(null);
    expect(browse.href).toBe("/breaks");
    expect(browse.match("/")).toBe(true);
    expect(browse.match("/breaks")).toBe(true);
    expect(browse.match("/h/jim")).toBe(true);
    expect(browse.match("/host")).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/app/landing-copy.test.ts src/lib/safe-next.test.ts src/components/shell/nav.test.ts`
Expected: FAIL: `./landing-copy` does not exist, `afterSignIn` is not exported, Browse's href is "/".

- [ ] **Step 3: Write the helpers**

Create `src/app/landing-copy.ts`:

```ts
import { plural } from "@/lib/list";

/**
 * "Ran 2 hours ago." under 48 hours (design §5.2), then "Ran on Tuesday." within the week, then "Ran on Oct 4.",
 * with the year once it is not this year ("Ran on Oct 4, 2025."), all in the viewer's zone.
 */
export function ranText(ranAt: Date, now: Date, tz: string): string {
  const mins = Math.max(0, Math.floor((now.getTime() - ranAt.getTime()) / 60_000));
  if (mins < 1) return "Ran just now.";
  if (mins < 60) return `Ran ${mins} ${plural(mins, "minute", "minutes")} ago.`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Ran ${hours} ${plural(hours, "hour", "hours")} ago.`;
  const yearOf = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d);
  const options: Intl.DateTimeFormatOptions = hours < 7 * 24 ? { weekday: "long" }
    : yearOf(ranAt) === yearOf(now) ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return `Ran on ${new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options }).format(ranAt)}.`;
}

/** The hero grid's numbers: every numbered line, plus the winning line when it is a bonus line above N. */
export function heroNumbers(lineCount: number, topLine: number): number[] {
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1);
  return topLine > lineCount ? [...numbers, topLine] : numbers;
}
```

Append to `src/lib/safe-next.ts`:

```ts
/** Where sign-in and onboarding go next: the safe `next` when one was given, else the feed (a member's home). */
export function afterSignIn(raw: unknown): string {
  const next = safeNext(raw);
  return next === "/" ? "/breaks" : next;
}

/** After a code or link is verified: an unfinished account sets up first, keeping `next` (and any ?pick=). */
export function signedInTarget(onboarded: boolean, raw: unknown): string {
  const next = afterSignIn(raw);
  return onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}
```

In `src/components/shell/nav.ts`, replace

```ts
/** Plan A destinations. Plan B adds "My lines" (/me) and points Browse at /breaks. */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") }];
```

with

```ts
/** Browse (the feed), and Host for hosts and admins. My lines joins with /me (Task 11). */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/breaks", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") || p.startsWith("/h/") }];
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/app/landing-copy.test.ts src/lib/safe-next.test.ts src/components/shell/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Send members to the feed after sign-in**

In `src/app/(auth)/login/actions.ts`, change the import line

```ts
import { safeNext } from "@/lib/safe-next";
```

to

```ts
import { safeNext, signedInTarget } from "@/lib/safe-next";
```

and replace, at the end of `verifyOtp`,

```ts
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or ask for a new one." };
  // Same rule as the link flow (auth/callback): new accounts set up first, keeping `next` (and any ?pick=).
  const caller = await getCaller();
  if (caller && !caller.onboarded) return { redirect: `/onboarding?next=${encodeURIComponent(next)}` };
  return { redirect: next };
```

with

```ts
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or ask for a new one." };
  // Same rule as the link flow (auth/callback): new accounts set up first, keeping `next` (and any ?pick=).
  const caller = await getCaller();
  return { redirect: signedInTarget(caller ? caller.onboarded : true, form.get("next")) };
```

(`safeNext` stays imported: `sendMagicLink` still uses it.)

In `src/app/auth/callback/actions.ts`, change the import line `import { safeNext } from "@/lib/safe-next";` to `import { safeNext, signedInTarget } from "@/lib/safe-next";`, and replace the last line of `exchange`

```ts
  redirect(caller.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
```

with

```ts
  redirect(signedInTarget(caller.onboarded, next));
```

In `src/app/onboarding/actions.ts`, change `import { safeNext } from "@/lib/safe-next";` to `import { afterSignIn } from "@/lib/safe-next";`, replace

```ts
  const next = safeNext(form.get("next"));
```

with

```ts
  const next = afterSignIn(form.get("next"));
```

In `src/app/onboarding/page.tsx`, change `import { safeNext } from "@/lib/safe-next";` to `import { afterSignIn, safeNext } from "@/lib/safe-next";` and replace

```ts
  if (caller?.onboarded) redirect(nextPath);
```

with

```ts
  if (caller?.onboarded) redirect(afterSignIn(nextPath));
```

- [ ] **Step 6: Build the landing page**

Replace the whole of `src/app/page.tsx` with:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { feedThumbs, latestRanBreak, listFeed } from "@/domain/breaks/feed";
import { viewerZone } from "@/lib/zone";
import { ButtonLink } from "@/components/button";
import { BreakCard } from "@/components/break-card";
import { thumbColumns } from "@/components/grid/layout";
import { heroNumbers, ranText } from "./landing-copy";

/** The board after a draw: every line paid (black), the winning line green. Decorative; the caption says it. */
function HeroGrid({ lineCount, topLine }: { lineCount: number; topLine: number }) {
  const numbers = heroNumbers(lineCount, topLine);
  return (
    <span aria-hidden className="grid shrink-0 border-t border-l border-wire-strong" style={{ width: 112, gridTemplateColumns: `repeat(${thumbColumns(numbers.length)}, minmax(0, 1fr))` }}>
      {numbers.map((n) => (
        <span key={n} className={`aspect-square border-r border-b border-wire-strong ${n === topLine ? "bg-green" : "bg-ink"}`} />
      ))}
    </span>
  );
}

export default async function Home() {
  const now = new Date();
  const zone = await viewerZone();
  const { hero, cards, thumbs } = await db.transaction(async (tx) => {
    const hero = await latestRanBreak(tx);
    const cards = await listFeed(tx, { sort: "newest", limit: 6, now });
    return { hero, cards, thumbs: await feedThumbs(tx, cards.map((c) => c.id)) };
  });
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      {hero && (
        <Link href={`/b/${hero.breakId}/result`} data-testid="hero" className="flex items-center gap-4 rounded-card border border-wire bg-card p-3">
          <HeroGrid lineCount={hero.lineCount} topLine={hero.topLine} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold">{hero.title}</span>
            <span className="block text-small">Top spot: line {hero.topLine}.</span>
            <span className="block text-small text-ink-2">{ranText(hero.ranAt, now, zone.tz)} Anyone can check the draw.</span>
          </span>
        </Link>
      )}
      <section className="space-y-4">
        <h1 className="font-condensed text-display font-semibold">Group buys for darts gear.</h1>
        <p className="max-w-[65ch]">See every host&apos;s record, and check every draw yourself.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/breaks" data-testid="browse-breaks">Browse breaks</ButtonLink>
          <ButtonLink href="/legal/draw" variant="secondary">How draws work</ButtonLink>
        </div>
      </section>
      {cards.length > 0 && (
        <section aria-labelledby="open-now" className="space-y-3">
          <h2 id="open-now" className="text-headline font-semibold">Open now</h2>
          <ul className="space-y-3">{cards.map((b) => <BreakCard key={b.id} b={b} cells={thumbs.get(b.id) ?? []} />)}</ul>
        </section>
      )}
      {/* No contact address yet (design §8): the invite contact is deferred, so the line ends here. */}
      <p className="text-small text-ink-2">Hosting on Facebook now? Breaks is invite-only for hosts.</p>
    </main>
  );
}
```

- [ ] **Step 7: Pin the landing page in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("the landing page leads with the newest ran break and links to the feed", async ({ browser }) => {
  // nh/nb, not lh/lb: those are the layout spec's host and buyer prefixes, and both files key handles on Date.now().
  const host = await as(browser, `nh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Hero ${run}`, lineCount: 2 });
  const buyer = await as(browser, `nb${run}@e2e.test`);
  await buyer.goto(url);
  await buyer.getByTestId("claim-rest").click();
  await expect(buyer.getByTestId("pay-amount")).toContainText("$10");
  await host.reload();
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-paid").click();
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await expect(host.getByTestId("ledger-result")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  const hero = visitor.getByTestId("hero");
  await expect(hero).toContainText(`Hero ${run}`);
  await expect(hero).toContainText("Anyone can check the draw.");
  await expect(hero).toHaveAttribute("href", `${new URL(url).pathname}/result`);
  await expect(visitor.getByText("Hosting on Facebook now? Breaks is invite-only for hosts.", { exact: true })).toBeVisible();
  await visitor.getByTestId("browse-breaks").click();
  await expect(visitor).toHaveURL(/\/breaks$/);
});
```

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. `loginAs` still waits for `/`: `/test/login` redirects there itself and does not go through `afterSignIn`.

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx src/app/landing-copy.ts src/app/landing-copy.test.ts src/lib/safe-next.ts src/lib/safe-next.test.ts "src/app/(auth)/login/actions.ts" src/app/auth/callback/actions.ts src/app/onboarding src/components/shell/nav.ts src/components/shell/nav.test.ts e2e/pages.spec.ts
git commit -m "feat(landing): a ran break as the hero, the feed as a member's home"
```

---

### Task 10: `useClaim` and `usePaySheet` out of the break island; past-deadline wording; no refresh while offline (model: opus)

Deferred item 1: `/me` needs "How to pay Jim" and "Give back unpaid lines", which today live inside the ~390-line `BreakInteractive`. This task moves the claim runner (batch id, transition, optimistic marks, thrown-action handling) into `useClaim` and the pay sheet's state (open, error, provisional owe, "I've sent it") into `usePaySheet`, with no behaviour change on the break page. Two deferred fixes ride along: the pay block says "Payment was due 9:40 pm today. Jim can release your lines now." once the deadline has passed (deferred item 1), and when the device is offline a thrown action no longer calls `router.refresh()`, which would fall back to a hard navigation (deferred item 7).

**Files:**
- Create: `src/components/break/use-pay-sheet.ts`, `src/components/break/use-claim.ts`
- Modify: `src/components/break/break-interactive.tsx` (whole file)
- Modify: `src/components/break/pay-sheet.tsx` (imports, give-back catch, deadline line)
- Modify: `src/components/break/pay-copy.ts` (`lateReleaseText`, `payeeFor`, `late` in `nextPendingOwe`), `src/components/break/pay-copy.test.ts`
- Modify: `src/lib/network-note.ts` (`OFFLINE_NOTE`, `canRefresh`); Create: `src/lib/network-note.test.ts`
- Modify: `src/app/b/[id]/page.tsx` (`owe.late`)

**Interfaces:**
- Consumes: `claim`, `claimNextAction`, `claimRandomAction`, `claimRest`, `sent` (`src/app/b/[id]/actions.ts`), everything `BreakInteractive` already imports.
- Produces:
  - `src/components/break/use-pay-sheet.ts`: `type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean }`; `type SheetError = { for: "sent" | "retry"; text: string }`; `usePaySheet(o: { breakId: string; owe: Owe | null; onNote?: (t: string) => void; say?: (t: string) => void; onSentOk?: () => void; onClosed?: () => void })` returning `{ open, show, close, error, setError, fail, owe, pendingOwe, setPendingOwe, markSent, pending }`.
  - `src/components/break/use-claim.ts`: `type ClaimData = { got: number[]; taken?: number[] }`; `useClaim(o: { markClaimed: (numbers: number[]) => void; onDone: (r: ActionResult<ClaimData>, requested: number[]) => void; onUnreachable: () => void })` returning `{ batchId, newBatch, pending, run(optimistic: number[], call: (batchId: string) => Promise<ActionResult<ClaimData>>) }`.
  - `break-interactive.tsx` re-exports `type Owe`. `src/lib/network-note.ts`: `OFFLINE_NOTE`, `canRefresh(): boolean`. `src/components/break/pay-copy.ts`: `lateReleaseText(hostName)`, `payeeFor(handles, hostName)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/network-note.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from "vitest";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "./network-note";

afterEach(() => vi.unstubAllGlobals());

describe("canRefresh", () => {
  it("refreshes unless the browser says it is offline", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(canRefresh()).toBe(true);
    vi.stubGlobal("navigator", { onLine: false });
    expect(canRefresh()).toBe(false);
    vi.stubGlobal("navigator", {});
    expect(canRefresh()).toBe(true);
  });
  it("words the two notes differently: only the online one promises a refreshed board", () => {
    expect(NETWORK_NOTE).toBe("Couldn't reach Breaks. Check your connection; the board is refreshed.");
    expect(OFFLINE_NOTE).toBe("You're offline. Check your connection, then try again.");
  });
});
```

In `src/components/break/pay-copy.test.ts`, change the import line to

```ts
import { commitmentShort, nextPendingOwe, giveBackPrompt, lateReleaseText, payeeFor, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";
```

replace the last test (`"adds the lines just got to what was already owed, …"`) with

```ts
it("adds the lines just got to what was already owed, and shows nothing when none were got", () => {
  const base = { numbers: [7], cents: 500, payByIso: "2026-10-14T01:00:00Z", payByFallback: "9 pm", late: true };
  expect(nextPendingOwe(base, [3, 12], 500)).toEqual({ numbers: [3, 7, 12], cents: 1500, payByIso: "2026-10-14T01:00:00Z", payByFallback: "9 pm", late: true });
  expect(nextPendingOwe(null, [4], 500)).toEqual({ numbers: [4], cents: 500, payByIso: null, payByFallback: null, late: false });
  expect(nextPendingOwe(base, [], 500)).toBeNull();
});

it("words a missed deadline and names who to pay", () => {
  // The sheet renders "Payment was due " + <LocalTime> + ". " + lateReleaseText(host).
  expect(lateReleaseText("Jim")).toBe("Jim can release your lines now.");
  expect(payeeFor({ venmo: "@Jim-R", paypal: "JimR" }, "Jim")).toBe("@Jim-R");
  expect(payeeFor({ paypal: "JimR" }, "Jim")).toBe("paypal.me/JimR");
  expect(payeeFor({}, "Jim")).toBe("Jim");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/lib/network-note.test.ts src/components/break/pay-copy.test.ts`
Expected: FAIL: `canRefresh`, `OFFLINE_NOTE`, `lateReleaseText`, `payeeFor` are not exported, and `nextPendingOwe` drops `late`.

- [ ] **Step 3: Write the helpers**

Append to `src/lib/network-note.ts`:

```ts
/** Fully offline: no refresh happened, so the note says only what to do. */
export const OFFLINE_NOTE = "You're offline. Check your connection, then try again.";

/** Offline, router.refresh() itself fails and Next falls back to a hard navigation: callers skip it and keep the note. */
export function canRefresh(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
```

In `src/components/break/pay-copy.ts`, replace

```ts
export const releaseText = (hostName: string) => `or ${hostName} can release your lines.`;
```

with

```ts
export const releaseText = (hostName: string) => `or ${hostName} can release your lines.`;
/** Past the deadline: follows "Payment was due <LocalTime>." */
export const lateReleaseText = (hostName: string) => `${hostName} can release your lines now.`;
/** Who to pay: the Venmo handle, else the PayPal.me link, else the host's name. */
export const payeeFor = (h: { venmo?: string; paypal?: string }, hostName: string) => h.venmo ?? (h.paypal ? `paypal.me/${h.paypal}` : hostName);
```

and replace the end of the file, from `type OweShape` to the end, with:

```ts
type OweShape = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean };

/** The provisional amount shown before refreshed props land: what was owed, plus the lines just got. Nothing got, nothing provisional. */
export function nextPendingOwe(base: OweShape | null, got: readonly number[], priceCents: number): OweShape | null {
  if (got.length === 0) return null;
  return {
    numbers: [...(base?.numbers ?? []), ...got].sort((x, y) => x - y),
    cents: (base?.cents ?? 0) + got.length * priceCents,
    payByIso: base?.payByIso ?? null,
    payByFallback: base?.payByFallback ?? null,
    late: base?.late ?? false,
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/lib/network-note.test.ts src/components/break/pay-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the two hooks**

Create `src/components/break/use-pay-sheet.ts`:

```ts
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sent } from "@/app/b/[id]/actions";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";

/** What the viewer owes for unsent lines. The deadline travels as ISO plus the server's fallback text (LocalTime). */
export type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean };
export type SheetError = { for: "sent" | "retry"; text: string };

type Options = {
  breakId: string;
  /** What the server says is owed; a provisional owe (set after a claim) stands in until fresh props arrive. */
  owe: Owe | null;
  /** A failure while the sheet is closed shows on the page through this. */
  onNote?: (text: string) => void;
  /** The polite live region. */
  say?: (text: string) => void;
  onSentOk?: () => void;
  onClosed?: () => void;
};

/** The pay sheet's state, shared by the break page and /me: open and close, its error, the provisional owe, "I've sent it". */
export function usePaySheet(o: Options) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<SheetError | null>(null);
  const [pendingOwe, setPendingOwe] = useState<Owe | null>(null);
  const [pending, start] = useTransition();
  const openRef = useRef(false);
  openRef.current = open;
  // Fresh server props carry the real amount and deadline; drop the provisional one.
  useEffect(() => { setPendingOwe(null); }, [o.owe]);
  const owe = o.owe ?? pendingOwe;

  const show = () => { setError(null); setOpen(true); };
  const close = () => { setError(null); setOpen(false); o.onClosed?.(); };
  /** A failure shows inside the sheet while it is open (the page behind a modal is inert), else on the page. */
  const fail = (forWhat: SheetError["for"], text: string) => {
    if (openRef.current) setError({ for: forWhat, text });
    else o.onNote?.(text);
    o.say?.(text);
  };
  /** "I've sent it" for every line still owed. `done` runs only once the server accepted it. */
  const markSent = (done?: () => void) => {
    if (!owe) return;
    setError(null);
    const numbers = owe.numbers;
    start(async () => {
      let r: Awaited<ReturnType<typeof sent>>;
      try {
        r = await sent(o.breakId, numbers);
      } catch {
        if (canRefresh()) { router.refresh(); fail("sent", NETWORK_NOTE); } else fail("sent", OFFLINE_NOTE);
        return;
      }
      if (r.ok) {
        done?.();
        setPendingOwe(null);
        close();
        o.onSentOk?.();
        return;
      }
      // The owe or the lines changed under us: catch the props up now.
      router.refresh();
      fail("sent", r.message);
    });
  };
  return { open, show, close, error, setError, fail, owe, pendingOwe, setPendingOwe, markSent, pending };
}
```

Create `src/components/break/use-claim.ts`:

```ts
"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";

export type ClaimData = { got: number[]; taken?: number[] };

type Options = {
  /** useOptimistic's setter: marks lines as taken by the viewer while the claim is in flight. */
  markClaimed: (numbers: number[]) => void;
  /** Runs inside the claim's transition, so optimistic marks hold until refreshed props land. */
  onDone: (r: ActionResult<ClaimData>, requested: number[]) => void;
  /** The action threw (dropped connection, 5xx): it may have committed. The batch id is kept for the retry. */
  onUnreachable: () => void;
};

/**
 * One claim at a time. The batch id belongs to one request: kept across a thrown action (a retry returns the same
 * lines, not new ones), renewed after a successful result and whenever the caller changes the request (newBatch).
 */
export function useClaim(o: Options) {
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const newBatch = () => setBatchId(crypto.randomUUID());
  const run = (optimistic: number[], call: (batchId: string) => Promise<ActionResult<ClaimData>>) => {
    const id = batchId;
    start(async () => {
      if (optimistic.length > 0) o.markClaimed(optimistic);
      let r: ActionResult<ClaimData>;
      try {
        r = await call(id);
      } catch {
        o.onUnreachable();
        return;
      }
      if (r.ok) setBatchId(crypto.randomUUID());
      o.onDone(r, optimistic);
    });
  };
  return { batchId, newBatch, pending, run };
}
```

- [ ] **Step 6: Rebuild the island on the hooks**

Replace the whole of `src/components/break/break-interactive.tsx` with:

```tsx
"use client";
import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest } from "@/app/b/[id]/actions";
import { Grid } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { SegmentedControl } from "@/components/segmented-control";
import { clampStep } from "@/components/stepper-math";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import { PaySheet } from "./pay-sheet";
import { nextPendingOwe } from "./pay-copy";
import { barShown, claimBar, failureNote, limitText, sentNote } from "./claim-bar-state";
import { cellNote, isSelectable, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
import { useAutoRefresh } from "./use-auto-refresh";
import { usePaySheet, type Owe } from "./use-pay-sheet";
import { useClaim, type ClaimData } from "./use-claim";

export type { Owe } from "./use-pay-sheet";

export type BreakInteractiveProps = {
  breakId: string;
  status: BreakStatus;
  claimMode: ClaimMode;
  priceCents: number;
  lineCount: number;
  title: string;
  shareUrl: string;
  /** "Pay within 24 hours. Hosted by @jim. New host." It shares one row with the Grid | List toggle (pixel budget). */
  smallLine: string;
  /** The host's profile (/h/handle): the whole small line links there (design §5.4). Null when the host has no handle. */
  hostHref: string | null;
  cells: GridCell[];
  counts: GridCounts;
  signedIn: boolean;
  allowance: Allowance;
  owe: Owe | null;
  hostName: string;
  payee: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  commitment: string | null;
  closedDaysAgo: number | null;
  initialPick: number[];
  children?: React.ReactNode;
};

type TapNote = { text: string; top: number; left: number };

export function BreakInteractive(p: BreakInteractiveProps) {
  const router = useRouter();
  // Server props are the truth; the optimistic layer only marks lines being claimed right now.
  const [cells, markClaimed] = useOptimistic(p.cells, (cur: GridCell[], numbers: number[]) =>
    cur.map((c) => (numbers.includes(c.number) && c.state === "open" ? { ...c, state: "taken" as const, mine: true } : c)));
  // ?pick= is parsed but not trimmed on the server: keep what is still open, inside the allowance, and say what was dropped.
  const [initial] = useState(() => {
    const r = reconcileSelection(p.initialPick, p.cells, p.allowance.remaining);
    const dropped = [r.taken.length > 0 ? takenAnnouncement(r.taken) : "", r.overLimit.length > 0 ? limitText(p.allowance) : ""];
    return { selected: r.selected, note: dropped.filter(Boolean).join(" ") || null };
  });
  const [selected, setSelected] = useState<number[]>(initial.selected);
  const [struck, setStruck] = useState<number[]>([]);
  // The live region: `n` re-keys the message so the same words twice (one taken cell tapped twice) are announced twice.
  const [announce, setAnnounce] = useState({ text: initial.note ?? "", n: 0 });
  const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
  const [note, setNote] = useState<string | null>(initial.note);
  const [tapNote, setTapNote] = useState<TapNote | null>(null);
  const [outcome, setOutcome] = useState<{ got: number[]; taken: number[] } | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [count, setCount] = useState(1);
  const gridWrap = useRef<HTMLDivElement>(null);
  // The grid's single roving tab stop; null lets the grid choose (first selected, then first open).
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  // Closing the sheet hands focus back to the bar (effect below).
  const restoreFocus = useRef(false);

  const pay = usePaySheet({
    breakId: p.breakId,
    owe: p.owe,
    onNote: setNote,
    say,
    onSentOk: () => { setJustSent(true); setOutcome(null); say(sentNote(p.hostName)); },
    onClosed: () => { restoreFocus.current = true; },
  });

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setOutcome({ got: r.data.got, taken });
      say(outcomeText(r.data.got, taken));
      // Built on what is already shown (a retry adds to the first claim's provisional amount); none got, none provisional.
      pay.setPendingOwe((prev) => nextPendingOwe(p.owe ?? prev, r.data.got, p.priceCents));
      pay.show(); // the claim is committed; now the pay step
      return;
    }
    if (r.code === "NOT_SIGNED_IN") { router.push(loginHref(p.breakId, requested)); return; }
    if (r.code === "NOT_ONBOARDED") { router.push(onboardingHref(p.breakId, requested)); return; }
    const taken = r.details?.taken ?? [];
    if (taken.length > 0) {
      setSelected((cur) => cur.filter((n) => !taken.includes(n)));
      setStruck(taken);
    }
    // The actions revalidate only on success: refresh so the grid and the allowance catch up with the server
    // (struck lines turn taken, a lowered allowance disables the claim) instead of waiting for the 20 s refresh.
    // Called inside the claim's transition, so the optimistic marks hold until the fresh props land.
    router.refresh();
    pay.fail("retry", failureNote(r));
  };

  const claimer = useClaim({
    markClaimed,
    onDone: finish,
    // The claim may have committed: refresh the props (unless offline) and say so where the buyer is looking.
    onUnreachable: () => {
      if (canRefresh()) { router.refresh(); pay.fail("retry", NETWORK_NOTE); } else pay.fail("retry", OFFLINE_NOTE);
    },
  });
  const pending = claimer.pending || pay.pending;

  // Open: claims move. Closed: the host may start the draw. Running draw: the result lands. Keep all three fresh.
  useAutoRefresh(p.status === "open" || p.status === "filled" || p.status === "drawing");

  // When fresh props show a selected line taken by someone else: strike it, drop it, say so.
  // Lines dropped because the allowance shrank are not "taken": they get the limit text instead.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastCells = useRef(p.cells);
  const { cells: freshCells, allowance } = p;
  useEffect(() => {
    if (lastCells.current === freshCells) return;
    lastCells.current = freshCells;
    const cur = selectedRef.current;
    const r = reconcileSelection(cur, freshCells, allowance.remaining);
    if (r.selected.length !== cur.length || r.selected.some((n, i) => n !== cur[i])) setSelected(r.selected);
    const said: string[] = [];
    if (r.taken.length > 0) {
      setStruck(r.taken);
      said.push(takenAnnouncement(r.taken));
    }
    if (r.overLimit.length > 0) {
      const text = limitText(allowance);
      setNote(text);
      said.push(text);
    } else {
      // Back inside the allowance: a limit note left from before no longer applies.
      const text = limitText(allowance);
      setNote((cur) => (cur === text ? null : cur));
    }
    if (said.length > 0) setAnnounce((a) => ({ text: said.join(" "), n: a.n + 1 }));
  }, [freshCells, allowance]);

  // The taken-cell popover closes on the next tap anywhere or on Escape.
  useEffect(() => {
    if (!tapNote) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setTapNote(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close, true);
    };
  }, [tapNote]);

  const bar = claimBar({
    status: p.status, signedIn: p.signedIn, claimMode: p.claimMode, selected, priceCents: p.priceCents, openCount: p.counts.open,
    allowance: p.allowance, owe: p.owe, justSent, hostName: p.hostName, payee: p.payee, closedDaysAgo: p.closedDaysAgo,
  });
  // Closing the sheet hands focus back to the bar. The Sheet does it itself, but if the claim is still resolving it
  // may aim at the claim button that is about to be replaced; once the refresh has landed, look again.
  const barKind = bar.kind;
  useEffect(() => {
    if (pay.open || pending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !a.hasAttribute("disabled")) return;
    document.querySelector<HTMLElement>("[data-sticky-bar] button:not([disabled]), [data-sticky-bar] a")?.focus();
  }, [pay.open, pending, barKind]);

  const stepMax = bar.kind === "idle" && bar.stepper ? bar.stepper.max : 1;
  const stepCount = clampStep(count, 1, stepMax);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const struckSet = useMemo(() => new Set(struck), [struck]);
  const canPick = p.status === "open" && p.claimMode !== "straight";
  // Until the refreshed props land, the lines just got still count as open and unspent in them.
  const justGot = pay.pendingOwe && outcome ? outcome.got.length : 0;
  const retryMax = p.status === "open" && p.claimMode === "pick_or_random" ? Math.max(0, Math.min(p.counts.open, p.allowance.remaining) - justGot) : 0;

  /** "Line 7: @mike, paid" in a small popover under the tapped cell, and in the polite live region. */
  const showCellNote = (c: GridCell) => {
    const text = cellNote(c);
    say(text);
    const wrap = gridWrap.current;
    const btn = wrap?.querySelector<HTMLElement>(`[data-testid="cell-${c.number}"]`);
    if (!wrap || !btn) { setTapNote({ text, top: 0, left: 0 }); return; }
    const w = wrap.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    setTapNote({ text, top: r.bottom - w.top + 4, left: Math.max(0, Math.min(r.left - w.left, w.width - 220)) });
  };

  const onPress = (n: number) => {
    const c = cells.find((x) => x.number === n);
    if (!c) return;
    setFocusNumber(n); // the tab stop follows the last cell touched
    // Bonus and reserved lines are never selectable; a selected line can always be deselected.
    if (!selected.includes(n) && !isSelectable(c)) { showCellNote(c); return; }
    if (!canPick) return;
    setTapNote(null);
    const r = toggleSelection(selected, c, p.allowance.remaining);
    if (r.blocked) {
      const text = limitText(p.allowance);
      setNote(text);
      say(text);
      return;
    }
    setNote(null);
    setStruck([]);
    setOutcome(null);
    setSelected(r.next);
    // A changed request is a new batch: the kept id only ever retries the same request after a thrown action.
    claimer.newBatch();
    say(selectionAnnouncement(r.next.length, p.priceCents));
  };

  const onClaim = () => { const numbers = selected; claimer.run(numbers, (id) => claim(p.breakId, numbers, id)); };
  const onStep = () => {
    if (bar.kind !== "idle" || !bar.stepper) return;
    const action = bar.stepper.action;
    const n = stepCount;
    claimer.run([], (id) => (action === "next" ? claimNextAction(p.breakId, n, id) : claimRandomAction(p.breakId, n, id)));
  };
  const onLast = () => {
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    claimer.run(open, (id) => claimRest(p.breakId, id));
  };
  const onRetry = (n: number) => { pay.setError(null); claimer.run([], (id) => claimRandomAction(p.breakId, n, id)); };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-cell]"));
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (index < 0) return;
    const rows = e.currentTarget.querySelector<HTMLElement>("[data-grid-rows]");
    const cols = rows ? getComputedStyle(rows).gridTemplateColumns.split(" ").filter(Boolean).length : 1;
    const next = nextFocusIndex(index, e.key, cols, buttons.length);
    if (next === null) return;
    e.preventDefault();
    // The roving tab stop lives in state (the Grid renders it), never in DOM tabIndex writes React does not know about.
    const n = Number(buttons[next].dataset.cell);
    if (Number.isInteger(n)) setFocusNumber(n);
    buttons[next].focus();
  };

  return (
    <>
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-2">
          {p.hostHref ? <Link href={p.hostHref} className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4" data-testid="host-line">{p.smallLine}</Link> : p.smallLine}
        </p>
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      {/* Only when the bar renders: an idle host with nothing to do gets no bar, and the link would go nowhere. */}
      {barShown(bar) && <a href="#claim-bar" className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus:text-small focus:underline">Skip to claim bar</a>}
      <div ref={gridWrap} className="relative mt-3">
        {view === "grid" ? (
          <Grid
            cells={cells}
            lineCount={p.lineCount}
            label={`Lines, ${p.counts.open} of ${p.lineCount} open`}
            selected={selectedSet}
            struck={struckSet}
            disabledOpen={selected.length >= p.allowance.remaining}
            readOnly={!canPick}
            onPress={onPress}
            onKeyDown={onGridKey}
            focusNumber={focusNumber}
          />
        ) : (
          <LineList cells={cells} title={p.title} shareUrl={p.shareUrl} />
        )}
        {tapNote && (
          <p data-testid="cell-note" style={{ top: tapNote.top, left: tapNote.left }}
            className="absolute z-30 max-w-[220px] rounded-input border border-ink bg-card px-3 py-2 text-small shadow-sheet">
            {tapNote.text}
          </p>
        )}
      </div>
      {note && <p className="mt-2 text-small text-red" data-testid="bar-note">{note}</p>}
      <p role="status" aria-live="polite" className="sr-only"><span key={announce.n}>{announce.text}</span></p>
      {p.children}
      <ClaimBar
        bar={bar}
        pending={pending}
        count={stepCount}
        onCount={(n) => { setCount(n); claimer.newBatch(); }}
        onClaim={onClaim}
        signInHref={loginHref(p.breakId, selected)}
        onStep={onStep}
        onLast={onLast}
        onSent={() => pay.markSent()}
        onOweTap={() => { setOutcome(null); pay.show(); }}
        resultHref={`/b/${p.breakId}/result`}
      />
      <PaySheet
        open={pay.open}
        onClose={pay.close}
        breakId={p.breakId}
        outcome={outcome}
        owe={pay.owe}
        payee={p.payee}
        handles={p.handles}
        instructions={p.instructions}
        hostName={p.hostName}
        commitment={p.commitment}
        retryMax={retryMax}
        onRetry={onRetry}
        onSent={pay.markSent}
        onGaveBack={() => pay.setPendingOwe(null)}
        error={pay.error}
        pending={pending}
      />
    </>
  );
}
```

- [ ] **Step 7: Point the pay sheet at the hook's types and word a missed deadline**

In `src/components/break/pay-sheet.tsx`:

replace `import { NETWORK_NOTE } from "@/lib/network-note";` with `import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";`;

replace `import { giveBackPrompt, payHeadline, releaseText, retryRandomLabel, SENT_HINT, SENT_HINT_KEY } from "./pay-copy";` with `import { giveBackPrompt, lateReleaseText, payHeadline, releaseText, retryRandomLabel, SENT_HINT, SENT_HINT_KEY } from "./pay-copy";`;

replace `import type { Owe } from "./break-interactive";` with `import type { Owe } from "./use-pay-sheet";`;

replace

```tsx
      } catch {
        setError(NETWORK_NOTE); // the give-back may have gone through: the refresh shows what the server holds
      }
```

with

```tsx
      } catch {
        // The give-back may have gone through: the refresh shows what the server holds. Offline, a refresh would
        // fall back to a hard navigation, so keep the note instead.
        if (!canRefresh()) { setError(OFFLINE_NOTE); return; }
        setError(NETWORK_NOTE);
      }
```

and replace

```tsx
                <p className="text-small" data-testid="pay-by">
                  Pay by <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}
                </p>
```

with

```tsx
                <p className="text-small" data-testid="pay-by">
                  {p.owe.late ? (
                    <>Payment was due <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" />. {lateReleaseText(p.hostName)}</>
                  ) : (
                    <>Pay by <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}</>
                  )}
                </p>
```

In `src/app/b/[id]/page.tsx`, replace

```ts
        payByFallback: payBy ? formatDeadline(payBy, now, zone.tz, zone.labelled) : null,
      }
```

with

```ts
        payByFallback: payBy ? formatDeadline(payBy, now, zone.tz, zone.labelled) : null,
        late: payBy !== null && payBy.getTime() < now.getTime(),
      }
```

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The journey and every layout test exercise this refactor unchanged: claims, the pay sheet, Escape and focus return, the failed "I've sent it" inside the sheet, and the dropped claim request (still online, so it keeps "Couldn't reach Breaks. Check your connection; the board is refreshed.").

- [ ] **Step 9: Commit**

```bash
git add src/components/break src/lib/network-note.ts src/lib/network-note.test.ts "src/app/b/[id]/page.tsx"
git commit -m "refactor(break): claim and pay hooks, a missed-deadline line, and no refresh while offline"
```

---

### Task 11: My lines `/me`, and the shell's My lines tab (model: sonnet)

Design §5.8: grouped by break, most recent first: title, my cells, a state line, the amount owed with its deadline, **How to pay Jim** (reopens the pay block), **Give back unpaid lines** with a confirm naming the lines, "Won. Tell Jim your choice." after a win in a choice break; past breaks collapse under "Earlier". (Got it waits for the reputation plan.) Each card reuses `usePaySheet` and `PaySheet` from Task 10. The shell gains **My lines** for every signed-in viewer, so members now get the tab bar on phones and the header nav above 640 (design §5.1: two or more destinations). Server actions that change a buyer's lines also revalidate `/me`.

**Files:**
- Create: `src/components/me/me-copy.ts`, `src/components/me/me-copy.test.ts`, `src/components/me/my-break-card.tsx`
- Create: `src/app/me/card-props.ts`, `src/app/me/card-props.test.ts`, `src/app/me/page.tsx`
- Modify: `src/components/shell/nav.ts`, `src/components/shell/nav.test.ts`
- Modify: `src/app/b/[id]/actions.ts:20` (`done` also revalidates `/me`)
- Modify: `e2e/pages.spec.ts` (My lines test)

**Interfaces:**
- Consumes: `myLines`, `MyBreak` (Task 3); `usePaySheet`, `Owe`, `PaySheet` (Task 10); `giveBack` action; `giveBackPrompt`, `payeeFor`, `commitmentShort` (`pay-copy.ts`); `hostLabel` (`frame-copy.ts`); `formatDeadline`, `viewerZone`; `sentNote` (`claim-bar-state.ts`).
- Produces:
  - `src/components/me/me-copy.ts`: `stateLine(g: Pick<MyBreak, "status" | "unsent" | "sent" | "award">, hostName: string): string` ("Cancelled." for a cancelled break); `howToPayLabel(hostName: string): string`; `type MyBreakCardProps = { breakId: string; title: string; status: string; hostName: string; payee: string; handles: { venmo?: string; paypal?: string }; instructions: string; commitment: string | null; cells: CellData[]; stateLine: string; owe: Owe | null }`.
  - `src/app/me/card-props.ts`: `toCardProps(g: MyBreak, now: Date, zone: Zone): MyBreakCardProps` — `owe` only while the break is open (a cancelled break owes nothing).
  - `MyBreakCard` mounts its `PaySheet` only while that card's sheet is open, so page-level test ids (`pay-sheet`, `pay-amount`, `pay-sent`) stay unique with several owing breaks.
  - `navItems`: signed-in viewers get My lines (`/me`) between Browse and Host.
  - Test ids: `my-break`, `my-state`, `my-owed`, `how-to-pay`, `give-back`, `give-back-yes`, `my-note`, `me-empty`, `me-earlier`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/me/me-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { howToPayLabel, stateLine } from "./me-copy";

const base = { status: "open", unsent: [] as number[], sent: [] as number[], award: null };

describe("stateLine", () => {
  it("says where the viewer's lines stand, a win first", () => {
    expect(stateLine({ ...base, unsent: [5], sent: [3] }, "Jim")).toBe("Unpaid.");
    expect(stateLine({ ...base, sent: [3] }, "Jim")).toBe("Sent. Jim will tick you off when it arrives.");
    expect(stateLine(base, "Jim")).toBe("Paid.");
    expect(stateLine({ ...base, award: { rank: 1, itemName: null, choice: true, shippedAt: null } }, "Jim")).toBe("Won. Tell Jim your choice.");
    expect(stateLine({ ...base, award: { rank: 1, itemName: "Chronos 22g", choice: false, shippedAt: null } }, "Jim")).toBe("Won Chronos 22g.");
    expect(stateLine({ ...base, award: { rank: 2, itemName: "Flight pack", choice: false, shippedAt: null } }, "Jim")).toBe("Won 2nd place: Flight pack.");
    expect(stateLine({ ...base, award: { rank: 1, itemName: "Chronos 22g", choice: false, shippedAt: new Date() } }, "Jim")).toBe("Shipped.");
  });
  it("says a cancelled break is cancelled, never that its lines are unpaid", () => {
    expect(stateLine({ ...base, status: "cancelled", unsent: [5] }, "Jim")).toBe("Cancelled.");
  });
  it("names the host on the pay button", () => {
    expect(howToPayLabel("Jim")).toBe("How to pay Jim");
  });
});
```

Create `src/app/me/card-props.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MyBreak } from "@/domain/lines/queries";
import { toCardProps } from "./card-props";

const now = new Date("2026-10-14T16:00:00Z");
const g: MyBreak = {
  breakId: "b1", title: "Chronos", status: "open", openedAt: now, lineCount: 10, linePriceCents: 500, seedCommitment: "ab".repeat(32),
  paymentWindowHours: 24, paymentInstructions: "Leave the note blank.",
  host: { id: "h1", handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
  lines: [{ number: 3, state: "sent", bonus: false }, { number: 5, state: "taken", bonus: false }, { number: 11, state: "paid", bonus: true }],
  unsent: [5], sent: [3], paid: [11], owedCents: 500, payBy: new Date("2026-10-15T01:40:00Z"), late: false,
  award: null, ranAt: null, earlier: false,
};

describe("toCardProps", () => {
  it("turns a group into what the card shows, with the deadline in the viewer's zone", () => {
    expect(toCardProps(g, now, { tz: "America/New_York", labelled: false })).toEqual({
      breakId: "b1", title: "Chronos", status: "open", hostName: "Jim", payee: "@Jim-R", handles: { venmo: "@Jim-R" },
      instructions: "Leave the note blank.", commitment: "abababababab",
      cells: [
        { number: 3, state: "sent", mine: true, overdue: false, bonus: false },
        { number: 5, state: "taken", mine: true, overdue: false, bonus: false },
        { number: 11, state: "paid", mine: true, overdue: false, bonus: true },
      ],
      stateLine: "Unpaid.",
      owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false },
    });
  });
  it("owes nothing once every unsent line is gone", () => {
    expect(toCardProps({ ...g, unsent: [], owedCents: 0, payBy: null }, now, { tz: "America/New_York", labelled: false }).owe).toBeNull();
  });
  it("owes nothing on a break that is no longer open", () => {
    const cancelled = toCardProps({ ...g, status: "cancelled" }, now, { tz: "America/New_York", labelled: false });
    expect(cancelled.owe).toBeNull();
    expect(cancelled.stateLine).toBe("Cancelled.");
  });
});
```

In `src/components/shell/nav.test.ts`, replace the whole `describe("navItems", …)` block's first test `"shows Host only to hosts and admins"` with

```ts
  it("shows My lines to signed-in viewers and Host only to hosts and admins", () => {
    expect(navItems(null).map((i) => i.label)).toEqual(["Browse"]);
    expect(navItems("member").map((i) => i.label)).toEqual(["Browse", "My lines"]);
    expect(navItems("host").map((i) => i.label)).toEqual(["Browse", "My lines", "Host"]);
    expect(navItems("admin").map((i) => i.label)).toEqual(["Browse", "My lines", "Host"]);
  });
```

replace `const [browse, host] = navItems("host");` with `const [browse, , host] = navItems("host");`, replace the test `"hides a one-item bar (members and signed-out viewers only have Browse in Plan A)"` with

```ts
  it("hides a one-item bar: signed-out viewers only have Browse", () => {
    expect(showTabBar("/", null)).toBe(false);
    expect(showTabBar("/", "member")).toBe(true);
    expect(showTabBar("/me", "member")).toBe(true);
  });
```

and in `describe("showHeaderNav", …)` replace `expect(showHeaderNav("member")).toBe(false);` with `expect(showHeaderNav("member")).toBe(true);`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/me src/app/me src/components/shell`
Expected: FAIL: `./me-copy` and `./card-props` do not exist; `navItems("member")` has no My lines.

- [ ] **Step 3: Write the copy and the props**

Create `src/components/me/me-copy.ts`:

```ts
import type { MyBreak } from "@/domain/lines/queries";
import type { CellData } from "@/components/grid/cell-label";
import type { Owe } from "@/components/break/use-pay-sheet";
import { ordinal } from "@/lib/list";

/** Where the viewer's lines in one break stand (recorded ruling 2): cancelled, else a win or shipment first, then what is still owed. */
export function stateLine(g: Pick<MyBreak, "status" | "unsent" | "sent" | "award">, hostName: string): string {
  if (g.status === "cancelled") return "Cancelled.";
  if (g.award?.shippedAt) return "Shipped.";
  if (g.award) {
    if (g.award.choice) return `Won. Tell ${hostName} your choice.`;
    if (g.award.rank === 1) return g.award.itemName ? `Won ${g.award.itemName}.` : "Won the top spot.";
    return g.award.itemName ? `Won ${ordinal(g.award.rank)} place: ${g.award.itemName}.` : `Won ${ordinal(g.award.rank)} place.`;
  }
  if (g.unsent.length > 0) return "Unpaid.";
  if (g.sent.length > 0) return `Sent. ${hostName} will tick you off when it arrives.`;
  return "Paid.";
}

export const howToPayLabel = (hostName: string) => `How to pay ${hostName}`;

/** Everything one /me card needs, already decided and serialisable. */
export type MyBreakCardProps = {
  breakId: string; title: string; status: string; hostName: string; payee: string;
  handles: { venmo?: string; paypal?: string }; instructions: string; commitment: string | null;
  cells: CellData[]; stateLine: string; owe: Owe | null;
};
```

Create `src/app/me/card-props.ts`:

```ts
import type { MyBreak } from "@/domain/lines/queries";
import { formatDeadline, type Zone } from "@/lib/time";
import { hostLabel } from "@/components/break/frame-copy";
import { commitmentShort, payeeFor } from "@/components/break/pay-copy";
import { stateLine, type MyBreakCardProps } from "@/components/me/me-copy";

/** One /me group → the card's props. The deadline goes down as ISO plus a fallback in the viewer's zone (LocalTime). */
export function toCardProps(g: MyBreak, now: Date, zone: Zone): MyBreakCardProps {
  const hostName = hostLabel(g.host);
  return {
    breakId: g.breakId, title: g.title, status: g.status, hostName, payee: payeeFor(g.host.paymentHandles, hostName),
    handles: g.host.paymentHandles, instructions: g.paymentInstructions, commitment: commitmentShort(g.seedCommitment),
    cells: g.lines.map((l) => ({ number: l.number, state: l.state, mine: true, overdue: false, bonus: l.bonus })),
    stateLine: stateLine(g, hostName),
    // Only an open break asks for money: a cancelled break holding unsent lines owes nothing (its refund is the host's).
    owe: g.status === "open" && g.unsent.length > 0
      ? {
          numbers: g.unsent, cents: g.owedCents,
          payByIso: g.payBy ? g.payBy.toISOString() : null,
          payByFallback: g.payBy ? formatDeadline(g.payBy, now, zone.tz, zone.labelled) : null,
          late: g.late,
        }
      : null,
  };
}
```

In `src/components/shell/nav.ts`, replace

```ts
/** Browse (the feed), and Host for hosts and admins. My lines joins with /me (Task 11). */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/breaks", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") || p.startsWith("/h/") }];
```

with

```ts
/** Browse (the feed), My lines for anyone signed in, Host for hosts and admins (design §5.1). */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/breaks", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") || p.startsWith("/h/") }];
  if (role) items.push({ href: "/me", label: "My lines", match: (p) => p === "/me" || p.startsWith("/me/") });
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/components/me src/app/me src/components/shell`
Expected: PASS.

- [ ] **Step 5: Write the card and the page**

Create `src/components/me/my-break-card.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { giveBack } from "@/app/b/[id]/actions";
import { Button } from "@/components/button";
import { MiniCells } from "@/components/mini-cells";
import { StatusPill } from "@/components/status-pill";
import { LocalTime } from "@/components/local-time";
import { PaySheet } from "@/components/break/pay-sheet";
import { usePaySheet } from "@/components/break/use-pay-sheet";
import { giveBackPrompt, lateReleaseText, releaseText } from "@/components/break/pay-copy";
import { sentNote } from "@/components/break/claim-bar-state";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { formatMoney } from "@/lib/money";
import { howToPayLabel, type MyBreakCardProps } from "./me-copy";

/** One break on /me (design §5.8). The pay block is the break page's own sheet. */
export function MyBreakCard(p: MyBreakCardProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [giving, startGive] = useTransition();
  const pay = usePaySheet({
    breakId: p.breakId,
    owe: p.owe,
    onNote: setNote,
    onSentOk: () => { setNote(sentNote(p.hostName)); router.refresh(); },
  });
  const owe = pay.owe;
  const actionable = p.status === "open" || p.status === "filled";
  const prompt = owe ? giveBackPrompt(owe.numbers) : null;

  const doGiveBack = () => {
    if (!owe) return;
    const numbers = owe.numbers;
    startGive(async () => {
      setNote("");
      try {
        const r = await giveBack(p.breakId, numbers);
        if (r.ok) {
          setConfirming(false);
          setNote(numbers.length === 1 ? `Gave back line ${numbers[0]}.` : `Gave back ${numbers.length} lines.`);
        } else {
          setNote(r.message);
        }
      } catch {
        if (!canRefresh()) { setNote(OFFLINE_NOTE); return; }
        setNote(NETWORK_NOTE);
      }
      router.refresh();
    });
  };

  return (
    <li data-testid="my-break" className="space-y-3 rounded-card border border-wire bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/b/${p.breakId}`} className="min-w-0 font-semibold underline-offset-4 hover:underline">{p.title}</Link>
        <StatusPill status={p.status} />
      </div>
      <MiniCells label="Your lines" cells={p.cells} />
      <p className="text-small" data-testid="my-state">{p.stateLine}</p>
      {owe && (
        <p className="text-small" data-testid="my-owed">
          <span className="font-semibold">You owe {formatMoney(owe.cents)}.</span>{" "}
          {owe.payByIso && owe.payByFallback && (owe.late ? (
            <>Payment was due <LocalTime iso={owe.payByIso} fallback={owe.payByFallback} kind="deadline" />. {lateReleaseText(p.hostName)}</>
          ) : (
            <>Pay by <LocalTime iso={owe.payByIso} fallback={owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}</>
          ))}
        </p>
      )}
      {owe && actionable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={pay.show} data-testid="how-to-pay">{howToPayLabel(p.hostName)}</Button>
          {confirming && prompt ? (
            <div className="w-full space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">{prompt.text}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={doGiveBack} disabled={giving} data-testid="give-back-yes">{prompt.confirm}</Button>
                <Button variant="text" onClick={() => setConfirming(false)}>Keep</Button>
              </div>
            </div>
          ) : (
            <Button variant="text" onClick={() => setConfirming(true)} data-testid="give-back">Give back unpaid lines</Button>
          )}
        </div>
      )}
      <p role="status" className="text-small" data-testid="my-note">{note}</p>
      {/* Mounted only while open: with several owing cards, one closed PaySheet each would repeat its test ids on the page. */}
      {owe && pay.open && (
        <PaySheet
          open={pay.open}
          onClose={pay.close}
          breakId={p.breakId}
          outcome={null}
          owe={owe}
          payee={p.payee}
          handles={p.handles}
          instructions={p.instructions}
          hostName={p.hostName}
          commitment={p.commitment}
          retryMax={0}
          onRetry={() => {}}
          onSent={pay.markSent}
          onGaveBack={() => { pay.setPendingOwe(null); router.refresh(); }}
          error={pay.error}
          pending={pay.pending}
        />
      )}
    </li>
  );
}
```

Create `src/app/me/page.tsx`:

```tsx
import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { myLines } from "@/domain/lines/queries";
import { viewerZone } from "@/lib/zone";
import { MyBreakCard } from "@/components/me/my-break-card";
import { toCardProps } from "./card-props";

export const metadata = { title: "My lines" };

export default async function MyLinesPage() {
  const caller = await requireCaller("/me");
  const now = new Date();
  const zone = await viewerZone();
  const groups = await db.transaction((tx) => myLines(tx, caller.id, now));
  const current = groups.filter((g) => !g.earlier).map((g) => toCardProps(g, now, zone));
  const earlier = groups.filter((g) => g.earlier).map((g) => toCardProps(g, now, zone));
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">My lines</h1>
      {groups.length === 0 && (
        <p className="text-ink-2" data-testid="me-empty">
          No lines yet. <Link href="/breaks" className="underline underline-offset-4">Browse breaks</Link> to find one.
        </p>
      )}
      {current.length > 0 && <ul className="space-y-3">{current.map((c) => <MyBreakCard key={c.breakId} {...c} />)}</ul>}
      {earlier.length > 0 && (
        <details className="rounded-card border border-wire bg-card" data-testid="me-earlier">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Earlier</summary>
          <ul className="space-y-3 px-4 pb-4">{earlier.map((c) => <MyBreakCard key={c.breakId} {...c} />)}</ul>
        </details>
      )}
    </main>
  );
}
```

In `src/app/b/[id]/actions.ts`, replace

```ts
const done = (breakId: string) => revalidatePath(`/b/${breakId}`);
```

with

```ts
/** A buyer's lines changed: the break page and /me both show them. */
const done = (breakId: string) => { revalidatePath(`/b/${breakId}`); revalidatePath("/me"); };
```

- [ ] **Step 6: Pin `/me` in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("My lines shows what a buyer holds, reopens the pay block, and gives lines back", async ({ browser }) => {
  const host = await as(browser, `mh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Mine ${run}`, lineCount: 6 });
  const buyer = await as(browser, `mb${run}@e2e.test`);
  await expect(buyer.getByRole("link", { name: "My lines" })).toBeVisible(); // members get the tab bar now
  await buyer.goto(url);
  await buyer.getByTestId("cell-2").click();
  await buyer.getByTestId("cell-3").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeVisible();
  await buyer.getByRole("button", { name: "I'll pay later" }).click();

  await buyer.goto("/me"); // the break page hides the tab bar (one bar at the bottom)
  const card = buyer.getByTestId("my-break").filter({ hasText: `Mine ${run}` });
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await expect(card.getByTestId("my-owed")).toContainText("You owe $10.");
  await card.getByTestId("how-to-pay").click();
  await expect(buyer.getByTestId("pay-amount")).toHaveText("Send $10 to @e2e-host");
  await buyer.getByTestId("pay-sent").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeHidden();
  await expect(card.getByTestId("my-state")).toHaveText(`Sent. mh${run} will tick you off when it arrives.`);

  await buyer.goto(url);
  await buyer.getByTestId("cell-5").click();
  await buyer.getByTestId("claim-submit").click();
  await buyer.getByRole("button", { name: "I'll pay later" }).click();
  await buyer.goto("/me");
  await card.getByTestId("give-back").click();
  await expect(card).toContainText("Give back line 5? It goes back on the board.");
  await card.getByTestId("give-back-yes").click();
  await expect(card.getByTestId("my-note")).toHaveText("Gave back line 5.");
  await expect(card.getByTestId("my-owed")).toHaveCount(0);
});
```

(`/test/login` sets the display name to the handle, so the host's name on the card is `mh<run>`; the composer saved `@e2e-host` as the Venmo handle, which is the payee.)

- [ ] **Step 7: Optional: check by hand**

If you have a browser tool: in `pnpm dev`, hold lines in two breaks, open `/me` at 390 wide, use How to pay and Give back, and check the tab bar. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The break page hides the tab bar (`/b/…`), so the layout spec's pixel budget is unchanged for members.

- [ ] **Step 9: Commit**

```bash
git add src/components/me src/app/me src/components/shell/nav.ts src/components/shell/nav.test.ts "src/app/b/[id]/actions.ts" e2e/pages.spec.ts
git commit -m "feat(me): My lines with the pay block, give back, wins and Earlier"
```

---

### Task 12: `/host` grouped by state, with the "waiting on you" strip and its merged ledger (model: sonnet)

Design §5.5, last paragraph: `/host` lists the host's breaks grouped by state (Open, Closed, Running draw, Ran, Drafts) with the mini fill bar and **New break** at the top, and above the list a strip "7 sent, waiting for you, across 3 breaks" that opens a merged ledger with the break title on each row. The merged ledger is the per-break ledger with titles added, so it is built from the same `LedgerRow` and `ledger-view` helpers and behaves the same way: one **Paid** button per buyer per break; marking paid turns the row "Paid" in place with **Undo** beside it for 8 s and a polite snackbar ("Marked @dave paid (1 line, $5)."); rows never move under the thumb (the list is frozen when the sheet opens and refreshed when it closes). The strip's own button says **Review**, never a state word. Drafts link to their edit page (Task 6b). Minis are already gone from the list (Task 1).

**Files:**
- Create: `src/app/host/groups.ts`, `src/app/host/groups.test.ts`
- Modify: `src/components/ledger/ledger-view.ts` (append `WaitingView`, `markedPaid`), `src/components/ledger/ledger-view.test.ts`
- Modify: `src/components/ledger/ledger-row.tsx` (optional `title`; `onToggle` optional)
- Create: `src/components/ledger/waiting-strip.tsx`
- Modify: `src/app/host/page.tsx` (whole file)
- Modify: `e2e/pages.spec.ts` (the /host test)

**Interfaces:**
- Consumes: `listHostBreaks`, `HostBreakRow` (Task 1); `waitingOnHost(tx, hostId: string): Promise<WaitingRow[]>` with `type WaitingRow = { breakId: string; breakTitle: string; ownerId: string; handle: string | null; displayName: string | null; paymentName: string | null; sent: number[]; sentCents: number; firstSentAt: Date }` (Task 3); `paidForBuyer`, `unpaidForBuyer` actions; `LedgerRow`, `LedgerRowView` (with `paymentName`, Task 2), `paidToast`; `Sheet`, `Toast`, `FillBar`, `StatusPill`, `statusWord`; `canRefresh`/`NETWORK_NOTE`/`OFFLINE_NOTE` (Task 10); `composeBreak` (`e2e/helpers.ts`, Task 6b).
- Produces:
  - `src/app/host/groups.ts`: `type HostGroup<T> = { status: string; label: string; rows: T[] }`; `groupHostBreaks<T extends { status: string }>(rows: readonly T[]): HostGroup<T>[]` (order Open, Closed, Running draw, Ran, Drafts, Cancelled; empty groups dropped); `waitingStripText(rows: readonly { breakId: string }[]): string | null`; `toWaitingView(w: WaitingRow): WaitingView`.
  - `src/components/ledger/ledger-view.ts`: `type WaitingView = { key: string; breakId: string; breakTitle: string; row: LedgerRowView }` (`key` = `breakId:ownerId`); `markedPaid(r: LedgerRowView): LedgerRowView` (the row as it reads once its unpaid lines are paid).
  - `LedgerRow` gains `title?: string` (a line above the row naming its break) and `onToggle` becomes optional (without it the name is plain text and the row does not expand).
  - `WaitingStrip({ text: string | null; rows: WaitingView[] })` (the button shows only with text; the sheet stays mounted).
  - Test ids: `new-break`, `group-<status>`, `waiting-strip`, `waiting-sheet`; rows inside the sheet reuse the ledger's `ledger-row`, `ledger-paid`, `ledger-undo`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/host/groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupHostBreaks, toWaitingView, waitingStripText } from "./groups";

describe("groupHostBreaks", () => {
  it("groups in the design's order with the community's words, keeping each group's order and dropping empty ones", () => {
    const rows = [
      { id: "d1", status: "draft" }, { id: "o1", status: "open" }, { id: "r1", status: "drawn" },
      { id: "o2", status: "open" }, { id: "c1", status: "filled" }, { id: "x1", status: "cancelled" },
    ];
    expect(groupHostBreaks(rows).map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["Open", ["o1", "o2"]], ["Closed", ["c1"]], ["Ran", ["r1"]], ["Drafts", ["d1"]], ["Cancelled", ["x1"]],
    ]);
    expect(groupHostBreaks([])).toEqual([]);
  });
});

describe("waitingStripText", () => {
  it("counts buyer rows and the breaks they span", () => {
    expect(waitingStripText([])).toBeNull();
    expect(waitingStripText([{ breakId: "a" }])).toBe("1 sent, waiting for you");
    expect(waitingStripText([{ breakId: "a" }, { breakId: "a" }])).toBe("2 sent, waiting for you");
    expect(waitingStripText([{ breakId: "a" }, { breakId: "b" }, { breakId: "c" }, { breakId: "a" }])).toBe("4 sent, waiting for you, across 3 breaks");
  });
});

describe("toWaitingView", () => {
  it("shapes a buyer's sent lines in one break as a ledger row, keyed by break and buyer", () => {
    const w = {
      breakId: "b1", breakTitle: "Chronos", ownerId: "u1", handle: "dave", displayName: "Dave", paymentName: "David R",
      sent: [3, 4], sentCents: 1000, firstSentAt: new Date("2026-10-14T12:00:00Z"),
    };
    expect(toWaitingView(w)).toEqual({
      key: "b1:u1", breakId: "b1", breakTitle: "Chronos",
      row: {
        ownerId: "u1", handle: "dave", displayName: "Dave", paymentName: "David R",
        numbers: [3, 4], unpaid: [3, 4], sent: [3, 4], overdue: [], paid: [], bonus: [], owedCents: 1000, status: "sent", lateText: null,
      },
    });
  });
});
```

In `src/components/ledger/ledger-view.test.ts`, change the import list

```ts
  applyOrder, applyView, bonusText, drawingText, freezeView, chipCounts, freezeOrder, markPaidLabel, matchesFilter, matchesQuery, paidToast, releaseConfirm, releaseReason, rowCells, rowStateWord, type LedgerRowView,
```

to

```ts
  applyOrder, applyView, bonusText, drawingText, freezeView, chipCounts, freezeOrder, markedPaid, markPaidLabel, matchesFilter, matchesQuery, paidToast, releaseConfirm, releaseReason, rowCells, rowStateWord, type LedgerRowView,
```

and append at the end of the file:

```ts
describe("markedPaid", () => {
  it("is the row once its unpaid lines are paid: no owe, no lateness, bonus and paid lines kept", () => {
    expect(markedPaid(erin)).toEqual({ ...erin, unpaid: [], sent: [], overdue: [], paid: [10, 11, 12], owedCents: 0, status: "paid", lateText: null });
    expect(markedPaid(alice)).toMatchObject({ unpaid: [], sent: [], paid: [2, 5], owedCents: 0, status: "paid" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/app/host/groups.test.ts src/components/ledger/ledger-view.test.ts`
Expected: FAIL: `./groups` does not exist and `markedPaid` is not exported.

- [ ] **Step 3: Write the grouping and the row helpers**

Append to `src/components/ledger/ledger-view.ts`:

```ts
/** One row of the merged "waiting on you" ledger (design §5.5): a buyer's sent lines in one break, with its title. */
export type WaitingView = { key: string; breakId: string; breakTitle: string; row: LedgerRowView };

/** The row as it reads once its unpaid lines are marked paid: kept in place, shown "Paid" (rows never move). */
export function markedPaid(r: LedgerRowView): LedgerRowView {
  return {
    ...r, unpaid: [], sent: [], overdue: [], paid: [...r.paid, ...r.unpaid].sort((a, b) => a - b), owedCents: 0, status: "paid", lateText: null,
  };
}
```

Create `src/app/host/groups.ts`:

```ts
import { statusWord } from "@/components/status-word";
import type { WaitingView } from "@/components/ledger/ledger-view";
import type { WaitingRow } from "@/domain/lines/queries";

const ORDER = ["open", "filled", "drawing", "drawn", "draft", "cancelled"] as const;

export type HostGroup<T> = { status: string; label: string; rows: T[] };

/** /host (design §5.5): Open, Closed, Running draw, Ran, Drafts, then Cancelled. Rows keep their order; empty groups go. */
export function groupHostBreaks<T extends { status: string }>(rows: readonly T[]): HostGroup<T>[] {
  return ORDER
    .map((s) => ({ status: s as string, label: s === "draft" ? "Drafts" : statusWord(s), rows: rows.filter((r) => r.status === s) }))
    .filter((g) => g.rows.length > 0);
}

/** "7 sent, waiting for you, across 3 breaks": one count per buyer per break (recorded ruling 3). */
export function waitingStripText(rows: readonly { breakId: string }[]): string | null {
  if (rows.length === 0) return null;
  const breaks = new Set(rows.map((r) => r.breakId)).size;
  return breaks > 1 ? `${rows.length} sent, waiting for you, across ${breaks} breaks` : `${rows.length} sent, waiting for you`;
}

/** A buyer's sent lines in one break, shaped as the per-break ledger's row so the merged ledger reuses LedgerRow. */
export function toWaitingView(w: WaitingRow): WaitingView {
  return {
    key: `${w.breakId}:${w.ownerId}`, breakId: w.breakId, breakTitle: w.breakTitle,
    row: {
      ownerId: w.ownerId, handle: w.handle, displayName: w.displayName, paymentName: w.paymentName,
      numbers: w.sent, unpaid: w.sent, sent: w.sent, overdue: [], paid: [], bonus: [], owedCents: w.sentCents, status: "sent", lateText: null,
    },
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/app/host/groups.test.ts src/components/ledger/ledger-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Let `LedgerRow` carry a break title and skip the expanding row**

In `src/components/ledger/ledger-row.tsx`, in `Props` replace

```ts
  onToggle: () => void;
```

with

```ts
  /** Expands the row (per-line marking, Release, bonus). Without it the name is plain text: the merged ledger. */
  onToggle?: () => void;
  /** The merged "waiting on you" ledger names each row's break above it (design §5.5). */
  title?: string;
```

replace

```tsx
    <li data-testid="ledger-row" data-status={r.status} className="border-b border-wire bg-card">
      <div className={`flex min-h-14 gap-3 px-4 py-2 ${LEDGER_COLS}`}>
        <div className="min-w-0 flex-1 sm:contents">
          <button type="button" onClick={p.onToggle} aria-expanded={p.expanded} className="flex min-h-11 w-full min-w-0 items-baseline gap-2 text-left">
            <span className="truncate font-semibold">{name}</span>
            {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
            {r.paymentName && <span className="truncate text-small text-ink-2" data-testid="pays-as">pays as {r.paymentName}</span>}
          </button>
```

with

```tsx
    <li data-testid="ledger-row" data-status={r.status} className="border-b border-wire bg-card">
      {p.title && <p className="truncate px-4 pt-2 text-small text-ink-2">{p.title}</p>}
      <div className={`flex min-h-14 gap-3 px-4 py-2 ${LEDGER_COLS}`}>
        <div className="min-w-0 flex-1 sm:contents">
          {p.onToggle ? (
            <button type="button" onClick={p.onToggle} aria-expanded={p.expanded} className="flex min-h-11 w-full min-w-0 items-baseline gap-2 text-left">
              <span className="truncate font-semibold">{name}</span>
              {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
              {r.paymentName && <span className="truncate text-small text-ink-2" data-testid="pays-as">pays as {r.paymentName}</span>}
            </button>
          ) : (
            <p className="flex min-h-11 w-full min-w-0 items-baseline gap-2">
              <span className="truncate font-semibold">{name}</span>
              {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
              {r.paymentName && <span className="truncate text-small text-ink-2" data-testid="pays-as">pays as {r.paymentName}</span>}
            </p>
          )}
```

and replace

```tsx
      {p.expanded && (
```

with

```tsx
      {p.expanded && p.onToggle && (
```

(The per-break ledger still passes `onToggle`, so it renders exactly as before.)

- [ ] **Step 6: Write the strip and its sheet**

Create `src/components/ledger/waiting-strip.tsx`:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paidForBuyer, unpaidForBuyer } from "@/app/b/[id]/actions";
import { Sheet } from "@/components/sheet";
import { Toast } from "@/components/toast";
import type { ActionResult } from "@/lib/action";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";
import { LedgerRow } from "./ledger-row";
import { markedPaid, paidToast, type LedgerRowView, type WaitingView } from "./ledger-view";

const UNDO_MS = 8000;
const noop = () => {};

/**
 * The /host strip and its merged ledger (design §5.5): sent lines across the host's breaks, one LedgerRow per buyer
 * per break with the break title above it. As in the per-break ledger, Paid turns the row "Paid" in place with Undo
 * beside it for 8 s and a polite snackbar, and rows never move under the thumb: the list is frozen when the sheet
 * opens (paid rows are patched in place) and refreshed from the server when it closes. The sheet stays mounted when
 * the last row is paid, so the host is never thrown out of it.
 */
export function WaitingStrip({ text, rows }: { text: string | null; rows: WaitingView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState<WaitingView[]>(rows);
  // Rows marked paid in this sheet: the row as it was (Undo puts it back) and until when Undo shows.
  const [recent, setRecent] = useState<Record<string, { before: LedgerRowView; until: number }>>({});
  const [toast, setToast] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Undo lasts 8 s per row; the snackbar goes with the row it speaks about (the per-break ledger's timer).
  useEffect(() => {
    const keys = Object.keys(recent);
    if (keys.length === 0) return;
    const soonest = Math.min(...keys.map((k) => recent[k].until));
    const t = window.setTimeout(() => {
      const now = Date.now();
      const live = Object.fromEntries(Object.entries(recent).filter(([, v]) => v.until > now));
      setRecent(live);
      setToast((cur) => (cur && live[cur.key] ? cur : null));
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(t);
  }, [recent]);

  const show = () => { setFrozen(rows); setRecent({}); setToast(null); setError(null); setOpen(true); };
  const close = () => { setOpen(false); setRecent({}); setToast(null); router.refresh(); };
  const patch = (key: string, row: LedgerRowView) => setFrozen((cur) => cur.map((w) => (w.key === key ? { ...w, row } : w)));

  const run = (fn: () => Promise<ActionResult<unknown>>, onOk: () => void) =>
    start(async () => {
      setError(null);
      let r: ActionResult<unknown>;
      try {
        r = await fn();
      } catch {
        setError(canRefresh() ? NETWORK_NOTE : OFFLINE_NOTE);
        return;
      }
      if (r.ok) { onOk(); return; }
      setError(r.message);
    });

  const markPaid = (w: WaitingView) => {
    const before = w.row;
    const numbers = before.unpaid;
    if (numbers.length === 0) return;
    run(() => paidForBuyer(w.breakId, before.ownerId, numbers), () => {
      patch(w.key, markedPaid(before));
      setRecent((cur) => ({ ...cur, [w.key]: { before, until: Date.now() + UNDO_MS } }));
      setToast({ key: w.key, text: paidToast(before, numbers, before.owedCents) });
    });
  };
  const undo = (w: WaitingView) => {
    const r = recent[w.key];
    if (!r) return;
    run(() => unpaidForBuyer(w.breakId, r.before.unpaid), () => {
      patch(w.key, r.before);
      setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== w.key)));
      setToast((cur) => (cur?.key === w.key ? null : cur));
    });
  };

  return (
    <>
      {text && (
        <button type="button" onClick={show} data-testid="waiting-strip" aria-label={`${text}. Review`}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card border border-ink bg-card px-4 py-3 text-left font-semibold">
          <span>{text}</span>
          {/* Says what happens; never a state word ("Open" sits right above the Open group). */}
          <span className="shrink-0 text-small underline underline-offset-4">Review</span>
        </button>
      )}
      <Sheet full open={open} onClose={close} title="Sent, waiting for you" testId="waiting-sheet">
        <ul aria-label="Buyers" className="-mx-4 border-t border-wire">
          {frozen.map((w) => (
            <LedgerRow
              key={w.key}
              title={w.breakTitle}
              row={w.row}
              actionable
              recentlyPaid={!!recent[w.key]}
              pending={pending}
              expanded={false}
              bonusUsed={0}
              bonusMax={0}
              onPaid={() => markPaid(w)}
              onUndo={() => undo(w)}
              onMarkLine={noop}
              onUnmarkLine={noop}
              onRelease={noop}
              onBonus={noop}
            />
          ))}
        </ul>
        {error && <p role="alert" className="mt-3 text-small text-red">{error}</p>}
        <Toast message={toast?.text ?? null} offset="none" />
      </Sheet>
    </>
  );
}
```

- [ ] **Step 7: Rebuild `/host`**

Replace the whole of `src/app/host/page.tsx` with:

```tsx
import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { listHostBreaks } from "@/domain/breaks/queries";
import { waitingOnHost } from "@/domain/lines/queries";
import { ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { FillBar } from "@/components/fill-bar";
import { WaitingStrip } from "@/components/ledger/waiting-strip";
import { groupHostBreaks, toWaitingView, waitingStripText } from "./groups";

export const metadata = { title: "Your breaks" };

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { rows, waiting } = await db.transaction(async (tx) => ({
    rows: await listHostBreaks(tx, caller.id),
    waiting: await waitingOnHost(tx, caller.id),
  }));
  const groups = groupHostBreaks(rows);
  const strip = waitingStripText(waiting);

  return (
    <main className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-condensed text-title font-semibold">Your breaks</h1>
        <ButtonLink href="/host/new" data-testid="new-break">New break</ButtonLink>
      </div>
      <WaitingStrip text={strip} rows={waiting.map(toWaitingView)} />
      {groups.length === 0 && <p className="text-small text-ink-2">No breaks yet. Start one with New break.</p>}
      {groups.map((g) => (
        <section key={g.status} aria-labelledby={`group-${g.status}`} data-testid={`group-${g.status}`} className="space-y-2">
          <h2 id={`group-${g.status}`} className="text-headline font-semibold">
            {g.label} <span className="text-small font-normal text-ink-2 tabular">{g.rows.length}</span>
          </h2>
          <ul className="divide-y divide-wire rounded-card border border-wire bg-card">
            {g.rows.map((b) => (
              <li key={b.id}>
                <Link href={b.status === "draft" ? `/host/${b.id}/edit` : `/b/${b.id}`} className="block space-y-2 px-4 py-3">
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{b.title}</span>
                    <StatusPill status={b.status} />
                  </span>
                  <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} />
                  <span className="block text-small text-ink-2 tabular">{b.paid} of {b.lineCount} paid</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 8: Pin `/host` in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("/host groups breaks by state; the waiting strip marks sent lines paid in place, with Undo, without moving rows", async ({ browser }) => {
  const host = await as(browser, `wh${run}@e2e.test`, "host");
  const first = await composeBreak(host, { title: `Wait A ${run}` });
  const second = await composeBreak(host, { title: `Wait B ${run}` });
  await composeBreak(host, { title: `Wait draft ${run}`, intent: "draft" });
  const buyer = await as(browser, `wb${run}@e2e.test`);
  for (const url of [first, second]) {
    await buyer.goto(url);
    await buyer.getByTestId("cell-1").click();
    await buyer.getByTestId("claim-submit").click();
    await buyer.getByTestId("pay-sent").click();
    await expect(buyer.getByTestId("pay-sheet")).toBeHidden();
  }
  await host.goto("/host");
  await expect(host.getByTestId("group-open")).toContainText(`Wait A ${run}`);
  await expect(host.getByTestId("group-draft")).toContainText(`Wait draft ${run}`);
  await expect(host.getByTestId("waiting-strip")).toContainText("2 sent, waiting for you, across 2 breaks");
  await expect(host.getByTestId("waiting-strip")).toContainText("Review");
  await host.getByTestId("waiting-strip").click();
  const sheet = host.getByTestId("waiting-sheet");
  const rows = sheet.getByTestId("ledger-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Wait A ${run}`); // oldest sent first
  // Paid, then Undo: the row comes back to Paid, in the same place.
  await sheet.getByTestId("ledger-paid").first().click();
  await expect(sheet.getByTestId("ledger-undo")).toBeVisible();
  await expect(sheet.getByRole("status").filter({ hasText: `Marked @wb${run} paid (1 line, $5).` })).toBeVisible();
  await sheet.getByTestId("ledger-undo").click();
  await expect(sheet.getByTestId("ledger-paid")).toHaveCount(2);
  // Paid for real: the row stays put, showing Paid.
  await sheet.getByTestId("ledger-paid").first().click();
  await expect(sheet.getByTestId("ledger-paid")).toHaveCount(1);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Wait A ${run}`);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(host.getByTestId("waiting-strip")).toContainText("1 sent, waiting for you");
});
```

- [ ] **Step 9: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The per-break ledger (journey 1, layout spec) passes `onToggle` and no `title`, so its rows render as before.

- [ ] **Step 10: Commit**

```bash
git add src/app/host/groups.ts src/app/host/groups.test.ts src/app/host/page.tsx src/components/ledger/ledger-view.ts src/components/ledger/ledger-view.test.ts src/components/ledger/ledger-row.tsx src/components/ledger/waiting-strip.tsx e2e/pages.spec.ts
git commit -m "feat(host): breaks grouped by state and the sent-and-waiting strip with Undo"
```

---

### Task 13: The link-preview image per break (model: opus)

Design §6, last paragraph: link previews carry a server-rendered image of the thumbnail beside the grid in its current state with "19 of 50 left, $5 a line". Facebook's crawler has no session, so the image is built exactly as an anonymous viewer sees the break: through `shapeGrid` with no viewer, keeping only each cell's number and a tone, and the route never reads the session at all, so a draft answers 404 even to its own host. Until photos exist the thumbnail is the grid itself (design §8), so the image is the grid on the left and the title and caption on the right. `generateMetadata` adds Open Graph and Twitter tags pointing at it.

**Files:**
- Create: `src/domain/breaks/og.ts`, `src/domain/breaks/og.test.ts`
- Create: `src/app/b/[id]/og/route.tsx`
- Modify: `src/app/b/[id]/page.tsx` (`generateMetadata`)
- Modify: `e2e/pages.spec.ts` (image and tags)

**Interfaces:**
- Consumes: `getBreakPage`, `BreakPage` (`queries.ts`), `shapeGrid`, `canViewBreak` (`grid.ts`), `loadBreak` (Task 4), `formatMoney`, `env().APP_URL`.
- Produces:
  - `src/domain/breaks/og.ts`: `type OgTone = "open" | "taken" | "paid" | "reserved"`; `type OgCell = { number: number; tone: OgTone }`; `type OgModel = { title: string; caption: string; cells: OgCell[]; columns: number }`; `ogCaption(status, open, total, priceCents): string`; `ogModel(page: BreakPage, now: Date): OgModel | null`.
  - `GET /b/{id}/og` → 1200 × 630 PNG, `Cache-Control: public, max-age=300, s-maxage=300`; 404 for a bad id, a missing break or a draft.
  - Break page metadata: `og:image` = `${APP_URL}/b/{id}/og` (1200 × 630), `twitter:card` = `summary_large_image`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/breaks/og.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { BreakPage } from "./queries";
import { ogCaption, ogModel } from "./og";

const HOST = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000a2";
const now = new Date("2026-10-14T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

type L = BreakPage["lines"][number];
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const alice = (number: number, o: Partial<L> = {}): L => ({ ...open(number), ownerId: ALICE, ownerHandle: "alice", claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Taylor Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
    items: [], prizes: [], lines,
  };
}

// 1 open; 2 alice sent; 3 alice overdue (claimed 30 h ago, unsent); 4 alice paid; 5 and 6 open; 7 alice's bonus line.
const lines: L[] = [
  open(1), alice(2, { sentAt: hoursAgo(0.5) }), alice(3, { claimedAt: hoursAgo(30) }), alice(4, { paidAt: hoursAgo(2) }),
  open(5), open(6), alice(7, { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];

describe("ogModel (Review Focus 4)", () => {
  it("draws the grid as an anonymous viewer sees it: tones only, no holder, no bonus lines", () => {
    const m = ogModel(page(lines), now)!;
    expect(m).toEqual({
      title: "Taylor Chronos",
      caption: "3 of 6 left, $5 a line",
      columns: 4,
      cells: [
        { number: 1, tone: "open" }, { number: 2, tone: "taken" }, { number: 3, tone: "taken" },
        { number: 4, tone: "paid" }, { number: 5, tone: "open" }, { number: 6, tone: "open" },
      ],
    });
    const text = JSON.stringify(m);
    expect(text).not.toContain("alice");
    expect(text).not.toContain(ALICE);
    expect(text).not.toContain("Jim-R");
    expect(m.cells.every((c) => Object.keys(c).sort().join() === "number,tone")).toBe(true);
  });
  it("is null for a draft, whoever asks", () => {
    expect(ogModel(page([], { status: "draft" }), now)).toBeNull();
  });
  it("shortens a long title", () => {
    const m = ogModel(page(lines, { title: "x".repeat(120) }), now)!;
    expect(m.title).toHaveLength(80);
    expect(m.title.endsWith("…")).toBe(true);
  });
});

describe("ogCaption", () => {
  it("speaks the community's state words", () => {
    expect(ogCaption("open", 19, 50, 500)).toBe("19 of 50 left, $5 a line");
    expect(ogCaption("open", 3, 12, 550)).toBe("3 of 12 left, $5.50 a line");
    expect(ogCaption("filled", 0, 50, 500)).toBe("Closed. Every line is paid.");
    expect(ogCaption("drawing", 0, 50, 500)).toBe("Running draw");
    expect(ogCaption("drawn", 0, 50, 500)).toBe("Ran. Anyone can check the draw.");
    expect(ogCaption("cancelled", 0, 50, 500)).toBe("Cancelled");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: FAIL: `./og` does not exist.

- [ ] **Step 3: Write the model**

Create `src/domain/breaks/og.ts`:

```ts
import { formatMoney } from "@/lib/money";
import { canViewBreak, shapeGrid } from "./grid";
import type { BreakPage } from "./queries";

export type OgTone = "open" | "taken" | "paid" | "reserved";
export type OgCell = { number: number; tone: OgTone };
export type OgModel = { title: string; caption: string; cells: OgCell[]; columns: number };

const MAX_TITLE = 80;

/** The image's caption (design §6): "19 of 50 left, $5 a line" while open, the community's state word after. */
export function ogCaption(status: string, open: number, total: number, priceCents: number): string {
  switch (status) {
    case "open": return `${open} of ${total} left, ${formatMoney(priceCents)} a line`;
    case "filled": return "Closed. Every line is paid.";
    case "drawing": return "Running draw";
    case "drawn": return "Ran. Anyone can check the draw.";
    case "cancelled": return "Cancelled";
    default: return "";
  }
}

/**
 * The link preview, anonymous by construction: link crawlers have no session, so the grid is shaped for no viewer
 * (shapeGrid withholds holders and the overdue flag) and only each cell's number and tone leave this function.
 * Taken and sent share one tone; bonus lines are left out (the image shows lines 1..N). Null when an anonymous
 * viewer may not see the break (a draft).
 */
export function ogModel(page: BreakPage, now: Date): OgModel | null {
  const b = page.break;
  if (!canViewBreak(b.status, false)) return null;
  const grid = shapeGrid(page, null, now);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c) => ({ number: c.number, tone: c.state === "sent" ? "taken" : c.state }));
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.lineCount, b.linePriceCents),
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the image route**

Create `src/app/b/[id]/og/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { ogModel, type OgTone } from "@/domain/breaks/og";
import { isUuid } from "@/lib/is-uuid";

// Board tokens (src/app/tokens.css) as literals: the image renderer reads no CSS variables.
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const INK = "#000000";
const INK_2 = "#5C5A55";
const WIRE_STRONG = "#86827A";
const WIRE = "#C9C6BE";
// Taken (and sent) is the `wire` tone with the number on a white chip (design §4), so it reads apart from the white
// open cells at a glance; the near-white wire-2 repeated the 1.27:1 open-versus-taken problem (design §10).
const TONE: Record<OgTone, { bg: string; fg: string; chip: boolean }> = {
  open: { bg: CARD, fg: INK, chip: false },
  taken: { bg: WIRE, fg: INK_2, chip: true },
  paid: { bg: INK, fg: CARD, chip: false },
  reserved: { bg: CARD, fg: INK_2, chip: false },
};
const GRID_PX = 500;

/**
 * GET /b/{id}/og: the link-preview PNG (design §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same anonymous image; drafts 404 for everyone.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  const m = page ? ogModel(page, new Date()) : null;
  if (!m) return new Response("Not found", { status: 404 });
  const cell = Math.floor(GRID_PX / m.columns);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: 64, background: PAPER, color: INK }}>
        {/* Wires: the grid's background shows through a 1 px margin around each cell. */}
        <div style={{ display: "flex", flexWrap: "wrap", width: cell * m.columns, background: WIRE_STRONG, padding: 1 }}>
          {m.cells.map((c) => (
            <div key={c.number} style={{ display: "flex", width: cell, height: cell, padding: 1 }}>
              <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", background: TONE[c.tone].bg, color: TONE[c.tone].fg, fontSize: Math.round(cell * 0.42) }}>
                {TONE[c.tone].chip ? (
                  <div style={{ display: "flex", background: CARD, borderRadius: 4, padding: `0 ${Math.round(cell * 0.08)}px` }}>{String(c.number)}</div>
                ) : String(c.number)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 28 }}>
          <div style={{ display: "flex", fontSize: 60, lineHeight: 1.1 }}>{m.title}</div>
          <div style={{ display: "flex", fontSize: 40, color: INK_2 }}>{m.caption}</div>
          <div style={{ display: "flex", fontSize: 32 }}>Breaks</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
```

- [ ] **Step 6: Point the break page's metadata at it**

In `src/app/b/[id]/page.tsx`, replace `generateMetadata` (from `export async function generateMetadata` to its closing `}`) with:

```tsx
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const { view } = await loadBreak(id);
  if (!view || view.page.break.status === "draft") return {};
  const b = view.page.break;
  const description = `${b.lineCount} lines at ${formatMoney(b.linePriceCents)}.`;
  const url = `${env().APP_URL}/b/${id}`;
  const image = { url: `${url}/og`, width: 1200, height: 630, alt: `${b.title}, the board as it stands` };
  return {
    title: b.title,
    description,
    openGraph: { title: b.title, description, url, type: "website", siteName: "Breaks", images: [image] },
    twitter: { card: "summary_large_image", title: b.title, description, images: [image.url] },
  };
}
```

- [ ] **Step 7: Pin the image in the page spec (updates `e2e/pages.spec.ts`)**

Append to `e2e/pages.spec.ts`:

```ts
test("every visible break has a link-preview image; a draft's 404s even for its host", async ({ browser }) => {
  const host = await as(browser, `oh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Preview ${run}` });
  const draft = await composeBreak(host, { title: `Preview draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute("content", `${url}/og`);
  await expect(visitor.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const img = await visitor.request.get(`${url}/og`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect((await host.request.get(`${draft}/og`)).status()).toBe(404);
});
```

(`APP_URL` in `.env.local` is `http://localhost:3000`, the e2e base URL, so `${url}/og` is exactly the tag's content.)

- [ ] **Step 8: Optional: check by hand**

If you have a browser tool: open `http://localhost:3000/b/<an open break>/og` in `pnpm dev` and look at the image: grid left, title and "N of M left, $5 a line" right, no handle anywhere. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 9: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/domain/breaks/og.ts src/domain/breaks/og.test.ts "src/app/b/[id]/og" "src/app/b/[id]/page.tsx" e2e/pages.spec.ts
git commit -m "feat(share): link-preview image per break, drawn as an anonymous viewer sees it"
```

---

### Task 14a: Copy pass, and cap notes said once (model: opus)

Deferred items 3 (one part), 4 and 8. Four copy fixes and one announcement fix:
- A host looking at their own break is told what to do, not about themselves in the third person: "You started the draw. The result is in about a minute." (bar and ledger) and "Closed. Every line is paid. Run the draw from Host tools." (bar).
- Sub-dollar prices keep their cents everywhere ("$0.25 a line", "50 lines at $0.25 = $12.50"): pinned by tests (recorded ruling 9).
- A copy-audit rule for the state words in JSX text (never "Filled", "Drawing" or "Drawn" between tags).
- The result page gets back its "Technical details" fold with the result hash and the algorithm version (platform spec §10; deferred item 8).
- A refused claim over a cap says the cap note, then the refresh that follows trims the selection and said the same note again: the island now skips a repeat of the same words within 3 s. A deliberate second tap still re-announces (it goes through `say`, which always speaks).

The trust-line casing item was done in Task 8.

**Files:**
- Modify: `src/components/break/claim-bar-state.ts` (`BarInput.viewerIsHost`, `claimBar`), `src/components/break/claim-bar-state.test.ts`
- Modify: `src/components/break/selection.ts` (append `isRepeat`), `src/components/break/selection.test.ts`
- Modify: `src/components/break/break-interactive.tsx` (`viewerIsHost` prop; `lastSaid`; the reconcile announcement)
- Modify: `src/components/ledger/ledger-view.ts` (`drawingText`), `src/components/ledger/ledger-view.test.ts`, `src/components/ledger/ledger-sheet.tsx` (`selfIsHost`)
- Modify: `src/app/b/[id]/page.tsx` (pass both flags)
- Modify: `src/app/b/[id]/result/page.tsx` (Technical details)
- Modify: `src/lib/copy-audit.test.ts`, `src/lib/money.test.ts`, `src/app/host/new/parse.test.ts`

**Interfaces:**
- Produces: `BarInput.viewerIsHost: boolean`; `BreakInteractiveProps.viewerIsHost: boolean`; `drawingText(hostName: string, self?: boolean)`; `LedgerSheetProps.selfIsHost?: boolean` (and so `HostTools`); `isRepeat(last: { text: string; at: number } | null, text: string, now: number): boolean`; test id `technical-details`.

- [ ] **Step 1: Write the failing tests**

In `src/components/break/claim-bar-state.test.ts`, replace the `base` line

```ts
  hostName: "Jim", payee: "@Jim-Roberts-36", closedDaysAgo: null,
```

with

```ts
  hostName: "Jim", payee: "@Jim-Roberts-36", closedDaysAgo: null, viewerIsHost: false,
```

and append at the end of the file:

```ts
describe("the host on their own break", () => {
  it("is told what to do, not about themselves", () => {
    const host = { ...base, viewerIsHost: true };
    expect(claimBar({ ...host, status: "filled" })).toEqual({ kind: "message", text: "Closed. Every line is paid. Run the draw from Host tools." });
    expect(claimBar({ ...host, status: "filled", closedDaysAgo: 4 })).toEqual({ kind: "message", text: "Closed 4 days ago, not drawn yet. Run the draw from Host tools." });
    expect(claimBar({ ...host, status: "drawing" })).toEqual({ kind: "message", text: "You started the draw. The result is in about a minute." });
  });
});
```

In `src/components/break/selection.test.ts`, add `isRepeat,` to the import list (after `isSelectable,`), and append at the end of the file:

```ts
describe("isRepeat", () => {
  it("skips the same words said again within 3 s, nothing else", () => {
    const last = { text: "You can hold 5 lines in this break.", at: 10_000 };
    expect(isRepeat(last, "You can hold 5 lines in this break.", 12_000)).toBe(true);
    expect(isRepeat(last, "You can hold 5 lines in this break.", 13_500)).toBe(false);
    expect(isRepeat(last, "Line 7 was just taken.", 11_000)).toBe(false);
    expect(isRepeat(null, "Line 7 was just taken.", 11_000)).toBe(false);
  });
});
```

In `src/components/ledger/ledger-view.test.ts`, replace

```ts
    expect(drawingText("Dave")).toBe("Dave started the draw. The result is in about a minute.");
```

with

```ts
    expect(drawingText("Dave")).toBe("Dave started the draw. The result is in about a minute.");
    expect(drawingText("Dave", true)).toBe("You started the draw. The result is in about a minute.");
```

In `src/lib/money.test.ts`, append at the end of the file:

```ts
describe("tiny prices", () => {
  it("keep their cents and never round to $0", () => {
    expect(formatMoney(1)).toBe("$0.01");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(25)).toBe("$0.25");
    expect(formatMoney(99)).toBe("$0.99");
  });
});
```

In `src/app/host/new/parse.test.ts`, inside `describe("previewText", …)`, append to the test `"multiplies lines by price"`:

```ts
    expect(previewText(50, "0.25")).toBe("50 lines at $0.25 = $12.50");
    expect(previewText(3, ".5")).toBe("3 lines at $0.50 = $1.50");
    expect(previewText(4, "0.01")).toBe("4 lines at $0.01 = $0.04");
```

In `src/lib/copy-audit.test.ts`, add after the test `"uses the community's state words in UI code, never Filled, Drawing or Drawn"`:

```ts
  it("never shows Filled, Drawing or Drawn as JSX text either", () => {
    const ui = tsx.filter((s) => /^src\/(components|app)\//.test(s.path));
    expect(hits(/>\s*(Filled|Drawing|Drawn)\b/, ui)).toEqual([]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/break src/components/ledger src/lib src/app/host/new`
Expected: FAIL on the host-on-their-own-break test, `isRepeat` (not exported) and `drawingText("Dave", true)`. The money, preview and copy-audit additions pass already (they pin today's behaviour).

- [ ] **Step 3: Write the copy**

In `src/components/break/claim-bar-state.ts`, in `BarInput` replace

```ts
  closedDaysAgo: number | null;
};
```

with

```ts
  closedDaysAgo: number | null;
  /** The host is looking at their own break: the bar says what to do next instead of naming them. */
  viewerIsHost: boolean;
};
```

and in `claimBar` replace

```ts
    case "filled":
      return { kind: "message", text: i.closedDaysAgo !== null && i.closedDaysAgo >= 3 ? `Closed ${i.closedDaysAgo} days ago, not drawn yet.` : `Closed. Every line is paid. Waiting for ${i.hostName} to run the draw.` };
    case "drawing": return { kind: "message", text: `${i.hostName} started the draw. The result is in about a minute.` };
```

with

```ts
    case "filled": {
      const stale = i.closedDaysAgo !== null && i.closedDaysAgo >= 3;
      if (i.viewerIsHost) return { kind: "message", text: stale ? `Closed ${i.closedDaysAgo} days ago, not drawn yet. Run the draw from Host tools.` : "Closed. Every line is paid. Run the draw from Host tools." };
      return { kind: "message", text: stale ? `Closed ${i.closedDaysAgo} days ago, not drawn yet.` : `Closed. Every line is paid. Waiting for ${i.hostName} to run the draw.` };
    }
    case "drawing": return { kind: "message", text: i.viewerIsHost ? "You started the draw. The result is in about a minute." : `${i.hostName} started the draw. The result is in about a minute.` };
```

Append to `src/components/break/selection.ts`:

```ts
/** The same words said again within 3 s (a refused claim's cap note, then the refresh that trims the selection): skip the second. */
export function isRepeat(last: { text: string; at: number } | null, text: string, now: number): boolean {
  return last !== null && last.text === text && now - last.at < 3000;
}
```

In `src/components/ledger/ledger-view.ts`, replace

```ts
export const drawingText = (hostName: string) => `${hostName} started the draw. The result is in about a minute.`;
```

with

```ts
export const drawingText = (hostName: string, self = false) =>
  `${self ? "You" : hostName} started the draw. The result is in about a minute.`;
```

In `src/components/ledger/ledger-sheet.tsx`, in `LedgerSheetProps` replace

```ts
  /** Who started the draw, for the running-draw wait (design §5.4). */
  hostName: string;
};
```

with

```ts
  /** Who started the draw, for the running-draw wait (design §5.4). */
  hostName: string;
  /** The viewer is the host (an admin is not): "You started the draw." */
  selfIsHost?: boolean;
};
```

and replace

```tsx
              <p className="text-small">{drawingText(p.hostName)}</p>
```

with

```tsx
              <p className="text-small">{drawingText(p.hostName, p.selfIsHost)}</p>
```

- [ ] **Step 4: Wire the flags and the announcement**

In `src/components/break/break-interactive.tsx`:

replace

```ts
import { cellNote, isSelectable, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
```

with

```ts
import { cellNote, isRepeat, isSelectable, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
```

in `BreakInteractiveProps`, after `closedDaysAgo: number | null;` add

```ts
  /** The viewer is this break's host (an admin is not). */
  viewerIsHost: boolean;
```

replace

```ts
  const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
```

with

```ts
  // What was said last and when: the refresh after a refused claim would repeat its cap note (isRepeat).
  const lastSaid = useRef<{ text: string; at: number } | null>(null);
  const say = (text: string) => {
    lastSaid.current = { text, at: Date.now() };
    setAnnounce((a) => ({ text, n: a.n + 1 }));
  };
```

replace

```ts
    if (said.length > 0) setAnnounce((a) => ({ text: said.join(" "), n: a.n + 1 }));
  }, [freshCells, allowance]);
```

with

```ts
    const text = said.join(" ");
    if (said.length > 0 && !isRepeat(lastSaid.current, text, Date.now())) {
      lastSaid.current = { text, at: Date.now() };
      setAnnounce((a) => ({ text, n: a.n + 1 }));
    }
  }, [freshCells, allowance]);
```

and replace

```ts
    allowance: p.allowance, owe: p.owe, justSent, hostName: p.hostName, payee: p.payee, closedDaysAgo: p.closedDaysAgo,
  });
```

with

```ts
    allowance: p.allowance, owe: p.owe, justSent, hostName: p.hostName, payee: p.payee, closedDaysAgo: p.closedDaysAgo,
    viewerIsHost: p.viewerIsHost,
  });
```

In `src/app/b/[id]/page.tsx`, replace

```tsx
        closedDaysAgo={status === "filled" && b.filledAt ? daysSince(b.filledAt, now) : null}
```

with

```tsx
        closedDaysAgo={status === "filled" && b.filledAt ? daysSince(b.filledAt, now) : null}
        viewerIsHost={!!caller && caller.id === b.hostId}
```

and replace

```tsx
              hostName={hostName}
            />
          )}
        </div>
```

with

```tsx
              hostName={hostName}
              selfIsHost={!!caller && caller.id === b.hostId}
            />
          )}
        </div>
```

- [ ] **Step 5: Bring back the technical details on the result page**

In `src/app/b/[id]/result/page.tsx`, add the import

```tsx
import { CopyField } from "@/components/copy-field";
```

below `import { LocalTime } from "@/components/local-time";`, and replace

```tsx
      <Verify inputs={publicInputs} seed={res.draw.seed} relayUrl={relayUrl} />
```

with

```tsx
      <Verify inputs={publicInputs} seed={res.draw.seed} relayUrl={relayUrl} />
      <details className="mt-3 rounded-card border border-wire bg-card" data-testid="technical-details">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Technical details</summary>
        <div className="space-y-3 px-4 pb-4">
          <CopyField label="Result hash" value={res.draw.resultHash} />
          <p className="text-small text-ink-2">Algorithm version {res.draw.algorithmVersion}.</p>
        </div>
      </details>
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/components/break src/components/ledger src/lib src/app/host/new`
Expected: PASS.

- [ ] **Step 7: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. No e2e keys on the closed or running-draw wording (`bar-message` is not asserted by text); the journey's host passes through "Running draw" by clicking `finish-draw`, which is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/components/break src/components/ledger "src/app/b/[id]/page.tsx" "src/app/b/[id]/result/page.tsx" src/lib/copy-audit.test.ts src/lib/money.test.ts src/app/host/new/parse.test.ts
git commit -m "fix(copy): speak to the host on their own break, say cap notes once, restore technical details"
```

---

### Task 14b: Accessibility pass: render-level state tests, the ledger header, measured toast offsets, axe (model: sonnet)

Deferred item 3, the remaining parts, and design §7's floor checked by a machine:
- Render-level state tests for `Cell`, `Grid` and `LedgerRow`: each state's accessible name, ARIA state and shape class, rendered with `react-dom/server` under vitest (node environment, `createElement`, no JSX in tests). Vitest gets the automatic JSX runtime for the `.tsx` sources (Vite 8 uses oxc).
- The ledger's column header row leaves the list (recorded ruling 5, a recorded deviation from deferred item 3's "real table header", for the owner's sign-off): visual above 640 and `aria-hidden`, so a screen reader no longer counts it as a buyer.
- The ledger snackbar sits above the sheet's bottom action as measured, not a fixed 68 px; toasts at the screen's bottom edge clear the tab bar on phones (`--tab-h`).
- `@axe-core/playwright` runs WCAG 2.1 A and AA rules over the main pages, the pay sheet and the host ledger.

**Files:**
- Modify: `vitest.config.mts` (oxc JSX)
- Create: `src/components/grid/render.test.ts`
- Modify: `src/components/ledger/ledger-sheet.tsx` (header row; measured action)
- Create: `src/components/use-measured-var.ts`
- Modify: `src/components/toast.tsx` (`BOTTOM`), `src/app/globals.css` (`--tab-offset`)
- Modify: `package.json`, `pnpm-lock.yaml` (`@axe-core/playwright`), `e2e/layout.spec.ts` (axe test)

**Interfaces:**
- Consumes: `Cell`, `Grid`, `LedgerRow`, `LEDGER_COLS`, `Toast` (Plan A), `paymentName` on `LedgerRowView` (Task 2).
- Produces: `useMeasuredVar(ref: RefObject<HTMLElement | null>, name: string): void` (writes the element's height into a CSS variable on the nearest `<dialog>`, else `<html>`); CSS variables `--sheet-action-h` (set by `LedgerSheet`) and `--tab-offset` (equals `--tab-h` while the tab bar shows on phones, else unset).

- [ ] **Step 1: Let vitest render `.tsx` components**

Leave `tsconfig.json`'s `"jsx": "preserve"` alone (Next needs it). If, after this step, vitest still fails to parse JSX in a `.tsx` source (the render tests in Step 3 fail with a syntax or `React is not defined` error rather than an assertion), stop and report BLOCKED: tooling; do not change `tsconfig.json` or add a JSX plugin.

Replace the whole of `vitest.config.mts` with:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // tsconfig keeps "jsx": "preserve" for Next; vitest transforms .tsx itself (Vite 8 uses oxc) with the automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/concurrency/**", "tests/ci/**", "e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only-stub.ts", import.meta.url)),
    },
  },
});
```

- [ ] **Step 2: Write the render tests**

Create `src/components/grid/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import type { LedgerRowView } from "@/components/ledger/ledger-view";
import { LedgerRow } from "@/components/ledger/ledger-row";
import { Cell } from "./cell";
import { Grid } from "./grid";

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el);
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, ...o });

describe("Cell: every state has a shape and a name, not only a colour (design §4)", () => {
  it("open: a card face, a toggle", () => {
    const h = html(createElement(Cell, { cell: cell(1), onPress: noop }));
    expect(h).toContain('aria-label="Line 1, open"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain('data-state="open"');
    expect(h).toContain("bg-card");
  });
  it("selected: pressed, the inset ring and the check", () => {
    const h = html(createElement(Cell, { cell: cell(1), selected: true, onPress: noop }));
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain("inset_0_0_0_3px");
    expect(h).toContain("✓");
  });
  it("taken: the hatch, disabled but focusable, no pressed state", () => {
    const h = html(createElement(Cell, { cell: cell(2, { state: "taken" }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 2, taken"');
    expect(h).toContain('aria-disabled="true"');
    expect(h).not.toContain("aria-pressed");
    expect(h).toContain("bg-hatch");
  });
  it("sent and mine: the dashed edge and the green flag", () => {
    const h = html(createElement(Cell, { cell: cell(3, { state: "sent", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 3, yours, sent"');
    expect(h).toContain("border-dashed");
    expect(h).toContain("border-t-green");
  });
  it("paid and mine: the ink face, a white number and a white flag", () => {
    const h = html(createElement(Cell, { cell: cell(4, { state: "paid", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 4, yours, paid"');
    expect(h).toContain("bg-ink");
    expect(h).toContain("text-card");
    expect(h).toContain("border-t-card");
  });
  it("overdue (host view): the red edge and the ! glyph", () => {
    const h = html(createElement(Cell, { cell: cell(5, { state: "taken", overdue: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 5, taken, overdue"');
    expect(h).toContain("border-red");
    expect(h).toContain(">!<");
  });
  it("bonus: the + mark; a display-only cell is an image", () => {
    const h = html(createElement(Cell, { cell: cell(51, { state: "paid", bonus: true }) }));
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="Line 51, bonus, paid"');
    expect(h).toContain(">+<");
  });
});

describe("Grid: one group, one tab stop, disabled where the viewer cannot pick", () => {
  it("labels the group and keeps one roving tab stop", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2, { state: "taken" }), cell(3)], lineCount: 3, label: "Lines, 2 of 3 open", onPress: noop, focusNumber: 3 }));
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Lines, 2 of 3 open"');
    expect(h.match(/tabindex="0"/g)).toHaveLength(1);
    expect(h).toMatch(/data-cell="3"[^>]*tabindex="0"|tabindex="0"[^>]*data-cell="3"/);
  });
  it("disables unselected open cells at the limit, and every open cell when read-only", () => {
    const atLimit = html(createElement(Grid, { cells: [cell(1), cell(2)], lineCount: 2, label: "L", selected: new Set([1]), disabledOpen: true, onPress: noop }));
    expect(atLimit).toMatch(/aria-label="Line 2, open"[^>]*aria-disabled="true"/);
    expect(atLimit).not.toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
    const readOnly = html(createElement(Grid, { cells: [cell(1)], lineCount: 2, label: "L", readOnly: true, onPress: noop }));
    expect(readOnly).toMatch(/aria-label="Line 1, open"[^>]*aria-disabled="true"/);
  });
  it("puts bonus lines on their own labelled row", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2), cell(3, { state: "paid", bonus: true })], lineCount: 2, label: "L" }));
    expect(h).toContain("Bonus");
    expect(h.indexOf("Line 3, bonus, paid")).toBeGreaterThan(h.indexOf("Bonus"));
  });
});

describe("LedgerRow: state as a word, the late time in red, one Paid button with a full name", () => {
  const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
    handle: null, displayName: null, paymentName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
  });
  const props = (r: LedgerRowView, o: Record<string, unknown> = {}) => ({
    row: r, actionable: true, recentlyPaid: false, pending: false, expanded: false, bonusUsed: 0, bonusMax: 1,
    onToggle: noop, onPaid: noop, onUndo: noop, onMarkLine: noop, onUnmarkLine: noop, onRelease: noop, onBonus: noop, ...o,
  });
  const alice = row({ ownerId: "a", handle: "alice", displayName: "Alice", paymentName: "Alice Smith", numbers: [2], unpaid: [2], overdue: [2], owedCents: 500, status: "overdue", lateText: "4 h late" });

  it("an overdue buyer", () => {
    const h = html(createElement(LedgerRow, props(alice)));
    expect(h).toContain('data-status="overdue"');
    expect(h).toContain(">Overdue<");
    expect(h).toContain("4 h late");
    expect(h).toContain("text-red");
    expect(h).toContain("pays as Alice Smith");
    expect(h).toContain('aria-label="Mark Alice paid, $5"');
  });
  it("just marked paid: Undo instead of Paid", () => {
    const h = html(createElement(LedgerRow, props(alice, { recentlyPaid: true })));
    expect(h).toContain('data-testid="ledger-undo"');
    expect(h).not.toContain('data-testid="ledger-paid"');
  });
  it("a paid buyer has no button, and nothing to do once the draw has started", () => {
    const paid = row({ ownerId: "b", handle: "bob", numbers: [7], paid: [7], status: "paid" });
    expect(html(createElement(LedgerRow, props(paid)))).not.toContain('data-testid="ledger-paid"');
    expect(html(createElement(LedgerRow, props(alice, { actionable: false })))).not.toContain('data-testid="ledger-paid"');
  });
});
```

- [ ] **Step 3: Run them**

Run: `pnpm test src/components/grid/render.test.ts`
Expected: PASS. They pin Plan A's rendering. If one fails, read the component and the design (§3, §4) once:
- the component contradicts the design (a state without its shape, word or ARIA state): fix the component with an attribute or a token class, and say which in the commit body;
- the test's expectation contradicts both the current markup and the design (a guessed class string, say): the test is wrong; fix the test and say so in the commit body;
- the fix would change a Plan A component's markup beyond an attribute or a token class, or needs a design decision: leave the test failing out of the commit (mark it `it.skip` with the reason), record it in the report, and finish as DONE_WITH_CONCERNS.
Never spend more than one round on this step (Global Constraints).

- [ ] **Step 4: Take the header row out of the ledger list and measure the bottom action**

Create `src/components/use-measured-var.ts`:

```ts
"use client";
import { useLayoutEffect, type RefObject } from "react";

/**
 * Writes the element's height (padding included) into a CSS variable on the nearest <dialog>, else on <html>, and
 * keeps it current. Toasts read it so they sit above the element instead of at a guessed offset.
 */
export function useMeasuredVar(ref: RefObject<HTMLElement | null>, name: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host: HTMLElement = el.closest("dialog") ?? document.documentElement;
    const write = () => host.style.setProperty(name, `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => { ro.disconnect(); host.style.removeProperty(name); };
  }, [ref, name]);
}
```

In `src/components/ledger/ledger-sheet.tsx`:

replace `import { useEffect, useState, useTransition } from "react";` with `import { useEffect, useRef, useState, useTransition } from "react";`, and add below `import { Toast } from "@/components/toast";`:

```tsx
import { useMeasuredVar } from "@/components/use-measured-var";
```

after `const router = useRouter();` add:

```tsx
  // The snackbar sits above the bottom action as it really is (it grows with an error or the draft note).
  const actionRef = useRef<HTMLDivElement>(null);
  useMeasuredVar(actionRef, "--sheet-action-h");
```

replace

```tsx
        <ul className="-mx-4 border-t border-wire">
          {/* Column names: screen readers always, sighted users only where the rows become a table (above 640). */}
          <li className={`sr-only gap-3 text-micro font-medium text-ink-2 sm:not-sr-only sm:px-4 sm:py-2 ${LEDGER_COLS}`}>
            <span>Buyer</span><span>Lines</span><span>State</span><span className="sm:text-right">Owed</span><span className="sm:text-right">Action</span>
          </li>
```

with

```tsx
        {/* Column names over the table above 640 only. Visual: each row already names its parts, and a header inside
            the list would be counted as one more buyer by a screen reader. */}
        <div aria-hidden className={`-mx-4 hidden gap-3 px-4 py-2 text-micro font-medium text-ink-2 ${LEDGER_COLS}`}>
          <span>Buyer</span><span>Lines</span><span>State</span><span className="sm:text-right">Owed</span><span className="sm:text-right">Action</span>
        </div>
        <ul aria-label="Buyers" className="-mx-4 border-t border-wire">
```

and replace

```tsx
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-wire bg-paper px-4 pt-3 pb-safe">
```

with

```tsx
        <div ref={actionRef} className="sticky bottom-0 -mx-4 space-y-2 border-t border-wire bg-paper px-4 pt-3 pb-safe">
```

In `src/components/toast.tsx`, replace

```ts
  "sheet-action": "calc(68px + max(12px, env(safe-area-inset-bottom)) + 8px)",
  none: "max(12px, env(safe-area-inset-bottom))",
```

with

```ts
  // --sheet-action-h is the sheet's measured bottom action (useMeasuredVar), safe area included.
  "sheet-action": "calc(var(--sheet-action-h, calc(68px + max(12px, env(safe-area-inset-bottom)))) + 8px)",
  // --tab-offset is the tab bar's height while it shows on phones (globals.css), else 0.
  none: "calc(var(--tab-offset, 0px) + max(12px, env(safe-area-inset-bottom)))",
```

In `src/app/globals.css`, replace

```css
  @media (max-width: 639px) {
    body:has([data-tab-bar]) {
      padding-bottom: calc(var(--tab-h) + max(12px, env(safe-area-inset-bottom)));
    }
  }
```

with

```css
  @media (max-width: 639px) {
    body:has([data-tab-bar]) {
      padding-bottom: calc(var(--tab-h) + max(12px, env(safe-area-inset-bottom)));
    }
    /* Bottom-edge toasts clear the tab bar while it shows. */
    :root:has([data-tab-bar]) {
      --tab-offset: var(--tab-h);
    }
  }
```

- [ ] **Step 5: Add axe to the layout spec (extends `e2e/layout.spec.ts`)**

Run: `pnpm add -D -E @axe-core/playwright@4.10.2`
Expected: `package.json` gains `"@axe-core/playwright": "4.10.2"` (exact, no caret: `-E`) in `devDependencies` and the lockfile updates. If the registry cannot be reached, stop and report BLOCKED: network.

In `e2e/layout.spec.ts`, add below the first import line:

```ts
import AxeBuilder from "@axe-core/playwright";
```

and append at the end of the file:

```ts
async function axeViolations(page: Page, where: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("axe finds no WCAG 2.1 A or AA violation on the main pages, the pay sheet and the ledger (D§7)", async ({ browser }) => {
  const found: string[] = [];
  const anon = await anonymous(browser, 390, 664);
  for (const path of ["/", "/breaks", url, `/h/lh${run}`, "/legal/draw"]) {
    await anon.goto(path);
    found.push(...(await axeViolations(anon, `anonymous ${path}`)));
  }
  const buyer = await signedIn(browser, `${buyerHandle}@e2e.test`);
  for (const path of ["/me", "/account"]) {
    await buyer.goto(path);
    found.push(...(await axeViolations(buyer, `buyer ${path}`)));
  }
  await buyer.goto(url);
  await buyer.getByTestId("owed").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeVisible();
  found.push(...(await axeViolations(buyer, "buyer pay sheet")));
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto("/host");
  found.push(...(await axeViolations(host, "host /host")));
  await host.goto(url);
  await host.getByTestId("host-tools").click();
  await expect(host.getByTestId("ledger")).toBeVisible();
  found.push(...(await axeViolations(host, "host ledger")));
  expect(found).toEqual([]);
});
```

(`hostEmail` is `lh<run>@e2e.test`, so the host's handle is `lh<run>`; the buyer from `beforeAll` still owes for lines 3 and 9, so the bar shows `owed`.)

- [ ] **Step 6: Run the axe test and fix what it reports, once**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/layout.spec.ts`
Expected: PASS. If the axe test lists violations, fix what it reports, one round only (Global Constraints), at the element axe names (the message gives the rule id and the selector), with one of these fixes: a missing accessible name gets a `<label>` or `aria-label`; a contrast failure moves the text to `text-ink` or `text-ink-2` on `bg-card`/`bg-paper` (both pass, design §3); a duplicate id gets `useId`. Do not disable rules or narrow the tags. List each fix in the commit body.
If a finding needs a design decision, or a fix would change a Plan A component's markup beyond an attribute or a token class, or more than five rules fire: do not guess. Record the violation list in the report, keep the axe test but mark it `test.fixme` with a comment naming the open findings (never commit a failing suite), and finish as DONE_WITH_CONCERNS.

- [ ] **Step 7: Optional: check by hand**

If you have a browser tool: open a break as its host in `pnpm dev` at 390 wide, open Host tools, mark a buyer paid, and check the snackbar sits just above the bottom action; at 1024 wide check the column names show over the rows. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. The journey still finds `ledger-row`, `ledger-paid` and `paid-count`; only the header row moved.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.mts src/components/grid/render.test.ts src/components/use-measured-var.ts src/components/ledger/ledger-sheet.tsx src/components/toast.tsx src/app/globals.css package.json pnpm-lock.yaml e2e/layout.spec.ts
git commit -m "test(a11y): render-level state tests, axe over the main pages, measured toast offsets"
```

---

### Task 15: Journey 2, a separate e2e database, and the sent-failure flake (model: sonnet)

Deferred item 6. Journey 2 walks the paths journey 1 never takes: a draft saved with a prize choice and a 2nd place, edited, then opened from the edit page; all three picking modes; a buyer who browses the feed, claims on straight fill and pays later from My lines; the host clearing the "waiting on you" strip; the draw; a real check of the result (the browser verifier, plus a recomputation in the test from `result.json` and a tampered copy that must fail); the winner told to pick; and the result page's Skip focus, Replay reset and Share fallback (deferred test backlog). The suite moves to its own `breaks_e2e` database, emptied before every run, so it stops filling the dev database with users and breaks. The layout spec's forced sent-failure test, which flaked once with two tabs in one context and a paused clock, opens its second tab in a second context instead.

**Files:**
- Create: `scripts/create-db.ts`
- Create: `e2e/e2e-db.ts`, `e2e/global-setup.ts`, `e2e/journey-2.spec.ts`
- Modify: `playwright.config.ts` (whole file)
- Modify: `e2e/layout.spec.ts` (the sent-failure test's second tab)
- Modify: `README.md` (an "E2E database" section), `.env.example` (one comment line)

**Interfaces:**
- Consumes: `composeBreak`, `loginAs` (`e2e/helpers.ts`, Task 6b), `verifyInputs`, `PublicInputs` (`src/crypto/verify.ts`, relative imports only), every test id the earlier tasks added (the merged ledger's rows are `ledger-row` / `ledger-paid` inside `waiting-sheet`, Task 12).
- Produces: `scripts/create-db.ts` (`pnpm exec tsx scripts/create-db.ts <name>`: creates the database on the local stack if missing and applies `supabase/ci-auth-stub.sql`, through the repo's `postgres` package; `psql` is not installed); `E2E_DATABASE_URL` (default `postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e`, override with the env var of the same name); Playwright `globalSetup` that refuses any database not named `breaks_e2e`, truncates every app table and re-inserts the SYSTEM user; `webServer.reuseExistingServer: false`.

- [ ] **Step 1: Create and migrate the e2e database (no `psql` needed)**

`psql` is not installed on this machine, so the database is created with the repo's own `postgres` package. Create `scripts/create-db.ts`:

```ts
// Usage: pnpm exec tsx scripts/create-db.ts breaks_e2e
// Creates a database on the local Supabase stack (if missing) and applies the CI auth stub to it, with the repo's
// postgres package: psql is not needed. Then migrate it with DATABASE_URL=…/<name> pnpm db:migrate.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const SERVER = process.env.DB_SERVER_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322";

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const name = process.argv[2] ?? "";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    console.error("usage: pnpm exec tsx scripts/create-db.ts <database_name>");
    return 2;
  }
  const admin = postgres(`${SERVER}/postgres`, { max: 1, prepare: false });
  try {
    const [{ n }] = await admin<{ n: number }[]>`select count(*)::int as n from pg_database where datname = ${name}`;
    if (n === 0) await admin.unsafe(`create database ${name}`); // the name is checked above; identifiers cannot be bound
    console.log(n === 0 ? `created ${name}` : `${name} exists`);
  } finally {
    await admin.end();
  }
  const db = postgres(`${SERVER}/${name}`, { max: 1, prepare: false });
  try {
    // The stub is idempotent (create … if not exists, create or replace): safe to apply again.
    await db.unsafe(readFileSync("supabase/ci-auth-stub.sql", "utf8"));
    console.log("auth stub applied");
  } finally {
    await db.end();
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
```

Run:

```bash
pnpm exec tsx scripts/create-db.ts breaks_e2e
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate
```

Expected: `created breaks_e2e` (or `breaks_e2e exists`), `auth stub applied`, then `migrated` (a `DATABASE_URL` already in the environment wins over `.env.local`, which `db:migrate` loads with dotenv). If the script cannot connect, check `pnpm exec supabase status` first; if the stack is up and it still fails, stop and report BLOCKED: environment.

Documented alternative, through the stack's own container (the container is `supabase_db_<project_id>`; `project_id` is `plan-1-tracer-bullet` in `supabase/config.toml`):

```bash
docker exec supabase_db_plan-1-tracer-bullet psql -U postgres -c 'create database breaks_e2e'
docker exec -i supabase_db_plan-1-tracer-bullet psql -U postgres -d breaks_e2e < supabase/ci-auth-stub.sql
```

- [ ] **Step 2: Point the suite at it**

Create `e2e/e2e-db.ts`:

```ts
/** The Playwright suite's own database: emptied before every run (global-setup.ts), never the dev or test database. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e";
```

Create `e2e/global-setup.ts`:

```ts
import postgres from "postgres";
import { E2E_DATABASE_URL } from "./e2e-db";

/** Empties the e2e database before every run, so runs never see each other's users and breaks. */
export default async function globalSetup() {
  if (new URL(E2E_DATABASE_URL).pathname !== "/breaks_e2e") {
    throw new Error(`Refusing to truncate ${new URL(E2E_DATABASE_URL).pathname}: the e2e database must be named breaks_e2e`);
  }
  const sql = postgres(E2E_DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql`truncate awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, legal_acceptances, idempotency_keys, rate_limits, users restart identity cascade`;
    // The truncate removes the SYSTEM row the first migration inserted; cron finalisation runs as SYSTEM.
    await sql`insert into users (id, email, role, handle, display_name, age_confirmed_at)
      values ('00000000-0000-4000-8000-000000000000', 'system@breaks.local', 'admin', 'system', 'System', now())
      on conflict (id) do nothing`;
  } finally {
    await sql.end();
  }
}
```

Replace the whole of `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/e2e-db";

export default defineConfig({
  testDir: "e2e", timeout: 60_000, retries: 0, workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000", ...devices["iPhone 13"], defaultBrowserType: "chromium" },
  // Never reuse a server already on :3000: it would be a dev server on the dev database (port rule: kill it first).
  webServer: {
    command: "pnpm build && pnpm start", url: "http://localhost:3000", reuseExistingServer: false, timeout: 180_000,
    env: { E2E_SECRET: "e2e", BEACON: "fake", DATABASE_URL: E2E_DATABASE_URL },
  },
});
```

- [ ] **Step 3: Make the sent-failure test deterministic (updates `e2e/layout.spec.ts`)**

In `e2e/layout.spec.ts`, in the test `"a failed 'I've sent it' reports inside the pay sheet, not behind it"`, replace

```ts
  // The same buyer gives the line back from a second tab, so marking it sent must now fail.
  const other = await ctx.newPage();
```

with

```ts
  // The same buyer gives the line back from a second browser context with the same session, so marking it sent
  // must now fail. A second tab in the same context took focus from `page`, and the visibility change could fire
  // the auto-refresh, which replaced the owe this test makes stale (the flake).
  const other = await (await browser.newContext({ storageState: await ctx.storageState() })).newPage();
```

- [ ] **Step 4: Write journey 2**

Create `e2e/journey-2.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from "@playwright/test";
import { verifyInputs, type PublicInputs } from "../src/crypto/verify";
import { composeBreak, loginAs } from "./helpers";

const run = Date.now();

async function as(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

test("draft with a choice and 2nd place, edited and opened on straight fill; browse, claim, pay from My lines; draw; the result checks out", async ({ browser }) => {
  const hostHandle = `j2h${run}`;
  const host = await as(browser, `${hostHandle}@e2e.test`, "host");

  // 1. A draft: a choice for the top spot, a 2nd place, pick only.
  await host.goto("/host/new");
  await host.fill("input[name=title]", `J2 ${run}`);
  await host.locator("input[name=prize1]").first().fill("Chronos 22g");
  await host.getByRole("button", { name: "Add a choice" }).click();
  await host.locator("input[name=prize1]").nth(1).fill("Chronos 24g");
  await host.getByRole("button", { name: "Add 2nd place" }).click();
  await host.fill("input[name=prize2]", "Flight pack");
  await host.fill("input[name=lineCount]", "4");
  await host.fill("input[name=linePrice]", "5");
  await host.fill("input[name=venmo]", "@e2e-host");
  await host.getByRole("radio", { name: /^Pick only, no randoms/ }).check();
  await host.getByTestId("composer-draft").click();
  await host.waitForURL(/\/b\/[0-9a-f-]{36}$/);
  const url = host.url();

  // 2. Edit it: everything came back; switch to straight fill and open from the edit page.
  await host.getByTestId("edit-draft").click();
  await expect(host.locator("input[name=prize1]")).toHaveCount(2);
  await expect(host.locator("input[name=prize2]")).toHaveValue("Flight pack");
  await expect(host.getByRole("radio", { name: /^Pick only, no randoms/ })).toBeChecked();
  await host.getByRole("radio", { name: /^Straight fill/ }).check();
  await host.getByTestId("composer-open").click();
  await host.waitForURL(url);
  await host.locator("summary", { hasText: "Details" }).click();
  // These three lines are Plan A's prizeLines / pickingText copy: a task that changes that wording updates them here.
  await expect(host.getByText("Top spot gets a choice: Chronos 22g or Chronos 24g.").or(host.getByText("Top spot gets a choice: Chronos 24g or Chronos 22g."))).toBeVisible();
  await expect(host.getByText("2nd place gets Flight pack.")).toBeVisible();
  await expect(host.getByText("Straight fill. Lines go out in order.")).toBeVisible();

  // 3. Buyer A finds it in the feed, takes the next two lines, and pays later from My lines.
  const a = await as(browser, `j2a${run}@e2e.test`);
  await a.goto(`/breaks?host=${hostHandle}`);
  await a.getByTestId("break-card").filter({ hasText: `J2 ${run}` }).click();
  await a.waitForURL(url);
  await expect(a.getByTestId("cell-1")).toHaveAttribute("aria-disabled", "true"); // straight fill: no picking
  await a.getByRole("button", { name: "Increase Number of lines" }).click();
  await expect(a.getByTestId("claim-step")).toHaveText("Claim the next 2");
  await a.getByTestId("claim-step").click();
  await expect(a.getByTestId("pay-outcome")).toHaveText("You have lines 1 and 2.");
  await a.getByRole("button", { name: "I'll pay later" }).click();
  await a.goto("/me");
  const card = a.getByTestId("my-break").filter({ hasText: `J2 ${run}` });
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await card.getByTestId("how-to-pay").click();
  await expect(a.getByTestId("pay-amount")).toHaveText("Send $10 to @e2e-host");
  await a.getByTestId("pay-sent").click();
  await expect(card.getByTestId("my-state")).toHaveText(`Sent. ${hostHandle} will tick you off when it arrives.`);

  // 4. Buyer B takes the last two and marks them sent from the sheet.
  const b = await as(browser, `j2b${run}@e2e.test`);
  await b.goto(url);
  await b.getByRole("button", { name: "Increase Number of lines" }).click();
  await b.getByTestId("claim-step").click();
  await expect(b.getByTestId("pay-outcome")).toHaveText("You have lines 3 and 4.");
  await b.getByTestId("pay-sent").click();
  await expect(b.getByTestId("pay-sheet")).toBeHidden();

  // 5. The host clears the waiting strip on /host, then runs the draw from the break's ledger.
  await host.goto("/host");
  await expect(host.getByTestId("waiting-strip")).toContainText("2 sent, waiting for you");
  await host.getByTestId("waiting-strip").click();
  const waiting = host.getByTestId("waiting-sheet");
  await waiting.getByTestId("ledger-paid").first().click();
  await expect(waiting.getByTestId("ledger-paid")).toHaveCount(1);
  await waiting.getByTestId("ledger-paid").click();
  await expect(waiting.getByTestId("ledger-paid")).toHaveCount(0);
  await expect(waiting.getByTestId("ledger-row")).toHaveCount(2);
  await waiting.getByRole("button", { name: "Close" }).click();
  await host.goto(url);
  await host.getByTestId("host-tools").click();
  await expect(host.getByTestId("paid-count")).toContainText("4 of 4 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("ledger-result").click();

  // 6. The result: the choice and 2nd place are named; the draw verifies in the browser and recomputes here.
  const final = host.locator("[data-reveal-final]");
  await expect(host.getByTestId("winner")).toContainText("Top spot: line", { timeout: 15_000 });
  await expect(final).toContainText("Picks one of the prize choices.");
  await expect(final).toContainText("2nd place: @");
  await expect(final).toContainText("Flight pack");
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
  const inputs = (await (await host.request.get(`${url}/result.json`)).json()) as PublicInputs;
  expect(verifyInputs(inputs).ok).toBe(true);
  expect(verifyInputs({ ...inputs, ranking: [...inputs.ranking].reverse() }).ok).toBe(false);

  // 7. The winner is told to pick.
  const top = Number(((await host.getByTestId("winner").textContent()) ?? "").match(/line (\d+)/)?.[1]);
  const winner = top <= 2 ? a : b;
  await winner.goto("/me");
  await expect(winner.getByTestId("my-break").filter({ hasText: `J2 ${run}` }).getByTestId("my-state")).toHaveText(`Won. Tell ${hostHandle} your choice.`);

  // 8. The result page for a first-time viewer: Skip hands focus to Replay, Replay deals again, Share falls back
  //    to a selectable field when the clipboard is blocked. A paused clock keeps the deal on screen: install() alone
  //    lets time run, and a 4-line deal ends in about 1.3 s, so Skip would race it (the layout spec's pattern).
  const viewer = a;
  await viewer.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("blocked")) } });
  });
  await viewer.clock.install();
  await viewer.clock.pauseAt(new Date(Date.now() + 1000));
  await viewer.goto(`${url}/result`);
  await viewer.getByTestId("reveal-skip").click();
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
  await viewer.getByTestId("reveal-replay").click();
  await expect(viewer.getByTestId("reveal-skip")).toBeVisible();
  await viewer.getByTestId("share").click();
  await expect(viewer.getByLabel("Share text")).toHaveValue(/^CLOSED n RAN\. Top spot: line \d+, @/);
});

test("each picking mode offers its own controls", async ({ browser }) => {
  const host = await as(browser, `j2m${run}@e2e.test`, "host");
  const pickOrRandom = await composeBreak(host, { title: `Modes A ${run}`, lineCount: 6, mode: "Pick or random" });
  const pickOnly = await composeBreak(host, { title: `Modes B ${run}`, lineCount: 6, mode: "Pick only, no randoms" });
  const straight = await composeBreak(host, { title: `Modes C ${run}`, lineCount: 6, mode: "Straight fill" });
  const buyer = await as(browser, `j2p${run}@e2e.test`);

  await buyer.goto(pickOrRandom);
  await expect(buyer.getByTestId("claim-step")).toHaveText("Claim 1 random");
  await expect(buyer.getByTestId("cell-1")).not.toHaveAttribute("aria-disabled", "true");
  await buyer.getByTestId("claim-step").click();
  await expect(buyer.getByTestId("pay-outcome")).toHaveText(/^You have line \d\.$/);
  await buyer.getByRole("button", { name: "I'll pay later" }).click();

  await buyer.goto(pickOnly);
  await expect(buyer.getByTestId("claim-step")).toHaveCount(0);
  await buyer.getByTestId("cell-4").click();
  await expect(buyer.getByTestId("bar-summary")).toHaveText("Line 4, $5");

  await buyer.goto(straight);
  await expect(buyer.getByTestId("cell-1")).toHaveAttribute("aria-disabled", "true");
  await expect(buyer.getByTestId("claim-step")).toHaveText("Claim the next line");
});
```

- [ ] **Step 5: Document the e2e database**

In `README.md`, insert after the "Test database" section (before the line `Then migrate the dev database and run:`):

````markdown
### E2E database

`pnpm test:e2e` runs against a third database, `breaks_e2e`, which Playwright empties before every run (`e2e/global-setup.ts` refuses any other name). Create it once with the repo's own `postgres` package (no `psql` needed), and migrate it once and again after every new migration:

```bash
pnpm exec tsx scripts/create-db.ts breaks_e2e
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate
```

Without the script, the stack's own container has `psql`: `docker exec supabase_db_plan-1-tracer-bullet psql -U postgres -c 'create database breaks_e2e'`, then `docker exec -i supabase_db_plan-1-tracer-bullet psql -U postgres -d breaks_e2e < supabase/ci-auth-stub.sql`. The same script creates the test database: `pnpm exec tsx scripts/create-db.ts breaks_test`.

Set `E2E_DATABASE_URL` to use another server; the database must still be called `breaks_e2e`. Sign-in for e2e users still goes through the local Supabase Auth, so their auth rows stay in the stack's own database.
````

In `.env.example`, below the line `# .env.test: use postgresql://postgres:postgres@127.0.0.1:54322/breaks_test, never the dev database (tests truncate it)`, add:

```
# e2e: Playwright uses postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e (override with E2E_DATABASE_URL); it is emptied before each run
```

- [ ] **Step 6: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green: journey 1, journey 2 (both tests), the layout spec and the page spec, on a freshly emptied `breaks_e2e`. Run `pnpm test:e2e e2e/layout.spec.ts` twice more; the sent-failure test must pass both times.

- [ ] **Step 7: Commit**

```bash
git add scripts/create-db.ts e2e playwright.config.ts README.md .env.example
git commit -m "test(e2e): journey 2, its own emptied database, and a deterministic sent-failure test"
```

---

### Task 16: "Take the last N" means those N, bonus lines go with the last numbered line, and the test backlog (model: opus)

Deferred items 9 and 5. "Take the last 3" could claim 4 lines if one reopened between the bar's render and the claim: the bar now sends the count it showed and `claimAllOpen` refuses a mismatch (a same-batch retry of a claim that already succeeded still returns its lines). A bonus line could outlive its holder's numbered lines: a release or give-back that leaves a buyer no numbered line now removes their bonus lines (recorded ruling 6), and both confirms say so ("Their bonus line 51 goes too." for the host, "Your bonus line 51 goes too." for the buyer), so no line leaves the grid unannounced. The buyer's give-back and the host's un-mark move from loops in server actions into domain commands, so their all-or-nothing rollback can be tested. And the rest of the deferred test backlog lands: `claimNext` on a pick-or-random break and in a race, the 0001 backfill, the owned-and-reserved grid case, ledger-view edge cases, `dealGateScript` behaviour, and `suggestHandle` edge cases. (Done earlier: `hostTrust` and host-list scope in Task 1, the post-sign-in redirect in Task 9, Share fallback, Skip focus and Replay reset in Task 15.)

**Files:**
- Modify: `src/domain/lines/commands.ts` (`openChanged`, `dropOrphanBonus`, `claimAllOpen`, `releaseLine`, `releaseForBuyer`; append `giveBackLines`, `unmarkPaidLines`)
- Modify: `src/domain/lines/commands.test.ts`
- Modify: `src/app/b/[id]/actions.ts` (imports, `claimRest`, `giveBack`, `unpaidForBuyer`)
- Modify: `src/components/break/break-interactive.tsx` (`onLast`)
- Modify: `tests/concurrency/claims.test.ts` (a `claimNext` race)
- Create: `src/db/migrations.test.ts`
- Modify: `src/domain/breaks/grid.test.ts`, `src/components/ledger/ledger-view.test.ts`, `src/app/b/[id]/result/reveal-plan.test.ts`, `src/domain/users/suggest-handle.test.ts`
- Modify (the bonus line named in the confirms): `src/components/break/pay-copy.ts` (`bonusGoesWith`, `giveBackPrompt`, `nextPendingOwe`), `src/components/break/pay-copy.test.ts`, `src/components/break/use-pay-sheet.ts` (`Owe.bonusLost`), `src/components/break/pay-sheet.tsx`, `src/components/ledger/ledger-view.ts` (`releaseConfirm`), `src/app/b/[id]/page.tsx` (`owe.bonusLost`), `src/app/me/card-props.ts`, `src/app/me/card-props.test.ts`, `src/components/me/my-break-card.tsx`

**Interfaces:**
- Consumes: `Owe` (`src/components/break/use-pay-sheet.ts`, Task 10), `toCardProps` (Task 11), `LedgerRowView`, `releaseConfirm` (Plan A, `paymentName` from Task 2).
- Produces:
  - `bonusGoesWith(held: readonly { number: number; bonus: boolean }[], givingBack: readonly number[]): number[]` (`pay-copy.ts`): the buyer's bonus lines when giving back `givingBack` would leave no numbered line, else `[]`.
  - `giveBackPrompt(numbers: readonly number[], bonusLost: readonly number[] = []): { text: string; confirm: string }` — adds "Your bonus line 51 goes too."; `Owe.bonusLost?: number[]`, set on the break page and on `/me`, carried by `nextPendingOwe`.
  - `releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent" | "numbers" | "bonus">, numbers)` — adds "Their bonus line 51 goes too." when the release takes every numbered line the buyer holds.
  - `claimAllOpen(tx, caller, { breakId, batchId, expected?: number, ipHash? })` — with `expected` set and a different open count: `LineTaken([])` with the message "The open lines just changed. Check the board and try again."; nothing claimed.
  - `giveBackLines(tx, caller, { breakId, numbers }): Promise<{ released: number[] }>`; `unmarkPaidLines(tx, caller, { breakId, numbers }): Promise<void>` — both rely on the caller's transaction for all-or-nothing.
  - Event `line.bonus_removed` `{ number, ownerId, reason: "no_numbered_line" }`.
  - Server action `claimRest(breakId: string, batchId: string, expected: number)`.

- [ ] **Step 1: Write the failing domain tests**

In `src/domain/lines/commands.test.ts`, change the import line

```ts
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill, releaseForBuyer, addBonusLine } from "./commands";
```

to

```ts
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill, releaseForBuyer, addBonusLine, giveBackLines, unmarkPaidLines } from "./commands";
```

and append at the end of the file:

```ts
describe("take the last N", () => {
  it("take the last N refuses when the open count changed (Review Focus 5)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() });
      // The bar offered "Take the last 3"; then line 3 was given back, so 4 are open when the claim lands.
      await releaseLine(tx, c(bb), { breakId: b.id, number: 3, reason: "withdrawn" });
      await expect(claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID(), expected: 3 })).rejects.toThrow("The open lines just changed. Check the board and try again.");
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId === a.id)).toHaveLength(0);
      const batchId = randomUUID();
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId, expected: 4 })).got).toEqual([3, 4, 5, 6]);
      // A retry of the claim that succeeded (lost response) returns its lines, whatever it now expects.
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId, expected: 3 })).got).toEqual([3, 4, 5, 6]);
    });
  });
});

describe("bonus lines go with the last numbered line", () => {
  it("a release that leaves a buyer no numbered line removes their bonus lines; otherwise they stay", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      expect((await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).number).toBe(11);
      await releaseLine(tx, c(host, "host"), { breakId: b.id, number: 2, reason: "host_dropped" });
      expect((await lineRows(tx, b.id)).some((l) => l.number === 11)).toBe(true); // a still holds line 1
      await releaseLine(tx, c(a), { breakId: b.id, number: 1, reason: "withdrawn" });
      expect((await lineRows(tx, b.id)).some((l) => l.number === 11)).toBe(false);
      const removed = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.bonus_removed'`);
      expect(removed.map((e) => e.payload)).toEqual([{ number: 11, ownerId: a.id, reason: "no_numbered_line" }]);

      await claimLines(tx, c(bb), { breakId: b.id, numbers: [3, 4], batchId: randomUUID() });
      expect((await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: bb.id })).number).toBe(11);
      await releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: bb.id, numbers: [3, 4], reason: "host_dropped" });
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId === bb.id)).toEqual([]);
    });
  });
});

describe("give back and un-mark, all or nothing", () => {
  it("giveBackLines releases every line or none", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      // Line 5 is someone else's: the savepoint rolls back line 1's release too.
      await expect(tx.transaction((t) => giveBackLines(t, c(a), { breakId: b.id, numbers: [1, 5] }))).rejects.toBeInstanceOf(NotAuthorized);
      expect((await lineRows(tx, b.id)).find((l) => l.number === 1)?.ownerId).toBe(a.id);
      expect(await giveBackLines(tx, c(a), { breakId: b.id, numbers: [1, 2] })).toEqual({ released: [1, 2] });
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId === a.id)).toEqual([]);
    });
  });
  it("unmarkPaidLines un-marks every line or none", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      // Line 2 is not paid: the savepoint rolls back line 1's un-mark too.
      await expect(tx.transaction((t) => unmarkPaidLines(t, c(host, "host"), { breakId: b.id, numbers: [1, 2] }))).rejects.toBeInstanceOf(InvalidInput);
      expect((await lineRows(tx, b.id)).find((l) => l.number === 1)?.paidAt).not.toBeNull();
      await unmarkPaidLines(tx, c(host, "host"), { breakId: b.id, numbers: [1] });
      expect((await lineRows(tx, b.id)).find((l) => l.number === 1)?.paidAt).toBeNull();
    });
  });
});

describe("claimNext outside straight fill", () => {
  it("refuses a break that lets buyers pick", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toThrow("This break lets you pick your lines");
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/lines/commands.test.ts`
Expected: FAIL: `giveBackLines` and `unmarkPaidLines` are not exported; `claimAllOpen` ignores `expected` (claims 4 lines); the bonus line survives the give-back. "claimNext outside straight fill" passes already (it pins existing behaviour).

- [ ] **Step 3: Write the domain changes**

In `src/domain/lines/commands.ts`, add after the `onlyOpen` function:

```ts
/** "Take the last 3" pressed after lines moved: the bar's count no longer matches what is open. */
function openChanged(): LineTaken {
  const e = new LineTaken([]);
  e.message = "The open lines just changed. Check the board and try again.";
  return e;
}

/** A bonus line goes with holding a numbered line (spec §7): once a buyer holds none in the break, their bonus lines go too. */
async function dropOrphanBonus(tx: Tx, b: BreakRow, ownerId: string, actorId: string): Promise<number[]> {
  const [held] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${ownerId} and ${lines.isBonus} = false`);
  if (held.n > 0) return [];
  const rows = await tx.execute<{ number: number }>(sql`delete from lines where break_id = ${b.id} and owner_id = ${ownerId} and is_bonus = true returning number`);
  const numbers = rows.map((r) => r.number).sort((x, y) => x - y);
  for (const number of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId, type: "line.bonus_removed", payload: { number, ownerId, reason: "no_numbered_line" } });
  }
  return numbers;
}
```

Replace `claimAllOpen` (from `export async function claimAllOpen` to its closing `}`) with:

```ts
export async function claimAllOpen(tx: Tx, caller: Caller, p: { breakId: string; batchId: string; expected?: number; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  const prior = await priorBatch(tx, b.id, caller.id, p.batchId);
  if (prior) return prior;
  assertClaimable(b);
  const open = (await tx.select({ number: lines.number }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)).map((r) => r.number);
  if (open.length === 0) throw new LineTaken([]);
  // "Take the last 3" means those three: if lines reopened or went since the bar was drawn, claim nothing and say so.
  if (p.expected !== undefined && open.length !== p.expected) throw openChanged();
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: open.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaidCount(tx, caller.id) });
  const got = await assign(tx, b, caller, open, p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}
```

In `releaseLine`, replace its last line

```ts
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: p.number, reason: p.reason } });
}
```

with

```ts
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: p.number, reason: p.reason } });
  await dropOrphanBonus(tx, b, cur.ownerId, caller.id);
}
```

In `releaseForBuyer`, replace

```ts
  for (const n of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: n, reason: p.reason } });
  }
  return { released: numbers };
```

with

```ts
  for (const n of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: n, reason: p.reason } });
  }
  await dropOrphanBonus(tx, b, p.ownerId, caller.id);
  return { released: numbers };
```

Append to the end of the file:

```ts
/** A buyer gives back unpaid lines (reason `withdrawn`). All or nothing: any refusal throws, and the caller's transaction rolls back. */
export async function giveBackLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<{ released: number[] }> {
  for (const number of p.numbers) await releaseLine(tx, caller, { breakId: p.breakId, number, reason: "withdrawn" });
  return { released: p.numbers };
}

/** The host un-marks paid lines (the ledger's Undo and per-line un-mark); each logs `line.unpaid`. All or nothing, as above. */
export async function unmarkPaidLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<void> {
  for (const number of p.numbers) await unmarkPaid(tx, caller, { breakId: p.breakId, number });
}
```

- [ ] **Step 4: Use them in the actions and the island**

In `src/app/b/[id]/actions.ts`, replace the import block

```ts
import {
  claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, releaseForBuyer, addBonusLine,
} from "@/domain/lines/commands";
```

with

```ts
import {
  claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, releaseForBuyer, addBonusLine, giveBackLines, unmarkPaidLines,
} from "@/domain/lines/commands";
```

replace

```ts
export async function claimRest(breakId: string, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, batchId: uuid }), { breakId, batchId });
```

with

```ts
/** "Take the last N": `expected` is the N the bar showed; if the open count differs, nothing is claimed. */
export async function claimRest(breakId: string, batchId: string, expected: number) {
  const v = parseInput(z.object({ breakId: uuid, batchId: uuid, expected: z.number().int().min(1).max(50) }), { breakId, batchId, expected });
```

replace

```ts
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await releaseLine(tx, c, { breakId: p.breakId, number, reason: "withdrawn" });
    return { released: p.numbers };
  });
```

with

```ts
  const r = await action((tx, c) => giveBackLines(tx, c, p));
```

and replace

```ts
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await unmarkPaid(tx, c, { breakId: p.breakId, number });
    return null;
  });
```

with

```ts
  const r = await action(async (tx, c) => {
    await unmarkPaidLines(tx, c, p);
    return null;
  });
```

In `src/components/break/break-interactive.tsx`, replace

```ts
  const onLast = () => {
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    claimer.run(open, (id) => claimRest(p.breakId, id));
  };
```

with

```ts
  const onLast = () => {
    if (bar.kind !== "idle" || bar.lastN === null) return;
    const expected = bar.lastN; // the N on the button: the server refuses if the open count moved since
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    claimer.run(open, (id) => claimRest(p.breakId, id, expected));
  };
```

- [ ] **Step 5: Run the domain tests to see them pass**

Run: `pnpm test src/domain/lines`
Expected: PASS, including "take the last N refuses when the open count changed (Review Focus 5)".

- [ ] **Step 6: Name the bonus line in the release and give-back confirms**

In `src/components/break/pay-copy.test.ts`, change the import line

```ts
import { commitmentShort, nextPendingOwe, giveBackPrompt, lateReleaseText, payeeFor, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";
```

to

```ts
import { bonusGoesWith, commitmentShort, nextPendingOwe, giveBackPrompt, lateReleaseText, payeeFor, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";
```

and append at the end of the file:

```ts
it("names the bonus lines a give-back takes with it (recorded ruling 6)", () => {
  expect(bonusGoesWith([{ number: 5, bonus: false }, { number: 51, bonus: true }], [5])).toEqual([51]);
  expect(bonusGoesWith([{ number: 3, bonus: false }, { number: 5, bonus: false }, { number: 51, bonus: true }], [5])).toEqual([]);
  expect(bonusGoesWith([{ number: 5, bonus: false }], [5])).toEqual([]);
  expect(giveBackPrompt([5], [51]).text).toBe("Give back line 5? It goes back on the board. Your bonus line 51 goes too.");
  expect(giveBackPrompt([4, 5], [51, 52]).text).toBe("Give back lines 4 and 5? They go back on the board. Your bonus lines 51 and 52 go too.");
  expect(giveBackPrompt([4])).toEqual({ text: "Give back line 4? It goes back on the board.", confirm: "Give back 1 line" });
  const base = { numbers: [5], cents: 500, payByIso: null, payByFallback: null, late: false, bonusLost: [51] };
  expect(nextPendingOwe(base, [6], 500)?.bonusLost).toEqual([51]);
});
```

In `src/components/ledger/ledger-view.test.ts`, append at the end of the file:

```ts
describe("release confirm and bonus lines", () => {
  it("names the bonus line when the release takes every numbered line the buyer holds", () => {
    const fay = row({ ownerId: "f", handle: "fay", numbers: [4, 11, 51], unpaid: [4, 11], paid: [51], bonus: [51], owedCents: 1000, status: "unpaid" });
    expect(releaseConfirm(fay, [4, 11]).text).toBe("Release lines 4 and 11 from @fay? They reopen now. Their bonus line 51 goes too.");
    // A paid numbered line stays with fay, so her bonus line stays too.
    expect(releaseConfirm({ ...fay, numbers: [3, 4, 11, 51], paid: [3, 51] }, [4, 11]).text).toBe("Release lines 4 and 11 from @fay? They reopen now.");
  });
});
```

In `src/app/me/card-props.test.ts`, replace

```ts
      owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false },
```

with

```ts
      owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false, bonusLost: [] },
```

and append inside `describe("toCardProps", …)`, after its last test:

```ts
  it("says which bonus lines a give-back would take", () => {
    const onlyUnsent = { ...g, lines: [{ number: 5, state: "taken" as const, bonus: false }, { number: 11, state: "paid" as const, bonus: true }], sent: [], paid: [11] };
    expect(toCardProps(onlyUnsent, now, { tz: "America/New_York", labelled: false }).owe?.bonusLost).toEqual([11]);
  });
```

Run: `pnpm test src/components/break/pay-copy.test.ts src/components/ledger/ledger-view.test.ts src/app/me/card-props.test.ts`
Expected: FAIL: `bonusGoesWith` is not exported, `giveBackPrompt` ignores its second argument, `releaseConfirm` says nothing of the bonus line, and the card's owe has no `bonusLost`.

In `src/components/break/pay-copy.ts`, replace

```ts
export function giveBackPrompt(numbers: readonly number[]): { text: string; confirm: string } {
  if (numbers.length === 1) return { text: `Give back line ${numbers[0]}? It goes back on the board.`, confirm: "Give back 1 line" };
  return { text: `Give back lines ${joinAnd(numbers)}? They go back on the board.`, confirm: `Give back ${numbers.length} lines` };
}
```

with

```ts
/** The buyer's bonus lines that a give-back of `givingBack` takes with it: all of them once no numbered line is left (ruling 6). */
export function bonusGoesWith(held: readonly { number: number; bonus: boolean }[], givingBack: readonly number[]): number[] {
  const bonus = held.filter((l) => l.bonus).map((l) => l.number).sort((a, b) => a - b);
  const keepsNumbered = held.some((l) => !l.bonus && !givingBack.includes(l.number));
  return bonus.length > 0 && !keepsNumbered ? bonus : [];
}

/** The give-back confirm names the lines, and any bonus line that goes with them, so nothing leaves the grid unannounced. */
export function giveBackPrompt(numbers: readonly number[], bonusLost: readonly number[] = []): { text: string; confirm: string } {
  const bonus = bonusLost.length === 0 ? ""
    : bonusLost.length === 1 ? ` Your bonus line ${bonusLost[0]} goes too.`
    : ` Your bonus lines ${joinAnd(bonusLost)} go too.`;
  if (numbers.length === 1) return { text: `Give back line ${numbers[0]}? It goes back on the board.${bonus}`, confirm: "Give back 1 line" };
  return { text: `Give back lines ${joinAnd(numbers)}? They go back on the board.${bonus}`, confirm: `Give back ${numbers.length} lines` };
}
```

and in the same file replace

```ts
type OweShape = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean };
```

with

```ts
type OweShape = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean; bonusLost?: number[] };
```

and

```ts
    late: base?.late ?? false,
  };
}
```

with

```ts
    late: base?.late ?? false,
    // Giving back every owed line, the new ones included, still leaves no numbered line: the same bonus lines go.
    bonusLost: base?.bonusLost,
  };
}
```

In `src/components/break/use-pay-sheet.ts`, replace

```ts
export type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean };
```

with

```ts
export type Owe = {
  numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean;
  /** Bonus lines a give-back of every owed line would take with it (recorded ruling 6); the give-back confirm names them. */
  bonusLost?: number[];
};
```

In `src/components/break/pay-sheet.tsx`, replace

```tsx
  const prompt = p.owe ? giveBackPrompt(p.owe.numbers) : null;
```

with

```tsx
  const prompt = p.owe ? giveBackPrompt(p.owe.numbers, p.owe.bonusLost) : null;
```

In `src/components/me/my-break-card.tsx`, replace

```tsx
  const prompt = owe ? giveBackPrompt(owe.numbers) : null;
```

with

```tsx
  const prompt = owe ? giveBackPrompt(owe.numbers, owe.bonusLost) : null;
```

In `src/components/ledger/ledger-view.ts`, replace

```ts
export function releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent">, numbers: readonly number[]): { text: string; confirm: string; warning: string | null } {
  const sentAmong = r.sent.filter((n) => numbers.includes(n));
  return {
    text: `Release ${linesPhrase(numbers)} from ${who(r)}? ${numbers.length === 1 ? "It reopens" : "They reopen"} now.`,
```

with

```ts
export function releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent" | "numbers" | "bonus">, numbers: readonly number[]): { text: string; confirm: string; warning: string | null } {
  const sentAmong = r.sent.filter((n) => numbers.includes(n));
  // Releasing every numbered line the buyer holds takes their bonus lines too (recorded ruling 6): say so.
  const numbered = r.numbers.filter((n) => !r.bonus.includes(n));
  const bonusGoes = r.bonus.length > 0 && numbered.every((n) => numbers.includes(n)) ? [...r.bonus].sort((a, b) => a - b) : [];
  const bonus = bonusGoes.length === 0 ? ""
    : bonusGoes.length === 1 ? ` Their bonus line ${bonusGoes[0]} goes too.`
    : ` Their bonus lines ${joinAnd(bonusGoes)} go too.`;
  return {
    text: `Release ${linesPhrase(numbers)} from ${who(r)}? ${numbers.length === 1 ? "It reopens" : "They reopen"} now.${bonus}`,
```

In `src/app/b/[id]/page.tsx`, replace

```tsx
import { commitmentShort } from "@/components/break/pay-copy";
```

with

```tsx
import { bonusGoesWith, commitmentShort } from "@/components/break/pay-copy";
```

and replace

```ts
        late: payBy !== null && payBy.getTime() < now.getTime(),
      }
```

with

```ts
        late: payBy !== null && payBy.getTime() < now.getTime(),
        bonusLost: bonusGoesWith(grid.cells.filter((c) => c.mine), grid.viewer.unsent),
      }
```

In `src/app/me/card-props.ts`, replace

```ts
import { commitmentShort, payeeFor } from "@/components/break/pay-copy";
```

with

```ts
import { bonusGoesWith, commitmentShort, payeeFor } from "@/components/break/pay-copy";
```

and replace

```ts
          late: g.late,
        }
      : null,
```

with

```ts
          late: g.late,
          bonusLost: bonusGoesWith(g.lines, g.unsent),
        }
      : null,
```

Run: `pnpm test src/components/break/pay-copy.test.ts src/components/ledger/ledger-view.test.ts src/app/me/card-props.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the rest of the backlog**

In `tests/concurrency/claims.test.ts`, change `import { claimLines, claimRandom } from "@/domain/lines/commands";` to `import { claimLines, claimNext, claimRandom } from "@/domain/lines/commands";` and add inside `describe("concurrent claims", …)`, after the test `"random claims never hand out the same line twice and never exceed the open count"`:

```ts
  it("straight-fill claims racing hand out the lowest numbers, each once, in consecutive pairs", async () => {
    const { b, buyers } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10, claimMode: "straight" });
      const buyers = await Promise.all(Array.from({ length: 6 }, () => makeUser(tx)));
      return { b, buyers };
    });
    const results = await Promise.allSettled(buyers.map((u) => db.transaction((tx) => claimNext(tx, c(u.id), { breakId: b.id, count: 2, batchId: randomUUID() }))));
    const won = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.got] : []));
    expect(won).toHaveLength(5); // 10 lines, 2 each
    expect(won.flat().sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const got of won) expect(got[1] - got[0]).toBe(1); // the break row lock serialises callers
    await db.transaction((tx) => assertInvariants(tx));
  });
```

Create `src/db/migrations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";

describe("migration 0001 backfill", () => {
  it("turns breaks that refused random claims into pick-only and leaves the rest", async () => {
    const text = readFileSync("src/db/migrations/0001_claim_mode.sql", "utf8");
    const statement = text.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim())
      .find((s) => s.startsWith("update breaks set claim_mode"));
    expect(statement).toBe("update breaks set claim_mode = 'pick_only' where allow_random_claims = false;");
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const refused = await makeBreak(tx, { hostId: host.id });
      const allowed = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set allow_random_claims = false, claim_mode = 'pick_or_random' where id = ${refused.id}`);
      // The migration's own statement, scoped to this test's two drafts.
      await tx.execute(sql.raw(`${statement!.replace(/;$/, "")} and id in ('${refused.id}', '${allowed.id}')`));
      const rows = await tx.select({ id: breaks.id, claimMode: breaks.claimMode }).from(breaks).where(sql`${breaks.id} in (${refused.id}, ${allowed.id})`);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.claimMode]))).toEqual({ [refused.id]: "pick_only", [allowed.id]: "pick_or_random" });
    });
  });
});
```

In `src/domain/breaks/grid.test.ts`, add inside `describe("shapeGrid", …)` after its last test:

```ts
  it("an owned line keeps its owner's state even if it still carries a mini reservation", () => {
    const m = shapeGrid(page([held(1, ALICE, "alice", { reservedForMiniId: MINI, paidAt: hoursAgo(1) }), open(2)]), null, now);
    expect(m.cells[0]).toMatchObject({ number: 1, state: "paid", holder: null, overdue: false });
    expect(m.counts).toMatchObject({ paid: 1, reserved: 0, open: 1 });
  });
```

In `src/components/ledger/ledger-view.test.ts`, append at the end of the file:

```ts
describe("edge cases", () => {
  it("an empty ledger has zero counts and shows nobody", () => {
    expect(chipCounts([])).toEqual({ all: 0, sent: 0, unpaid: 0, overdue: 0 });
    expect(applyView(freezeView([], "all"), [], "")).toEqual([]);
  });
  it("applyOrder drops a buyer who left and puts a newcomer last", () => {
    expect(applyOrder([dave, alice], ["a", "x", "d"]).map((r) => r.ownerId)).toEqual(["a", "d"]);
    expect(applyOrder([bob, alice], ["a"]).map((r) => r.ownerId)).toEqual(["a", "b"]);
    expect(applyOrder([], ["a"])).toEqual([]);
  });
});
```

In `src/app/b/[id]/result/reveal-plan.test.ts`, append at the end of the file:

```ts
it("marks <html data-deal> only for a first-time viewer without reduced motion, lifts it after 4 s, and never throws", () => {
  const runGate = (o: { seen: string | null; reduced: boolean; storageThrows?: boolean }) => {
    const dataset: Record<string, string> = {};
    const timers: (() => void)[] = [];
    const localStorage = { getItem: () => { if (o.storageThrows) throw new Error("blocked"); return o.seen; } };
    const matchMedia = () => ({ matches: o.reduced });
    const document = { documentElement: { dataset } };
    const setTimeout = (fn: () => void) => { timers.push(fn); return 0; };
    // The script runs against these stand-ins for the browser globals it names.
    new Function("localStorage", "matchMedia", "document", "setTimeout", dealGateScript("b1"))(localStorage, matchMedia, document, setTimeout);
    return { dataset, timers };
  };
  const first = runGate({ seen: null, reduced: false });
  expect(first.dataset.deal).toBe("1");
  first.timers.forEach((t) => t());
  expect(first.dataset.deal).toBeUndefined();
  expect(runGate({ seen: "1", reduced: false }).dataset.deal).toBeUndefined();
  expect(runGate({ seen: null, reduced: true }).dataset.deal).toBeUndefined();
  expect(() => runGate({ seen: null, reduced: false, storageThrows: true })).not.toThrow();
});
```

In `src/domain/users/suggest-handle.test.ts`, append at the end of the file:

```ts
it("shapes awkward addresses into a valid handle", () => {
  expect(suggestHandle("Ünïcode.Name+tag@x.com")).toBe("unicode_name_tag");
  expect(suggestHandle("a@x.com")).toBe("a__");
  expect(suggestHandle("___@x.com")).toBe("user");
  expect(suggestHandle("admin@x.com")).toBe("admin_1");
  expect(suggestHandle("a-very-long-local-part-indeed@x.com")).toBe("a_very_long_local_pa");
  expect(suggestHandle("")).toBe("user");
  for (const email of ["Ünïcode.Name+tag@x.com", "a@x.com", "admin@x.com", "a-very-long-local-part-indeed@x.com"]) {
    expect(() => normalizeHandle(suggestHandle(email))).not.toThrow();
  }
});
```

- [ ] **Step 8: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green. Journey 1's Bob still takes the last line with `claim-rest` (the bar's N matches); the layout spec's give-back still works through `giveBack`; no e2e buyer holds a bonus line when giving back, so no e2e assertion on the confirm text moved.

The backlog tests in Step 7 pin existing behaviour and are expected to pass on their first run. If one fails, read the code once: fix the test only when the code matches the spec; otherwise leave that test out of the commit (`it.skip` with the reason), record it in the report and finish as DONE_WITH_CONCERNS. Fix what these checks report; if a finding needs a design decision, record it in the report and move on; never spend more than one round (Global Constraints).

- [ ] **Step 9: Commit**

```bash
git add src/domain/lines src/domain/breaks/grid.test.ts src/db/migrations.test.ts "src/app/b/[id]/actions.ts" "src/app/b/[id]/page.tsx" "src/app/b/[id]/result/reveal-plan.test.ts" src/components/break src/components/ledger src/components/me/my-break-card.tsx src/app/me src/domain/users/suggest-handle.test.ts tests/concurrency/claims.test.ts
git commit -m "fix(lines): take the last N means those N, bonus lines go with the last numbered line, and the test backlog"
```

---

## Self-review

Run by the plan's author against the design, the deferred list and the code at `21af6ef`; fixed inline. Re-run after the panel revisions below.

**Spec coverage.**
- D§5.1 shell: My lines tab for signed-in viewers and the header nav once two or more destinations exist (Task 11); Browse points at the feed (Task 9); avatar links to `/account` (Task 5).
- D§5.2 landing: ran-not-voided hero with the green winning cell, linked to its result, "Ran 2 hours ago. Anyone can check the draw." / "Ran on Tuesday."; the sentence; Browse breaks and How draws work; six feed cards; the hosts line without the deferred invite contact (Tasks 1, 9).
- D§5.3 feed: three sorts and a host filter in the URL, open breaks only, horizontal card with 96-pt mini grid, "19 of 50 left", two-tone fill bar, "$5 a line", host and trust line, the empty state and its host-filtered variant with a way back to every open break (Tasks 1, 8).
- D§5.5 last paragraph: grouped `/host` with New break at the top and the "waiting for you" strip ("Review") with a merged ledger carrying break titles, built from `LedgerRow`: Paid in place, Undo for 8 s, a polite snackbar, rows frozen (Tasks 1, 3, 12).
- D§5.6 last line: drafts editable, private (Tasks 6a, 6b).
- D§5.8 My lines: grouped, most recent first, cells, state, owed (open breaks only), How to pay Jim, Give back with a confirm naming the lines (and any bonus line, Task 16), won with "Tell Jim your choice", Earlier that never hides a pending action (Tasks 3, 10, 11). Got it and shipped tracking wait for the reputation plan; a shipped award already reads "Shipped.".
- D§5.9 host profile: handle, since, the trust sentence (no "0 breaks run", no date twice), open breaks as cards, past count (Tasks 3, 8). Median ship days wait for the reputation plan.
- D§5.10 live handle availability (Tasks 7a, 7b); the payment-name field (Task 5).
- D§6 link preview (Task 13). D§7 floor: axe and render tests (Task 14b).
- Deferred "For the Plan B brief": 1 hooks and past-deadline wording (Task 10); 2 perf (Task 4); 3 accessibility (Tasks 14a, 14b; the table header is a recorded deviation, ruling 5); 4 copy (Tasks 8, 14a); 5 test backlog (Tasks 1, 9, 15, 16); 6 journey 2, e2e database, flake (Task 15); 7 offline refresh (Task 10); 8 technical details fold (Task 14a); 9 `/host` minis (Task 1), "Take the last N" (Task 16), bonus outliving release and the confirms that name it (Task 16), live chip counts (left as is, ruling 10); 10 `/account` and the half-set-up account (Tasks 2, 5); 11 payment name (Tasks 2, 5); 12 dropping `allow_random_claims` and e2e in CI (left, ruling 10).

**Panel items.** Every Must, Blocking, Should and Non-blocking item of the three reviews is applied (see "Panel revisions"), with one exception ruled out by the lead's instructions: the optional Task 10 split (exec Should 9), since only Tasks 6 and 7 are split.

**Placeholder scan.** No "TBD", "TODO", "similar to Task N", "add validation" or "handle edge cases": every step carries its code, its command and its expected output. The open-ended steps (Task 14b Steps 3 and 6, Task 16 Step 8's note on Step 7) now carry the one-round stopping rule from the Global Constraints and say what to do with a finding that needs a design decision.

**Names and signatures across tasks.** `listFeed`, `feedThumbs`, `feedHosts`, `latestRanBreak`, `FeedBreak`, `ThumbCell` (Task 1) are used with the same shapes in Tasks 8 and 9; `drawnBreak` (Task 1) in Tasks 3, 4; `paymentName` (Task 2) reaches `ledgerByBuyer`, `LedgerRowView`, `waitingOnHost` (Task 3), `toWaitingView` and the merged ledger (Task 12) and the render tests (Task 14b); `myLines`/`MyBreak` (Task 3) feed `toCardProps` (Task 11); `hostProfile` (Task 3) is read by the profile page (Task 8); `loadBreak`/`readBreakView` (Task 4) are reused by `generateMetadata` in Task 13; `accountOf` (Task 5) is kept verbatim when Task 7a rewrites `src/domain/users/queries.ts`; `updateDraft`, `draftForEdit`, `ComposerInitial`, `newComposerInitial`, `draftComposerInitial` (Task 6a) are what Task 6b's pages and `ComposerForm({ initial, maxLines })` consume; `composeBreak` (Task 6b) is used by Tasks 8, 9, 11, 12, 13, 15; `checkHandle` and `ipBucket` (Task 7a) are what Task 7b's route calls; `Owe.late`, `usePaySheet`, `useClaim`, `canRefresh`, `OFFLINE_NOTE`, `lateReleaseText`, `payeeFor` (Task 10) are consumed by Tasks 11 and 12; `stateLine` takes `status` from Task 11 on; `LedgerRow`'s optional `title`/`onToggle`, `markedPaid` and `WaitingView` (Task 12) are used only by the strip, and the per-break ledger keeps passing `onToggle`; `hostHref` (Task 8) survives the island rewrite in Task 10; `viewerIsHost` and `isRepeat` (Task 14a) and `claimRest(…, expected)` (Task 16) edit the Task 10 island by exact snippets; Task 16's `bonusGoesWith`, `giveBackPrompt(numbers, bonusLost)`, `Owe.bonusLost` and `releaseConfirm` edits quote the Task 10, 11 and Plan A text they replace (`OweShape` with `late`, `late: base?.late ?? false,`, the card's `late: g.late,`, the page's `late: payBy !== null …` line, and the card-props test's owe literal); `break-interactive.tsx` and `src/app/b/[id]/page.tsx` edits in Tasks 6b, 8, 10, 13, 14a and 16 quote lines that exist after the preceding task. Journey 2 (Task 15) keys the merged ledger by `waiting-sheet` → `ledger-row`/`ledger-paid`, as Task 12 renders it.

**Review Focus pins.** 1 → Task 1 `feed.test.ts` "sorts: filling fast counts numbered lines paid in the last 24 h only (Review Focus 1)". 2 → Task 3 `lines/queries.test.ts` "owes only unsent lines and wins only from the active draw (Review Focus 2)" and "shows a choice prize as a choice until the winner picks, and never hides it under Earlier". 3 → Task 7a `users/handle-check.test.ts` "checkHandle (Review Focus 3)" (three tests, the per-user limit included). 4 → Task 13 `breaks/og.test.ts` "ogModel (Review Focus 4)" and the draft-host request in `e2e/pages.spec.ts`. 5 → Task 16 `lines/commands.test.ts` "take the last N refuses when the open count changed (Review Focus 5)".

**Sequencing.** Every task leaves lint, unit tests, tsc, the build and the e2e specs green: 1 to 5 as before; 6a adds unused domain functions (gates green), 6b consumes them with unchanged composer field names and test ids; 7a adds migration 0003 (both databases migrated in the task, `test:ci` in its gate) and functions nothing calls yet, 7b adds the route and the field; 8 to 11 as before (11's PaySheet now mounts only while open, which no spec relies on being closed-but-present); 12 changes only the strip's markup, and its spec and journey 2 key on the new ids; 13 to 14b as before (14b's loops are bounded); 15 moves the suite to `breaks_e2e` after every spec that needs it exists, created by `scripts/create-db.ts`; 16's confirm copy changes no text an e2e asserts (no e2e buyer gives back while holding a bonus line).

## Panel revisions

Applied after the three-reviewer panel (design fidelity "D", code "C", executability "X"), with the lead's rulings.

- Task 12: the merged ledger is built from `LedgerRow` and the ledger-view helpers, with Paid in place, Undo for 8 s and the `paidToast` snackbar; rows patched in place, never moved; `markedPaid`, `WaitingView`, `toWaitingView` added and tested; e2e covers Paid, Undo and the snackbar. (D Must 1)
- Task 12: the strip's button says "Review" (accessible name "<text>. Review"), never a state word. (D Must 2)
- Task 3 and ruling 2: a break stays out of "Earlier" while the viewer has unpaid lines (sent or not) or an unanswered choice win, whatever its age; test added. (D Must 3)
- Task 11: `owe` only on an open break; `stateLine` says "Cancelled." for a cancelled break; tests added. (D Should 1)
- Task 8: `profileTrustText` reads "New host. No breaks run yet." / "New host. 3 breaks run." / "12 breaks run since Oct 2026."; the "On Breaks since" line shows only under 5 breaks; unit and e2e tests updated. (D Should 2)
- Task 9 and ruling 7: the hosts line is "Hosting on Facebook now? Breaks is invite-only for hosts."; the invite contact joins the deferred list; the e2e checks the line. (D Should 3, lead ruling)
- Task 16 and ruling 6: the host's release confirm and the buyer's give-back prompt name the bonus line that goes ("Their/Your bonus line 51 goes too."), via `releaseConfirm`, `bonusGoesWith`, `giveBackPrompt(numbers, bonusLost)` and `Owe.bonusLost`. (D Should 4, lead ruling)
- Task 13 and ruling 8: taken and sent cells in the link preview use `wire` `#C9C6BE` with the number on a white chip. (D Should 5)
- Task 3: a cancelled break is dated by its latest `break.cancelled` event; with none it stays current; test added. (D Should 6)
- Task 8: the host-filtered empty state adds a "See all open breaks" link to `/breaks`; e2e covers it. (D Should 7)
- Global Constraints: the copy-audit pin points at `src/lib/copy-audit.test.ts` (extended in Task 14a), not Task 16. (D Should 8)
- Ruling 1: reworded so it no longer attributes the old status set to platform §13; the decision stands. (D Should 9, lead ruling)
- Ruling 5: recorded as a deviation for the owner's sign-off, with the reasons; Task 14b intro says so. (Lead ruling on D's escalation)
- Task 3: `hostProfile` reads the user first and binds the id as a parameter, as `hostTrust` does; the test asserts non-zero counts. (C Blocking 1)
- Task 15, README, Before any task, Global Constraints: `scripts/create-db.ts` creates a database and applies the auth stub with the repo's `postgres` package via `pnpm exec tsx` (no top-level await); `docker exec supabase_db_plan-1-tracer-bullet psql` documented as the alternative; migrations run through `pnpm db:migrate`. (C Blocking 2, X Must 2)
- Before any task and Global Constraints: `pnpm exec supabase status`, never bare `supabase`. (X Must 1)
- Task 15 journey 2: `clock.pauseAt` after `clock.install()` so the deal stays on screen for Skip. (C Non-blocking 1)
- Task 14b: `pnpm add -D -E @axe-core/playwright@4.10.2` for an exact pin. (C Non-blocking 2)
- Task 11: `MyBreakCard` mounts its `PaySheet` only while open, so page-level pay test ids stay unique. (C Non-blocking 3)
- Task 3: `hostProfile` is null for the SYSTEM user and for anyone not a host who never listed a break (admins included); tests added. (C Non-blocking 4)
- Task 6a: `draftComposerInitial` keeps every 2nd-place name (joined with ", ") instead of dropping all but the first; test added. (C Non-blocking 5)
- Task 15 journey 2: a comment marks the `prizeLines`/`pickingText` copy it asserts, so a wording change updates it. (C Non-blocking 6)
- Task 14b: the visual ledger header drops its `border-t` (no double rule above 640). (C Non-blocking 7)
- Task 9: `ranText` adds the year once it is not the current one ("Ran on Oct 4, 2025."); test added. (C Non-blocking 8)
- Global Constraints and Architecture: `updateDraft(tx, caller, breakId, input)` stated as the `openBreak` precedent. (C Convention 1)
- Global Constraints and Task 7a: rate-limit counters recorded as the exemption from "every state change appends an events row". (C Convention 2)
- Task 7a: `tests/concurrency/setup.ts` truncates `rate_limits` too. (C Convention 3, X Should 10)
- Task 7a/7b: IPv6 addresses are bucketed by /64 (`ipBucket`) before hashing, and every check also counts against a per-user bucket (60 a minute); Review Focus 3 gains the rotation test. (C Security notes)
- Task 9: model set to opus for the sign-in redirect rewrite. (X Should 1, lead ruling)
- Task 6 split into 6a (opus: `insertPrizes`, `updateDraft`, `draftForEdit`, `initial.ts`) and 6b (sonnet: composer, routes, Edit draft, `composeBreak`, e2e), each with its own gates and commit. (X Should 2, lead ruling)
- Task 7 split into 7a (opus: schema, migration 0003, limiter, `ipBucket`, `handleStatus`, `checkHandle`, prune, concurrency truncate) and 7b (sonnet: route, field copy, `HandleField`, onboarding, e2e). (X Should 3, lead ruling)
- Task 14b Steps 3 and 6 and the Global Constraints: one-round stopping rule; a render-test expectation that contradicts markup and design is fixed in the test; findings needing a design decision are recorded and the task ends DONE_WITH_CONCERNS. (X Should 4, lead ruling)
- Task 16: the backlog tests carry the same stopping rule and what to do if one fails. (X Should 5, lead ruling)
- Global Constraints: the BLOCKED: migration rule is global. (X Should 6, lead ruling)
- Task 9: the landing test's e2e users are `nh<run>`/`nb<run>`, apart from the layout spec's `lh`/`lb`. (X Should 7, lead ruling)
- Interfaces of Tasks 3, 6a, 6b, 7a, 7b, 8, 11 and 12 carry full types. (X Should 8)
- Task 6a Interfaces: `validateDraftInput` and `isClaimMode` are named as living in `rules.ts`. (X minor mismatch)
- Task 14b Step 1: if vitest still cannot parse JSX, report BLOCKED: tooling; never change `tsconfig.json`. (X stall risk)
- Global Constraints: gate runs use the 10-minute Bash timeout. (X stall risk)
- Not applied: the optional Task 10 split into 10a/10b (X Should 9), because the lead's renumbering covers only Tasks 6 and 7.
- Kept as ruled: the feed lists open main breaks only and says "New host"; the visual-only ledger header (now a recorded deviation); sub-dollar price wording; the `rate_limits` table, the oxc JSX setting, the `breaks_e2e` database and `reuseExistingServer: false`. (Lead rulings)
