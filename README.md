# Breaks

A group-buy tracker for a darts community. Members join a break (a shared box opening), hosts run every draw, and the result is verifiable by anyone. The platform never handles money: payment happens between members and hosts, outside the app.

## Local setup

Requirements: Node 22.12+ (see `.nvmrc`), pnpm 9+, and Docker (needed by `pnpm supabase start`).

```bash
pnpm install
pnpm supabase start            # local Postgres, Auth and Mailpit
cp .env.example .env.local     # and again as .env.test
```

Fill both env files with the keys printed by `supabase start`, then generate the draw key:

```bash
DRAW_KEY_V1=$(openssl rand -base64 32)   # paste the output into the env files
IP_HASH_KEY=$(openssl rand -base64 32)   # likewise, a separate value
```

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

The tests get their own database. Never point `.env.test` at the dev database: the concurrency suite truncates every table in the database it runs against, users included.

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

Without the script, the stack's own container has `psql`: `docker exec supabase_db_plan-1-tracer-bullet psql -U postgres -c 'create database breaks_e2e'`, then `docker exec -i supabase_db_plan-1-tracer-bullet psql -U postgres -d breaks_e2e < supabase/ci-auth-stub.sql`. The same script creates the test database: `pnpm exec tsx scripts/create-db.ts breaks_test`.

Set `E2E_DATABASE_URL` to use another server; the database must still be called `breaks_e2e`. Sign-in for e2e users still goes through the local Supabase Auth, so their auth rows stay in the stack's own database.

Then migrate the dev database and run:

```bash
ENV_FILE=.env.local pnpm db:migrate
pnpm dev
```

Sign-in emails are caught by Mailpit at http://127.0.0.1:54324.

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

## Tests

- Unit and domain: `pnpm test`. Needs the local database and `.env.test`.
- Concurrency: `pnpm test:concurrency`.
- End to end: `pnpm test:e2e`. Runs with `BEACON=fake` and an `E2E_SECRET` so tests can sign in through `/test/login`; neither may be set on any Vercel deploy (production or preview).
- Security posture: `pnpm test:ci`. Asserts every public table has forced RLS with no policies, and that the `anon` role reads nothing. In CI it runs on a plain `postgres:16` service with a stub `auth` schema (`supabase/ci-auth-stub.sql`).

## Deploy

- Hosting: Vercel Pro (for per-minute cron) and Supabase Pro.
- Set all variables from the table above in Vercel, except `BEACON` and `E2E_SECRET`, which must never be set on Vercel, not even for preview deploys. A draw made with the fake beacon shows a "Fake beacon — development only" warning on its result page. `CRON_SECRET` must match the secret the cron request sends to `/api/tick` (`vercel.json` schedules it every minute).
- Configure custom SMTP in Supabase Auth, for example Resend, so sign-in emails are deliverable.
- Email templates: in the hosted Supabase dashboard (Authentication > Email Templates), paste `supabase/templates/magic_link.html` into "Magic Link" and `supabase/templates/confirmation.html` into "Confirm signup", with the subjects from `supabase/config.toml`. Both show the 6-digit code and a link to `/auth/callback`. The local stack picks them up from `config.toml` after `pnpm supabase stop && pnpm supabase start`.
- Keep "Confirm email" ON in hosted Supabase Auth: admin promotion through `ADMIN_EMAILS` relies on a confirmed email.

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

## UI conventions

- Tokens live in `src/app/tokens.css` (raw colours on `:root`, mapped through Tailwind v4 `@theme inline`); there is no `tailwind.config`. Use `bg-paper`, `text-ink-2`, `border-wire-strong`, `font-condensed`, `text-title` and friends, never Tailwind's default palette.
- Shared components are in `src/components/`. In development, `/dev/components` shows them all (it 404s in production).
- Grid shaping, holder visibility and the host-only overdue flag are decided in `src/domain/breaks/grid.ts` on the server; client components receive the result.
- Copy rules (no middle dots or bullets, gambling-neutral words, `formatMoney` for money, no default palette, no caps labels, no "Submit", the community's state words, no exclamation marks) are enforced by `src/lib/copy-audit.test.ts`.
- Absolute times reach the browser as ISO plus a server fallback and render through `LocalTime` in the viewer's zone; the `tz` cookie lets the server's fallback match.
- `e2e/layout.spec.ts` pins the break page's pixel budget, grid columns, cell names, focus return and bar hiding in a real browser.
- The Playwright journey keys on `data-testid`; keep ids stable when restyling.
- Migration `0001_claim_mode` adds the picking mode (`pick_or_random`, `pick_only`, `straight`); `allow_random_claims` is kept in step and will be dropped later.

## Spec and plans

- Design: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
