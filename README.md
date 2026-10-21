# Breaks

A group-buy tracker for a darts community. Members join a break (a shared box opening), hosts run every draw, and the result is verifiable by anyone. The platform never handles money: payment happens between members and hosts, outside the app.

## Local setup

Requirements: Node 22.12+ (see `.nvmrc`), pnpm 9+, and Docker (needed by `pnpm supabase start`).

```bash
pnpm install
pnpm supabase start            # local Postgres, Auth, Storage and Mailpit
cp .env.example .env.local     # and again as .env.test
```

Fill both env files with the keys printed by `supabase start`, then generate the draw key:

```bash
DRAW_KEY_V1=$(openssl rand -base64 32)   # paste the output into the env files
IP_HASH_KEY=$(openssl rand -base64 32)   # likewise, a separate value
```

Create the photo buckets once: `ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts` (it prints each bucket with `ok` or `created`, then `no client policies on storage`).

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (direct `54322` locally) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project access |
| `DRAW_KEY_V1` | 32 random bytes, base64; used for draw commitments |
| `IP_HASH_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`); HMAC key for the IP hashes stored on events |
| `CRON_SECRET` | Shared secret protecting `/api/tick` |
| `APP_URL` | Public base URL of the app |
| `ADMIN_EMAILS` | Optional comma-separated emails promoted to admin on sign-in |
| `BEACON` | `fake` swaps the public randomness beacon for a deterministic one. Local, CI and e2e only; never set on Vercel (the app refuses to boot when `VERCEL_ENV` is set) |
| `E2E_SECRET` | Enables the `/test/login` helper route used by e2e. Local and CI only; never set on Vercel (the route 404s and the app refuses to boot when `VERCEL_ENV` is set) |

### Test database

The tests get their own database. Never point `.env.test` at the dev database: the concurrency suite truncates every table in the database it runs against, users included. Create it with the repo's own `postgres` package (no `psql` needed; it also applies the CI auth stub):

```bash
pnpm exec tsx scripts/create-db.ts breaks_test
```

With `psql` installed, the same by hand:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'create database breaks_test'
psql postgresql://postgres:postgres@127.0.0.1:54322/breaks_test -f supabase/ci-auth-stub.sql
```

Set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_test` in `.env.test`, then migrate it:

```bash
ENV_FILE=.env.test pnpm db:migrate
```

### E2E database

`pnpm test:e2e` runs against a third database, `breaks_e2e`, which Playwright empties before every run (`e2e/global-setup.ts` refuses any other name). Create it once with the repo's own `postgres` package (no `psql` needed), and migrate it once and again after every new migration:

```bash
pnpm exec tsx scripts/create-db.ts breaks_e2e
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate
```

Without the script, the stack's own container has `psql`: `docker exec supabase_db_plan-1-tracer-bullet psql -U postgres -c 'create database breaks_e2e'`, then `docker exec -i supabase_db_plan-1-tracer-bullet psql -U postgres -d breaks_e2e < supabase/ci-auth-stub.sql`.

The e2e builds and starts the app on port 3000 itself, so nothing may listen there first. Stop only a listener (a plain `lsof -ti tcp:3000` also matches browsers that merely hold a connection to it):

```bash
/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill
```

Set `E2E_DATABASE_URL` to use another server; the database must still be called `breaks_e2e`. Sign-in for e2e users still goes through the local Supabase Auth, so their auth rows stay in the stack's own database.

Then migrate the dev database and run:

```bash
ENV_FILE=.env.local pnpm db:migrate
pnpm dev
```

Sign-in emails are caught by Mailpit at http://127.0.0.1:54324.

### Storage

Photos live in four Supabase Storage buckets (photos spec §5.5):

- `incoming`: private; camera uploads land here through a signed upload URL, 5 MB per file, JPEG, PNG or WebP only.
- `photos-draft`: private; a draft break's re-encoded variants, shown to the host through signed URLs.
- `photos`: public by URL (not listable), `image/webp` only; an open break's variants.
- `photo-archive`: private, service role only; removed and hidden photos kept for retention.

`supabase/config.toml` declares them for the local stack, and `scripts/create-buckets.ts` creates or aligns them in any other environment (`src/storage/buckets.ts` `BUCKET_SETTINGS` is the source for both). No `storage.objects` policy may exist for `anon` or `authenticated`: every write is the service role or a signed upload URL, and both the script and `pnpm test:ci` fail if such a policy exists.

After a change to `supabase/config.toml`, run `pnpm supabase stop` then `pnpm supabase start` (stop keeps the database). Run them from the main checkout: the containers mount files from the checkout that started them, and a stack started from a worktree breaks when that worktree is removed.

### Preflight

Before testing or handing over a URL, check the stack:

1. Docker is running (`docker ps` answers). Docker and the Supabase CLI run outside the agent sandbox.
2. `docker ps -a --filter name=supabase_ --format '{{.Names}} {{.Status}}'`: every container `Up`, including kong and storage, none `Exited`.
3. Auth: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/auth/v1/health` prints `200`.
4. Mailpit: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54324/` prints `200`.
5. Storage: the bucket listing prints the four bucket names (`incoming`, `photo-archive`, `photos`, `photos-draft`):

   ```bash
   set -a; . ./.env.local; set +a
   curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     http://127.0.0.1:54321/storage/v1/bucket | grep -o '"name":"[a-z-]*"' | sort
   ```

6. The app: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` prints `200` once `pnpm dev` runs.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Unit and domain tests (Vitest) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:concurrency` | Concurrency suite against Postgres |
| `pnpm test:e2e` | Playwright end-to-end journey |
| `pnpm test:ci` | Security checks (RLS, anon role) intended for CI |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations (reads `ENV_FILE`, default `.env.local`) |
| `pnpm supabase:start` / `pnpm supabase:stop` | Start / stop the local Supabase stack |
| `pnpm exec tsx scripts/create-buckets.ts` | Create or align the four photo buckets and check Storage has no client policies |

## Tests

- Unit and domain: `pnpm test`. Needs the local database and `.env.test`.
- Concurrency: `pnpm test:concurrency`.
- End to end: `pnpm test:e2e`. Runs with `BEACON=fake` and an `E2E_SECRET` so tests can sign in through `/test/login`; neither may be set on any Vercel deploy (production or preview).
- Security posture: `pnpm test:ci`. Asserts every public table has forced RLS with no policies, and that the `anon` role reads nothing. It also checks the Storage buckets and policies, and what `anon` and a signed-in member can do, against the local stack (skipped on GitHub CI, which has no Storage). In CI it runs on a plain `postgres:16` service with a stub `auth` schema (`supabase/ci-auth-stub.sql`).

## Deploy

- Hosting: Vercel Pro (for per-minute cron) and Supabase Pro.
- Set all variables from the table above in Vercel, except `BEACON` and `E2E_SECRET`, which must never be set on Vercel, not even for preview deploys. A draw made with the fake beacon shows a "Fake beacon — development only" warning on its result page. `CRON_SECRET` must match the secret the cron request sends to `/api/tick` (`vercel.json` schedules it every minute).
- Configure custom SMTP in Supabase Auth, for example Resend, so sign-in emails are deliverable.
- Email templates: in the hosted Supabase dashboard (Authentication > Email Templates), paste `supabase/templates/magic_link.html` into "Magic Link" and `supabase/templates/confirmation.html` into "Confirm signup", with the subjects from `supabase/config.toml`. Both show the 6-digit code and a link to `/auth/callback`. The local stack picks them up from `config.toml` after `pnpm supabase stop && pnpm supabase start`.
- Keep "Confirm email" ON in hosted Supabase Auth: admin promotion through `ADMIN_EMAILS` relies on a confirmed email.
- Create the photo buckets once per environment, before the photos release: `ENV_FILE=.env.production pnpm exec tsx scripts/create-buckets.ts`. It must end with `no client policies on storage`.

## Roles

- Admin: emails listed in `ADMIN_EMAILS` are promoted on sign-in (a `user.role_changed` event is recorded). Demotion is manual SQL: remove the email from `ADMIN_EMAILS` first, then `update users set role='member' where email='…';`.
- Host: until invite codes exist (Plan 4), grant the host role by hand: `update users set role='host' where email='…';`.
- Migrations are forward-only. Run them from CI or locally with the direct Postgres connection string, not the pooler on port 6543 (`ENV_FILE=.env.production pnpm db:migrate`).

## Verify a draw

Anyone can recompute a draw from its published inputs:

```bash
node --import tsx scripts/verify-draw.ts https://<host>/b/<id>/result.json
```

It prints `OK` or `MISMATCH`.

Every draw also records whether it verified when it was recorded (`draws.verified_at`, set when `verifyInputs` passes on its inputs; the host record's "draws verified" counts it). Draws recorded before migration 0004 are backfilled by running the same check over them, once per database, after migrating:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm exec tsx scripts/verify-draws.ts
```

The test and e2e databases are emptied by their suites, so they need no backfill.

## UI conventions

- Tokens live in `src/app/tokens.css` (raw colours on `:root`, mapped through Tailwind v4 `@theme inline`); there is no `tailwind.config`. Use `bg-paper`, `text-ink-2`, `border-wire-strong`, `font-condensed`, `text-title` and friends, never Tailwind's default palette. Paper surfaces (the ledger, sheets, forms, `/host`, `/me`, `/account`) keep the first design's tokens. Wall routes (`/b/{id}`, `/b/{id}/result`, `/breaks`, `/`, `/h/{handle}`) use the Mosaic board tokens, all new names: `--board-wall`, `--board-wall-2`, `--board-cream`, `--board-cream-2`, `--board-ink`, `--board-ink-2`, `--board-steel`, `--board-ring`, `--board-text`, `--board-text-2`, `--board-text-3`, the lamp steps `--lamp-0` … `--lamp-4`, and `--kit-dark` / `--kit-light`, set per break from the host's kit. No existing token changed value; `tokens.test.ts` pins every pair. The flight palette, the kits and the heat steps live in `src/domain/flights.ts`; its keys never reorder or rename.
- Fonts (`src/app/fonts.ts`, `next/font/google`, fetched at build time): Barlow 400, 500 and 600, Barlow Condensed 600 for cell numbers, and Big Shoulders (one variable file with the `opsz` axis, weight 800, the Display cut pinned with `font-variation-settings`, not preloaded) for titles, the caller banner, the checkout count and the result display on wall routes: five font files. The link preview reads three static TTFs from disk instead; they are not shipped to browsers. A build that cannot reach Google Fonts is BLOCKED: fonts; do not vendor the files.
- Shared components are in `src/components/`. In development, `/dev/components` shows them all, with every Mosaic §5 cell state in the member and kit views and the 50-line board at 390 (it 404s in production unless `E2E_SECRET` is set, which the e2e build sets for its density check and Vercel refuses).
- Grid shaping, holder and flight visibility and the host-only overdue flag are decided in `src/domain/breaks/grid.ts` (`shapeGrid`) on the server; client components receive the result. A cell carries a `flight` exactly when it carries a `holder` (the break's host, an admin, or a viewer holding a line there); everyone else, and the feed, the landing page, the host profile and the link preview, see the board in the host's kit, never a flight.
- Copy rules (no middle dots or bullets, gambling-neutral words, `formatMoney` for money, no default palette, no caps labels or caps chips, no "Submit", the community's state words, no exclamation marks, and the Mosaic bans: the heat words, streaks and levels, winnings and "You won", "lucky colour", betting words near a kit, the retired counts and sorts, "his") are enforced by `src/lib/copy-audit.test.ts`. The count everywhere is "N to go".
- Absolute times reach the browser as ISO plus a server fallback and render through `LocalTime` in the viewer's zone; the `tz` cookie lets the server's fallback match.
- `e2e/layout.spec.ts` pins the break page's pixel budget, grid columns, cell names, focus return and bar hiding in a real browser.
- The Playwright journey keys on `data-testid`; keep ids stable when restyling.
- Migration `0001_claim_mode` adds the picking mode (`pick_or_random`, `pick_only`, `straight`); `allow_random_claims` is kept in step and will be dropped later.
- Migration `0004_flights_kits` adds `users.flight_colour` and `users.flight_shape` (NOT NULL: a random flight drawn on the server when the row is created, existing rows backfilled the same way, each CHECKed against the palette keys; never derived from the user id), `users.flight_chosen_at` (null until the member picks on `/account`), `host_profiles.kit_dark` and `host_profiles.kit_light` (null together means the default kit, Blue with Yellow) and `draws.verified_at` (see "Verify a draw").

## Spec and plans

- Design: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
