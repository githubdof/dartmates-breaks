# Plan 1 — Tracer Bullet (schema → auth → break → claim → paid → draw → result) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host can open a break, buyers can claim and mark lines sent, the host marks them paid, the break fills, the host requests and finalises a beacon-mixed verifiable draw, and anyone can open the result page and re-verify it.

**Architecture:** Domain commands `(tx, caller, input) → result` in `src/domain/*` over Drizzle/Postgres, each writing state + an `events` row in one transaction; Next.js App Router server actions are thin adapters (zod → authz → command → revalidate). The draw is commit–reveal (secret committed at open) mixed with a drand beacon chosen at request time, computed by a shared crypto module that also runs in the browser verifier.

**Tech Stack:** Next.js 15 (App Router, TypeScript), pnpm, Drizzle ORM + drizzle-kit, postgres-js, Supabase (Postgres, Auth via `@supabase/ssr`, local via Supabase CLI), zod, `@noble/hashes`, vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md` (§2, §3, §4.0, §5, §6, §7, §9, §12 sign-in/onboarding, §13 `/b/{id}`, `/b/{id}/result`, `/host/new`, §14, §15)

## Global Constraints

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

## Review Focus

1. A buyer submits the same claim twice (double-tap / retry): the second call must return success for lines they already hold, not `LineTaken`. Test added to Task 8.
2. A host marks a line paid after the buyer withdrew and someone else claimed it: `markPaid` with the stale `expectedOwner` must fail with `OwnerChanged`, never pay the new owner. Test added to Task 8.
3. The draw finalise function crashes after inserting `draws` but before `awards`: the whole transaction rolls back and a retry produces the byte-identical draw. Test added to Task 10.
4. Entries containing a bonus line above `line_count` and a handle with non-ASCII characters: serialization must ignore handles and the browser verifier must still match the server. Test added to Task 4.
5. `recomputeFill` when every numbered line is paid but one is `reserved_for_mini_id` and unowned (Plan 2 will create these): the break must **not** fill. Test added to Task 8 so the invariant exists before minis do.

---

## File structure

```
package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.js
vitest.config.ts, vitest.concurrency.config.ts, playwright.config.ts
.env.example
supabase/config.toml                     # local stack (studio/realtime/storage disabled)
drizzle.config.ts
src/db/schema.ts                         # Drizzle tables (this plan's subset)
src/db/client.ts                         # pooled postgres-js + drizzle, prepare:false
src/db/migrations/0000_init.sql          # generated + appended hand SQL (triggers, revokes, RLS)
src/db/rls.sql                           # deny-all policies, appended into migrations
src/domain/errors.ts                     # DomainError classes
src/domain/types.ts                      # Caller, Tx types
src/domain/breaks/{commands.ts,queries.ts,rules.ts,commands.test.ts}
src/domain/lines/{commands.ts,queries.ts,rules.ts,commands.test.ts}
src/domain/draws/{commands.ts,queries.ts,commands.test.ts}
src/domain/events.ts                     # appendEvent(tx, …)
src/crypto/{commit.ts,serialize.ts,shuffle.ts,draw.ts,vectors.json,draw.test.ts}
src/crypto/secrets.ts                    # AES-256-GCM for break_secrets
src/crypto/beacon.ts                     # BeaconSource interface, DrandBeacon, FakeBeacon
src/auth/{supabase.ts,session.ts,authz.ts,authz.test.ts}
src/app/(auth)/login/page.tsx, src/app/(auth)/login/actions.ts
src/app/auth/callback/route.ts
src/app/onboarding/{page.tsx,actions.ts}
src/app/host/new/{page.tsx,actions.ts}
src/app/b/[id]/{page.tsx,actions.ts,grid.tsx}
src/app/b/[id]/result/{page.tsx,verify.tsx}
src/app/api/tick/route.ts
src/middleware.ts
tests/helpers/{db.ts,fixtures.ts}
tests/concurrency/*.test.ts
e2e/journey-1.spec.ts
```

Deferred to later plans: conversations/messages (Plan 3), minis/free draws (Plan 2), feedback/stats/reports/admin (Plan 4). This plan's `breaks.open` does **not** create a thread; Plan 3 adds it.

---

### Task 1: Scaffold the app and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/env.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Produces: `env` object from `src/lib/env.ts` with typed, validated server env: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DRAW_KEY_V1` (base64, 32 bytes), `CRON_SECRET`, `APP_URL`.

- [ ] **Step 1: Create the Next.js app with pnpm**

Run from the repo root (it already contains `docs/` and `research/`):
```bash
pnpm dlx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```
Answer "yes" to creating in a non-empty directory. Then:
```bash
pnpm add drizzle-orm postgres zod @noble/hashes @supabase/supabase-js @supabase/ssr
pnpm add -D drizzle-kit vitest @vitest/coverage-v8 tsx @types/node playwright @playwright/test supabase
```

- [ ] **Step 2: Write `.env.example`**

```bash
# Postgres via Supabase transaction-mode pooler (port 6543 in cloud; 54322 direct locally)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=replace-with-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
# 32 random bytes, base64: openssl rand -base64 32
DRAW_KEY_V1=replace-me
CRON_SECRET=replace-me
APP_URL=http://localhost:3000
```

- [ ] **Step 3: Write the failing env test**

`src/lib/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const good = {
  DATABASE_URL: "postgresql://u:p@h:5432/db",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DRAW_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
  CRON_SECRET: "s",
  APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a complete env", () => {
    expect(parseEnv(good).APP_URL).toBe("http://localhost:3000");
  });
  it("rejects a DRAW_KEY_V1 that is not 32 bytes", () => {
    expect(() => parseEnv({ ...good, DRAW_KEY_V1: "c2hvcnQ=" })).toThrow(/DRAW_KEY_V1/);
  });
  it("rejects a missing CRON_SECRET", () => {
    const { CRON_SECRET: _omit, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/CRON_SECRET/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/env.test.ts`
Expected: FAIL with "Cannot find module './env'"

- [ ] **Step 5: Implement `src/lib/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DRAW_KEY_V1: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "DRAW_KEY_V1 must be 32 bytes base64"),
  CRON_SECRET: z.string().min(1),
  APP_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

// Lazy so test files can import parseEnv without a real env.
let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/concurrency/**", "e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`tests/helpers/setup.ts`:
```ts
import { config } from "dotenv";
config({ path: ".env.test" });
```
Add `pnpm add -D dotenv` and create `.env.test` by copying `.env.example` (git-ignored by the existing `.env.*` rule).

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Replace the generated home page with a plain placeholder**

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-semibold">Breaks</h1>
      <p className="mt-2 text-sm text-neutral-600">Group buys for darts gear, with a draw you can check.</p>
    </main>
  );
}
```

- [ ] **Step 9: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:concurrency": "vitest run --config vitest.concurrency.config.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/db/migrate.ts",
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop"
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "build: scaffold next.js app with vitest, drizzle and env validation"
```

---

### Task 2: Local Supabase, Drizzle client and schema with constraints, triggers and RLS

**Files:**
- Create: `supabase/config.toml` (generated), `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/rls.sql`, `src/db/migrations/0000_init.sql` (generated then appended), `src/db/schema.test.ts`

**Interfaces:**
- Produces: `db` (drizzle instance) and `Tx` type from `src/db/client.ts`; table objects `users, breaks, breakSecrets, breakItems, prizes, lines, drawRequests, draws, awards, events, idempotencyKeys` from `src/db/schema.ts`.

- [ ] **Step 1: Initialise local Supabase**

```bash
pnpm supabase init
```
Edit `supabase/config.toml`: set `[studio] enabled = false`, `[realtime] enabled = false`, `[storage] enabled = false`, `[analytics] enabled = false`, `[inbucket] enabled = true` (local mail viewer). Then `pnpm supabase start` and copy the printed anon/service keys into `.env.test` and `.env.local`. `DATABASE_URL` for local is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] **Step 2: Write `src/db/schema.ts`**

```ts
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // = auth.users.id
  handle: text("handle"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  listingPausedAt: timestamp("listing_paused_at", { withTimezone: true }),
  foundingHost: boolean("founding_host").notNull().default(false),
  nameChangedAt: timestamp("name_changed_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_handle_lower_idx").on(sql`lower(${t.handle})`),
  check("users_role_chk", sql`${t.role} in ('member','host','admin')`),
]);

export const hostProfiles = pgTable("host_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  paymentHandles: jsonb("payment_handles").$type<{ venmo?: string; paypal?: string }>().notNull().default({}),
  paymentHandlesChangedAt: timestamp("payment_handles_changed_at", { withTimezone: true }),
  bio: text("bio"),
  createdAt: createdAt(),
});

export const breaks = pgTable("breaks", {
  id: id(),
  hostId: uuid("host_id").notNull().references(() => users.id),
  kind: text("kind").notNull().default("main"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  lineCount: integer("line_count").notNull(),
  linePriceCents: integer("line_price_cents").notNull(),
  allowRandomClaims: boolean("allow_random_claims").notNull().default(true),
  paymentWindowHours: integer("payment_window_hours").notNull().default(24),
  maxLinesPerUser: integer("max_lines_per_user"),
  entryRule: jsonb("entry_rule").$type<{ bought_from_host_days: number } | null>(),
  paymentInstructions: text("payment_instructions").notNull().default(""),
  onePrizePerPerson: boolean("one_prize_per_person").notNull().default(false),
  miniTimeoutAutoAssign: boolean("mini_timeout_auto_assign").notNull().default(true),
  threadClosedAt: timestamp("thread_closed_at", { withTimezone: true }),
  status: text("status").notNull().default("draft"),
  seedCommitment: text("seed_commitment"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  filledAt: timestamp("filled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  createdAt: createdAt(),
}, (t) => [
  check("breaks_kind_chk", sql`${t.kind} in ('main','mini','free')`),
  check("breaks_status_chk", sql`${t.status} in ('draft','open','filled','drawing','drawn','cancelled')`),
  check("breaks_price_chk", sql`(${t.kind} = 'free' and ${t.linePriceCents} = 0) or (${t.kind} <> 'free' and ${t.linePriceCents} > 0)`),
  check("breaks_count_chk", sql`${t.lineCount} >= 2`),
  index("breaks_host_active_idx").on(t.hostId).where(sql`${t.status} in ('open','filled','drawing')`),
]);

export const breakSecrets = pgTable("break_secrets", {
  breakId: uuid("break_id").primaryKey().references(() => breaks.id),
  ciphertext: text("ciphertext").notNull(), // base64: iv || tag || data
  keyId: text("key_id").notNull(),
  createdAt: createdAt(),
});

export const breakItems = pgTable("break_items", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  name: text("name").notNull(),
  photoPaths: jsonb("photo_paths").$type<string[]>().notNull().default([]),
  variantSchema: jsonb("variant_schema").$type<Record<string, string[]> | null>(),
  expectedShipAt: timestamp("expected_ship_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const prizes = pgTable("prizes", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  rank: integer("rank").notNull(),
  itemId: uuid("item_id").references(() => breakItems.id),
  parentBreakId: uuid("parent_break_id").references(() => breaks.id),
  spotCount: integer("spot_count"),
  createdAt: createdAt(),
}, (t) => [
  check("prizes_shape_chk", sql`(${t.itemId} is not null and ${t.parentBreakId} is null and ${t.spotCount} is null) or (${t.itemId} is null and ${t.parentBreakId} is not null and ${t.spotCount} > 0)`),
  uniqueIndex("prizes_item_uq").on(t.breakId, t.rank, t.itemId).where(sql`${t.itemId} is not null`),
  uniqueIndex("prizes_parent_uq").on(t.breakId, t.rank, t.parentBreakId).where(sql`${t.parentBreakId} is not null`),
]);

export const lines = pgTable("lines", {
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  number: integer("number").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  priceCents: integer("price_cents"),
  reservedForMiniId: uuid("reserved_for_mini_id").references(() => breaks.id),
  awardId: uuid("award_id"),
  isBonus: boolean("is_bonus").notNull().default(false),
  refundConfirmedAt: timestamp("refund_confirmed_at", { withTimezone: true }),
  claimBatchId: uuid("claim_batch_id"),
}, (t) => [
  primaryKey({ columns: [t.breakId, t.number] }),
  check("lines_paid_owned_chk", sql`${t.paidAt} is null or ${t.ownerId} is not null`),
  check("lines_owned_claimed_chk", sql`(${t.ownerId} is null) = (${t.claimedAt} is null)`),
  check("lines_reserved_unowned_chk", sql`${t.reservedForMiniId} is null or ${t.ownerId} is null`),
  check("lines_award_paid_chk", sql`${t.awardId} is null or (${t.priceCents} = 0 and ${t.paidAt} is not null)`),
  index("lines_open_idx").on(t.breakId).where(sql`${t.ownerId} is null`),
  index("lines_owner_idx").on(t.ownerId),
  index("lines_unpaid_idx").on(t.breakId, t.claimedAt).where(sql`${t.paidAt} is null`),
]);

export const drawRequests = pgTable("draw_requests", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  attempt: integer("attempt").notNull(),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  beaconRound: integer("beacon_round").notNull(),
  onBehalfNote: text("on_behalf_note"),
  status: text("status").notNull().default("pending"),
}, (t) => [
  uniqueIndex("draw_requests_attempt_uq").on(t.breakId, t.attempt),
  index("draw_requests_pending_idx").on(t.beaconRound).where(sql`${t.status} = 'pending'`),
  check("draw_requests_status_chk", sql`${t.status} in ('pending','done')`),
]);

export const draws = pgTable("draws", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  requestId: uuid("request_id").notNull().references(() => drawRequests.id).unique(),
  secret: text("secret").notNull(), // base64, revealed
  beaconRound: integer("beacon_round").notNull(),
  beaconRandomness: text("beacon_randomness").notNull(), // hex
  beaconSignature: text("beacon_signature").notNull(), // hex
  seed: text("seed").notNull(), // hex
  algorithmVersion: integer("algorithm_version").notNull(),
  entriesSnapshot: jsonb("entries_snapshot").$type<EntrySnapshot[]>().notNull(),
  ranking: jsonb("ranking").$type<number[]>().notNull(), // line numbers, rank 1 first
  resultHash: text("result_hash").notNull(),
  runBy: uuid("run_by").notNull().references(() => users.id),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => users.id),
  voidReason: text("void_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("draws_active_uq").on(t.breakId).where(sql`${t.voidedAt} is null`),
]);

export type EntrySnapshot = { number: number; ownerId: string; handleAtDraw: string; isBonus: boolean };

export const awards = pgTable("awards", {
  id: id(),
  drawId: uuid("draw_id").notNull().references(() => draws.id),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  rank: integer("rank").notNull(),
  winnerId: uuid("winner_id").notNull().references(() => users.id),
  itemId: uuid("item_id").references(() => breakItems.id),
  variant: jsonb("variant").$type<Record<string, string> | null>(),
  pickDeadline: timestamp("pick_deadline", { withTimezone: true }),
  pickedAt: timestamp("picked_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  tracking: text("tracking"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  receivedAuto: boolean("received_auto").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("awards_break_idx").on(t.breakId)]);

export const events = pgTable("events", {
  id: id(),
  breakId: uuid("break_id").references(() => breaks.id),
  actorId: uuid("actor_id").references(() => users.id),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  batchId: uuid("batch_id"),
  ipHash: text("ip_hash"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("events_batch_uq").on(t.breakId, t.batchId).where(sql`${t.batchId} is not null`),
  index("events_unprocessed_idx").on(t.id).where(sql`${t.processedAt} is null`),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: uuid("key").primaryKey(),
  callerId: uuid("caller_id").notNull(),
  result: jsonb("result").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
```

- [ ] **Step 3: Write `src/db/client.ts` and `src/db/migrate.ts`**

`src/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// transaction-mode pooler: no prepared statements, no session state
const sql = postgres(env().DATABASE_URL, { prepare: false, max: 10 });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`src/db/migrate.ts`:
```ts
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
await sql.end();
console.log("migrated");
```

- [ ] **Step 4: Generate the migration, then append hand-written SQL**

```bash
pnpm db:generate
```
Append to the end of the generated `src/db/migrations/0000_init.sql` (one pipeline — never a second migrations folder):

```sql
--> statement-breakpoint
-- Freeze line_count / line_price_cents / seed_commitment once the break is open.
create or replace function breaks_freeze_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if new.line_count <> old.line_count or new.line_price_cents <> old.line_price_cents then
      raise exception 'line_count and line_price_cents are frozen after open' using errcode = 'check_violation';
    end if;
  end if;
  if old.seed_commitment is not null and new.seed_commitment is distinct from old.seed_commitment then
    raise exception 'seed_commitment is immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger breaks_freeze before update on breaks for each row execute function breaks_freeze_guard();
--> statement-breakpoint
-- draws: insert-only except the single void transition.
create or replace function draws_update_guard() returns trigger language plpgsql as $$
begin
  if old.voided_at is not null then
    raise exception 'voided draws are immutable' using errcode = 'check_violation';
  end if;
  if new.voided_at is null
     or new.secret <> old.secret or new.seed <> old.seed or new.ranking::text <> old.ranking::text
     or new.entries_snapshot::text <> old.entries_snapshot::text or new.result_hash <> old.result_hash
     or new.break_id <> old.break_id or new.request_id <> old.request_id then
    raise exception 'draws may only be voided' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger draws_update before update on draws for each row execute function draws_update_guard();
--> statement-breakpoint
create rule draws_no_delete as on delete to draws do instead nothing;
--> statement-breakpoint
-- draws: the revealed secret must match the commitment made at open.
create or replace function draws_commitment_guard() returns trigger language plpgsql as $$
declare c text;
begin
  select seed_commitment into c from breaks where id = new.break_id;
  if c is null or c <> encode(digest('breaks-commit-v1'::bytea || decode(new.secret, 'base64'), 'sha256'), 'hex') then
    raise exception 'secret does not match seed_commitment' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger draws_commitment before insert on draws for each row execute function draws_commitment_guard();
--> statement-breakpoint
-- draw_requests: pending -> done only.
create or replace function draw_requests_update_guard() returns trigger language plpgsql as $$
begin
  if not (old.status = 'pending' and new.status = 'done'
          and new.break_id = old.break_id and new.attempt = old.attempt and new.beacon_round = old.beacon_round) then
    raise exception 'draw_requests may only move pending -> done' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger draw_requests_update before update on draw_requests for each row execute function draw_requests_update_guard();
--> statement-breakpoint
create rule draw_requests_no_delete as on delete to draw_requests do instead nothing;
--> statement-breakpoint
-- events: append-only except processed_at.
create or replace function events_update_guard() returns trigger language plpgsql as $$
begin
  if new.type <> old.type or new.payload::text <> old.payload::text or new.actor_id is distinct from old.actor_id
     or new.break_id is distinct from old.break_id or new.created_at <> old.created_at then
    raise exception 'events are append-only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger events_update before update on events for each row execute function events_update_guard();
--> statement-breakpoint
create rule events_no_delete as on delete to events do instead nothing;
--> statement-breakpoint
-- items/prizes: add-only after first paid line; never while drawn/cancelled.
create or replace function items_mutation_guard() returns trigger language plpgsql as $$
declare b_status text; any_paid boolean; b_id uuid;
begin
  b_id := coalesce(new.break_id, old.break_id);
  select status into b_status from breaks where id = b_id;
  if b_status in ('drawn','cancelled','drawing') then
    raise exception 'items and prizes are locked once the draw is requested' using errcode = 'check_violation';
  end if;
  if tg_op in ('UPDATE','DELETE') then
    select exists(select 1 from lines where break_id = b_id and paid_at is not null) into any_paid;
    if any_paid then
      raise exception 'items and prizes are add-only after the first paid line' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;
--> statement-breakpoint
create trigger break_items_guard before update or delete on break_items for each row execute function items_mutation_guard();
--> statement-breakpoint
create trigger break_items_insert_guard before insert on break_items for each row execute function items_mutation_guard();
--> statement-breakpoint
create trigger prizes_guard before update or delete on prizes for each row execute function items_mutation_guard();
--> statement-breakpoint
create trigger prizes_insert_guard before insert on prizes for each row execute function items_mutation_guard();
--> statement-breakpoint
create extension if not exists pgcrypto;
```

Then append the contents of `src/db/rls.sql`:
```sql
--> statement-breakpoint
-- Deny-all RLS backstop: the app connects with the service role, which bypasses RLS.
-- The anon/authenticated roles get no policies, so a leaked anon key reads nothing.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
```
(`force row level security` applies to the table owner too; the service role bypasses RLS by role attribute, so the app still works. This makes the "no permissive policies" CI check meaningful.)

- [ ] **Step 5: Write the failing schema test**

`src/db/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

describe("schema constraints", () => {
  let hostId: string;
  let breakId: string;
  beforeAll(async () => {
    hostId = (await sql`insert into users (id, email, role) values (gen_random_uuid(), 'h@example.com', 'host') returning id`)[0].id;
    breakId = (await sql`insert into breaks (host_id, title, line_count, line_price_cents, status) values (${hostId}, 't', 10, 2000, 'open') returning id`)[0].id;
  });

  it("rejects a paid line with no owner", async () => {
    await expect(sql`insert into lines (break_id, number, paid_at) values (${breakId}, 1, now())`).rejects.toThrow(/lines_paid_owned_chk/);
  });

  it("rejects changing line_count after open", async () => {
    await expect(sql`update breaks set line_count = 11 where id = ${breakId}`).rejects.toThrow(/frozen/);
  });

  it("has RLS forced on every public table", async () => {
    const rows = await sql`select tablename from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c where c.relname = t.tablename and c.relrowsecurity and c.relforcerowsecurity)`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("has no permissive policies", async () => {
    const rows = await sql`select policyname from pg_policies where schemaname='public'`;
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run migrations against local Supabase, then the test**

```bash
ENV_FILE=.env.test pnpm db:migrate
pnpm vitest run src/db/schema.test.ts
```
Expected: PASS (4 tests). If `relforcerowsecurity` fails for `__drizzle_migrations`, that table lives in schema `drizzle`, not `public`, so it is excluded — confirm the failing table name before changing anything.

- [ ] **Step 7: Commit**

```bash
git add supabase drizzle.config.ts src/db
git commit -m "feat(db): core schema with integrity triggers and deny-all RLS"
```

---

### Task 3: Test harness — transactional DB helper and fixture builders

**Files:**
- Create: `tests/helpers/db.ts`, `tests/helpers/fixtures.ts`, `tests/helpers/fixtures.test.ts`

**Interfaces:**
- Produces: `withTx(fn: (tx: Tx) => Promise<void>)` which runs `fn` inside a transaction and always rolls back; `makeUser(tx, {role?, handle?})`, `makeBreak(tx, {hostId, lineCount?, linePriceCents?, status?})`, `openBreakWithLines(tx, {hostId, lineCount})` which inserts the break as `open` with pre-created lines and a commitment (bypassing the command, for tests that need an open break fast).

- [ ] **Step 1: Write `tests/helpers/db.ts`**

```ts
import { db, type Tx } from "@/db/client";

class Rollback extends Error {}

/** Run fn in a transaction that is always rolled back, so tests leave no rows. */
export async function withTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
```

- [ ] **Step 2: Write `tests/helpers/fixtures.ts`**

```ts
import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, breaks, breakItems, prizes, lines } from "@/db/schema";
import { commitment } from "@/crypto/commit";

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function makeUser(tx: Tx, opts: { role?: "member" | "host" | "admin"; handle?: string } = {}) {
  const id = randomUUID();
  const handle = opts.handle ?? `u${uniq()}`;
  await tx.insert(users).values({
    id, email: `${handle}@example.com`, handle, displayName: handle,
    role: opts.role ?? "member", ageConfirmedAt: new Date(),
  });
  return { id, handle };
}

export async function makeBreak(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; status?: string; kind?: string }) {
  const [b] = await tx.insert(breaks).values({
    hostId: opts.hostId, title: `Break ${uniq()}`, lineCount: opts.lineCount ?? 12,
    linePriceCents: opts.linePriceCents ?? 2000, status: opts.status ?? "draft", kind: opts.kind ?? "main",
  }).returning();
  const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: "Darts" }).returning();
  await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  return b;
}

/** Shortcut for tests that need an open break with lines but don't test `breaks.open` itself. */
export async function openBreakWithLines(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number }) {
  const b = await makeBreak(tx, { ...opts, status: "draft" });
  const secret = randomBytes(32);
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${b.id}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${b.id}::uuid, generate_series(1, ${b.lineCount})`);
  return { ...b, status: "open", secret };
}

export async function lineRows(tx: Tx, breakId: string) {
  return tx.select().from(lines).where(sql`${lines.breakId} = ${breakId}`).orderBy(lines.number);
}
```
(`commitment` comes from Task 4; write Task 4 before running this file's test, or stub it temporarily as `(b: Uint8Array) => "stub"` — the fixture test below only checks row shapes.)

- [ ] **Step 3: Write the failing fixture test**

`tests/helpers/fixtures.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withTx } from "./db";
import { makeUser, openBreakWithLines, lineRows } from "./fixtures";

describe("fixtures", () => {
  it("creates an open break with N unowned lines and rolls back", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      const rows = await lineRows(tx, b.id);
      expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
      expect(rows.every((r) => r.ownerId === null)).toBe(true);
    });
  });
});
```

- [ ] **Step 4: Run the test (after Task 4's `commit.ts` exists)**

Run: `pnpm vitest run tests/helpers/fixtures.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/helpers
git commit -m "test: transactional db helper and fixture builders"
```

---

### Task 4: Shared crypto module — commitment, serialization, seeded shuffle, golden vectors

**Files:**
- Create: `src/crypto/commit.ts`, `src/crypto/serialize.ts`, `src/crypto/shuffle.ts`, `src/crypto/draw.ts`, `src/crypto/vectors.json`, `src/crypto/draw.test.ts`

**Interfaces:**
- Produces:
  - `commitment(secret: Uint8Array): string` — hex sha256 of `"breaks-commit-v1" ‖ secret`.
  - `type Entry = { number: number; ownerId: string }` (ownerId is a UUID string).
  - `serializeEntries(entries: Entry[]): Uint8Array` — concatenation of `uint16be(number) ‖ uuidBytes(ownerId)`, entries sorted by number.
  - `deriveSeed(p: { version: number; secret: Uint8Array; beacon: Uint8Array; breakId: string; entries: Entry[] }): Uint8Array` (32 bytes).
  - `shuffle(seed: Uint8Array, n: number): number[]` — permutation of indices 0..n-1 via HMAC-SHA256 counter stream and Fisher–Yates with rejection sampling.
  - `computeRanking(p): { seed: Uint8Array; ranking: number[]; resultHash: string }` — ranking is **line numbers**, rank 1 first; `resultHash` = hex sha256 of the ranking serialised as `uint16be` sequence.
  - `ALGORITHM_VERSION = 1`.
- Everything uses only `Uint8Array` and `@noble/hashes` so the same file runs in the browser (Task 15).

- [ ] **Step 1: Write the failing tests**

`src/crypto/draw.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { commitment } from "./commit";
import { serializeEntries, uuidBytes } from "./serialize";
import { shuffle } from "./shuffle";
import { computeRanking, ALGORITHM_VERSION } from "./draw";
import vectors from "./vectors.json";

describe("commitment", () => {
  it("is domain-separated sha256 of the secret", () => {
    const secret = new Uint8Array(32).fill(7);
    expect(commitment(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment(secret)).not.toBe(bytesToHex(secret));
  });
});

describe("serializeEntries", () => {
  it("encodes number as uint16be and uuid as 16 bytes, sorted by number, ignoring any handle", () => {
    const a = "00000000-0000-0000-0000-000000000001";
    const b = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const out = serializeEntries([{ number: 13, ownerId: b }, { number: 2, ownerId: a }]);
    expect(out.length).toBe(2 * 18);
    expect(Array.from(out.slice(0, 2))).toEqual([0, 2]);
    expect(Array.from(out.slice(2, 18))).toEqual(Array.from(uuidBytes(a)));
    expect(Array.from(out.slice(18, 20))).toEqual([0, 13]);
  });
  it("accepts bonus numbers above 255 (uint16)", () => {
    const out = serializeEntries([{ number: 300, ownerId: "00000000-0000-0000-0000-000000000001" }]);
    expect(Array.from(out.slice(0, 2))).toEqual([1, 44]);
  });
});

describe("shuffle", () => {
  it("returns a permutation", () => {
    const p = shuffle(new Uint8Array(32).fill(1), 20);
    expect([...p].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
  it("is deterministic for a seed and differs across seeds", () => {
    const s1 = new Uint8Array(32).fill(1), s2 = new Uint8Array(32).fill(2);
    expect(shuffle(s1, 10)).toEqual(shuffle(s1, 10));
    expect(shuffle(s1, 10)).not.toEqual(shuffle(s2, 10));
  });
  it("handles n = 1 and n = 0", () => {
    expect(shuffle(new Uint8Array(32), 1)).toEqual([0]);
    expect(shuffle(new Uint8Array(32), 0)).toEqual([]);
  });
});

describe("golden vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const r = computeRanking({
        version: ALGORITHM_VERSION,
        secret: hexToBytes(v.secret),
        beacon: hexToBytes(v.beacon),
        breakId: v.breakId,
        entries: v.entries,
      });
      expect(bytesToHex(r.seed)).toBe(v.seed);
      expect(r.ranking).toEqual(v.ranking);
      expect(r.resultHash).toBe(v.resultHash);
    });
  }
});
```

Create `src/crypto/vectors.json` with **placeholder expected values** for now — they are filled in Step 5 by running the implementation once and pasting its output; after that they are frozen and any change to the algorithm must bump `ALGORITHM_VERSION`:
```json
[
  {
    "name": "12 lines, two owners, one bonus line 13",
    "secret": "0707070707070707070707070707070707070707070707070707070707070707",
    "beacon": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "breakId": "11111111-1111-4111-8111-111111111111",
    "entries": [
      {"number": 1, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 2, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 3, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 4, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 5, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 6, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 7, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 8, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 9, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 10, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 11, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 12, "ownerId": "00000000-0000-4000-8000-000000000002"},
      {"number": 13, "ownerId": "00000000-0000-4000-8000-000000000003"}
    ],
    "seed": "FILL_ME",
    "ranking": [],
    "resultHash": "FILL_ME"
  },
  {
    "name": "2 lines",
    "secret": "0000000000000000000000000000000000000000000000000000000000000001",
    "beacon": "0000000000000000000000000000000000000000000000000000000000000002",
    "breakId": "22222222-2222-4222-8222-222222222222",
    "entries": [
      {"number": 1, "ownerId": "00000000-0000-4000-8000-000000000001"},
      {"number": 2, "ownerId": "00000000-0000-4000-8000-000000000002"}
    ],
    "seed": "FILL_ME",
    "ranking": [],
    "resultHash": "FILL_ME"
  }
]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/crypto/draw.test.ts`
Expected: FAIL with "Cannot find module './commit'"

- [ ] **Step 3: Implement the four modules**

`src/crypto/commit.ts`:
```ts
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes, concatBytes } from "@noble/hashes/utils";

export const COMMIT_DOMAIN = utf8ToBytes("breaks-commit-v1");

export function commitment(secret: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(COMMIT_DOMAIN, secret)));
}
```

`src/crypto/serialize.ts`:
```ts
export type Entry = { number: number; ownerId: string };

export function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`invalid uuid: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function uint16be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`number out of uint16 range: ${n}`);
  return new Uint8Array([n >> 8, n & 0xff]);
}

/** uint16be(number) ‖ uuid(ownerId), sorted by number. Handles are deliberately excluded. */
export function serializeEntries(entries: Entry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.number - b.number);
  const out = new Uint8Array(sorted.length * 18);
  sorted.forEach((e, i) => {
    out.set(uint16be(e.number), i * 18);
    out.set(uuidBytes(e.ownerId), i * 18 + 2);
  });
  return out;
}

export function serializeRanking(ranking: number[]): Uint8Array {
  const out = new Uint8Array(ranking.length * 2);
  ranking.forEach((n, i) => out.set(uint16be(n), i * 2));
  return out;
}
```

`src/crypto/shuffle.ts`:
```ts
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

/** HMAC-SHA256(seed, uint32be(counter)) blocks, consumed as big-endian uint32 words. */
class WordStream {
  private counter = 0;
  private buf = new Uint8Array(0);
  private pos = 0;
  constructor(private seed: Uint8Array) {}
  next(): number {
    if (this.pos >= this.buf.length) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, this.counter++, false);
      this.buf = hmac(sha256, this.seed, c);
      this.pos = 0;
    }
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getUint32(0, false);
    this.pos += 4;
    return v;
  }
}

/** Fisher–Yates with rejection sampling: unbiased for every bound. Returns a permutation of 0..n-1. */
export function shuffle(seed: Uint8Array, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  const ws = new WordStream(seed);
  for (let j = n - 1; j >= 1; j--) {
    const bound = j + 1;
    const limit = Math.floor(0x100000000 / bound) * bound; // largest multiple of bound ≤ 2^32
    let r: number;
    do r = ws.next(); while (r >= limit);
    const k = r % bound;
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}
```

`src/crypto/draw.ts`:
```ts
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes, concatBytes } from "@noble/hashes/utils";
import { serializeEntries, serializeRanking, uuidBytes, type Entry } from "./serialize";
import { shuffle } from "./shuffle";

export const ALGORITHM_VERSION = 1;
const SEED_DOMAIN = utf8ToBytes("breaks-seed-v1");

export type DrawInput = { version: number; secret: Uint8Array; beacon: Uint8Array; breakId: string; entries: Entry[] };

export function deriveSeed(p: DrawInput): Uint8Array {
  const v = new Uint8Array([0, 0, 0, p.version]);
  return sha256(concatBytes(SEED_DOMAIN, v, p.secret, p.beacon, uuidBytes(p.breakId), sha256(serializeEntries(p.entries))));
}

export function computeRanking(p: DrawInput): { seed: Uint8Array; ranking: number[]; resultHash: string } {
  if (p.version !== ALGORITHM_VERSION) throw new Error(`unsupported algorithm version ${p.version}`);
  const sorted = [...p.entries].sort((a, b) => a.number - b.number);
  const seed = deriveSeed(p);
  const perm = shuffle(seed, sorted.length);
  const ranking = perm.map((i) => sorted[i].number);
  return { seed, ranking, resultHash: bytesToHex(sha256(serializeRanking(ranking))) };
}
```

- [ ] **Step 4: Run the tests; golden vectors still fail**

Run: `pnpm vitest run src/crypto/draw.test.ts`
Expected: all pass except the two golden-vector cases (seed `FILL_ME`).

- [ ] **Step 5: Fill the vectors from the implementation and freeze them**

Run once:
```bash
pnpm tsx -e '
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { computeRanking, ALGORITHM_VERSION } from "./src/crypto/draw";
import v from "./src/crypto/vectors.json";
for (const x of v) { const r = computeRanking({ version: ALGORITHM_VERSION, secret: hexToBytes(x.secret), beacon: hexToBytes(x.beacon), breakId: x.breakId, entries: x.entries }); x.seed = bytesToHex(r.seed); x.ranking = r.ranking; x.resultHash = r.resultHash; }
console.log(JSON.stringify(v, null, 2));'
```
Paste the output over `vectors.json`. Re-run: `pnpm vitest run src/crypto/draw.test.ts` → PASS. From now on the vectors are the contract; a failing vector means the algorithm changed and `ALGORITHM_VERSION` must be bumped with a new vector set.

- [ ] **Step 6: Commit**

```bash
git add src/crypto
git commit -m "feat(crypto): commitment, entry serialization, rejection-sampled shuffle and golden vectors"
```

---

### Task 5: Secret storage (AES-256-GCM) and the beacon source

**Files:**
- Create: `src/crypto/secrets.ts`, `src/crypto/secrets.test.ts`, `src/crypto/beacon.ts`, `src/crypto/beacon.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(secret: Uint8Array, breakId: string): { ciphertext: string; keyId: string }` and `decryptSecret(ciphertext: string, keyId: string, breakId: string): Uint8Array` — AES-256-GCM, key from `env().DRAW_KEY_V1` (`keyId = "v1"`), `breakId` bytes as AAD.
  - `interface BeaconSource { roundAt(time: Date): number; fetch(round: number): Promise<{ randomness: Uint8Array; signature: string } | null> }`.
  - `DrandBeacon` (quicknet: period 3s, genesis 1692803367, chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, relays in order `https://api.drand.sh`, `https://api2.drand.sh`, `https://api3.drand.sh`, `https://drand.cloudflare.com`), returns `null` if all relays fail or the round is in the future.
  - `FakeBeacon` for tests: `roundAt` uses the same formula; `fetch(round)` returns `sha256("fake-beacon" ‖ uint32be(round))` as randomness and `"fake"` as signature.
  - `roundAfter(time: Date, delaySeconds: number): number` helper exported for the request command.

- [ ] **Step 1: Write the failing tests**

`src/crypto/secrets.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./secrets";

describe("secrets", () => {
  beforeAll(() => { process.env.DRAW_KEY_V1 = Buffer.alloc(32, 9).toString("base64"); });
  const breakId = "11111111-1111-4111-8111-111111111111";
  it("round-trips", () => {
    const s = new Uint8Array(32).fill(3);
    const { ciphertext, keyId } = encryptSecret(s, breakId);
    expect(keyId).toBe("v1");
    expect(decryptSecret(ciphertext, keyId, breakId)).toEqual(s);
  });
  it("fails to decrypt under a different break id (AAD)", () => {
    const { ciphertext, keyId } = encryptSecret(new Uint8Array(32), breakId);
    expect(() => decryptSecret(ciphertext, keyId, "22222222-2222-4222-8222-222222222222")).toThrow();
  });
  it("rejects unknown key ids", () => {
    const { ciphertext } = encryptSecret(new Uint8Array(32), breakId);
    expect(() => decryptSecret(ciphertext, "v9", breakId)).toThrow(/key id/);
  });
});
```

`src/crypto/beacon.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakeBeacon, roundAfter, QUICKNET } from "./beacon";

describe("beacon rounds", () => {
  it("computes the first round at or after time + delay", () => {
    const t = new Date((QUICKNET.genesis + 100 * QUICKNET.period) * 1000); // exactly round 101
    expect(roundAfter(t, 0)).toBe(101);
    expect(roundAfter(t, 60)).toBe(121);
    expect(roundAfter(new Date(t.getTime() + 1000), 0)).toBe(102);
  });
  it("fake beacon is deterministic per round", async () => {
    const f = new FakeBeacon();
    const a = await f.fetch(5), b = await f.fetch(5), c = await f.fetch(6);
    expect(a!.randomness).toEqual(b!.randomness);
    expect(a!.randomness).not.toEqual(c!.randomness);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/crypto/secrets.test.ts src/crypto/beacon.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/crypto/secrets.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const KEYS: Record<string, () => Buffer> = { v1: () => Buffer.from(env().DRAW_KEY_V1, "base64") };
export const CURRENT_KEY_ID = "v1";

export function newSecret(): Uint8Array { return new Uint8Array(randomBytes(32)); }

export function encryptSecret(secret: Uint8Array, breakId: string): { ciphertext: string; keyId: string } {
  const key = KEYS[CURRENT_KEY_ID]();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(breakId, "utf8"));
  const data = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, data]).toString("base64"), keyId: CURRENT_KEY_ID };
}

export function decryptSecret(ciphertext: string, keyId: string, breakId: string): Uint8Array {
  const getKey = KEYS[keyId];
  if (!getKey) throw new Error(`unknown key id ${keyId}`);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(Buffer.from(breakId, "utf8"));
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]));
}
```

- [ ] **Step 4: Implement `src/crypto/beacon.ts`**

```ts
import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";

export const QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesis: 1692803367, // unix seconds of round 1
  period: 3,
  relays: ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"],
};

export type BeaconValue = { randomness: Uint8Array; signature: string };

export interface BeaconSource {
  roundAt(time: Date): number;
  fetch(round: number): Promise<BeaconValue | null>;
}

/** First round whose time is >= time + delaySeconds. Round r happens at genesis + (r-1)*period. */
export function roundAfter(time: Date, delaySeconds: number): number {
  const t = Math.floor(time.getTime() / 1000) + delaySeconds;
  return Math.ceil((t - QUICKNET.genesis) / QUICKNET.period) + 1;
}

export class DrandBeacon implements BeaconSource {
  constructor(private fetchFn: typeof fetch = fetch) {}
  roundAt(time: Date) { return roundAfter(time, 0); }
  async fetch(round: number): Promise<BeaconValue | null> {
    if (round > this.roundAt(new Date())) return null;
    for (const relay of QUICKNET.relays) {
      try {
        const res = await this.fetchFn(`${relay}/${QUICKNET.chainHash}/public/${round}`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const body = (await res.json()) as { round: number; randomness: string; signature: string };
        if (body.round !== round) continue;
        return { randomness: hexToBytes(body.randomness), signature: body.signature };
      } catch { /* try next relay */ }
    }
    return null;
  }
}

export class FakeBeacon implements BeaconSource {
  roundAt(time: Date) { return roundAfter(time, 0); }
  async fetch(round: number): Promise<BeaconValue> {
    const r = new Uint8Array(4);
    new DataView(r.buffer).setUint32(0, round, false);
    return { randomness: sha256(concatBytes(utf8ToBytes("fake-beacon"), r)), signature: "fake" };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/crypto/secrets.test.ts src/crypto/beacon.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/crypto/secrets.ts src/crypto/secrets.test.ts src/crypto/beacon.ts src/crypto/beacon.test.ts
git commit -m "feat(crypto): aes-gcm secret storage and drand/fake beacon sources"
```

---

### Task 6: Domain foundations — errors, caller, events, authorization helpers

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/types.ts`, `src/domain/events.ts`, `src/auth/authz.ts`, `src/auth/authz.test.ts`, `src/domain/events.test.ts`

**Interfaces:**
- Produces:
  - `class DomainError extends Error { code: string; status: number }` and subclasses `NotFound`, `NotAuthorized`, `NotOpen`, `NotOnboarded`, `LineTaken(numbers: number[])`, `OwnerChanged`, `CapExceeded(kind, limit)`, `InvalidInput(message)`, `NotFilled`, `BeaconUnavailable`, `AlreadyDrawn`.
  - `type Caller = { id: string; role: "member" | "host" | "admin"; onboarded: boolean; banned: boolean }`.
  - `appendEvent(tx, e: { breakId?: string; actorId?: string; type: string; payload?: object; batchId?: string; ipHash?: string }): Promise<string>` (returns event id).
  - `assertHostOf(tx, caller, breakId): Promise<BreakRow>` — loads the break **with `FOR UPDATE`** (this is the lock-first rule) and throws `NotAuthorized` unless `caller.id === break.hostId` or caller is admin.
  - `lockBreak(tx, breakId): Promise<BreakRow>` — `SELECT … FOR UPDATE`, throws `NotFound`.
  - `assertOnboarded(caller)`.

- [ ] **Step 1: Write the failing tests**

`src/auth/authz.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { assertHostOf, assertOnboarded, lockBreak } from "./authz";
import { NotAuthorized, NotFound, NotOnboarded } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const callerOf = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("authz", () => {
  it("assertHostOf allows the host and admins, rejects others", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx);
      const admin = await makeUser(tx, { role: "admin" });
      const b = await makeBreak(tx, { hostId: host.id });
      expect((await assertHostOf(tx, callerOf(host, "host"), b.id)).id).toBe(b.id);
      expect((await assertHostOf(tx, callerOf(admin, "admin"), b.id)).id).toBe(b.id);
      await expect(assertHostOf(tx, callerOf(other), b.id)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("lockBreak throws NotFound for unknown ids", async () => {
    await withTx(async (tx) => {
      await expect(lockBreak(tx, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFound);
    });
  });
  it("assertOnboarded rejects un-onboarded and banned callers", () => {
    expect(() => assertOnboarded({ id: "x", role: "member", onboarded: false, banned: false })).toThrow(NotOnboarded);
    expect(() => assertOnboarded({ id: "x", role: "member", onboarded: true, banned: true })).toThrow(NotAuthorized);
  });
});
```

`src/domain/events.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { appendEvent } from "./events";
import { events } from "@/db/schema";

describe("appendEvent", () => {
  it("writes an event row and returns its id", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const id = await appendEvent(tx, { breakId: b.id, actorId: host.id, type: "test.event", payload: { a: 1 } });
      const [row] = await tx.select().from(events).where(sql`${events.id} = ${id}`);
      expect(row.type).toBe("test.event");
      expect(row.payload).toEqual({ a: 1 });
      expect(row.processedAt).toBeNull();
    });
  });
  it("rejects a duplicate batch id for the same break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const batchId = "33333333-3333-4333-8333-333333333333";
      await appendEvent(tx, { breakId: b.id, type: "x", batchId });
      await expect(appendEvent(tx, { breakId: b.id, type: "x", batchId })).rejects.toThrow(/events_batch_uq/);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/auth/authz.test.ts src/domain/events.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement**

`src/domain/errors.ts`:
```ts
export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = code; }
}
export class NotFound extends DomainError { constructor(what = "Not found") { super("NOT_FOUND", what, 404); } }
export class NotAuthorized extends DomainError { constructor(msg = "You can't do that") { super("NOT_AUTHORIZED", msg, 403); } }
export class NotOnboarded extends DomainError { constructor() { super("NOT_ONBOARDED", "Finish setting up your account first", 403); } }
export class NotOpen extends DomainError { constructor(status: string) { super("NOT_OPEN", `This break is ${status}`, 409); } }
export class NotFilled extends DomainError { constructor() { super("NOT_FILLED", "Every line must be paid before the draw", 409); } }
export class AlreadyDrawn extends DomainError { constructor() { super("ALREADY_DRAWN", "This break has already been drawn", 409); } }
export class LineTaken extends DomainError { constructor(public numbers: number[]) { super("LINE_TAKEN", `Lines ${numbers.join(", ")} are taken`, 409); } }
export class OwnerChanged extends DomainError { constructor() { super("OWNER_CHANGED", "This line changed hands; refresh and try again", 409); } }
export class CapExceeded extends DomainError { constructor(public kind: string, public limit: number) { super("CAP_EXCEEDED", `Limit of ${limit} (${kind}) reached`, 409); } }
export class InvalidInput extends DomainError { constructor(msg: string) { super("INVALID_INPUT", msg, 400); } }
export class BeaconUnavailable extends DomainError { constructor() { super("BEACON_UNAVAILABLE", "Waiting for the public beacon — try again in a moment", 503); } }
```

`src/domain/types.ts`:
```ts
export type Role = "member" | "host" | "admin";
export type Caller = { id: string; role: Role; onboarded: boolean; banned: boolean };
export const SYSTEM: Caller = { id: "00000000-0000-4000-8000-000000000000", role: "admin", onboarded: true, banned: false };
```

`src/domain/events.ts`:
```ts
import type { Tx } from "@/db/client";
import { events } from "@/db/schema";

export async function appendEvent(tx: Tx, e: {
  breakId?: string; actorId?: string; type: string; payload?: Record<string, unknown>; batchId?: string; ipHash?: string;
}): Promise<string> {
  const [row] = await tx.insert(events).values({
    breakId: e.breakId, actorId: e.actorId, type: e.type, payload: e.payload ?? {}, batchId: e.batchId, ipHash: e.ipHash,
  }).returning({ id: events.id });
  return row.id;
}
```

`src/auth/authz.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks } from "@/db/schema";
import { NotAuthorized, NotFound, NotOnboarded } from "@/domain/errors";
import type { Caller } from "@/domain/types";

export type BreakRow = typeof breaks.$inferSelect;

/** Row-locks the break. Every command that mutates a break or its lines calls this first. */
export async function lockBreak(tx: Tx, breakId: string): Promise<BreakRow> {
  const rows = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`).for("update");
  if (rows.length === 0) throw new NotFound("Break not found");
  return rows[0];
}

export async function assertHostOf(tx: Tx, caller: Caller, breakId: string): Promise<BreakRow> {
  const b = await lockBreak(tx, breakId);
  if (b.hostId !== caller.id && caller.role !== "admin") throw new NotAuthorized("Only the host can do that");
  return b;
}

export function assertOnboarded(caller: Caller): void {
  if (caller.banned) throw new NotAuthorized("This account is suspended");
  if (!caller.onboarded) throw new NotOnboarded();
}

export function assertAdmin(caller: Caller): void {
  if (caller.role !== "admin") throw new NotAuthorized("Admins only");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/auth/authz.test.ts src/domain/events.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/errors.ts src/domain/types.ts src/domain/events.ts src/domain/events.test.ts src/auth/authz.ts src/auth/authz.test.ts
git commit -m "feat(domain): typed errors, caller, event append and break lock/authz helpers"
```

---

### Task 7: `breaks` commands — create draft, add item, add prize, open

**Files:**
- Create: `src/domain/breaks/commands.ts`, `src/domain/breaks/rules.ts`, `src/domain/breaks/queries.ts`, `src/domain/breaks/commands.test.ts`

**Interfaces:**
- Consumes: `lockBreak`, `assertHostOf`, `assertOnboarded`, `appendEvent`, `commitment`, `newSecret`, `encryptSecret`.
- Produces:
  - `createDraft(tx, caller, input: { title; description?; lineCount; linePriceCents; paymentWindowHours?; maxLinesPerUser?; allowRandomClaims?; paymentInstructions?; items: { name; variantSchema?; expectedShipAt? }[] }): Promise<{ breakId }>` — inserts the break (`kind: "main"`), its items, and rank-1 prizes for every item (a choice set if several). Requires `caller.role` host or admin.
  - `openBreak(tx, caller, breakId): Promise<void>` — validation per spec §7, secret + commitment, pre-creates lines, status `open`, event `break.opened`.
  - `getBreakPage(tx, breakId): Promise<BreakPage | null>` — break, items, prizes, lines (with owner handle), host handle/display name/payment handles.
  - `validateDraftForOpen(b: BreakRow, prizeCount: number): void` in `rules.ts`.

- [ ] **Step 1: Write the failing tests**

`src/domain/breaks/commands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, lineRows } from "../../../tests/helpers/fixtures";
import { createDraft, openBreak } from "./commands";
import { getBreakPage } from "./queries";
import { breaks, breakSecrets, events } from "@/db/schema";
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const asHost = (u: { id: string }): Caller => ({ id: u.id, role: "host", onboarded: true, banned: false });
const asMember = (u: { id: string }): Caller => ({ id: u.id, role: "member", onboarded: true, banned: false });

const input = { title: "Target Chronos", lineCount: 12, linePriceCents: 2000, items: [{ name: "Chronos 22g" }, { name: "Chronos 24g" }] };

describe("createDraft", () => {
  it("creates a draft with items and a rank-1 choice set", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.break.status).toBe("draft");
      expect(page.items.map((i) => i.name)).toEqual(["Chronos 22g", "Chronos 24g"]);
      expect(page.prizes.filter((p) => p.rank === 1)).toHaveLength(2);
    });
  });
  it("rejects members", async () => {
    await withTx(async (tx) => {
      const m = await makeUser(tx);
      await expect(createDraft(tx, asMember(m), input)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("rejects fewer than 2 lines or a zero price", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), { ...input, lineCount: 1 })).rejects.toBeInstanceOf(InvalidInput);
      await expect(createDraft(tx, asHost(host), { ...input, linePriceCents: 0 })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
});

describe("openBreak", () => {
  it("opens, commits a secret, pre-creates lines and logs an event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      const [b] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
      expect(b.status).toBe("open");
      expect(b.seedCommitment).toMatch(/^[0-9a-f]{64}$/);
      expect(b.openedAt).not.toBeNull();
      const [s] = await tx.select().from(breakSecrets).where(sql`${breakSecrets.breakId} = ${breakId}`);
      expect(s.keyId).toBe("v1");
      expect((await lineRows(tx, breakId)).map((l) => l.number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId}`);
      expect(evs.map((e) => e.type)).toContain("break.opened");
    });
  });
  it("is rejected when the break is not a draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("is rejected for a draft without a rank-1 prize", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [] });
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("is rejected for a banned or listing-paused host", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await tx.execute(sql`update users set listing_paused_at = now() where id = ${host.id}`);
      await expect(openBreak(tx, asHost(host), breakId)).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/breaks`
Expected: FAIL with "Cannot find module './commands'"

- [ ] **Step 3: Implement `rules.ts`, `commands.ts`, `queries.ts`**

`src/domain/breaks/rules.ts`:
```ts
import { InvalidInput } from "@/domain/errors";

export function validateDraftInput(i: { lineCount: number; linePriceCents: number; title: string; kind?: string }): void {
  if (!i.title.trim()) throw new InvalidInput("Title is required");
  if (!Number.isInteger(i.lineCount) || i.lineCount < 2) throw new InvalidInput("At least 2 lines");
  if (i.lineCount > 1000) throw new InvalidInput("At most 1000 lines");
  const free = i.kind === "free";
  if (!Number.isInteger(i.linePriceCents) || (free ? i.linePriceCents !== 0 : i.linePriceCents <= 0)) {
    throw new InvalidInput(free ? "Free draws have a price of 0" : "Price per line must be above 0");
  }
}

export function validateDraftForOpen(b: { status: string; lineCount: number }, rank1PrizeCount: number): void {
  if (rank1PrizeCount < 1) throw new InvalidInput("Add at least one item before opening");
}

export const SELF_CLAIM_SHARE = 0.1;
export const BONUS_SHARE = 0.1;
export const GLOBAL_UNPAID_CAP = 30;
```

`src/domain/breaks/commands.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, breakSecrets, users } from "@/db/schema";
import { assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { commitment } from "@/crypto/commit";
import { newSecret, encryptSecret } from "@/crypto/secrets";
import { validateDraftInput, validateDraftForOpen } from "./rules";

export type CreateDraftInput = {
  title: string; description?: string; lineCount: number; linePriceCents: number;
  paymentWindowHours?: number; maxLinesPerUser?: number | null; allowRandomClaims?: boolean; paymentInstructions?: string;
  items: { name: string; variantSchema?: Record<string, string[]> | null; expectedShipAt?: Date | null }[];
};

export async function createDraft(tx: Tx, caller: Caller, input: CreateDraftInput): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts can list a break");
  validateDraftInput(input);
  const [b] = await tx.insert(breaks).values({
    hostId: caller.id, kind: "main", title: input.title.trim(), description: input.description ?? "",
    lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    allowRandomClaims: input.allowRandomClaims ?? true, paymentInstructions: input.paymentInstructions ?? "",
  }).returning({ id: breaks.id });
  for (const item of input.items) {
    const [it] = await tx.insert(breakItems).values({
      breakId: b.id, name: item.name.trim(), variantSchema: item.variantSchema ?? null, expectedShipAt: item.expectedShipAt ?? null,
    }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: it.id });
  }
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.created" });
  return { breakId: b.id };
}

export async function openBreak(tx: Tx, caller: Caller, breakId: string): Promise<void> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, breakId);
  if (b.status !== "draft") throw new NotOpen(b.status);
  const [host] = await tx.select({ bannedAt: users.bannedAt, pausedAt: users.listingPausedAt }).from(users).where(sql`${users.id} = ${b.hostId}`).for("update");
  if (host.bannedAt || host.pausedAt) throw new NotAuthorized("Listing is paused for this account");
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(prizes).where(sql`${prizes.breakId} = ${breakId} and ${prizes.rank} = 1`);
  validateDraftForOpen(b, count);

  const secret = newSecret();
  const { ciphertext, keyId } = encryptSecret(secret, breakId);
  await tx.insert(breakSecrets).values({ breakId, ciphertext, keyId });
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${breakId}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${breakId}::uuid, generate_series(1, ${b.lineCount})`);
  await appendEvent(tx, { breakId, actorId: caller.id, type: "break.opened", payload: { lineCount: b.lineCount, linePriceCents: b.linePriceCents } });
}
```

`src/domain/breaks/queries.ts`:
```ts
import { sql, eq, asc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, lines, users, hostProfiles } from "@/db/schema";

export type BreakPage = {
  break: typeof breaks.$inferSelect;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string } };
  items: (typeof breakItems.$inferSelect)[];
  prizes: (typeof prizes.$inferSelect)[];
  lines: { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; reservedForMiniId: string | null; isBonus: boolean }[];
};

export async function getBreakPage(tx: Tx, breakId: string): Promise<BreakPage | null> {
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
  if (!b) return null;
  const [host] = await tx.select({ id: users.id, handle: users.handle, displayName: users.displayName, paymentHandles: hostProfiles.paymentHandles })
    .from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, b.hostId));
  const items = await tx.select().from(breakItems).where(eq(breakItems.breakId, breakId)).orderBy(asc(breakItems.createdAt));
  const prizeRows = await tx.select().from(prizes).where(eq(prizes.breakId, breakId)).orderBy(asc(prizes.rank));
  const lineRows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, ownerHandle: users.handle, claimedAt: lines.claimedAt, sentAt: lines.sentAt,
    paidAt: lines.paidAt, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  return { break: b, host: { ...host, paymentHandles: host.paymentHandles ?? {} }, items, prizes: prizeRows, lines: lineRows };
}

export async function listOpenBreaks(tx: Tx, limit = 50) {
  return tx.select({ id: breaks.id, title: breaks.title, lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, status: breaks.status, openedAt: breaks.openedAt,
    openLines: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is null and l.reserved_for_mini_id is null)`,
    hostHandle: users.handle })
    .from(breaks).innerJoin(users, eq(users.id, breaks.hostId))
    .where(sql`${breaks.status} in ('open','filled','drawing')`).orderBy(sql`${breaks.openedAt} desc`).limit(limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/breaks`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/breaks
git commit -m "feat(breaks): create draft, open with commitment and pre-created lines"
```

---

### Task 8: `lines` commands — claim, random, take-the-rest, sent, paid, un-mark, release, fill

**Files:**
- Create: `src/domain/lines/commands.ts`, `src/domain/lines/rules.ts`, `src/domain/lines/queries.ts`, `src/domain/lines/commands.test.ts`

**Interfaces:**
- Consumes: `lockBreak`, `assertHostOf`, `assertOnboarded`, `appendEvent`, `GLOBAL_UNPAID_CAP`, `SELF_CLAIM_SHARE`.
- Produces (all `(tx, caller, …)`; all lock the break row first):
  - `claimLines(tx, caller, { breakId, numbers: number[], batchId: string; ipHash?: string }): Promise<{ got: number[]; taken: number[] }>` — partial success; `got` includes lines the caller already held (idempotent retry); throws `LineTaken` only if **nothing** was obtained.
  - `claimRandom(tx, caller, { breakId, count, batchId }): Promise<{ got: number[] }>` — `FOR UPDATE SKIP LOCKED`; throws `LineTaken([])` with message "Only N open" if fewer than `count` are free (no partial).
  - `claimAllOpen(tx, caller, { breakId, batchId }): Promise<{ got: number[] }>`.
  - `markSent(tx, caller, { breakId, numbers })`.
  - `markPaid(tx, caller, { breakId, number, expectedOwnerId }): Promise<{ filled: boolean }>` — conditional update; `OwnerChanged` if the owner differs; idempotent if already paid by that owner.
  - `unmarkPaid(tx, caller, { breakId, number })` — only in open|filled.
  - `releaseLine(tx, caller, { breakId, number, reason: "overdue" | "host_dropped" | "withdrawn" })` — host for the first two, owner for `withdrawn`; unpaid lines only.
  - `recomputeFill(tx, breakId, actorId?): Promise<boolean>` — must be called with the break row already locked; moves open→filled or filled→open, writes `break.filled` / `break.unfilled` events, sets `filledAt` only if null.
  - `isOverdue(line, breakRow, now): boolean` in `rules.ts`.
  - `myLines(tx, userId)` in `queries.ts` for `/me`.

- [ ] **Step 1: Write the failing tests**

`src/domain/lines/commands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, lineRows } from "../../../tests/helpers/fixtures";
import { claimLines, claimRandom, claimAllOpen, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill } from "./commands";
import { isOverdue } from "./rules";
import { breaks, lines, events } from "@/db/schema";
import { CapExceeded, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const status = async (tx: any, id: string) => (await tx.select({ s: breaks.status }).from(breaks).where(sql`${breaks.id} = ${id}`))[0].s;

describe("claimLines", () => {
  it("claims free lines, snapshots price, sets claimed_at, logs one batch event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12, linePriceCents: 2000 });
      const batchId = randomUUID();
      const r = await claimLines(tx, c(buyer), { breakId: b.id, numbers: [4, 7, 11], batchId });
      expect(r).toEqual({ got: [4, 7, 11], taken: [] });
      const rows = await lineRows(tx, b.id);
      expect(rows[3].ownerId).toBe(buyer.id); expect(rows[3].priceCents).toBe(2000); expect(rows[3].claimedAt).not.toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.claimed'`);
      expect(evs).toHaveLength(1); expect(evs[0].payload).toEqual({ numbers: [4, 7, 11] }); expect(evs[0].batchId).toBe(batchId);
    });
  });
  it("succeeds partially and reports taken lines", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [7], batchId: randomUUID() });
      const r = await claimLines(tx, c(bb), { breakId: b.id, numbers: [4, 7, 11], batchId: randomUUID() });
      expect(r).toEqual({ got: [4, 11], taken: [7] });
    });
  });
  it("throws LineTaken only when nothing was obtained", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [7], batchId: randomUUID() });
      await expect(claimLines(tx, c(bb), { breakId: b.id, numbers: [7], batchId: randomUUID() })).rejects.toBeInstanceOf(LineTaken);
    });
  });
  it("treats a retry for lines the caller already holds as success (double-tap)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId: randomUUID() });
      const r = await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId: randomUUID() });
      expect(r).toEqual({ got: [3, 5], taken: [] });
    });
  });
  it("rejects claims when the break is not open", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await tx.update(breaks).set({ status: "cancelled" }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() })).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("enforces max_lines_per_user and the host self-claim share", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await tx.update(breaks).set({ maxLinesPerUser: 2 }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      // host may hold at most 10% of 20 = 2
      await expect(claimLines(tx, c(host, "host"), { breakId: b.id, numbers: [4, 5, 6], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      expect((await claimLines(tx, c(host, "host"), { breakId: b.id, numbers: [4, 5], batchId: randomUUID() })).got).toEqual([4, 5]);
    });
  });
  it("never claims a line reserved for a mini", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await tx.update(lines).set({ reservedForMiniId: mini.id }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = 2`);
      const r = await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      expect(r).toEqual({ got: [1], taken: [2] });
    });
  });
});

describe("claimRandom / claimAllOpen", () => {
  it("gives n random open lines, or fails without partial claims", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      const r = await claimRandom(tx, c(a), { breakId: b.id, count: 3, batchId: randomUUID() });
      expect(r.got).toHaveLength(3);
      await expect(claimRandom(tx, c(await makeUser(tx)), { breakId: b.id, count: 3, batchId: randomUUID() })).rejects.toBeInstanceOf(LineTaken);
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId).length).toBe(3);
    });
  });
  it("take-the-rest claims every open line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      expect((await claimAllOpen(tx, c(bb), { breakId: b.id, batchId: randomUUID() })).got).toEqual([3, 4, 5]);
    });
  });
});

describe("markSent / markPaid / recomputeFill", () => {
  it("fills the break when the last numbered line is paid and un-fills on un-mark", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() });
      await markSent(tx, c(a), { breakId: b.id, numbers: [1, 2, 3] });
      expect((await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).filled).toBe(false);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
      expect((await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id })).filled).toBe(true);
      expect(await status(tx, b.id)).toBe("filled");
      await unmarkPaid(tx, c(host, "host"), { breakId: b.id, number: 2 });
      expect(await status(tx, b.id)).toBe("open");
      const [row] = await tx.select({ filledAt: breaks.filledAt }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.filledAt).not.toBeNull(); // first fill is kept
    });
  });
  it("markPaid with a stale owner fails with OwnerChanged and pays nobody", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await releaseLine(tx, c(a), { breakId: b.id, number: 1, reason: "withdrawn" });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).rejects.toBeInstanceOf(OwnerChanged);
      expect((await lineRows(tx, b.id))[0].paidAt).toBeNull();
    });
  });
  it("markPaid is idempotent and host-only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      await expect(markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).resolves.toEqual({ filled: false });
      await expect(markPaid(tx, c(a), { breakId: b.id, number: 1, expectedOwnerId: a.id })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("does not fill while a numbered line is reserved for a mini and unowned", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await tx.update(lines).set({ reservedForMiniId: mini.id }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = 2`);
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      expect(await status(tx, b.id)).toBe("open");
    });
  });
});

describe("releaseLine", () => {
  it("host releases an unpaid claim; buyer can withdraw; paid lines cannot be released", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() });
      await releaseLine(tx, c(host, "host"), { breakId: b.id, number: 1, reason: "host_dropped" });
      await releaseLine(tx, c(a), { breakId: b.id, number: 2, reason: "withdrawn" });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id });
      await expect(releaseLine(tx, c(host, "host"), { breakId: b.id, number: 3, reason: "host_dropped" })).rejects.toThrow(/paid/);
      const rows = await lineRows(tx, b.id);
      expect(rows[0].ownerId).toBeNull(); expect(rows[0].claimedAt).toBeNull(); expect(rows[0].priceCents).toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.released'`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 1, reason: "host_dropped" }, { number: 2, reason: "withdrawn" }]);
    });
  });
  it("a buyer cannot release someone else's line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(releaseLine(tx, c(bb), { breakId: b.id, number: 1, reason: "withdrawn" })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
});

describe("isOverdue", () => {
  const b = { paymentWindowHours: 24 } as any;
  const now = new Date("2026-10-13T12:00:00Z");
  it("is overdue when claimed > window ago, unpaid and not sent", () => {
    expect(isOverdue({ claimedAt: new Date("2026-10-12T11:00:00Z"), sentAt: null, paidAt: null, ownerId: "x" } as any, b, now)).toBe(true);
    expect(isOverdue({ claimedAt: new Date("2026-10-12T11:00:00Z"), sentAt: new Date(), paidAt: null, ownerId: "x" } as any, b, now)).toBe(false);
    expect(isOverdue({ claimedAt: new Date("2026-10-13T11:00:00Z"), sentAt: null, paidAt: null, ownerId: "x" } as any, b, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/lines`
Expected: FAIL with "Cannot find module './commands'"

- [ ] **Step 3: Implement `rules.ts`**

`src/domain/lines/rules.ts`:
```ts
import { CapExceeded, InvalidInput } from "@/domain/errors";
import { SELF_CLAIM_SHARE, GLOBAL_UNPAID_CAP } from "@/domain/breaks/rules";

export function isOverdue(l: { claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; ownerId: string | null }, b: { paymentWindowHours: number }, now = new Date()): boolean {
  if (!l.ownerId || !l.claimedAt || l.paidAt || l.sentAt) return false;
  return l.claimedAt.getTime() + b.paymentWindowHours * 3600_000 < now.getTime();
}

export function validateNumbers(numbers: number[], lineCount: number): number[] {
  const uniq = [...new Set(numbers)];
  if (uniq.length === 0) throw new InvalidInput("Pick at least one line");
  for (const n of uniq) if (!Number.isInteger(n) || n < 1 || n > lineCount) throw new InvalidInput(`Line ${n} does not exist`);
  return uniq.sort((a, b) => a - b);
}

/** Caps after this claim would land. `heldByCaller` counts lines the caller already owns in this break. */
export function assertCaps(p: { requested: number; heldByCaller: number; maxLinesPerUser: number | null; isHost: boolean; lineCount: number; globalUnpaid: number }): void {
  const after = p.heldByCaller + p.requested;
  if (p.maxLinesPerUser !== null && after > p.maxLinesPerUser) throw new CapExceeded("lines per person", p.maxLinesPerUser);
  if (p.isHost) {
    const hostCap = Math.max(1, Math.floor(p.lineCount * SELF_CLAIM_SHARE));
    if (after > hostCap) throw new CapExceeded("host-held lines", hostCap);
  }
  if (p.globalUnpaid + p.requested > GLOBAL_UNPAID_CAP) throw new CapExceeded("open unpaid claims", GLOBAL_UNPAID_CAP);
}
```

- [ ] **Step 4: Implement `commands.ts`**

`src/domain/lines/commands.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines } from "@/db/schema";
import { lockBreak, assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { assertCaps, validateNumbers } from "./rules";

type LineRow = typeof lines.$inferSelect;

async function heldBy(tx: Tx, breakId: string, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.breakId} = ${breakId} and ${lines.ownerId} = ${userId} and ${lines.isBonus} = false`);
  return r.n;
}
async function globalUnpaid(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${userId} and ${lines.paidAt} is null`);
  return r.n;
}

async function assign(tx: Tx, b: typeof breaks.$inferSelect, caller: Caller, numbers: number[]): Promise<number[]> {
  const rows = await tx.execute<{ number: number }>(sql`
    update lines set owner_id = ${caller.id}, claimed_at = now(), price_cents = ${b.linePriceCents}
    where break_id = ${b.id} and number = any(${numbers}::int[]) and owner_id is null and reserved_for_mini_id is null
    returning number`);
  return rows.map((r) => r.number).sort((x, y) => x - y);
}

async function finishClaim(tx: Tx, b: typeof breaks.$inferSelect, caller: Caller, got: number[], batchId: string, ipHash?: string) {
  if (got.length === 0) return;
  if (b.kind === "free") await tx.update(lines).set({ paidAt: new Date() }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = any(${got}::int[])`);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.claimed", payload: { numbers: got }, batchId, ipHash });
  if (b.kind === "free") await recomputeFill(tx, b.id, caller.id);
}

export async function claimLines(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[]; batchId: string; ipHash?: string }): Promise<{ got: number[]; taken: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open") throw new NotOpen(b.status);
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const mine = (await tx.select({ number: lines.number }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id} and ${lines.number} = any(${numbers}::int[])`)).map((r) => r.number);
  const wanted = numbers.filter((n) => !mine.includes(n));
  const isHost = caller.id === b.hostId;
  if (isHost && b.kind !== "main") throw new NotAuthorized("Hosts can't take lines in their own mini or free draw");
  assertCaps({ requested: wanted.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const got = await assign(tx, b, caller, wanted);
  const taken = wanted.filter((n) => !got.includes(n));
  if (got.length === 0 && mine.length === 0) throw new LineTaken(taken);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got: [...mine, ...got].sort((x, y) => x - y), taken };
}

export async function claimRandom(tx: Tx, caller: Caller, p: { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open") throw new NotOpen(b.status);
  if (!b.allowRandomClaims) throw new InvalidInput("This break doesn't allow random lines");
  if (!Number.isInteger(p.count) || p.count < 1) throw new InvalidInput("Ask for at least one line");
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: p.count, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const picked = await tx.execute<{ number: number }>(sql`
    select number from lines where break_id = ${b.id} and owner_id is null and reserved_for_mini_id is null and number <= ${b.lineCount}
    order by random() limit ${p.count} for update skip locked`);
  if (picked.length < p.count) { const e = new LineTaken([]); e.message = `Only ${picked.length} open`; throw e; }
  const got = await assign(tx, b, caller, picked.map((r) => r.number));
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function claimAllOpen(tx: Tx, caller: Caller, p: { breakId: string; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open") throw new NotOpen(b.status);
  const open = (await tx.select({ number: lines.number }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)).map((r) => r.number);
  if (open.length === 0) throw new LineTaken([]);
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: open.length, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const got = await assign(tx, b, caller, open);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}

export async function markSent(tx: Tx, caller: Caller, p: { breakId: string; numbers: number[] }): Promise<void> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const rows = await tx.execute<{ number: number }>(sql`
    update lines set sent_at = coalesce(sent_at, now()) where break_id = ${b.id} and owner_id = ${caller.id} and paid_at is null and number = any(${p.numbers}::int[]) returning number`);
  if (rows.length === 0) throw new NotAuthorized("Those lines aren't yours or are already paid");
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.sent", payload: { numbers: rows.map((r) => r.number) } });
}

export async function markPaid(tx: Tx, caller: Caller, p: { breakId: string; number: number; expectedOwnerId: string }): Promise<{ filled: boolean }> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const [cur] = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  if (!cur || cur.ownerId !== p.expectedOwnerId) throw new OwnerChanged();
  if (cur.paidAt) return { filled: b.status === "filled" };
  await tx.update(lines).set({ paidAt: new Date() }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number} and ${lines.ownerId} = ${p.expectedOwnerId} and ${lines.paidAt} is null`);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.paid", payload: { number: p.number, ownerId: p.expectedOwnerId } });
  return { filled: await recomputeFill(tx, b.id, caller.id) };
}

export async function unmarkPaid(tx: Tx, caller: Caller, p: { breakId: string; number: number }): Promise<void> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const rows = await tx.execute<{ owner_id: string }>(sql`update lines set paid_at = null where break_id = ${b.id} and number = ${p.number} and paid_at is not null and award_id is null returning owner_id`);
  if (rows.length === 0) throw new InvalidInput("That line is not marked paid");
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.unpaid", payload: { number: p.number, ownerId: rows[0].owner_id } });
  await recomputeFill(tx, b.id, caller.id);
}

export async function releaseLine(tx: Tx, caller: Caller, p: { breakId: string; number: number; reason: "overdue" | "host_dropped" | "withdrawn" }): Promise<void> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const [cur] = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  if (!cur?.ownerId) throw new InvalidInput("That line is already open");
  if (cur.paidAt) throw new InvalidInput("A paid line can't be released; un-mark it first");
  const isHost = caller.id === b.hostId || caller.role === "admin";
  if (p.reason === "withdrawn" ? cur.ownerId !== caller.id : !isHost) throw new NotAuthorized("You can't release that line");
  await tx.update(lines).set({ ownerId: null, claimedAt: null, sentAt: null, priceCents: null, claimBatchId: null }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = ${p.number}`);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: p.number, reason: p.reason } });
}

/** Caller must already hold the break row lock. */
export async function recomputeFill(tx: Tx, breakId: string, actorId?: string): Promise<boolean> {
  const [b] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
  const [r] = await tx.execute<{ unpaid: number; reserved: number }>(sql`
    select count(*) filter (where number <= ${b.lineCount} and paid_at is null)::int as unpaid,
           count(*) filter (where reserved_for_mini_id is not null and owner_id is null)::int as reserved
    from lines where break_id = ${breakId}`);
  const full = r.unpaid === 0 && r.reserved === 0;
  if (full && b.status === "open") {
    await tx.update(breaks).set({ status: "filled", filledAt: b.filledAt ?? new Date() }).where(sql`${breaks.id} = ${breakId}`);
    await appendEvent(tx, { breakId, actorId, type: "break.filled" });
    return true;
  }
  if (!full && b.status === "filled") {
    await tx.update(breaks).set({ status: "open" }).where(sql`${breaks.id} = ${breakId}`);
    await appendEvent(tx, { breakId, actorId, type: "break.unfilled" });
    return false;
  }
  return b.status === "filled";
}
```

- [ ] **Step 5: Implement `queries.ts`**

`src/domain/lines/queries.ts`:
```ts
import { sql, eq, desc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines, users, hostProfiles } from "@/db/schema";

/** Lines a user holds across breaks, grouped per break for /me with amount owed. */
export async function myLines(tx: Tx, userId: string) {
  const rows = await tx.select({
    breakId: breaks.id, title: breaks.title, status: breaks.status, hostHandle: users.handle, paymentHandles: hostProfiles.paymentHandles,
    paymentInstructions: breaks.paymentInstructions, paymentWindowHours: breaks.paymentWindowHours,
    number: lines.number, claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents,
  }).from(lines).innerJoin(breaks, eq(breaks.id, lines.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(eq(lines.ownerId, userId)).orderBy(desc(breaks.openedAt), lines.number);
  const byBreak = new Map<string, { breakId: string; title: string; status: string; hostHandle: string | null; paymentHandles: { venmo?: string; paypal?: string }; paymentInstructions: string; paymentWindowHours: number; lines: typeof rows; owedCents: number }>();
  for (const r of rows) {
    const g = byBreak.get(r.breakId) ?? { ...r, paymentHandles: r.paymentHandles ?? {}, lines: [], owedCents: 0 };
    g.lines.push(r);
    if (!r.paidAt) g.owedCents += r.priceCents ?? 0;
    byBreak.set(r.breakId, g);
  }
  return [...byBreak.values()];
}

/** Host view: unpaid lines grouped per buyer for one-tap Paid. */
export async function unpaidByBuyer(tx: Tx, breakId: string) {
  return tx.execute<{ owner_id: string; handle: string; numbers: number[]; sent: boolean; amount_cents: number; oldest_claim: Date }>(sql`
    select l.owner_id, u.handle, array_agg(l.number order by l.number) as numbers, bool_and(l.sent_at is not null) as sent,
           sum(l.price_cents)::int as amount_cents, min(l.claimed_at) as oldest_claim
    from lines l join users u on u.id = l.owner_id
    where l.break_id = ${breakId} and l.paid_at is null and l.owner_id is not null
    group by l.owner_id, u.handle order by min(l.claimed_at)`);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/lines`
Expected: PASS (15 tests)

- [ ] **Step 7: Commit**

```bash
git add src/domain/lines
git commit -m "feat(lines): claim, random, take-the-rest, sent, paid, release and fill recompute"
```

---

### Task 9: `draws` commands — request, finalise, result query

**Files:**
- Create: `src/domain/draws/commands.ts`, `src/domain/draws/queries.ts`, `src/domain/draws/commands.test.ts`

**Interfaces:**
- Consumes: `assertHostOf`, `lockBreak`, `appendEvent`, `decryptSecret`, `computeRanking`, `ALGORITHM_VERSION`, `roundAfter`, `BeaconSource`.
- Produces:
  - `requestDraw(tx, caller, { breakId, onBehalfNote? }): Promise<{ requestId; beaconRound }>` — host (or admin with a note); break must be `filled`; inserts `draw_requests` with `attempt` = count + 1 and `beacon_round = roundAfter(now, 60)`; sets status `drawing`; event `draw.requested`. Idempotent: if already `drawing`, returns the pending request.
  - `finaliseDraw(tx, caller, { breakId }, beacon: BeaconSource): Promise<{ drawId; ranking: number[] }>` — any participant, the host, admin, or `SYSTEM` (cron) may call; break must be `drawing`; throws `BeaconUnavailable` if `beacon.fetch(round)` is null; builds entries from owned lines; computes; inserts `draws`, marks request `done`, creates `awards` (per spec §9 prize assignment), deletes `break_secrets`, sets `drawn`; event `draw.drawn`. Idempotent: if already `drawn`, returns the existing draw.
  - `getDrawResult(tx, breakId): Promise<DrawResult | null>` — the active (non-voided) draw with entries, ranking, awards (winner handle, rank, item name), request info, voided chain.
  - `assignAwards(ranking, entries, prizes, onePrizePerPerson): { rank; winnerId; itemId | null }[]` pure helper (exported for tests).

- [ ] **Step 1: Write the failing tests**

`src/domain/draws/commands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { hexToBytes } from "@noble/hashes/utils";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, lineRows } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw, assignAwards } from "./commands";
import { getDrawResult } from "./queries";
import { FakeBeacon, type BeaconSource } from "@/crypto/beacon";
import { computeRanking, ALGORITHM_VERSION } from "@/crypto/draw";
import { breaks, breakSecrets, draws, awards, prizes, lines } from "@/db/schema";
import { BeaconUnavailable, NotFilled } from "@/domain/errors";
import { SYSTEM, type Caller } from "@/domain/types";
import { encryptSecret } from "@/crypto/secrets";
import { commitment } from "@/crypto/commit";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

/** Opens a 4-line break, two buyers, all paid → filled. Stores the fixture's secret so the test can recompute. */
async function filledBreak(tx: any) {
  const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const b2 = await makeUser(tx);
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
  await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
  await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
  await claimLines(tx, c(b2), { breakId: b.id, numbers: [3, 4], batchId: randomUUID() });
  for (const n of [1, 2]) await markPaid(tx, c(host, "host"), { breakId: b.id, number: n, expectedOwnerId: a.id });
  for (const n of [3, 4]) await markPaid(tx, c(host, "host"), { breakId: b.id, number: n, expectedOwnerId: b2.id });
  return { host, a, b2, b };
}

describe("requestDraw", () => {
  it("records a request, a beacon round ≥ 60s out, and moves to drawing; idempotent", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      const r1 = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawing");
      expect(r1.beaconRound).toBeGreaterThan(new FakeBeacon().roundAt(new Date()) + 19);
      const r2 = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      expect(r2.requestId).toBe(r1.requestId);
    });
  });
  it("refuses when not filled", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await expect(requestDraw(tx, c(host, "host"), { breakId: b.id })).rejects.toBeInstanceOf(NotFilled);
    });
  });
  it("freezes lines: un-mark paid is refused while drawing", async () => {
    await withTx(async (tx) => {
      const { host, b, a } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const { unmarkPaid } = await import("@/domain/lines/commands");
      await expect(unmarkPaid(tx, c(host, "host"), { breakId: b.id, number: 1 })).rejects.toThrow(/drawing/);
      void a;
    });
  });
});

describe("finaliseDraw", () => {
  it("produces the same ranking as the shared crypto module and creates awards", async () => {
    await withTx(async (tx) => {
      const { host, a, b2, b } = await filledBreak(tx);
      const { beaconRound } = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      const r = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon);
      const bv = await beacon.fetch(beaconRound);
      const expected = computeRanking({ version: ALGORITHM_VERSION, secret: b.secret, beacon: bv!.randomness, breakId: b.id,
        entries: [{ number: 1, ownerId: a.id }, { number: 2, ownerId: a.id }, { number: 3, ownerId: b2.id }, { number: 4, ownerId: b2.id }] });
      expect(r.ranking).toEqual(expected.ranking);
      const [d] = await tx.select().from(draws).where(sql`${draws.id} = ${r.drawId}`);
      expect(d.resultHash).toBe(expected.resultHash);
      expect(d.beaconRound).toBe(beaconRound);
      const aw = await tx.select().from(awards).where(sql`${awards.breakId} = ${b.id}`);
      expect(aw).toHaveLength(1); expect(aw[0].rank).toBe(1);
      const winnerLine = expected.ranking[0];
      expect(aw[0].winnerId).toBe(winnerLine <= 2 ? a.id : b2.id);
      expect(aw[0].pickedAt).not.toBeNull();
      expect(await tx.select().from(breakSecrets).where(sql`${breakSecrets.breakId} = ${b.id}`)).toHaveLength(0);
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawn");
    });
  });
  it("throws BeaconUnavailable when the beacon can't be fetched and leaves the break drawing", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const down: BeaconSource = { roundAt: (t) => new FakeBeacon().roundAt(t), fetch: async () => null };
      await expect(finaliseDraw(tx, SYSTEM, { breakId: b.id }, down)).rejects.toBeInstanceOf(BeaconUnavailable);
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawing");
    });
  });
  it("is idempotent once drawn", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const r1 = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      const r2 = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      expect(r2.drawId).toBe(r1.drawId);
    });
  });
  it("recomputes byte-identically after a crash mid-finalise (transaction rolled back)", async () => {
    // Run finalise in a nested savepoint that throws after the draws insert, then run it again for real.
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      let first: number[] | undefined;
      await expect(tx.transaction(async (sp) => {
        const r = await finaliseDraw(sp, SYSTEM, { breakId: b.id }, beacon);
        first = r.ranking;
        throw new Error("simulated crash after insert");
      })).rejects.toThrow(/simulated/);
      expect(await tx.select().from(draws).where(sql`${draws.breakId} = ${b.id}`)).toHaveLength(0);
      const again = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon);
      expect(again.ranking).toEqual(first);
    });
  });
  it("includes bonus lines in the entries and the result page data", async () => {
    await withTx(async (tx) => {
      const { host, b, a } = await filledBreak(tx);
      await tx.insert(lines).values({ breakId: b.id, number: 5, ownerId: a.id, claimedAt: new Date(), paidAt: new Date(), priceCents: 0, isBonus: true });
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      const res = (await getDrawResult(tx, b.id))!;
      expect(res.entries.map((e) => e.number)).toEqual([1, 2, 3, 4, 5]);
      expect(res.entries[4].isBonus).toBe(true);
      expect(res.ranking).toHaveLength(5);
    });
  });
});

describe("assignAwards", () => {
  const entries = [{ number: 1, ownerId: "A" }, { number: 2, ownerId: "A" }, { number: 3, ownerId: "B" }];
  const prizeRows = [{ rank: 1, itemId: "i1" }, { rank: 2, itemId: "i2" }];
  it("per-line by default: the same person can win twice", () => {
    expect(assignAwards([2, 1, 3], entries, prizeRows, false)).toEqual([{ rank: 1, winnerId: "A", itemId: "i1" }, { rank: 2, winnerId: "A", itemId: "i2" }]);
  });
  it("one prize per person skips to the next distinct winner", () => {
    expect(assignAwards([2, 1, 3], entries, prizeRows, true)).toEqual([{ rank: 1, winnerId: "A", itemId: "i1" }, { rank: 2, winnerId: "B", itemId: "i2" }]);
  });
  it("a choice set (several items at one rank) yields one award with itemId null", () => {
    expect(assignAwards([3, 1, 2], entries, [{ rank: 1, itemId: "x" }, { rank: 1, itemId: "y" }], false)).toEqual([{ rank: 1, winnerId: "B", itemId: null }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/draws`
Expected: FAIL with "Cannot find module './commands'"

- [ ] **Step 3: Implement `commands.ts`**

`src/domain/draws/commands.ts`:
```ts
import { sql, eq, asc } from "drizzle-orm";
import { bytesToHex } from "@noble/hashes/utils";
import type { Tx } from "@/db/client";
import { breaks, breakSecrets, lines, users, prizes, drawRequests, draws, awards } from "@/db/schema";
import { assertHostOf, lockBreak, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { AlreadyDrawn, BeaconUnavailable, InvalidInput, NotAuthorized, NotFilled, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { decryptSecret } from "@/crypto/secrets";
import { computeRanking, ALGORITHM_VERSION } from "@/crypto/draw";
import { roundAfter, type BeaconSource } from "@/crypto/beacon";

export const BEACON_DELAY_SECONDS = 60;

export async function requestDraw(tx: Tx, caller: Caller, p: { breakId: string; onBehalfNote?: string }): Promise<{ requestId: string; beaconRound: number }> {
  const b = await assertHostOf(tx, caller, p.breakId);
  if (caller.role === "admin" && caller.id !== b.hostId && !p.onBehalfNote) throw new InvalidInput("Admins must record the host's request");
  if (b.status === "drawing") {
    const [pending] = await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id} and ${drawRequests.status} = 'pending'`);
    return { requestId: pending.id, beaconRound: pending.beaconRound };
  }
  if (b.status === "drawn") throw new AlreadyDrawn();
  if (b.status !== "filled") throw new NotFilled();
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(drawRequests).where(eq(drawRequests.breakId, b.id));
  const requestedAt = new Date();
  const beaconRound = roundAfter(requestedAt, BEACON_DELAY_SECONDS);
  const [req] = await tx.insert(drawRequests).values({ breakId: b.id, attempt: n + 1, requestedBy: caller.id, requestedAt, beaconRound, onBehalfNote: p.onBehalfNote ?? null }).returning({ id: drawRequests.id });
  await tx.update(breaks).set({ status: "drawing" }).where(eq(breaks.id, b.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "draw.requested", payload: { attempt: n + 1, beaconRound } });
  return { requestId: req.id, beaconRound };
}

export type PrizeRef = { rank: number; itemId: string | null };
export function assignAwards(ranking: number[], entries: { number: number; ownerId: string }[], prizeRows: PrizeRef[], onePrizePerPerson: boolean): { rank: number; winnerId: string; itemId: string | null }[] {
  const ownerOf = new Map(entries.map((e) => [e.number, e.ownerId]));
  const ranks = [...new Set(prizeRows.map((p) => p.rank))].sort((a, b) => a - b);
  const out: { rank: number; winnerId: string; itemId: string | null }[] = [];
  const used = new Set<string>();
  let i = 0;
  for (const rank of ranks) {
    while (i < ranking.length && onePrizePerPerson && used.has(ownerOf.get(ranking[i])!)) i++;
    if (i >= ranking.length) break;
    const winnerId = ownerOf.get(ranking[i])!;
    const items = prizeRows.filter((p) => p.rank === rank);
    out.push({ rank, winnerId, itemId: items.length === 1 ? items[0].itemId : null });
    used.add(winnerId);
    i++;
  }
  return out;
}

export async function finaliseDraw(tx: Tx, caller: Caller, p: { breakId: string }, beacon: BeaconSource): Promise<{ drawId: string; ranking: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  if (b.status === "drawn") {
    const [d] = await tx.select().from(draws).where(sql`${draws.breakId} = ${b.id} and ${draws.voidedAt} is null`);
    return { drawId: d.id, ranking: d.ranking };
  }
  if (b.status !== "drawing") throw new NotOpen(b.status);
  const isParty = caller.id === b.hostId || caller.role === "admin";
  if (!isParty) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${caller.id}`);
    if (n === 0) throw new NotAuthorized("Only the host or a participant can finalise");
  }
  const [req] = await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id} and ${drawRequests.status} = 'pending'`);
  const bv = await beacon.fetch(req.beaconRound);
  if (!bv) throw new BeaconUnavailable();

  const entryRows = await tx.select({ number: lines.number, ownerId: lines.ownerId, handle: users.handle, isBonus: lines.isBonus })
    .from(lines).innerJoin(users, eq(users.id, lines.ownerId)).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is not null`).orderBy(asc(lines.number));
  const entries = entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId! }));
  const [sec] = await tx.select().from(breakSecrets).where(eq(breakSecrets.breakId, b.id));
  if (!sec) throw new InvalidInput("Draw secret unavailable; contact the admin");
  const secret = decryptSecret(sec.ciphertext, sec.keyId, b.id);
  const { seed, ranking, resultHash } = computeRanking({ version: ALGORITHM_VERSION, secret, beacon: bv.randomness, breakId: b.id, entries });

  const [d] = await tx.insert(draws).values({
    breakId: b.id, requestId: req.id, secret: Buffer.from(secret).toString("base64"), beaconRound: req.beaconRound,
    beaconRandomness: bytesToHex(bv.randomness), beaconSignature: bv.signature, seed: bytesToHex(seed), algorithmVersion: ALGORITHM_VERSION,
    entriesSnapshot: entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId!, handleAtDraw: e.handle ?? "", isBonus: e.isBonus })),
    ranking, resultHash, runBy: caller.id,
  }).returning({ id: draws.id });
  await tx.update(drawRequests).set({ status: "done" }).where(eq(drawRequests.id, req.id));
  const prizeRows = await tx.select({ rank: prizes.rank, itemId: prizes.itemId }).from(prizes).where(eq(prizes.breakId, b.id));
  const now = new Date();
  for (const a of assignAwards(ranking, entries, prizeRows, b.onePrizePerPerson)) {
    await tx.insert(awards).values({ drawId: d.id, breakId: b.id, rank: a.rank, winnerId: a.winnerId, itemId: a.itemId, pickedAt: now });
  }
  await tx.delete(breakSecrets).where(eq(breakSecrets.breakId, b.id));
  await tx.update(breaks).set({ status: "drawn" }).where(eq(breaks.id, b.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "draw.drawn", payload: { drawId: d.id, winnerLine: ranking[0] } });
  return { drawId: d.id, ranking };
}
```
Note for `unmarkPaid` (Task 8): its `NotOpen(b.status)` message reads "This break is drawing", which is what the request test asserts with `/drawing/`.

- [ ] **Step 4: Implement `queries.ts`**

`src/domain/draws/queries.ts`:
```ts
import { sql, eq, asc, desc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { draws, drawRequests, awards, users, breakItems, breaks } from "@/db/schema";

export type DrawResult = {
  draw: typeof draws.$inferSelect;
  request: typeof drawRequests.$inferSelect;
  entries: { number: number; ownerId: string; handleAtDraw: string; isBonus: boolean }[];
  ranking: number[];
  awards: { rank: number; winnerHandle: string | null; itemName: string | null }[];
  voided: { createdAt: Date; voidReason: string | null }[];
  breakTitle: string;
  seedCommitment: string | null;
};

export async function getDrawResult(tx: Tx, breakId: string): Promise<DrawResult | null> {
  const [d] = await tx.select().from(draws).where(sql`${draws.breakId} = ${breakId} and ${draws.voidedAt} is null`);
  if (!d) return null;
  const [req] = await tx.select().from(drawRequests).where(eq(drawRequests.id, d.requestId));
  const [b] = await tx.select({ title: breaks.title, seedCommitment: breaks.seedCommitment }).from(breaks).where(eq(breaks.id, breakId));
  const aw = await tx.select({ rank: awards.rank, winnerHandle: users.handle, itemName: breakItems.name })
    .from(awards).innerJoin(users, eq(users.id, awards.winnerId)).leftJoin(breakItems, eq(breakItems.id, awards.itemId))
    .where(eq(awards.drawId, d.id)).orderBy(asc(awards.rank));
  const voided = await tx.select({ createdAt: draws.createdAt, voidReason: draws.voidReason }).from(draws).where(sql`${draws.breakId} = ${breakId} and ${draws.voidedAt} is not null`).orderBy(desc(draws.createdAt));
  return { draw: d, request: req, entries: d.entriesSnapshot, ranking: d.ranking, awards: aw, voided, breakTitle: b.title, seedCommitment: b.seedCommitment };
}

export async function pendingRequestsReady(tx: Tx, currentRound: number) {
  return tx.select({ breakId: drawRequests.breakId }).from(drawRequests).where(sql`${drawRequests.status} = 'pending' and ${drawRequests.beaconRound} <= ${currentRound}`);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/draws`
Expected: PASS (10 tests). If the "freezes lines" test fails, check `unmarkPaid` throws `NotOpen` for `drawing` (it does: status is neither open nor filled).

- [ ] **Step 6: Commit**

```bash
git add src/domain/draws
git commit -m "feat(draws): host-requested beacon-mixed draw with immutable record and awards"
```

---

### Task 10: Concurrency suite (real commits, serial)

**Files:**
- Create: `vitest.concurrency.config.ts`, `tests/concurrency/setup.ts`, `tests/concurrency/claims.test.ts`, `tests/concurrency/draw.test.ts`

**Interfaces:**
- Consumes: all commands above via `db.transaction` (no rollback helper here).

- [ ] **Step 1: Write the config and setup**

`vitest.concurrency.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/concurrency/**/*.test.ts"], environment: "node", setupFiles: ["tests/helpers/setup.ts", "tests/concurrency/setup.ts"], fileParallelism: false, sequence: { concurrent: false } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`tests/concurrency/setup.ts`:
```ts
import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
beforeEach(async () => {
  await db.execute(sql`truncate awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, users restart identity cascade`);
});
```

- [ ] **Step 2: Write the failing tests**

`tests/concurrency/claims.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { makeUser, openBreakWithLines } from "../helpers/fixtures";
import { claimLines, claimRandom } from "@/domain/lines/commands";
import { lines } from "@/db/schema";
import type { Caller } from "@/domain/types";

const c = (id: string): Caller => ({ id, role: "member", onboarded: true, banned: false });

describe("concurrent claims", () => {
  it("ten buyers racing for the same 3 lines: each line ends with exactly one owner", async () => {
    const { host, b, buyers } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      const buyers = await Promise.all(Array.from({ length: 10 }, () => makeUser(tx)));
      return { host, b, buyers };
    });
    const results = await Promise.allSettled(buyers.map((u) => db.transaction((tx) => claimLines(tx, c(u.id), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() }))));
    const got = results.flatMap((r) => (r.status === "fulfilled" ? r.value.got : []));
    expect(got.sort()).toEqual([1, 2, 3]);
    const rows = await db.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} <= 3`);
    expect(rows.every((r) => r.ownerId !== null)).toBe(true);
    void host;
  });

  it("random claims never hand out the same line twice and never exceed the open count", async () => {
    const { b, buyers } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10 });
      const buyers = await Promise.all(Array.from({ length: 6 }, () => makeUser(tx)));
      return { b, buyers };
    });
    const results = await Promise.allSettled(buyers.map((u) => db.transaction((tx) => claimRandom(tx, c(u.id), { breakId: b.id, count: 2, batchId: randomUUID() }))));
    const got = results.flatMap((r) => (r.status === "fulfilled" ? r.value.got : []));
    expect(new Set(got).size).toBe(got.length);
    expect(got.length).toBeLessThanOrEqual(10);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(5); // 10 lines / 2 each
  });
});
```

`tests/concurrency/draw.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { makeUser, openBreakWithLines } from "../helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { FakeBeacon } from "@/crypto/beacon";
import { encryptSecret } from "@/crypto/secrets";
import { breakSecrets, draws } from "@/db/schema";
import { SYSTEM, type Caller } from "@/domain/types";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });

describe("concurrent draw", () => {
  it("two simultaneous finalise calls produce exactly one draw row", async () => {
    const { host, b } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
      await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
      await claimLines(tx, c(a.id), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
      await requestDraw(tx, c(host.id, "host"), { breakId: b.id });
      return { host, b };
    });
    const beacon = new FakeBeacon();
    const results = await Promise.allSettled([
      db.transaction((tx) => finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon)),
      db.transaction((tx) => finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon)),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const rows = await db.select().from(draws).where(sql`${draws.breakId} = ${b.id}`);
    expect(rows).toHaveLength(1);
    void host;
  });
});
```

- [ ] **Step 3: Run the suite**

Run: `pnpm test:concurrency`
Expected: PASS (3 tests). The second finalise waits on the row lock, then sees `status = drawn` and returns the existing draw.

- [ ] **Step 4: Commit**

```bash
git add vitest.concurrency.config.ts tests/concurrency
git commit -m "test: concurrency suite for racing claims and double finalise"
```

---

### Task 11: Auth — Supabase SSR client, session → Caller, magic link + OTP, onboarding gate

**Files:**
- Create: `src/auth/supabase.ts`, `src/auth/session.ts`, `src/auth/session.test.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/onboarding/page.tsx`, `src/app/onboarding/actions.ts`, `src/domain/users/commands.ts`, `src/domain/users/commands.test.ts`, `src/lib/action.ts`

**Interfaces:**
- Produces:
  - `createServerSupabase()` (cookie-bound anon client for auth only) and `supabaseAdmin()` (service-role client, server only).
  - `getCaller(): Promise<Caller | null>` — reads the Supabase session, upserts the `users` row on first sight (`handle = null`), returns `{ id, role, onboarded, banned }` where `onboarded = handle && displayName && ageConfirmedAt`.
  - `requireCaller(): Promise<Caller>` — redirects to `/login?next=` if none.
  - `completeOnboarding(tx, caller, { handle, displayName, ageConfirmed, acceptedTerms }): Promise<void>` with handle normalisation (NFKC, lowercase compare, `^[a-z0-9_]{3,20}$`, reserved list) → `InvalidInput("That handle is taken")` on `23505`.
  - `action(fn)` wrapper in `src/lib/action.ts`: runs `fn(tx, caller, input)` in `db.transaction`, maps `DomainError` to `{ ok: false, code, message }`, rethrows others after Sentry capture (Task 17 wires Sentry; until then `console.error`).
  - Middleware: refreshes the Supabase session cookie; redirects signed-in-but-not-onboarded users to `/onboarding` for every path except `/onboarding`, `/login`, `/auth/*`, `/b/*` (public), `/`.

- [ ] **Step 1: Configure Supabase Auth locally**

In `supabase/config.toml`: `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/auth/callback"]`, `[auth.email] enable_signup = true`, `double_confirm_changes = false`, `otp_length = 6`, `otp_expiry = 900`. Keep the local Inbucket mail viewer at `http://127.0.0.1:54324`. (Production: set custom SMTP to Resend in the Supabase dashboard, template includes both the link and `{{ .Token }}`.)

- [ ] **Step 2: Write the failing tests**

`src/domain/users/commands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { completeOnboarding, normalizeHandle } from "./commands";
import { users } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";

const caller = (id: string) => ({ id, role: "member" as const, onboarded: false, banned: false });

describe("normalizeHandle", () => {
  it("NFKC-normalises and lowercases, rejects bad shapes and reserved names", () => {
    expect(normalizeHandle("Ｊim_Roberts")).toBe("jim_roberts");
    expect(() => normalizeHandle("ab")).toThrow(InvalidInput);
    expect(() => normalizeHandle("has space")).toThrow(InvalidInput);
    expect(() => normalizeHandle("admin")).toThrow(InvalidInput);
  });
});

describe("completeOnboarding", () => {
  it("sets handle, display name, age confirmation", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null, displayName: null, ageConfirmedAt: null }).where(sql`${users.id} = ${u.id}`);
      await completeOnboarding(tx, caller(u.id), { handle: "Jim_R", displayName: "Jim Roberts", ageConfirmed: true, acceptedTerms: true });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row.handle).toBe("jim_r"); expect(row.displayName).toBe("Jim Roberts"); expect(row.ageConfirmedAt).not.toBeNull();
    });
  });
  it("requires the 18+ and terms checkboxes", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await expect(completeOnboarding(tx, caller(u.id), { handle: "abc", displayName: "A", ageConfirmed: false, acceptedTerms: true })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("reports a taken handle (case-insensitively)", async () => {
    await withTx(async (tx) => {
      await makeUser(tx, { handle: "taken1" });
      const u = await makeUser(tx);
      await tx.update(users).set({ handle: null }).where(sql`${users.id} = ${u.id}`);
      await expect(completeOnboarding(tx, caller(u.id), { handle: "TAKEN1", displayName: "x", ageConfirmed: true, acceptedTerms: true })).rejects.toThrow(/taken/);
    });
  });
});
```

`src/auth/session.test.ts` (pure part only — the Supabase call is wrapped so it can be stubbed):
```ts
import { describe, it, expect } from "vitest";
import { toCaller } from "./session";

describe("toCaller", () => {
  it("is onboarded only with handle, display name and age confirmation", () => {
    const base = { id: "u", role: "member", handle: "h", displayName: "d", ageConfirmedAt: new Date(), bannedAt: null };
    expect(toCaller(base as any).onboarded).toBe(true);
    expect(toCaller({ ...base, handle: null } as any).onboarded).toBe(false);
    expect(toCaller({ ...base, bannedAt: new Date() } as any).banned).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/users src/auth/session.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement users commands**

`src/domain/users/commands.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { appendEvent } from "@/domain/events";

const RESERVED = new Set(["admin", "administrator", "host", "support", "breaks", "system", "mod", "moderator", "staff", "help", "me"]);

export function normalizeHandle(raw: string): string {
  const h = raw.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new InvalidInput("Handle must be 3–20 letters, numbers or underscores");
  if (RESERVED.has(h)) throw new InvalidInput("That handle is reserved");
  return h;
}

export async function completeOnboarding(tx: Tx, caller: Caller, p: { handle: string; displayName: string; ageConfirmed: boolean; acceptedTerms: boolean }): Promise<void> {
  if (!p.ageConfirmed) throw new InvalidInput("You must confirm you are 18 or older");
  if (!p.acceptedTerms) throw new InvalidInput("You must accept the terms");
  const handle = normalizeHandle(p.handle);
  const displayName = p.displayName.normalize("NFKC").trim();
  if (displayName.length < 1 || displayName.length > 40) throw new InvalidInput("Display name must be 1–40 characters");
  try {
    await tx.update(users).set({ handle, displayName, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` }).where(sql`${users.id} = ${caller.id} and ${users.handle} is null`);
  } catch (e: any) {
    if (e?.code === "23505" || /users_handle_lower_idx/.test(String(e?.message))) throw new InvalidInput("That handle is taken");
    throw e;
  }
  await appendEvent(tx, { actorId: caller.id, type: "user.onboarded", payload: { handle } });
}
```

- [ ] **Step 5: Implement the Supabase clients, session and middleware**

`src/auth/supabase.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createServerSupabase() {
  const store = await cookies();
  return createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in RSC */ } },
    },
  });
}

export function supabaseAdmin() {
  return createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
```

`src/auth/session.ts`:
```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { createServerSupabase } from "./supabase";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Caller } from "@/domain/types";

type UserRow = Pick<typeof users.$inferSelect, "id" | "role" | "handle" | "displayName" | "ageConfirmedAt" | "bannedAt">;

export function toCaller(u: UserRow): Caller {
  return { id: u.id, role: u.role as Caller["role"], onboarded: !!(u.handle && u.displayName && u.ageConfirmedAt), banned: u.bannedAt !== null };
}

export const getCaller = cache(async (): Promise<Caller | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const [row] = await db.insert(users).values({ id: data.user.id, email })
    .onConflictDoUpdate({ target: users.id, set: { email, lastSeenAt: sql`now()` } })
    .returning({ id: users.id, role: users.role, handle: users.handle, displayName: users.displayName, ageConfirmedAt: users.ageConfirmedAt, bannedAt: users.bannedAt });
  return toCaller(row);
});

export async function requireCaller(next = "/"): Promise<Caller> {
  const c = await getCaller();
  if (!c) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!c.onboarded) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return c;
}
```

`src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = [/^\/$/, /^\/login/, /^\/auth\//, /^\/b\//, /^\/breaks/, /^\/h\//, /^\/legal/, /^\/api\//, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });
  const { data } = await supabase.auth.getUser(); // refreshes the cookie if needed
  const path = req.nextUrl.pathname;
  if (!data.user && !PUBLIC.some((re) => re.test(path))) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```
(Onboarding redirect is done in `requireCaller`, not middleware, because middleware can't query Postgres cheaply.)

`src/lib/action.ts`:
```ts
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { DomainError } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function action<T>(fn: (tx: Tx, caller: Caller) => Promise<T>): Promise<ActionResult<T>> {
  const caller = await getCaller();
  if (!caller) return { ok: false, code: "NOT_SIGNED_IN", message: "Sign in to continue" };
  try {
    const data = await db.transaction((tx) => fn(tx, caller));
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, code: e.code, message: e.message };
    console.error(e);
    return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 6: Login page, actions and callback**

`src/app/(auth)/login/actions.ts`:
```ts
"use server";
import { z } from "zod";
import { createServerSupabase } from "@/auth/supabase";
import { env } from "@/lib/env";

const emailSchema = z.object({ email: z.string().email(), next: z.string().startsWith("/").default("/") });
export async function sendMagicLink(_: unknown, form: FormData) {
  const parsed = emailSchema.safeParse({ email: form.get("email"), next: form.get("next") ?? "/" });
  if (!parsed.success) return { error: "Enter a valid email" };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(parsed.data.next)}` } });
  return error ? { error: error.message } : { sent: true, email: parsed.data.email };
}

const otpSchema = z.object({ email: z.string().email(), token: z.string().regex(/^\d{6}$/), next: z.string().startsWith("/").default("/") });
export async function verifyOtp(_: unknown, form: FormData) {
  const parsed = otpSchema.safeParse({ email: form.get("email"), token: form.get("token"), next: form.get("next") ?? "/" });
  if (!parsed.success) return { error: "Enter the 6-digit code" };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work" };
  return { redirect: parsed.data.next };
}
```

`src/app/(auth)/login/page.tsx`:
```tsx
"use client";
import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendMagicLink, verifyOtp } from "./actions";

export default function LoginPage() {
  const next = useSearchParams().get("next") ?? "/";
  const router = useRouter();
  const [sent, send, sending] = useActionState(sendMagicLink, null as any);
  const [verified, verify, verifying] = useActionState(verifyOtp, null as any);
  useEffect(() => { if (verified?.redirect) router.replace(verified.redirect); }, [verified, router]);

  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {!sent?.sent ? (
        <form action={send} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required placeholder="you@example.com" className="w-full rounded border p-3" />
          <button disabled={sending} className="w-full rounded bg-black p-3 text-white">Email me a sign-in link</button>
          {sent?.error && <p className="text-sm text-red-600">{sent.error}</p>}
        </form>
      ) : (
        <form action={verify} className="mt-4 space-y-3">
          <p className="text-sm">We sent a link and a 6-digit code to <b>{sent.email}</b>. Tap the link, or enter the code here.</p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <input name="token" inputMode="numeric" pattern="\d{6}" required placeholder="123456" className="w-full rounded border p-3 text-center text-2xl tracking-widest" />
          <button disabled={verifying} className="w-full rounded bg-black p-3 text-white">Continue</button>
          {verified?.error && <p className="text-sm text-red-600">{verified.error}</p>}
        </form>
      )}
    </main>
  );
}
```

`src/app/auth/callback/route.ts` (PKCE exchange, then a confirmation page is unnecessary because `@supabase/ssr` PKCE links are only redeemable from the originating browser; scanners that prefetch get an error, and the OTP path covers them):
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/auth/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", req.url));
}
```

- [ ] **Step 7: Onboarding page and action**

`src/app/onboarding/actions.ts`:
```ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { completeOnboarding } from "@/domain/users/commands";

const schema = z.object({ handle: z.string(), displayName: z.string(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional(), next: z.string().startsWith("/").default("/") });

export async function finishOnboarding(_: unknown, form: FormData) {
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Please fill in every field" };
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName: p.data.displayName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on" }));
  if (!r.ok) return { error: r.message };
  redirect(p.data.next);
}
```

`src/app/onboarding/page.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { finishOnboarding } from "./actions";

export default function OnboardingPage() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, submit, pending] = useActionState(finishOnboarding, null as any);
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold">Set up your account</h1>
      <form action={submit} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">Handle<input name="handle" required pattern="[A-Za-z0-9_]{3,20}" className="mt-1 w-full rounded border p-3" placeholder="jim_r" /></label>
        <label className="block text-sm">Name people know you by<input name="displayName" required maxLength={40} className="mt-1 w-full rounded border p-3" placeholder="Jim Roberts" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ageConfirmed" required /> I am 18 or older</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acceptedTerms" required /> I accept the <a className="underline" href="/legal/terms">terms</a></label>
        <button disabled={pending} className="w-full rounded bg-black p-3 text-white">Continue</button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </main>
  );
}
```
Create `src/app/legal/terms/page.tsx` with a placeholder heading "Terms of service" and one paragraph stating: hosts are solely responsible for their breaks; payment happens outside the platform at your own risk; the platform records ledger and draw results permanently; 18+ only. The lawyer-reviewed text (spec §16) replaces this before public launch; the page must exist so the link resolves.

- [ ] **Step 8: Run the tests and try the flow**

Run: `pnpm vitest run src/domain/users src/auth/session.test.ts` → PASS (5 tests).
Run `pnpm dev`, open `/login`, enter an email, open Inbucket at `http://127.0.0.1:54324`, use the code → lands on `/onboarding` → complete → lands on `/`.

- [ ] **Step 9: Commit**

```bash
git add src/auth src/middleware.ts src/lib/action.ts src/domain/users "src/app/(auth)" src/app/auth src/app/onboarding src/app/legal supabase/config.toml
git commit -m "feat(auth): magic link with otp fallback, session caller and onboarding gate"
```

---

### Task 12: Host composer — `/host/new` creates and opens a break

**Files:**
- Create: `src/app/host/new/page.tsx`, `src/app/host/new/actions.ts`, `src/app/host/page.tsx`

**Interfaces:**
- Consumes: `createDraft`, `openBreak`, `action`, `requireCaller`.
- Produces: server action `createAndOpen(form)` → redirects to `/b/{id}`; `/host` lists the host's breaks by status with links.

- [ ] **Step 1: Write the action**

`src/app/host/new/actions.ts`:
```ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { createDraft, openBreak } from "@/domain/breaks/commands";

const schema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  lineCount: z.coerce.number().int().min(2).max(1000),
  linePrice: z.coerce.number().positive(), // dollars
  paymentWindowHours: z.coerce.number().int().min(1).max(336).default(24),
  maxLinesPerUser: z.coerce.number().int().min(1).optional(),
  allowRandomClaims: z.literal("on").optional(),
  paymentInstructions: z.string().max(500).default(""),
  items: z.string().min(1), // one item name per line
  openNow: z.literal("on").optional(),
});

export async function createAndOpen(_: unknown, form: FormData) {
  const raw = Object.fromEntries(form); if (raw.maxLinesPerUser === "") delete raw.maxLinesPerUser;
  const p = schema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0].message };
  const items = p.data.items.split("\n").map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  const r = await action(async (tx, caller) => {
    const { breakId } = await createDraft(tx, caller, {
      title: p.data.title, description: p.data.description, lineCount: p.data.lineCount, linePriceCents: Math.round(p.data.linePrice * 100),
      paymentWindowHours: p.data.paymentWindowHours, maxLinesPerUser: p.data.maxLinesPerUser ?? null, allowRandomClaims: p.data.allowRandomClaims === "on",
      paymentInstructions: p.data.paymentInstructions, items,
    });
    if (p.data.openNow === "on") await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message };
  redirect(`/b/${r.data}`);
}
```

- [ ] **Step 2: Write the page**

`src/app/host/new/page.tsx`:
```tsx
import { requireCaller } from "@/auth/session";
import { ComposerForm } from "./form";

export default async function NewBreakPage() {
  const caller = await requireCaller("/host/new");
  if (caller.role !== "host" && caller.role !== "admin") return <main className="p-4">Only hosts can list a break.</main>;
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">New break</h1>
      <ComposerForm />
    </main>
  );
}
```

`src/app/host/new/form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { createAndOpen } from "./actions";

export function ComposerForm() {
  const [state, submit, pending] = useActionState(createAndOpen, null as any);
  const field = "mt-1 w-full rounded border p-3";
  return (
    <form action={submit} className="mt-4 space-y-3">
      <label className="block text-sm">Title<input name="title" required className={field} placeholder="Target Phil Taylor Chronos" /></label>
      <label className="block text-sm">Items (one per line; several = winner picks one)<textarea name="items" required rows={3} className={field} placeholder={"Chronos 22g steel\nChronos 18g soft"} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Lines<input name="lineCount" type="number" min={2} required defaultValue={12} className={field} /></label>
        <label className="block text-sm">$ per line<input name="linePrice" type="number" min={1} step="0.01" required defaultValue={20} className={field} /></label>
      </div>
      <label className="block text-sm">Payment instructions<textarea name="paymentInstructions" rows={2} className={field} placeholder={"Venmo @Jim-Roberts-36\nNo notes on payments"} /></label>
      <label className="block text-sm">Hours to pay after claiming<input name="paymentWindowHours" type="number" min={1} defaultValue={24} className={field} /></label>
      <label className="block text-sm">Max lines per person (blank = no limit)<input name="maxLinesPerUser" type="number" min={1} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowRandomClaims" defaultChecked /> Allow "give me N random lines"</label>
      <label className="block text-sm">Description<textarea name="description" rows={3} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="openNow" defaultChecked /> Open for claims now</label>
      <button disabled={pending} className="w-full rounded bg-black p-3 text-white">{pending ? "Saving…" : "Post break"}</button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

`src/app/host/page.tsx`:
```tsx
import Link from "next/link";
import { sql, eq, desc } from "drizzle-orm";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { breaks } from "@/db/schema";

export default async function HostHome() {
  const caller = await requireCaller("/host");
  const rows = await db.select({ id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})` })
    .from(breaks).where(eq(breaks.hostId, caller.id)).orderBy(desc(breaks.createdAt));
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">My breaks</h1><Link href="/host/new" className="rounded bg-black px-3 py-2 text-sm text-white">New break</Link></div>
      <ul className="mt-4 divide-y">
        {rows.map((b) => (
          <li key={b.id} className="py-3"><Link href={`/b/${b.id}`} className="block"><div className="font-medium">{b.title}</div><div className="text-sm text-neutral-600">{b.status} · {b.paid}/{b.lineCount} paid</div></Link></li>
        ))}
        {rows.length === 0 && <li className="py-3 text-sm text-neutral-600">No breaks yet.</li>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

Promote your local user to host: `psql $DATABASE_URL -c "update users set role='host' where email='<you>'"` (the admin invite flow is Plan 4). Open `/host/new`, post a break with two items, land on `/b/{id}` (404 until Task 13 — confirm the row exists in `/host`).

- [ ] **Step 4: Commit**

```bash
git add src/app/host
git commit -m "feat(host): break composer and host break list"
```

---

### Task 13: Break page — public grid, claim / random / take-the-rest, Sent, host per-buyer Paid

**Files:**
- Create: `src/app/b/[id]/page.tsx`, `src/app/b/[id]/actions.ts`, `src/app/b/[id]/grid.tsx`, `src/app/b/[id]/claim-panel.tsx`, `src/app/b/[id]/host-panel.tsx`, `src/lib/money.ts`, `src/lib/money.test.ts`, `src/lib/pay-links.ts`, `src/lib/pay-links.test.ts`

**Interfaces:**
- Consumes: `getBreakPage`, `unpaidByBuyer`, `claimLines`, `claimRandom`, `claimAllOpen`, `markSent`, `markPaid`, `releaseLine`, `isOverdue`, `action`, `getCaller`.
- Produces: server actions `claim(breakId, numbers, batchId)`, `claimRandomAction(breakId, count, batchId)`, `claimRest(breakId, batchId)`, `sent(breakId, numbers)`, `paidForBuyer(breakId, ownerId, numbers[])`, `release(breakId, number, reason)`; helpers `formatCents(n): string` ("$20.00") and `payLinks(handles, amountCents): { venmo?: string; paypal?: string }`.

- [ ] **Step 1: Write the failing helper tests**

`src/lib/money.test.ts`:
```ts
import { it, expect } from "vitest";
import { formatCents } from "./money";
it("formats cents as dollars", () => { expect(formatCents(2000)).toBe("$20.00"); expect(formatCents(250)).toBe("$2.50"); expect(formatCents(0)).toBe("$0.00"); });
```

`src/lib/pay-links.test.ts`:
```ts
import { it, expect } from "vitest";
import { payLinks } from "./pay-links";
it("builds venmo and paypal deep links with the amount and an empty note", () => {
  expect(payLinks({ venmo: "@Jim-Roberts-36", paypal: "JamesRoberts603182" }, 4000)).toEqual({
    venmo: "venmo://paycharge?txn=pay&recipients=Jim-Roberts-36&amount=40.00&note=",
    paypal: "https://paypal.me/JamesRoberts603182/40.00",
  });
});
it("omits links for missing handles", () => { expect(payLinks({}, 100)).toEqual({}); });
```

- [ ] **Step 2: Implement the helpers**

`src/lib/money.ts`:
```ts
export const formatCents = (n: number) => `$${(n / 100).toFixed(2)}`;
```
`src/lib/pay-links.ts`:
```ts
export function payLinks(h: { venmo?: string; paypal?: string }, amountCents: number) {
  const amount = (amountCents / 100).toFixed(2);
  const out: { venmo?: string; paypal?: string } = {};
  if (h.venmo) out.venmo = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(h.venmo.replace(/^@/, ""))}&amount=${amount}&note=`;
  if (h.paypal) out.paypal = `https://paypal.me/${encodeURIComponent(h.paypal.replace(/^@/, ""))}/${amount}`;
  return out;
}
```
Run: `pnpm vitest run src/lib` → PASS.

- [ ] **Step 3: Write the server actions**

`src/app/b/[id]/actions.ts`:
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { action } from "@/lib/action";
import { claimLines, claimRandom, claimAllOpen, markSent, markPaid, releaseLine } from "@/domain/lines/commands";

const uuid = z.string().uuid();
const nums = z.array(z.number().int().min(1).max(1100)).min(1).max(200);

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : undefined;
}
const done = (breakId: string) => revalidatePath(`/b/${breakId}`);

export async function claim(breakId: string, numbers: number[], batchId: string) {
  const p = z.object({ breakId: uuid, numbers: nums, batchId: uuid }).parse({ breakId, numbers, batchId });
  const r = await action((tx, c) => claimLines(tx, c, { ...p, ipHash: undefined }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRandomAction(breakId: string, count: number, batchId: string) {
  const p = z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }).parse({ breakId, count, batchId });
  const hash = await ipHash();
  const r = await action((tx, c) => claimRandom(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRest(breakId: string, batchId: string) {
  const p = z.object({ breakId: uuid, batchId: uuid }).parse({ breakId, batchId });
  const hash = await ipHash();
  const r = await action((tx, c) => claimAllOpen(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function sent(breakId: string, numbers: number[]) {
  const p = z.object({ breakId: uuid, numbers: nums }).parse({ breakId, numbers });
  const r = await action((tx, c) => markSent(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
export async function paidForBuyer(breakId: string, ownerId: string, numbers: number[]) {
  const p = z.object({ breakId: uuid, ownerId: uuid, numbers: nums }).parse({ breakId, ownerId, numbers });
  const r = await action(async (tx, c) => {
    let filled = false;
    for (const number of p.numbers) filled = (await markPaid(tx, c, { breakId: p.breakId, number, expectedOwnerId: p.ownerId })).filled;
    return { filled };
  });
  if (r.ok) done(breakId);
  return r;
}
export async function release(breakId: string, number: number, reason: "overdue" | "host_dropped" | "withdrawn") {
  const p = z.object({ breakId: uuid, number: z.number().int().min(1), reason: z.enum(["overdue", "host_dropped", "withdrawn"]) }).parse({ breakId, number, reason });
  const r = await action((tx, c) => releaseLine(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
```
(The `claim` action deliberately passes `ipHash: undefined` for the pick path and hashes for random/rest, matching spec §7 "IP hash on claim events" — change `claim` to hash too if you prefer; keep it consistent in Plan 4's admin alerts.)

- [ ] **Step 4: Write the page**

`src/app/b/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { unpaidByBuyer } from "@/domain/lines/queries";
import { getCaller } from "@/auth/session";
import { formatCents } from "@/lib/money";
import { Grid } from "./grid";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

export default async function BreakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const caller = await getCaller();
  const isHost = !!caller && (caller.id === page.host.id || caller.role === "admin");
  const participant = !!caller && page.lines.some((l) => l.ownerId === caller.id);
  const numbered = page.lines.filter((l) => l.number <= page.break.lineCount);
  const open = numbered.filter((l) => !l.ownerId && !l.reservedForMiniId).length;
  const paid = numbered.filter((l) => l.paidAt).length;
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const unpaid = isHost ? await db.transaction((tx) => unpaidByBuyer(tx, id)) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{page.break.title}</h1>
      <p className="text-sm text-neutral-600">{open} of {page.break.lineCount} open · {formatCents(page.break.linePriceCents)}/line · {paid} paid</p>
      <p className="text-sm">Host: <Link href={`/h/${page.host.handle}`} className="underline">{page.host.displayName ?? page.host.handle}</Link></p>
      <ul className="mt-2 text-sm">{page.items.map((i) => <li key={i.id}>• {i.name}</li>)}</ul>
      {page.items.length > 1 && <p className="text-xs text-neutral-600">Winner picks one.</p>}
      {page.break.status === "drawn" && <Link href={`/b/${id}/result`} className="mt-3 block rounded bg-green-700 p-3 text-center text-white">See the result</Link>}
      {page.break.status === "drawing" && <p className="mt-3 rounded bg-amber-100 p-3 text-sm">Draw requested — waiting for the public beacon.</p>}

      <Grid lines={page.lines} lineCount={page.break.lineCount} viewerId={caller?.id ?? null} showHandles={isHost || participant} paymentWindowHours={page.break.paymentWindowHours} />

      {caller && page.break.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={numbered.filter((l) => !l.ownerId && !l.reservedForMiniId).map((l) => l.number)} allowRandom={page.break.allowRandomClaims}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={page.break.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={page.break.paymentInstructions} />
      )}
      {!caller && page.break.status === "open" && <Link href={`/login?next=/b/${id}`} className="mt-4 block rounded bg-black p-3 text-center text-white">Sign in to claim lines</Link>}
      {isHost && <HostPanel breakId={id} status={page.break.status} unpaid={unpaid.map((u) => ({ ownerId: u.owner_id, handle: u.handle, numbers: u.numbers, sent: u.sent, amountCents: u.amount_cents }))} />}
      {page.break.seedCommitment && <p className="mt-6 text-xs text-neutral-500">Draw locked before opening: <code>{page.break.seedCommitment.slice(0, 16)}…</code></p>}
    </main>
  );
}
```

`src/app/b/[id]/grid.tsx`:
```tsx
"use client";
import { isOverdue } from "@/domain/lines/rules";

type L = { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; reservedForMiniId: string | null; isBonus: boolean };

export function Grid({ lines, lineCount, viewerId, showHandles, paymentWindowHours }: { lines: L[]; lineCount: number; viewerId: string | null; showHandles: boolean; paymentWindowHours: number }) {
  const cls = (l: L) => {
    if (l.reservedForMiniId) return "bg-purple-100 text-purple-800";
    if (!l.ownerId) return "bg-white border";
    if (l.paidAt) return "bg-green-200";
    if (isOverdue(l, { paymentWindowHours })) return "bg-red-200";
    if (l.sentAt) return "bg-blue-100";
    return "bg-amber-100";
  };
  const label = (l: L) => (!l.ownerId ? "open" : showHandles ? l.ownerHandle ?? "?" : "taken");
  const cols = lineCount > 30 ? "grid-cols-6" : "grid-cols-4";
  return (
    <div className={`mt-4 grid ${cols} gap-2`}>
      {lines.map((l) => (
        <div key={l.number} className={`rounded p-2 text-center text-xs ${cls(l)} ${l.ownerId === viewerId ? "ring-2 ring-black" : ""}`}>
          <div className="text-base font-semibold">{l.number}{l.isBonus ? "★" : ""}</div>
          <div className="truncate">{label(l)}</div>
        </div>
      ))}
    </div>
  );
}
```

`src/app/b/[id]/claim-panel.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { claim, claimRandomAction, claimRest, sent } from "./actions";
import { formatCents } from "@/lib/money";
import { payLinks } from "@/lib/pay-links";

type Mine = { number: number; sentAt: Date | null; paidAt: Date | null };
export function ClaimPanel(p: { breakId: string; openNumbers: number[]; allowRandom: boolean; mine: Mine[]; priceCents: number; paymentHandles: { venmo?: string; paypal?: string }; paymentInstructions: string }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [count, setCount] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const unpaidMine = p.mine.filter((m) => !m.paidAt);
  const unsentMine = unpaidMine.filter((m) => !m.sentAt);
  const owed = unpaidMine.length * p.priceCents;
  const links = payLinks(p.paymentHandles, owed);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; data?: any }>) => start(async () => {
    const r = await fn();
    if (r.ok) { const d = r.data; setMsg(d?.taken?.length ? `Got ${d.got.join(", ")}; ${d.taken.join(", ")} already taken` : "Done"); setPicked([]); setBatchId(crypto.randomUUID()); }
    else setMsg(r.message ?? "Failed");
  });
  const toggle = (n: number) => setPicked((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  return (
    <section className="mt-4 space-y-3 rounded border p-3">
      <h2 className="font-medium">Claim lines</h2>
      <div className="flex flex-wrap gap-1">{p.openNumbers.map((n) => <button key={n} onClick={() => toggle(n)} className={`rounded border px-2 py-1 text-sm ${picked.includes(n) ? "bg-black text-white" : ""}`}>{n}</button>)}</div>
      <div className="flex gap-2">
        <button disabled={pending || picked.length === 0} onClick={() => run(() => claim(p.breakId, picked, batchId))} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40">Claim {picked.length || ""}</button>
        {p.allowRandom && <>
          <input type="number" min={1} value={count} onChange={(e) => setCount(+e.target.value)} className="w-16 rounded border p-1 text-sm" />
          <button disabled={pending} onClick={() => run(() => claimRandomAction(p.breakId, count, batchId))} className="rounded border px-3 py-2 text-sm">Random</button>
        </>}
        <button disabled={pending || p.openNumbers.length === 0} onClick={() => run(() => claimRest(p.breakId, batchId))} className="rounded border px-3 py-2 text-sm">Take the rest</button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {unpaidMine.length > 0 && (
        <div className="rounded bg-neutral-50 p-3 text-sm">
          <p>You owe <b>{formatCents(owed)}</b> for lines {unpaidMine.map((m) => m.number).join(", ")}.</p>
          <p className="whitespace-pre-line text-neutral-700">{p.paymentInstructions}</p>
          <p className="text-xs text-neutral-600">Leave the payment note blank.</p>
          <div className="mt-2 flex gap-2">
            {links.venmo && <a href={links.venmo} className="rounded bg-blue-600 px-3 py-2 text-white">Open Venmo</a>}
            {links.paypal && <a href={links.paypal} target="_blank" rel="noreferrer" className="rounded bg-yellow-500 px-3 py-2">Open PayPal</a>}
            {p.paymentHandles.venmo && <button onClick={() => navigator.clipboard.writeText(p.paymentHandles.venmo!)} className="rounded border px-3 py-2">Copy handle</button>}
          </div>
          {unsentMine.length > 0 && <button disabled={pending} onClick={() => run(() => sent(p.breakId, unsentMine.map((m) => m.number)))} className="mt-2 w-full rounded bg-green-700 p-2 text-white">I've sent payment</button>}
        </div>
      )}
    </section>
  );
}
```

`src/app/b/[id]/host-panel.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { paidForBuyer, release } from "./actions";
import { formatCents } from "@/lib/money";
import { requestDrawAction, finaliseDrawAction } from "./draw-actions";

type U = { ownerId: string; handle: string; numbers: number[]; sent: boolean; amountCents: number };
export function HostPanel({ breakId, status, unpaid }: { breakId: string; status: string; unpaid: U[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message ?? "Failed"); });
  return (
    <section className="mt-4 space-y-2 rounded border border-black p-3">
      <h2 className="font-medium">Host</h2>
      {status === "open" && unpaid.length === 0 && <p className="text-sm text-neutral-600">No unpaid claims.</p>}
      {unpaid.map((u) => (
        <div key={u.ownerId} className="flex items-center justify-between rounded bg-neutral-50 p-2 text-sm">
          <div><b>{u.handle}</b> · lines {u.numbers.join(", ")} · {formatCents(u.amountCents)} {u.sent && <span className="text-blue-700">· sent</span>}</div>
          <div className="flex gap-1">
            <button disabled={pending} onClick={() => run(() => paidForBuyer(breakId, u.ownerId, u.numbers))} className="rounded bg-green-700 px-2 py-1 text-white">Paid</button>
            <button disabled={pending} onClick={() => run(async () => { for (const n of u.numbers) { const r = await release(breakId, n, "host_dropped"); if (!r.ok) return r; } return { ok: true }; })} className="rounded border px-2 py-1">Release</button>
          </div>
        </div>
      ))}
      {status === "filled" && <button disabled={pending} onClick={() => run(() => requestDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Run draw</button>}
      {status === "drawing" && <button disabled={pending} onClick={() => run(() => finaliseDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Finish draw (beacon ready?)</button>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </section>
  );
}
```
(`draw-actions.ts` is written in Task 14; create it with the two exports before building, or stub them as `async () => ({ ok: false, message: "not yet" })` to type-check this task.)

- [ ] **Step 5: Verify manually**

`pnpm dev`: as a host open a break; in a second browser (another email) sign in, claim lines by tapping, use Random and Take the rest, tap "I've sent payment"; as host tap Paid per buyer and watch the header count reach "12 paid" and the "Run draw" button appear. Check events in the DB: `select type, payload from events order by created_at`.

- [ ] **Step 6: Commit**

```bash
git add src/app/b src/lib/money.ts src/lib/money.test.ts src/lib/pay-links.ts src/lib/pay-links.test.ts
git commit -m "feat(break-page): public grid, claims, sent and host paid flow"
```

---

### Task 14: Run draw, result page and in-browser verifier

**Files:**
- Create: `src/app/b/[id]/draw-actions.ts`, `src/app/b/[id]/result/page.tsx`, `src/app/b/[id]/result/verify.tsx`, `src/app/b/[id]/result/reveal.tsx`, `scripts/verify-draw.ts`

**Interfaces:**
- Consumes: `requestDraw`, `finaliseDraw`, `getDrawResult`, `computeRanking`, `commitment`, `DrandBeacon`, `QUICKNET`.
- Produces: server actions `requestDrawAction(breakId)`, `finaliseDrawAction(breakId)`; page `/b/{id}/result`; `scripts/verify-draw.ts <result-json-url>` which prints `OK` or `MISMATCH`.

- [ ] **Step 1: Server actions**

`src/app/b/[id]/draw-actions.ts`:
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { DrandBeacon } from "@/crypto/beacon";

export async function requestDrawAction(breakId: string) {
  const id = z.string().uuid().parse(breakId);
  const r = await action((tx, c) => requestDraw(tx, c, { breakId: id }));
  if (r.ok) revalidatePath(`/b/${id}`);
  return r;
}
export async function finaliseDrawAction(breakId: string) {
  const id = z.string().uuid().parse(breakId);
  const r = await action((tx, c) => finaliseDraw(tx, c, { breakId: id }, new DrandBeacon()));
  if (r.ok) { revalidatePath(`/b/${id}`); revalidatePath(`/b/${id}/result`); }
  return r;
}
```

- [ ] **Step 2: Result page (server-rendered data, client reveal + verifier)**

`src/app/b/[id]/result/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
import { Reveal } from "./reveal";
import { Verify } from "./verify";
import { QUICKNET } from "@/crypto/beacon";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) notFound();
  const handleOf = new Map(res.entries.map((e) => [e.number, e.handleAtDraw]));
  const publicInputs = { breakId: id, version: res.draw.algorithmVersion, secret: res.draw.secret, beaconRound: res.draw.beaconRound, beaconRandomness: res.draw.beaconRandomness,
    entries: res.entries.map((e) => ({ number: e.number, ownerId: e.ownerId })), ranking: res.ranking, resultHash: res.draw.resultHash, seedCommitment: res.seedCommitment };
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{res.breakTitle} — result</h1>
      <Reveal ranking={res.ranking} handleOf={Object.fromEntries(handleOf)} awards={res.awards} />
      <p className="mt-2 text-xs text-neutral-600">Drawn {res.draw.createdAt.toLocaleString()} · requested by the host{res.request.onBehalfNote ? ` (run by admin: ${res.request.onBehalfNote})` : ""}</p>
      <Verify inputs={publicInputs} />
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer">Entries</summary>
        <ol className="mt-2 list-decimal pl-5">{res.entries.map((e) => <li key={e.number}>Line {e.number}: {e.handleAtDraw}{e.isBonus ? " (bonus)" : ""}</li>)}</ol>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer">Technical details</summary>
        <dl className="mt-2 space-y-1 break-all">
          <dt>Commitment (shown before the break opened)</dt><dd><code>{res.seedCommitment}</code></dd>
          <dt>Revealed secret (base64)</dt><dd><code>{res.draw.secret}</code></dd>
          <dt>Beacon</dt><dd>drand quicknet round {res.draw.beaconRound} — <a className="underline" href={`${QUICKNET.relays[0]}/${QUICKNET.chainHash}/public/${res.draw.beaconRound}`} target="_blank" rel="noreferrer">view on a public relay</a><br /><code>{res.draw.beaconRandomness}</code></dd>
          <dt>Seed</dt><dd><code>{res.draw.seed}</code></dd>
          <dt>Result hash</dt><dd><code>{res.draw.resultHash}</code></dd>
          <dt>Algorithm</dt><dd>breaks-seed-v{res.draw.algorithmVersion}: HMAC-SHA256 stream, Fisher–Yates with rejection sampling. <Link className="underline" href="/legal/draw">How it works</Link></dd>
        </dl>
        <p className="mt-2">Machine-readable: <a className="underline" href={`/b/${id}/result.json`}>result.json</a></p>
      </details>
      {res.voided.length > 0 && <p className="mt-4 text-xs text-amber-700">{res.voided.length} earlier draw(s) voided by admin — see technical details on each.</p>}
    </main>
  );
}
```

`src/app/b/[id]/result.json/route.ts` (public inputs for the script):
```ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ breakId: id, version: res.draw.algorithmVersion, secret: res.draw.secret, beaconRound: res.draw.beaconRound, beaconRandomness: res.draw.beaconRandomness,
    entries: res.entries.map((e) => ({ number: e.number, ownerId: e.ownerId })), ranking: res.ranking, resultHash: res.draw.resultHash, seedCommitment: res.seedCommitment });
}
```

`src/app/b/[id]/result/reveal.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
export function Reveal({ ranking, handleOf, awards }: { ranking: number[]; handleOf: Record<number, string>; awards: { rank: number; winnerHandle: string | null; itemName: string | null }[] }) {
  const [shown, setShown] = useState(0); // reveal worst → best
  useEffect(() => { if (shown < ranking.length) { const t = setTimeout(() => setShown(shown + 1), Math.max(60, 1500 / ranking.length)); return () => clearTimeout(t); } }, [shown, ranking.length]);
  const done = shown >= ranking.length;
  return (
    <div className="mt-3">
      {done && <div className="rounded bg-green-700 p-4 text-white"><div className="text-sm">Winner</div><div className="text-2xl font-bold">{handleOf[ranking[0]]} — line {ranking[0]}</div>
        {awards.filter((a) => a.rank > 1).map((a) => <div key={a.rank} className="text-sm">#{a.rank}: {a.winnerHandle}{a.itemName ? ` — ${a.itemName}` : ""}</div>)}</div>}
      <ol className="mt-2 text-sm" reversed>
        {ranking.slice(ranking.length - shown).reverse().map((n, i) => <li key={n} value={ranking.length - shown + 1 + i}>Line {n} · {handleOf[n]}</li>)}
      </ol>
      {!done && <button onClick={() => setShown(ranking.length)} className="mt-2 text-xs underline">Skip</button>}
    </div>
  );
}
```

`src/app/b/[id]/result/verify.tsx`:
```tsx
"use client";
import { useState } from "react";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { computeRanking } from "@/crypto/draw";
import { commitment } from "@/crypto/commit";

export type PublicInputs = { breakId: string; version: number; secret: string; beaconRound: number; beaconRandomness: string; entries: { number: number; ownerId: string }[]; ranking: number[]; resultHash: string; seedCommitment: string | null };

function b64ToBytes(s: string) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export function verifyInputs(i: PublicInputs): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const secret = b64ToBytes(i.secret);
  if (commitment(secret) !== i.seedCommitment) reasons.push("secret does not match the commitment shown before opening");
  const r = computeRanking({ version: i.version, secret, beacon: hexToBytes(i.beaconRandomness), breakId: i.breakId, entries: i.entries });
  if (JSON.stringify(r.ranking) !== JSON.stringify(i.ranking)) reasons.push("ranking does not match the recomputation");
  if (r.resultHash !== i.resultHash) reasons.push("result hash differs");
  void bytesToHex;
  return { ok: reasons.length === 0, reasons };
}

export function Verify({ inputs }: { inputs: PublicInputs }) {
  const [state, setState] = useState<null | { ok: boolean; reasons: string[] }>(null);
  return (
    <div className="mt-3 rounded border p-3 text-sm">
      <div>🔒 Locked before opening · {state ? (state.ok ? "Checked ✓" : "Check failed") : "not checked yet"}</div>
      <button onClick={() => setState(verifyInputs(inputs))} className="mt-2 rounded border px-3 py-1">Check it yourself</button>
      {state && !state.ok && <ul className="mt-2 list-disc pl-5 text-red-700">{state.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <p className="mt-2 text-xs text-neutral-600">This recomputes the draw in your browser from the published inputs. The beacon value can be confirmed on a public drand relay (link under technical details).</p>
    </div>
  );
}
```

- [ ] **Step 3: Verifier unit test (reuses golden vectors) and the script**

Add to `src/crypto/draw.test.ts`:
```ts
import { verifyInputs } from "@/app/b/[id]/result/verify";
import { commitment as commitOf } from "./commit";
describe("verifyInputs", () => {
  it("accepts a consistent result and rejects a tampered ranking", () => {
    const v = vectors[1];
    const secret = hexToBytes(v.secret);
    const base = { breakId: v.breakId, version: ALGORITHM_VERSION, secret: Buffer.from(secret).toString("base64"), beaconRound: 1, beaconRandomness: v.beacon, entries: v.entries, ranking: v.ranking, resultHash: v.resultHash, seedCommitment: commitOf(secret) };
    expect(verifyInputs(base).ok).toBe(true);
    expect(verifyInputs({ ...base, ranking: [...v.ranking].reverse() }).ok).toBe(false);
  });
});
```
(`atob` exists in Node 20; vitest's node environment is fine.)

`scripts/verify-draw.ts`:
```ts
import { verifyInputs } from "../src/app/b/[id]/result/verify";
const url = process.argv[2];
if (!url) { console.error("usage: pnpm tsx scripts/verify-draw.ts https://<host>/b/<id>/result.json"); process.exit(2); }
const inputs = await (await fetch(url)).json();
const r = verifyInputs(inputs);
console.log(r.ok ? "OK — result matches the published inputs" : `MISMATCH: ${r.reasons.join("; ")}`);
process.exit(r.ok ? 0 : 1);
```
Also create `src/app/legal/draw/page.tsx` with a plain-language explanation (five short paragraphs: locked secret, public beacon, entries, one shuffle, check it yourself) — copy the wording from spec §9 "Trust claim" and "Verifier trust model".

- [ ] **Step 4: Run tests and the full flow**

Run: `pnpm vitest run src/crypto` → PASS.
Manual: fill a break, tap "Run draw", wait ~60s, tap "Finish draw" → result page animates, "Check it yourself" turns green; `pnpm tsx scripts/verify-draw.ts http://localhost:3000/b/<id>/result.json` prints OK. (Local dev hits real drand relays; if offline, the button shows "Waiting for the public beacon".)

- [ ] **Step 5: Commit**

```bash
git add src/app/b src/app/legal/draw scripts src/crypto/draw.test.ts
git commit -m "feat(draw): run draw from the break page, result reveal and in-browser verifier"
```

---

### Task 15: Cron tick — finalise pending draws whose beacon round has arrived

**Files:**
- Create: `src/app/api/tick/route.ts`, `src/jobs/tick.ts`, `src/jobs/finalise-draws.ts`, `src/jobs/finalise-draws.test.ts`, `vercel.json`

**Interfaces:**
- Consumes: `pendingRequestsReady`, `finaliseDraw`, `DrandBeacon`, `SYSTEM`.
- Produces: `runTick(deps: { beacon: BeaconSource; now?: Date }): Promise<{ finalised: string[]; skipped: string[] }>`; `GET /api/tick` guarded by `Authorization: Bearer <CRON_SECRET>`; each job wrapped in `pg_try_advisory_xact_lock(hashtext('job:<name>'))` so overlapping ticks skip instead of double-running.

- [ ] **Step 1: Write the failing test**

`src/jobs/finalise-draws.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, openBreakWithLines } from "../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw } from "@/domain/draws/commands";
import { finalisePendingDraws } from "./finalise-draws";
import { FakeBeacon } from "@/crypto/beacon";
import { encryptSecret } from "@/crypto/secrets";
import { breakSecrets, breaks, drawRequests } from "@/db/schema";
import type { Caller } from "@/domain/types";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });

describe("finalisePendingDraws", () => {
  it("finalises requests whose round has arrived and skips the rest", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
      await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
      await claimLines(tx, c(a.id), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
      const { beaconRound } = await requestDraw(tx, c(host.id, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      // Too early: the round is 60s in the future.
      const early = await finalisePendingDraws(tx, beacon, beaconRound - 1);
      expect(early).toEqual({ finalised: [], skipped: [b.id] });
      // Round arrived.
      const late = await finalisePendingDraws(tx, beacon, beaconRound);
      expect(late).toEqual({ finalised: [b.id], skipped: [] });
      const [row] = await tx.select({ s: breaks.status }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.s).toBe("drawn");
      const [req] = await tx.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id}`);
      expect(req.status).toBe("done");
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/jobs`
Expected: FAIL with "Cannot find module './finalise-draws'"

- [ ] **Step 3: Implement the job, the tick and the route**

`src/jobs/finalise-draws.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { drawRequests } from "@/db/schema";
import { finaliseDraw } from "@/domain/draws/commands";
import { BeaconUnavailable } from "@/domain/errors";
import { SYSTEM } from "@/domain/types";
import type { BeaconSource } from "@/crypto/beacon";

/** Finalises every pending request whose beacon round ≤ currentRound. Returns ids finalised and ids skipped (round not reached or beacon unavailable). */
export async function finalisePendingDraws(tx: Tx, beacon: BeaconSource, currentRound: number): Promise<{ finalised: string[]; skipped: string[] }> {
  const pending = await tx.select({ breakId: drawRequests.breakId, round: drawRequests.beaconRound }).from(drawRequests).where(sql`${drawRequests.status} = 'pending'`);
  const finalised: string[] = [], skipped: string[] = [];
  for (const p of pending) {
    if (p.round > currentRound) { skipped.push(p.breakId); continue; }
    try {
      await tx.transaction(async (sp) => { await finaliseDraw(sp, SYSTEM, { breakId: p.breakId }, beacon); });
      finalised.push(p.breakId);
    } catch (e) {
      if (e instanceof BeaconUnavailable) skipped.push(p.breakId); else throw e;
    }
  }
  return { finalised, skipped };
}
```
Note: `SYSTEM` is a synthetic caller; `finaliseDraw` calls `assertOnboarded(SYSTEM)` (passes) and treats `role: "admin"` as a party. The `users` FK on `draws.run_by` means a `users` row with `SYSTEM.id` must exist: add it in the migration appended SQL — `insert into users (id, email, role, handle, display_name, age_confirmed_at) values ('00000000-0000-4000-8000-000000000000', 'system@breaks.local', 'admin', 'system', 'System', now()) on conflict do nothing;` — and add `'system'` to the reserved handle list (already there).

`src/jobs/tick.ts`:
```ts
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { finalisePendingDraws } from "./finalise-draws";
import { DrandBeacon, type BeaconSource } from "@/crypto/beacon";

async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<T | "locked"> {
  return db.transaction(async (tx) => {
    const [{ got }] = await tx.execute<{ got: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${"job:" + name})) as got`);
    if (!got) return "locked" as const;
    return fn();
  });
}

export async function runTick(deps: { beacon?: BeaconSource; now?: Date } = {}) {
  const beacon = deps.beacon ?? new DrandBeacon();
  const now = deps.now ?? new Date();
  const draws = await withJobLock("finalise-draws", () => db.transaction((tx) => finalisePendingDraws(tx, beacon, beacon.roundAt(now))));
  return { draws };
}
```
(Later plans add outbox, deliveries, pick timeouts and purge to this function.)

`src/app/api/tick/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runTick } from "@/jobs/tick";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env().CRON_SECRET}`;
  if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runTick();
  console.log(JSON.stringify({ job: "tick", ms: Date.now() - started, result }));
  return NextResponse.json(result);
}
```

`vercel.json`:
```json
{ "crons": [{ "path": "/api/tick", "schedule": "* * * * *" }] }
```
Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the `CRON_SECRET` env var is set on the project.

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/jobs` → PASS. Then `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/tick` → `{"draws":{"finalised":[],"skipped":[]}}`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs src/app/api/tick vercel.json src/db/migrations
git commit -m "feat(jobs): minute tick that finalises draws once the beacon round exists"
```

---

### Task 16: End-to-end journey 1 (Playwright, local server, test login)

**Files:**
- Create: `playwright.config.ts`, `e2e/journey-1.spec.ts`, `src/app/test/login/route.ts`, `e2e/helpers.ts`

**Interfaces:**
- Produces: `GET /test/login?email=&role=&secret=` — exists only when `E2E_SECRET` is set (the route returns 404 otherwise and the file is excluded from production builds via the check); it creates/looks up the Supabase user with the admin API, generates a magic link, exchanges it server-side and sets the session cookies, upserts the `users` row as onboarded with the given role, then redirects to `/`.

- [ ] **Step 1: Test login route**

`src/app/test/login/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { supabaseAdmin, createServerSupabase } from "@/auth/supabase";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export async function GET(req: NextRequest) {
  const secret = process.env.E2E_SECRET;
  if (!secret || process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  if (q.get("secret") !== secret) return new NextResponse("Forbidden", { status: 403 });
  const email = q.get("email")!; const role = q.get("role") ?? "member";
  const admin = supabaseAdmin();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return new NextResponse(error.message, { status: 500 });
  const supabase = await createServerSupabase();
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr) return new NextResponse(vErr.message, { status: 500 });
  const handle = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20);
  await db.insert(users).values({ id: link.user.id, email, handle, displayName: handle, role, ageConfirmedAt: new Date() })
    .onConflictDoUpdate({ target: users.id, set: { role, handle: sql`coalesce(${users.handle}, ${handle})`, displayName: sql`coalesce(${users.displayName}, ${handle})`, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` } });
  return NextResponse.redirect(new URL("/", req.url));
}
```

- [ ] **Step 2: Playwright config and helpers**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: "http://localhost:3000", ...devices["iPhone 13"] },
  webServer: { command: "pnpm build && pnpm start", url: "http://localhost:3000", reuseExistingServer: true, env: { E2E_SECRET: "e2e", BEACON: "fake" }, timeout: 180_000 },
});
```
In `src/app/b/[id]/draw-actions.ts` and `src/jobs/tick.ts`, choose the beacon with `process.env.BEACON === "fake" ? new FakeBeacon() : new DrandBeacon()` so the e2e run doesn't depend on the network or the 60-second wait (the FakeBeacon returns a value for any round). Guard: throw at startup if `BEACON === "fake"` and `VERCEL_ENV === "production"`.

`e2e/helpers.ts`:
```ts
import type { Page } from "@playwright/test";
export async function loginAs(page: Page, email: string, role: "member" | "host" = "member") {
  await page.goto(`/test/login?email=${encodeURIComponent(email)}&role=${role}&secret=e2e`);
  await page.waitForURL("/");
}
```

- [ ] **Step 3: The journey**

`e2e/journey-1.spec.ts`:
```ts
import { test, expect, type Browser } from "@playwright/test";
import { loginAs } from "./helpers";

async function newContext(browser: Browser, email: string, role: "member" | "host" = "member") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, email, role);
  return page;
}

test("host opens, buyers claim and pay, host draws, result verifies", async ({ browser }) => {
  const run = Date.now();
  const host = await newContext(browser, `host${run}@e2e.test`, "host");
  await host.goto("/host/new");
  await host.fill("input[name=title]", "E2E Chronos");
  await host.fill("textarea[name=items]", "Chronos 22g");
  await host.fill("input[name=lineCount]", "3");
  await host.fill("input[name=linePrice]", "5");
  await host.click("text=Post break");
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.click("section >> button:has-text('1')");
  await alice.click("section >> button:has-text('2')");
  await alice.click("button:has-text('Claim 2')");
  await expect(alice.getByText("You owe $10.00")).toBeVisible();
  await alice.click("text=I've sent payment");

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.click("button:has-text('Take the rest')");
  await expect(bob.getByText("You owe $5.00")).toBeVisible();

  await host.reload();
  await expect(host.getByText("· sent")).toBeVisible();
  const paidButtons = host.locator("button:has-text('Paid')");
  await paidButtons.first().click();
  await host.reload();
  await host.locator("button:has-text('Paid')").first().click();
  await host.reload();
  await expect(host.getByText("3 paid")).toBeVisible();
  await host.click("text=Run draw");
  await host.reload();
  await host.click("text=Finish draw");
  await host.reload();
  await host.click("text=See the result");
  await expect(host.getByText("Winner")).toBeVisible({ timeout: 15_000 });
  await host.click("text=Check it yourself");
  await expect(host.getByText("Checked ✓")).toBeVisible();
});
```

- [ ] **Step 4: Run it**

```bash
pnpm supabase start   # if not running
ENV_FILE=.env.local pnpm db:migrate
pnpm playwright install chromium
E2E_SECRET=e2e BEACON=fake pnpm playwright test
```
Expected: 1 passed. If the "Claim 2" selector is ambiguous, scope it to the claim panel section.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e src/app/test src/app/b/[id]/draw-actions.ts src/jobs/tick.ts
git commit -m "test(e2e): host-to-result journey with env-gated test login and fake beacon"
```

---

### Task 17: CI, deploy configuration and README

**Files:**
- Create: `.github/workflows/ci.yml`, `tests/ci/rls.test.ts`, `README.md`, `supabase/ci-auth-stub.sql`

**Interfaces:**
- Produces: a CI pipeline that runs unit + domain tests on a `postgres:16` service with migrations applied, the concurrency suite, the RLS/anon checks, lint and build; a README with local setup, env, scripts and deploy notes.

- [ ] **Step 1: Auth-schema stub for plain Postgres in CI**

`supabase/ci-auth-stub.sql` (only used in CI; local dev uses the real Supabase stack):
```sql
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
```

- [ ] **Step 2: RLS / anon-key CI test**

`tests/ci/rls.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
describe("security posture", () => {
  it("every public table has RLS enabled and forced, with zero policies", async () => {
    const bad = await sql`select tablename from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity and c.relforcerowsecurity)`;
    expect(bad).toHaveLength(0);
    expect(await sql`select 1 from pg_policies where schemaname='public'`).toHaveLength(0);
  });
  it("an anon-role session reads no rows from lines", async () => {
    await sql`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$`;
    await sql`grant usage on schema public to anon`;
    await sql`grant select on all tables in schema public to anon`;
    const rows = await sql.begin(async (tx) => { await tx`set local role anon`; return tx`select * from lines limit 1`; });
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      SUPABASE_URL: http://localhost:54321
      SUPABASE_ANON_KEY: ci
      SUPABASE_SERVICE_ROLE_KEY: ci
      DRAW_KEY_V1: AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=
      CRON_SECRET: ci
      APP_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: psql "$DATABASE_URL" -f supabase/ci-auth-stub.sql
      - run: cp .env.example .env.test && ENV_FILE=.env.test pnpm db:migrate
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm test:concurrency
      - run: pnpm vitest run tests/ci
      - run: pnpm build
      - run: pnpm audit --audit-level=high || true
```
(`psql` is available on `ubuntu-latest`. Add `tests/ci/**` to the main vitest `exclude` so it only runs in the explicit step.)

- [ ] **Step 4: README**

`README.md` sections, each a short paragraph or list: *What this is* (group-buy tracker for a darts community; the platform never handles money; hosts run every draw); *Local setup* (`pnpm install`, `pnpm supabase start`, copy keys to `.env.local`/`.env.test`, `ENV_FILE=.env.local pnpm db:migrate`, `pnpm dev`, Inbucket at `:54324`); *Scripts* (table of the `package.json` scripts); *Tests* (unit/domain, concurrency, e2e commands and the `BEACON=fake` note); *Deploy* (Vercel Pro + Supabase Pro; env vars; `CRON_SECRET`; custom SMTP via Resend; forward-only migrations run from CI or locally against the pooler port 6543 with `?pgbouncer=true` removed — use the direct connection string for migrations); *Verify a draw* (`pnpm tsx scripts/verify-draw.ts <result.json url>`); *Spec and plans* (links to `docs/superpowers/`).

- [ ] **Step 5: Run CI locally once, then commit**

```bash
pnpm lint && pnpm test && pnpm test:concurrency && pnpm vitest run tests/ci && pnpm build
git add .github tests/ci README.md supabase/ci-auth-stub.sql vitest.config.ts
git commit -m "ci: postgres service pipeline with rls checks, concurrency suite and build"
```

---

## Self-review notes (completed by the plan author)

- **Spec coverage (Plan 1 scope):** §4.0 tracer bullet — Tasks 1–16. §5 architecture — Tasks 2, 6, 11, 15. §6 tables used here — Task 2 (remaining tables arrive with Plans 2–4). §7 open/claim/sent/paid/un-mark/release/fill — Tasks 7–8 (bonus lines and cancel are Plan 2; relist is v1.1). §9 commitment/request/finalise/result/verifier — Tasks 4, 5, 9, 14, 15. §12 sign-in/onboarding — Task 11. §13 `/b/{id}`, `/b/{id}/result`, `/host`, `/host/new` — Tasks 12–14. §14 idempotent double-tap paths — Tasks 8, 9. §15 tests — Tasks 3, 4, 10, 16, 17. Not in this plan by design: `idempotency_keys` wrapper (the natural idempotency of claim/paid/request/finalise covers the tracer bullet; Plan 3 adds the key table when messages arrive), `/me` page (query exists in Task 8; page in Plan 3), `/h/{handle}` (Plan 4).
- **Review Focus coverage:** (1) Task 8 "retry … double-tap"; (2) Task 8 "stale owner → OwnerChanged"; (3) Task 9 "crash mid-finalise"; (4) Task 4 bonus number > 255 and handle-free serialization, Task 9 bonus entries; (5) Task 8 "does not fill while reserved".
- **Type consistency:** `Caller` from `src/domain/types.ts` everywhere; `BeaconSource.fetch` returns `{ randomness: Uint8Array; signature: string } | null`; `computeRanking` returns line numbers; `getDrawResult().entries` matches `EntrySnapshot`; `unpaidByBuyer` returns snake_case columns mapped in the page.
- **Known seams for executors:** `tests/helpers/fixtures.ts` imports `commitment` (Task 4) — build Task 4 before running Task 3's test, as noted. `host-panel.tsx` imports `draw-actions.ts` (Task 14) — stub noted in Task 13. The `SYSTEM` user row is inserted by migration SQL (Task 15 note).
