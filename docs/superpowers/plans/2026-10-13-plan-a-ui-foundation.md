# Plan A — UI Foundation (domain additions → tokens → components → existing screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The screens that exist today (break page with grid, claim and pay; host ledger; result page; sign-in; onboarding; new-break composer) wear the board design, on a token and component foundation Plan B reuses, with the domain additions those screens need: picking mode, a tested grid-shaping function, typed action failures, a per-buyer ledger, one-transaction release, bonus lines, a money format and a viewer query.

**Architecture:** Domain work lands first and changes nothing visible: `claim_mode` (migration 0001), a pure `shapeGrid` that alone decides holder visibility and the host-only overdue flag, `ActionResult` failures carrying `taken`/`limit`, `ledgerByBuyer` + `releaseForBuyer` + `addBonusLine`. Then Tailwind v4 CSS-first tokens (`src/app/tokens.css` with `@theme inline`, no config file), `next/font/google` Barlow, and server-safe presentational primitives in `src/components/`. Each break page has one client island, `BreakInteractive`, that owns selection, `useOptimistic` over server props, taken-line recovery and auto-refresh; sheets are native `<dialog>`. Every piece of client logic lives in a pure `.ts` module tested under vitest (node environment), so each UI task still starts from a failing test; the Playwright journey is re-keyed on test ids before any copy changes and updated in the same commit as every task that touches a keyed element.

**Tech Stack:** Next.js 15.5 (App Router, TypeScript), React 19.1, Tailwind CSS 4.3 via `@tailwindcss/postcss`, `next/font/google`, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres-js, Supabase (Postgres, Auth), zod 4, vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-ui-design.md` (§1–§7, §8 fallbacks, §9 Plan A) and `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md` (§7 lines and claims, §13 `/b/{id}`, `/b/{id}/result`, `/host/new`, sign-in and onboarding).

**Recorded design errata** (the owner ruled on these; the UI design doc is corrected separately, and this plan follows the rulings):
1. A paid cell's number is always white (`text-card`), the viewer's own included. "Mine" on a paid cell is carried by the white corner flag and by "yours" in the accessible name. The design's green number on a black cell measures 3.9:1, under the 4.5:1 floor (D§3, D§7). Pinned by `tokens.test.ts` (Task 6).
2. A selected cell keeps weight 600 (inset ring plus check). D§3 loads 600 at most, so D§4's 700 is not used (D§3 wins over D§4).
3. The bonus allowance follows the platform spec, `max(1, floor(N / 10))` (Task 4); the UI design's "at most 10% of N" is aligned to it separately.

**Branch:** execute on a feature branch or worktree named `plan-a-ui-foundation`; never commit to `main`.

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
- Gambling-neutral vocabulary extends to: never raffle, lottery, odds, bet, ticket, jackpot, lucky. No exclamation marks in copy. (Pinned by the copy audit test in Task 16.)
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

## Review Focus

1. A signed-in member who holds no line views a break where another buyer's claim is past its payment window: the server must send that cell as `taken` with `overdue: false` and `holder: null`; a participant gets the holder but still `overdue: false`; only the host and an admin get `overdue: true`. Test added to Task 2 ("overdue and holders are host-only").
2. A buyer has lines 7 and 12 selected; an auto-refresh shows 7 taken by someone else while the buyer's own optimistic claim marked 12 `mine`: 7 must be dropped and announced ("Line 7 was just taken."), 12 must be dropped silently. Test added to Task 11a (`reconcileSelection`).
3. A signed-out buyer returns from sign-in with `?pick=7,abc,4,7,0,99,12` on a 50-line break where line 4 has since been taken: the selection must become exactly `[7, 12]` (deduplicated, bounded, open only). Test added to Task 11a (`parsePick` then `reconcileSelection`).
4. A buyer in the host ledger holds one paid line, one sent line and one overdue line: their row status is `overdue`, owed counts only the two unpaid lines, and the ledger order is Sent, then Unpaid, then Overdue, then Paid. Test added to Task 4 (`ledgerByBuyer`), with the filter behaviour in Task 13a (`matchesFilter`).
5. Deadlines are decided in the viewer's zone, not UTC. 03:30 UTC on Oct 14 must read "11:30 pm today" in America/New_York and "4:30 am tomorrow" in Europe/London (now = Oct 13, 16:00 UTC); a deadline across a clock change keeps the wall-clock hour in both zones, including the week between the UK change (2026-10-25) and the US change (2026-11-01); with no valid `tz` cookie the server fallback is labelled ("11:30 pm EDT today"). Test added to Task 5 (`formatDeadline`, parameterised over both zones).

## Before any task

(0) In a fresh worktree run `pnpm install` first. (1) The local Supabase stack is running: `supabase status` shows the DB on 54322; if not, run `pnpm supabase:start`. (2) `.env.local` and `.env.test` exist in the working tree; in a new worktree, copy them from the main checkout. (3) `ENV_FILE=.env.local pnpm db:migrate` prints `migrated`. (4) `pnpm exec playwright install chromium` has been run once. If any of these fails, stop and report BLOCKED: environment.

Execute on a feature branch or worktree named `plan-a-ui-foundation`; never commit to `main`.

---

## File structure

```
src/app/tokens.css                       # raw colour variables + @theme inline mapping (Task 6)
src/app/fonts.ts                         # Barlow + Barlow Condensed via next/font/google (Task 6)
src/app/globals.css                      # @import tailwindcss + tokens, base rules, utilities, keyframes
src/app/layout.tsx                       # viewport, fonts, skip link, header, footer, tab bar
src/app/dev/components/{page.tsx,demo.tsx}   # dev-only gallery (Task 8)
src/db/migrations/0001_claim_mode.sql    # generated + appended hand SQL (Task 1)
src/domain/breaks/grid.ts                # shapeGrid, canViewBreak, allowanceFor (Task 2)
src/domain/lines/ledger.ts               # buyerStatus, compareLedger (Task 4)
src/domain/users/suggest-handle.ts
src/auth/viewer.ts                       # Viewer, toViewer, getSessionViewer (server-only, cached; no extra query)
src/lib/{action-result.ts,list.ts,time.ts,share-text.ts,contrast.ts}
src/lib/zone.ts                          # viewerZone(): the tz cookie, validated (server-only)
src/components/{local-time.tsx,tz-cookie.tsx}   # LocalTime (client reformat) and the tz cookie writer
src/components/button.tsx, banner.tsx, avatar.tsx, status-pill.tsx, status-word.ts, legend.tsx, fill-bar.tsx, mini-cells.tsx
src/components/grid/{cell-label.ts,layout.ts,cell.tsx,grid.tsx,grid-preview.tsx}
src/components/{sheet.tsx,sticky-bar.tsx,stepper.tsx,stepper-math.ts,copy-button.tsx,copy-field.tsx,segmented-control.tsx,filter-chips.tsx,toast.tsx}
src/components/shell/{nav.ts,nav-links.tsx,app-header.tsx,tab-bar.tsx,footer.tsx}
src/components/break/{frame-copy.ts,details-fold.tsx,selection.ts,claim-bar-state.ts,claim-bar.tsx,use-auto-refresh.ts,line-list.tsx,break-interactive.tsx,pay-copy.ts,pay-sheet.tsx}
src/components/ledger/{ledger-view.ts,ledger-row.tsx,ledger-sheet.tsx,host-tools.tsx}
src/app/b/[id]/result/reveal-plan.ts
src/app/host/new/{parse.ts,preview.ts}
src/lib/copy-audit.test.ts               # forbidden words, middle dots, default palette, dynamic classes (Task 16)
e2e/layout.spec.ts                       # pixel budget, columns, names, focus return, bar hiding (Tasks 11b, 12, 13b, 16)
```

Removed by this plan: `src/app/b/[id]/grid.tsx` (Task 10), `src/app/b/[id]/claim-panel.tsx` (Task 11b), `src/app/b/[id]/host-panel.tsx` and `src/app/b/[id]/release-prompt{,.test}.ts` (Task 13b), `src/app/b/[id]/result/share.tsx` (Task 14).

Deferred to Plan B or later backend plans, drawn here with the design's fallback: photos (the grid thumbnail stands in), trust percentage and late history (interim "new host" / "N breaks run since …"), Remind and the question thread (messaging plan), Mark shipped (reputation plan), Cancelled transitions (display-only), reserved-for-mini cells (render-only), `/me`, `/breaks`, `/h/{handle}` (Plan B; the host line is plain text until then), live handle availability, draft editing, the OG image, the contact address, payment name on ledger rows and in search (needs `users.payment_name` migration + onboarding field).

---
### Task 1: Picking mode (`claim_mode`, migration 0001), straight-fill claims and 2nd-place prizes (model: opus)

The design's picking mode has three values (Pick or random, Pick only, Straight fill). Today only `allow_random_claims` exists and nothing forbids picking. This task adds the column, enforces it in every claim path, adds the straight-fill command, and lets the composer store a 2nd-place prize. No UI changes beyond keeping the current composer and claim panel working.

`allow_random_claims` is kept (a drop plus an add on the same table makes drizzle-kit ask an interactive rename question, which subagents cannot answer). After this task the code reads only `claim_mode`; `createDraft` keeps `allow_random_claims` equal to `claim_mode = 'pick_or_random'` so the old column never lies. A later migration drops it.

**Files:**
- Modify: `src/db/schema.ts:45` (add `claimMode` after `allowRandomClaims`), `src/db/schema.ts:61-64` (add `breaks_claim_mode_chk`)
- Create (generated, then appended): `src/db/migrations/0001_claim_mode.sql`; Create (generated): `src/db/migrations/meta/0001_snapshot.json`; Modify (generated): `src/db/migrations/meta/_journal.json`
- Modify: `src/domain/breaks/rules.ts` (append `CLAIM_MODES`, `ClaimMode`, `isClaimMode`)
- Modify: `src/domain/breaks/commands.ts:1-67` (`CreateDraftInput`, `defaultPaymentInstructions`, `createDraft`)
- Modify: `src/domain/lines/commands.ts:6`, `:49-87` (claim-mode checks, `onlyOpen`, new `claimNext`)
- Modify: `src/app/b/[id]/actions.ts` (add `claimNextAction`), `src/app/host/new/actions.ts:42`, `src/app/b/[id]/page.tsx:52`
- Modify: `tests/helpers/fixtures.ts:20-37` (`claimMode` option)
- Test: `src/db/schema.test.ts`, `src/domain/breaks/commands.test.ts`, `src/domain/lines/commands.test.ts`

**Interfaces:**
- Consumes: `lockBreak`, `assertOnboarded`, `assertCaps`, `appendEvent`, `LineTaken`, `InvalidInput` (all existing).
- Produces:
  - `breaks.claimMode: "pick_or_random" | "pick_only" | "straight"` (column `claim_mode text not null default 'pick_or_random'` with CHECK `breaks_claim_mode_chk`; frozen after open by `breaks_freeze_guard`).
  - In `src/domain/breaks/rules.ts`: `CLAIM_MODES = ["pick_or_random", "pick_only", "straight"] as const`, `type ClaimMode = (typeof CLAIM_MODES)[number]`, `isClaimMode(v: unknown): v is ClaimMode`.
  - `CreateDraftInput` gains `claimMode?: ClaimMode` and `secondPlace?: { name: string }[]`, and loses `allowRandomClaims`.
  - `defaultPaymentInstructions(h)` now returns `"Venmo @Jim-R. PayPal paypal.me/JimR. Leave the note blank."` (no middle dots).
  - `claimNext(tx, caller, { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }>` — straight-fill only; lowest open numbers; no partial claims.
  - `claimLines` throws `InvalidInput("This break fills in order. Say how many lines you want.")` on straight fill; `claimRandom` throws `InvalidInput("This break doesn't allow random lines")` unless `pick_or_random`; "Only N open" becomes "Only 1 line is open." / "Only 2 lines are open.".
  - Server action `claimNextAction(breakId: string, count: number, batchId: string): Promise<ActionResult<{ got: number[] }>>`.
  - Fixtures: `makeBreak(tx, { …, claimMode?: ClaimMode })`, `openBreakWithLines(tx, { …, claimMode?: ClaimMode })`, with `import type { ClaimMode } from "@/domain/breaks/rules"` (one source of truth for the union).

- [ ] **Step 1: Write the failing schema tests**

Append inside the `describe("schema constraints", …)` block of `src/db/schema.test.ts`, after the test `"rejects moving a break back to draft after open"` (these tests commit rows, like the rest of this file):

```ts
  it("rejects an unknown claim mode", async () => {
    await expect(sql`insert into breaks (host_id, title, line_count, line_price_cents, claim_mode) values (${hostId}, 'm', 4, 500, 'random_only')`).rejects.toThrow(/breaks_claim_mode_chk/);
  });

  it("defaults the claim mode and lets a draft change it", async () => {
    const [d] = await sql`insert into breaks (host_id, title, line_count, line_price_cents) values (${hostId}, 'd', 4, 500) returning id, claim_mode`;
    expect(d.claim_mode).toBe("pick_or_random");
    await expect(sql`update breaks set claim_mode = 'pick_only' where id = ${d.id}`).resolves.toBeDefined();
  });

  it("freezes claim_mode after open", async () => {
    await expect(sql`update breaks set claim_mode = 'straight' where id = ${breakId}`).rejects.toThrow(/claim_mode is frozen/);
  });
```

- [ ] **Step 2: Write the failing domain tests**

In `src/domain/breaks/commands.test.ts`, replace the line
```ts
      expect(page.break.paymentInstructions).toBe("Venmo @Jim-R · PayPal paypal.me/JimR · leave the note blank");
```
with
```ts
      expect(page.break.paymentInstructions).toBe("Venmo @Jim-R. PayPal paypal.me/JimR. Leave the note blank.");
```
and append inside `describe("createDraft", …)`, after the payment-handles test:

```ts
  it("stores the picking mode, defaulting to pick or random, and keeps allow_random_claims in step", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const a = await createDraft(tx, asHost(host), input);
      const b = await createDraft(tx, asHost(host), { ...input, claimMode: "straight" });
      const pa = (await getBreakPage(tx, a.breakId))!.break;
      const pb = (await getBreakPage(tx, b.breakId))!.break;
      expect(pa.claimMode).toBe("pick_or_random");
      expect(pa.allowRandomClaims).toBe(true);
      expect(pb.claimMode).toBe("straight");
      expect(pb.allowRandomClaims).toBe(false);
      await expect(createDraft(tx, asHost(host), { ...input, claimMode: "random_only" as never })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("adds 2nd-place items as rank-2 prizes", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [{ name: "Chronos 22g" }], secondPlace: [{ name: "Flight pack" }, { name: "  " }] });
      const page = (await getBreakPage(tx, breakId))!;
      expect(page.prizes.map((p) => p.rank)).toEqual([1, 2]);
      expect(page.items.map((i) => i.name).sort()).toEqual(["Chronos 22g", "Flight pack"]);
    });
  });
```

In `src/domain/lines/commands.test.ts`, change the import line
```ts
import { claimLines, claimRandom, claimAllOpen, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill } from "./commands";
```
to
```ts
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill } from "./commands";
```
and append at the end of the file:

```ts
describe("picking modes", () => {
  it("straight fill rejects picks and randoms; claimNext hands out the lowest open numbers", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, claimMode: "straight" });
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [3], batchId: randomUUID() })).rejects.toThrow(/fills in order/);
      await expect(claimRandom(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toThrow(/random/);
      expect(await claimNext(tx, c(a), { breakId: b.id, count: 2, batchId: randomUUID() })).toEqual({ got: [1, 2] });
      expect(await claimNext(tx, c(bb), { breakId: b.id, count: 3, batchId: randomUUID() })).toEqual({ got: [3, 4, 5] });
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 2, batchId: randomUUID() })).rejects.toThrow(/Only 1 line is open/);
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID() })).got).toEqual([6]);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.claimed'`);
      expect(evs).toHaveLength(3);
    });
  });
  it("pick only rejects randoms and claimNext but allows picks and take-the-rest", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4, claimMode: "pick_only" });
      await expect(claimRandom(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toBeInstanceOf(InvalidInput);
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toBeInstanceOf(InvalidInput);
      expect(await claimLines(tx, c(a), { breakId: b.id, numbers: [2], batchId: randomUUID() })).toEqual({ got: [2], taken: [] });
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID() })).got).toEqual([1, 3, 4]);
    });
  });
  it("claimNext respects the per-person cap", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, claimMode: "straight" });
      await tx.update(breaks).set({ maxLinesPerUser: 2 }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 3, batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId).length).toBe(0);
    });
  });
});
```

- [ ] **Step 3: Add the fixture option**

In `tests/helpers/fixtures.ts`, add after the `import { commitment } from "@/crypto/commit";` line:

```ts
import type { ClaimMode } from "@/domain/breaks/rules";
```

(The type itself lands in Step 9. Vitest strips type-only imports, so Step 4 still runs; `tsc` is first run in Step 14.) Then replace `makeBreak` and `openBreakWithLines` (lines 20-37) with:

```ts
export async function makeBreak(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; status?: string; kind?: string; claimMode?: ClaimMode }) {
  const claimMode = opts.claimMode ?? "pick_or_random";
  const [b] = await tx.insert(breaks).values({
    hostId: opts.hostId, title: `Break ${uniq()}`, lineCount: opts.lineCount ?? 12,
    linePriceCents: opts.linePriceCents ?? 2000, status: opts.status ?? "draft", kind: opts.kind ?? "main",
    claimMode, allowRandomClaims: claimMode === "pick_or_random",
  }).returning();
  const [item] = await tx.insert(breakItems).values({ breakId: b.id, name: "Darts" }).returning();
  await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: item.id });
  return b;
}

/** Shortcut for tests that need an open break with lines but don't test `breaks.open` itself. */
export async function openBreakWithLines(tx: Tx, opts: { hostId: string; lineCount?: number; linePriceCents?: number; claimMode?: ClaimMode }) {
  const b = await makeBreak(tx, { ...opts, status: "draft" });
  const secret = randomBytes(32);
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${b.id}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${b.id}::uuid, generate_series(1, ${b.lineCount})`);
  return { ...b, status: "open", secret };
}
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `pnpm test src/db/schema.test.ts src/domain/breaks/commands.test.ts src/domain/lines/commands.test.ts`
Expected: FAIL. Vitest does not type-check, and Drizzle silently drops the unknown `claimMode` key in the fixtures' `insert().values()`, so the failures are runtime ones: the three schema tests fail with `column "claim_mode" of relation "breaks" does not exist`; the `createDraft` test fails on an assertion (`expected undefined to be 'pick_or_random'`); the `picking modes` tests fail with `TypeError: claimNext is not a function` or on assertions (straight fill still accepts picks).

- [ ] **Step 5: Add the column and the check to the schema**

In `src/db/schema.ts`, replace line 45
```ts
  allowRandomClaims: boolean("allow_random_claims").notNull().default(true),
```
with
```ts
  // Superseded by claim_mode (migration 0001). createDraft keeps it equal to claim_mode = 'pick_or_random'; drop it in a later migration.
  allowRandomClaims: boolean("allow_random_claims").notNull().default(true),
  claimMode: text("claim_mode").$type<"pick_or_random" | "pick_only" | "straight">().notNull().default("pick_or_random"),
```
and in the `breaks` table's check list, after
```ts
  check("breaks_count_chk", sql`${t.lineCount} >= 2`),
```
add
```ts
  check("breaks_claim_mode_chk", sql`${t.claimMode} in ('pick_or_random','pick_only','straight')`),
```

- [ ] **Step 6: Generate migration 0001**

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name claim_mode`
Expected: drizzle-kit writes `src/db/migrations/0001_claim_mode.sql`, `src/db/migrations/meta/0001_snapshot.json`, and adds an entry with `"tag": "0001_claim_mode"` to `_journal.json`. It must not prompt (this is a pure addition). If drizzle-kit prompts, or if the generated SQL differs from the two statements quoted below (whitespace aside), answer nothing, stop and report BLOCKED: migration. The generated file must contain exactly these two statements:

```sql
ALTER TABLE "breaks" ADD COLUMN "claim_mode" text DEFAULT 'pick_or_random' NOT NULL;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_claim_mode_chk" CHECK ("breaks"."claim_mode" in ('pick_or_random','pick_only','straight'));
```

Then check the journal timestamp. Drizzle's pg migrator applies a migration only when its journal `when` is greater than the last applied `created_at`, and 0000's `when` is `1791916807048`. Run `node -e 'const j=require("./src/db/migrations/meta/_journal.json");const [a,b]=j.entries;console.log(b.when>a.when?"ok":"BAD")'`; it must print `ok`. If it prints `BAD` (a skewed clock on this machine), stop and report BLOCKED: migration.

- [ ] **Step 7: Append the hand SQL to `0001_claim_mode.sql`**

Append to the end of the generated file (the backfill runs while the 0000 trigger body is still in force, which allows it; the new trigger body comes after):

```sql
--> statement-breakpoint
-- Backfill: breaks that had random claims turned off become pick-only.
update breaks set claim_mode = 'pick_only' where allow_random_claims = false;
--> statement-breakpoint
-- Re-declare the 0000 freeze guard with one more rule: the picking mode is frozen once the break leaves draft.
create or replace function breaks_freeze_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'a break cannot return to draft (open -> draft does not exist)' using errcode = 'check_violation';
  end if;
  if old.status <> 'draft' then
    if new.line_count <> old.line_count or new.line_price_cents <> old.line_price_cents then
      raise exception 'line_count and line_price_cents are frozen after open' using errcode = 'check_violation';
    end if;
    if new.claim_mode <> old.claim_mode then
      raise exception 'claim_mode is frozen after open' using errcode = 'check_violation';
    end if;
  end if;
  if old.seed_commitment is not null and new.seed_commitment is distinct from old.seed_commitment then
    raise exception 'seed_commitment is immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

No RLS step: no table was added, and the existing forced deny-all RLS covers the new column.

- [ ] **Step 8: Apply the migration**

Run: `ENV_FILE=.env.local pnpm db:migrate`
Expected: prints `migrated`. (`.env.local` and `.env.test` point at the same local database, so tests see the new column.)

- [ ] **Step 9: Add the picking-mode types to the rules**

Append to `src/domain/breaks/rules.ts`:

```ts
export const CLAIM_MODES = ["pick_or_random", "pick_only", "straight"] as const;
/** pick_or_random: buyers pick or ask for randoms. pick_only: picks only. straight: lines go out in order (claimNext). */
export type ClaimMode = (typeof CLAIM_MODES)[number];
export const isClaimMode = (v: unknown): v is ClaimMode => typeof v === "string" && (CLAIM_MODES as readonly string[]).includes(v);
```

- [ ] **Step 10: Update `createDraft` and the default payment instructions**

In `src/domain/breaks/commands.ts`, replace lines 6 and 10 with:

```ts
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
```
```ts
import { validateDraftInput, validateDraftForOpen, isClaimMode, type ClaimMode } from "./rules";
```

Replace the `CreateDraftInput` type (lines 12-17) with:

```ts
export type CreateDraftInput = {
  title: string; description?: string; lineCount: number; linePriceCents: number;
  paymentWindowHours?: number; maxLinesPerUser?: number | null; claimMode?: ClaimMode; paymentInstructions?: string;
  paymentHandles?: { venmo?: string; paypal?: string };
  /** Rank-1 prize items; several items mean the winner picks one. */
  items: { name: string; variantSchema?: Record<string, string[]> | null; expectedShipAt?: Date | null }[];
  /** Rank-2 prize items (blank names are skipped). */
  secondPlace?: { name: string }[];
};
```

Replace `defaultPaymentInstructions` (lines 26-31) with:

```ts
export function defaultPaymentInstructions(h: Handles): string {
  const parts: string[] = [];
  if (h.venmo) parts.push(`Venmo ${h.venmo}.`);
  if (h.paypal) parts.push(`PayPal paypal.me/${h.paypal}.`);
  return parts.length ? [...parts, "Leave the note blank."].join(" ") : "";
}
```

Replace the body of `createDraft` (lines 43-67) with:

```ts
export async function createDraft(tx: Tx, caller: Caller, input: CreateDraftInput): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts can list a break");
  validateDraftInput(input);
  const claimMode = input.claimMode ?? "pick_or_random";
  if (!isClaimMode(claimMode)) throw new InvalidInput("Choose how buyers get lines");
  let paymentInstructions = input.paymentInstructions?.trim() ?? "";
  if (input.paymentHandles) {
    const handles = cleanHandles(input.paymentHandles);
    await savePaymentHandles(tx, caller.id, handles);
    if (!paymentInstructions) paymentInstructions = defaultPaymentInstructions(handles);
  }
  const [b] = await tx.insert(breaks).values({
    hostId: caller.id, kind: "main", title: input.title.trim(), description: input.description ?? "",
    lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    claimMode, allowRandomClaims: claimMode === "pick_or_random", paymentInstructions,
  }).returning({ id: breaks.id });
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
  return { breakId: b.id };
}
```

- [ ] **Step 11: Enforce the mode in the claim commands and add `claimNext`**

In `src/domain/lines/commands.ts`, after the `intArray` helper (line 13) add:

```ts
/** "Only 1 line is open." / "Only 3 lines are open." — no partial random or straight-fill claims. */
function onlyOpen(n: number): LineTaken {
  const e = new LineTaken([]);
  e.message = `Only ${n} ${n === 1 ? "line is" : "lines are"} open.`;
  return e;
}
```

In `claimLines`, after `assertClaimable(b);` (line 53) add:

```ts
  if (b.claimMode === "straight") throw new InvalidInput("This break fills in order. Say how many lines you want.");
```

In `claimRandom`, replace line 76
```ts
  if (!b.allowRandomClaims) throw new InvalidInput("This break doesn't allow random lines");
```
with
```ts
  if (b.claimMode !== "pick_or_random") throw new InvalidInput("This break doesn't allow random lines");
```
and replace line 83
```ts
  if (picked.length < p.count) { const e = new LineTaken([]); e.message = `Only ${picked.length} open`; throw e; }
```
with
```ts
  if (picked.length < p.count) throw onlyOpen(picked.length);
```

After `claimRandom` (before `claimAllOpen`) add:

```ts
/** Straight fill: the caller gets the lowest open numbers, all or nothing. The break row lock serialises callers. */
export async function claimNext(tx: Tx, caller: Caller, p: { breakId: string; count: number; batchId: string; ipHash?: string }): Promise<{ got: number[] }> {
  assertOnboarded(caller);
  const b = await lockBreak(tx, p.breakId);
  await lockUser(tx, caller.id); // lock order: break row -> user (advisory xact lock) -> lines
  assertClaimable(b);
  if (b.claimMode !== "straight") throw new InvalidInput("This break lets you pick your lines");
  if (!Number.isInteger(p.count) || p.count < 1) throw new InvalidInput("Ask for at least one line");
  const isHost = caller.id === b.hostId;
  assertCaps({ requested: p.count, heldByCaller: await heldBy(tx, b.id, caller.id), maxLinesPerUser: b.maxLinesPerUser, isHost, lineCount: b.lineCount, globalUnpaid: await globalUnpaid(tx, caller.id) });
  const next = (await tx.select({ number: lines.number }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is null and ${lines.reservedForMiniId} is null and ${lines.number} <= ${b.lineCount}`)
    .orderBy(lines.number).limit(p.count)).map((r) => r.number);
  if (next.length < p.count) throw onlyOpen(next.length);
  const got = await assign(tx, b, caller, next, p.batchId);
  await finishClaim(tx, b, caller, got, p.batchId, p.ipHash);
  return { got };
}
```

- [ ] **Step 12: Keep the app compiling**

In `src/app/b/[id]/actions.ts`, change the import on line 8 to:

```ts
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, releaseLine } from "@/domain/lines/commands";
```
and add after `claimRandomAction`:

```ts
export async function claimNextAction(breakId: string, count: number, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }), { breakId, count, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimNext(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
```

In `src/app/host/new/actions.ts`, replace line 42
```ts
      allowRandomClaims: p.data.allowRandomClaims === "on",
```
with
```ts
      claimMode: p.data.allowRandomClaims === "on" ? "pick_or_random" : "pick_only",
```

In `src/app/b/[id]/page.tsx`, replace on line 52
```tsx
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={page.break.allowRandomClaims}
```
with
```tsx
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={page.break.claimMode === "pick_or_random"}
```

- [ ] **Step 13: Run the tests to see them pass**

Run: `pnpm test src/db/schema.test.ts src/domain/breaks/commands.test.ts src/domain/lines/commands.test.ts`
Expected: PASS, including the three new schema tests and the `picking modes` block.

- [ ] **Step 14: Run the whole suite, types and lint**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: all green. The concurrency suite (not part of `pnpm test`) still passes: its `claimRandom` calls use `makeBreak`'s default `pick_or_random`, and `claimNext` takes the same break-row, then user, then lines lock order. The build and the journey pass because the composer maps its checkbox to `claimMode` and the page reads `claimMode`.

- [ ] **Step 15: Commit**

```bash
git add src/db/schema.ts src/db/migrations src/db/schema.test.ts src/domain/breaks src/domain/lines "src/app/b/[id]/actions.ts" "src/app/b/[id]/page.tsx" src/app/host/new/actions.ts tests/helpers/fixtures.ts
git commit -m "feat(breaks): picking mode with straight fill and 2nd-place prizes"
```

---

### Task 2: `shapeGrid` — one pure function decides what each viewer sees (model: opus)

Today `src/app/b/[id]/page.tsx` shapes cells inline and sends `overdue` to every viewer, which leaks a buyer's late payment to the public and disagrees with the client at the deadline. This task moves shaping into a pure, tested function with the host-only overdue rule, holder gating, bonus ordering, counts and the viewer's allowance, and makes drafts private. The page renders exactly as before (same old `Grid`), except that non-hosts no longer see the red overdue colour and drafts 404 for everyone but their host.

**Files:**
- Create: `src/domain/breaks/grid.ts`, `src/domain/breaks/grid.test.ts`
- Modify: `src/domain/breaks/queries.ts:10`, `:20-23` (add `priceCents` to the page lines)
- Modify: `src/domain/lines/queries.ts` (add `globalUnpaidCount`)
- Modify: `src/domain/lines/commands.test.ts` (test `globalUnpaidCount`)
- Modify: `src/app/b/[id]/page.tsx` (whole file)

**Interfaces:**
- Consumes: `BreakPage` (`getBreakPage`), `isOverdue` (`src/domain/lines/rules.ts`), `GLOBAL_UNPAID_CAP`, `SELF_CLAIM_SHARE`, `Role`.
- Produces (all in `src/domain/breaks/grid.ts`):
  - `type CellState = "open" | "taken" | "sent" | "paid" | "reserved"`
  - `type GridCell = { number: number; state: CellState; mine: boolean; overdue: boolean; bonus: boolean; holder: string | null }`
  - `type GridCounts = { open: number; taken: number; sent: number; paid: number; reserved: number; total: number }` (numbered lines only; `total = lineCount`)
  - `type AllowanceReason = "per_person" | "host" | "global"`; `type Allowance = { remaining: number; reason: AllowanceReason; limit: number }`
  - `type ViewerLines = { held: number[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null }`
  - `type GridViewer = { id: string; role: Role; globalUnpaid: number }`
  - `type GridModel = { cells: GridCell[]; counts: GridCounts; hostView: boolean; participant: boolean; showHolders: boolean; viewer: ViewerLines | null; allowance: Allowance }`
  - `shapeGrid(page: BreakPage, viewer: GridViewer | null, now: Date): GridModel`
  - `isHostView(hostId: string, viewer: { id: string; role: Role } | null): boolean`
  - `canViewBreak(status: string, hostView: boolean): boolean`
  - `allowanceFor(p: { maxLinesPerUser: number | null; lineCount: number; heldNumbered: number; isHost: boolean; globalUnpaid: number }): Allowance`
- `BreakPage["lines"][number]` gains `priceCents: number | null`.
- `globalUnpaidCount(tx: Tx, userId: string): Promise<number>` in `src/domain/lines/queries.ts`.

- [ ] **Step 1: Write the failing pure tests**

`src/domain/breaks/grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shapeGrid, canViewBreak, allowanceFor, type GridViewer } from "./grid";
import type { BreakPage } from "./queries";

const HOST = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000a2";
const BOB = "00000000-0000-4000-8000-0000000000a3";
const ADMIN = "00000000-0000-4000-8000-0000000000a4";
const CAROL = "00000000-0000-4000-8000-0000000000a5";
const MINI = "00000000-0000-4000-8000-0000000000c1";
const now = new Date("2026-10-13T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

type L = BreakPage["lines"][number];
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const held = (number: number, ownerId: string, ownerHandle: string, o: Partial<L> = {}): L =>
  ({ ...open(number), ownerId, ownerHandle, claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: {} },
    items: [], prizes: [], lines,
  };
}
const v = (id: string, role: GridViewer["role"] = "member", globalUnpaid = 0): GridViewer => ({ id, role, globalUnpaid });

// 1 open; 2 alice, claimed 30 h ago, unsent (overdue); 3 alice sent; 4 bob paid; 5 reserved for a mini; 6 open; 7 bonus, bob, paid.
const lines: L[] = [
  open(6), held(4, BOB, "bob", { paidAt: hoursAgo(2) }), open(1),
  held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice", { sentAt: hoursAgo(0.5) }),
  { ...open(5), reservedForMiniId: MINI }, held(7, BOB, "bob", { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];

describe("shapeGrid", () => {
  it("orders cells, puts bonus lines after N and counts numbered lines only", () => {
    const g = shapeGrid(page(lines), null, now);
    expect(g.cells.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.cells.map((c) => c.state)).toEqual(["open", "taken", "sent", "paid", "reserved", "open", "paid"]);
    expect(g.cells[6].bonus).toBe(true);
    expect(g.counts).toEqual({ open: 2, taken: 1, sent: 1, paid: 1, reserved: 1, total: 6 });
  });

  it("overdue and holders are host-only", () => {
    const cell2 = (viewer: GridViewer | null) => shapeGrid(page(lines), viewer, now).cells[1];
    expect(cell2(null)).toEqual({ number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null });
    expect(cell2(v(CAROL))).toMatchObject({ state: "taken", overdue: false, holder: null });
    expect(shapeGrid(page(lines), v(CAROL), now).showHolders).toBe(false);
    expect(cell2(v(BOB))).toMatchObject({ state: "taken", overdue: false, holder: "alice" });
    expect(cell2(v(HOST, "host"))).toMatchObject({ state: "taken", overdue: true, holder: "alice" });
    expect(cell2(v(ADMIN, "admin"))).toMatchObject({ overdue: true, holder: "alice" });
    // A sent line is never overdue, even for the host.
    expect(shapeGrid(page(lines), v(HOST, "host"), now).cells[2].overdue).toBe(false);
  });

  it("summarises the viewer's own lines and what they owe", () => {
    const g = shapeGrid(page(lines), v(ALICE), now);
    expect(g.participant).toBe(true);
    expect(g.cells.filter((c) => c.mine).map((c) => c.number)).toEqual([2, 3]);
    expect(g.viewer).toEqual({ held: [2, 3], unsent: [2], sent: [3], paid: [], owedCents: 500, payBy: hoursAgo(6) });
    expect(shapeGrid(page(lines), null, now).viewer).toBeNull();
  });

  it("takes the tightest of the per-person, host and global caps, never below zero", () => {
    expect(shapeGrid(page(lines, { maxLinesPerUser: 3 }), v(ALICE), now).allowance).toEqual({ reason: "per_person", limit: 3, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 1 }), v(ALICE), now).allowance).toEqual({ reason: "per_person", limit: 1, remaining: 0 });
    expect(shapeGrid(page(lines), v(ALICE, "member", 29), now).allowance).toEqual({ reason: "global", limit: 30, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 5 }), null, now).allowance).toEqual({ reason: "per_person", limit: 5, remaining: 5 });
    const hostLines = [held(1, HOST, "jim"), held(2, HOST, "jim"), held(3, HOST, "jim"), held(4, HOST, "jim"), open(5)];
    expect(shapeGrid(page(hostLines, { lineCount: 50 }), v(HOST, "host"), now).allowance).toEqual({ reason: "host", limit: 5, remaining: 1 });
  });

  it("does not count bonus lines towards the per-person cap", () => {
    expect(allowanceFor({ maxLinesPerUser: 2, lineCount: 6, heldNumbered: 1, isHost: false, globalUnpaid: 0 })).toEqual({ reason: "per_person", limit: 2, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 2 }), v(BOB), now).allowance.remaining).toBe(1);
  });
});

describe("canViewBreak", () => {
  it("hides drafts from everyone but their host", () => {
    expect(canViewBreak("draft", false)).toBe(false);
    expect(canViewBreak("draft", true)).toBe(true);
    expect(canViewBreak("open", false)).toBe(true);
    expect(canViewBreak("drawn", false)).toBe(true);
  });
});
```

Add to the end of `src/domain/lines/commands.test.ts` (and add `import { globalUnpaidCount } from "./queries";` beside the existing `unpaidByBuyer` import):

```ts
describe("globalUnpaidCount", () => {
  it("counts a buyer's unpaid lines across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b1 = await openBreakWithLines(tx, { hostId: host.id }); const b2 = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b1.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, c(a), { breakId: b2.id, numbers: [3], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b1.id, number: 1, expectedOwnerId: a.id });
      expect(await globalUnpaidCount(tx, a.id)).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm test src/domain/breaks/grid.test.ts src/domain/lines/commands.test.ts`
Expected: FAIL. `grid.test.ts` fails with `Failed to resolve import "./grid"`; the new `commands.test.ts` block fails with `TypeError: globalUnpaidCount is not a function` (a missing named export from an existing module is `undefined` at runtime, not a resolve error).

- [ ] **Step 3: Add `priceCents` to the break page query**

In `src/domain/breaks/queries.ts`, replace line 10 with:

```ts
  lines: { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; priceCents: number | null; reservedForMiniId: string | null; isBonus: boolean }[];
```
and replace lines 20-23 with:

```ts
  const lineRows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, ownerHandle: users.handle, claimedAt: lines.claimedAt, sentAt: lines.sentAt,
    paidAt: lines.paidAt, priceCents: lines.priceCents, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
```

- [ ] **Step 4: Add `globalUnpaidCount`**

Append to `src/domain/lines/queries.ts`:

```ts
/** Unpaid lines a buyer holds across every break (the platform-wide cap counts these). */
export async function globalUnpaidCount(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${userId} and ${lines.paidAt} is null`);
  return r.n;
}
```

- [ ] **Step 5: Write `shapeGrid`**

`src/domain/breaks/grid.ts`:

```ts
import type { Role } from "@/domain/types";
import { isOverdue } from "@/domain/lines/rules";
import { GLOBAL_UNPAID_CAP, SELF_CLAIM_SHARE } from "./rules";
import type { BreakPage } from "./queries";

export type CellState = "open" | "taken" | "sent" | "paid" | "reserved";
/** One grid cell as a given viewer may see it. `holder` and `overdue` are already gated by the server. */
export type GridCell = { number: number; state: CellState; mine: boolean; overdue: boolean; bonus: boolean; holder: string | null };
export type GridCounts = { open: number; taken: number; sent: number; paid: number; reserved: number; total: number };
export type AllowanceReason = "per_person" | "host" | "global";
export type Allowance = { remaining: number; reason: AllowanceReason; limit: number };
export type ViewerLines = { held: number[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null };
export type GridViewer = { id: string; role: Role; globalUnpaid: number };
export type GridModel = {
  cells: GridCell[]; counts: GridCounts; hostView: boolean; participant: boolean; showHolders: boolean;
  viewer: ViewerLines | null; allowance: Allowance;
};

export function isHostView(hostId: string, viewer: { id: string; role: Role } | null): boolean {
  return !!viewer && (viewer.id === hostId || viewer.role === "admin");
}

/** Drafts are private to their host (and admins). */
export function canViewBreak(status: string, hostView: boolean): boolean {
  return status !== "draft" || hostView;
}

function stateOf(l: BreakPage["lines"][number]): CellState {
  if (l.reservedForMiniId && !l.ownerId) return "reserved";
  if (!l.ownerId) return "open";
  if (l.paidAt) return "paid";
  if (l.sentAt) return "sent";
  return "taken";
}

/** Mirrors assertCaps: how many more lines this viewer may claim, and which cap binds first. */
export function allowanceFor(p: { maxLinesPerUser: number | null; lineCount: number; heldNumbered: number; isHost: boolean; globalUnpaid: number }): Allowance {
  const options: Allowance[] = [];
  if (p.maxLinesPerUser !== null) options.push({ reason: "per_person", limit: p.maxLinesPerUser, remaining: p.maxLinesPerUser - p.heldNumbered });
  if (p.isHost) {
    const cap = Math.floor(p.lineCount * SELF_CLAIM_SHARE);
    options.push({ reason: "host", limit: cap, remaining: cap - p.heldNumbered });
  }
  options.push({ reason: "global", limit: GLOBAL_UNPAID_CAP, remaining: GLOBAL_UNPAID_CAP - p.globalUnpaid });
  const tightest = options.reduce((a, o) => (o.remaining < a.remaining ? o : a));
  return { ...tightest, remaining: Math.max(0, tightest.remaining) };
}

export function shapeGrid(page: BreakPage, viewer: GridViewer | null, now: Date): GridModel {
  const b = page.break;
  const hostView = isHostView(b.hostId, viewer);
  const participant = !!viewer && page.lines.some((l) => l.ownerId === viewer.id);
  const showHolders = hostView || participant;
  const sorted = [...page.lines].sort((x, y) => x.number - y.number);

  const cells: GridCell[] = sorted.map((l) => ({
    number: l.number,
    state: stateOf(l),
    mine: !!viewer && l.ownerId === viewer.id,
    overdue: hostView && isOverdue(l, b, now),
    bonus: l.isBonus,
    holder: showHolders && l.ownerId ? l.ownerHandle : null,
  }));

  const counts: GridCounts = { open: 0, taken: 0, sent: 0, paid: 0, reserved: 0, total: b.lineCount };
  for (const c of cells) if (!c.bonus && c.number <= b.lineCount) counts[c.state] += 1;

  let viewerLines: ViewerLines | null = null;
  if (viewer) {
    const mine = sorted.filter((l) => l.ownerId === viewer.id);
    const unsentRows = mine.filter((l) => !l.paidAt && !l.sentAt);
    const firstClaim = unsentRows.reduce<Date | null>((min, l) => (l.claimedAt && (!min || l.claimedAt < min) ? l.claimedAt : min), null);
    viewerLines = {
      held: mine.map((l) => l.number),
      unsent: unsentRows.map((l) => l.number),
      sent: mine.filter((l) => !l.paidAt && l.sentAt).map((l) => l.number),
      paid: mine.filter((l) => l.paidAt).map((l) => l.number),
      owedCents: unsentRows.reduce((s, l) => s + (l.priceCents ?? b.linePriceCents), 0),
      payBy: firstClaim ? new Date(firstClaim.getTime() + b.paymentWindowHours * 3_600_000) : null,
    };
  }

  const heldNumbered = viewer ? sorted.filter((l) => l.ownerId === viewer.id && !l.isBonus).length : 0;
  const allowance = allowanceFor({
    maxLinesPerUser: b.maxLinesPerUser, lineCount: b.lineCount, heldNumbered,
    isHost: !!viewer && viewer.id === b.hostId, globalUnpaid: viewer?.globalUnpaid ?? 0,
  });
  return { cells, counts, hostView, participant, showHolders, viewer: viewerLines, allowance };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/domain/breaks/grid.test.ts src/domain/lines/commands.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire it into the page with no visual change**

Replace `src/app/b/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { unpaidByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getCaller } from "@/auth/session";
import { formatCents } from "@/lib/money";
import { isUuid } from "@/lib/is-uuid";
import { Grid, type GridLine } from "./grid";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

export default async function BreakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(page.break.status, isHostView(page.break.hostId, caller))) notFound();
  const now = new Date();
  const globalUnpaid = caller ? await db.transaction((tx) => globalUnpaidCount(tx, caller.id)) : 0;
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);
  const isHost = grid.hostView;
  const openNumbers = grid.cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
  const paid = grid.counts.paid;
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const gridLines: GridLine[] = grid.cells.map((c) => ({
    number: c.number,
    isBonus: c.bonus,
    mine: c.mine,
    label: c.holder,
    state: c.overdue ? "overdue" : c.state === "taken" ? "claimed" : c.state,
  }));
  const unpaid = isHost ? await db.transaction((tx) => unpaidByBuyer(tx, id)) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{page.break.title}</h1>
      <p className="text-sm text-neutral-600">{openNumbers.length} of {page.break.lineCount} open · {formatCents(page.break.linePriceCents)}/line · {paid} paid</p>
      <p className="text-sm">Host: {page.host.handle
        ? <Link href={`/h/${page.host.handle}`} className="underline">{page.host.displayName ?? page.host.handle}</Link>
        : <span>{page.host.displayName ?? "unknown"}</span>}</p>
      <ul className="mt-2 text-sm">{page.items.map((i) => <li key={i.id}>• {i.name}</li>)}</ul>
      {page.items.length > 1 && <p className="text-xs text-neutral-600">Winner picks one.</p>}
      {page.break.status === "drawn" && <Link href={`/b/${id}/result`} className="mt-3 block rounded bg-green-700 p-3 text-center text-white">See the result</Link>}
      {page.break.status === "drawing" && <p className="mt-3 rounded bg-amber-100 p-3 text-sm">Draw requested — waiting for the public beacon.</p>}

      <Grid lines={gridLines} lineCount={page.break.lineCount} />

      {caller && page.break.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={page.break.claimMode === "pick_or_random"}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={page.break.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={page.break.paymentInstructions} seedCommitment={page.break.seedCommitment} />
      )}
      {!caller && page.break.status === "open" && <Link href={`/login?next=/b/${id}`} className="mt-4 block rounded bg-black p-3 text-center text-white">Sign in to claim lines</Link>}
      {isHost && <HostPanel breakId={id} status={page.break.status} unpaid={unpaid.map((u) => ({ ownerId: u.owner_id, handle: u.handle, numbers: u.numbers, sent: u.sent, sentNumbers: u.sent_numbers, amountCents: u.amount_cents }))} />}
      {page.break.seedCommitment && <p className="mt-6 text-xs text-neutral-500">Draw locked before opening: <code>{page.break.seedCommitment.slice(0, 16)}…</code></p>}
    </main>
  );
}
```

(The middle dots and old colours stay until Tasks 10 and 16 replace this markup; this task only moves the decisions.)

- [ ] **Step 8: Verify nothing else moved**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: all green; the Playwright journey passes unchanged (it does not depend on overdue).

- [ ] **Step 9: Commit**

```bash
git add src/domain/breaks/grid.ts src/domain/breaks/grid.test.ts src/domain/breaks/queries.ts src/domain/lines/queries.ts src/domain/lines/commands.test.ts "src/app/b/[id]/page.tsx"
git commit -m "refactor(break-page): shape the grid in one tested function with host-only overdue"
```

---

### Task 3: Typed action failures, and the copy for taken lines and caps (model: opus)

`action()` drops `LineTaken.numbers` and `CapExceeded.limit`, so the client cannot clear the right cells or say which limit bit. This task adds `details` to failures, moves the mapping into a pure module so it is testable without Supabase, and rewrites the taken, cap and not-open messages in the design's voice (no internal status words such as "filled" or "drawing"). It also adds the shared list helpers the rest of the plan uses for "4, 11 and 27" and "2nd".

**Files:**
- Create: `src/lib/list.ts`, `src/lib/list.test.ts`, `src/lib/action-result.ts`, `src/lib/action-result.test.ts`
- Modify: `src/domain/errors.ts:7`, `:10`, `:12` (messages via `notOpenMessage` / `takenMessage` / `capMessage`)
- Modify: `src/lib/action.ts` (whole file)

**Interfaces:**
- Consumes: `DomainError`, `LineTaken`, `CapExceeded`.
- Produces:
  - `src/lib/list.ts`: `joinAnd(items: readonly (string | number)[]): string` ("4, 11 and 27"), `plural(n: number, one: string, many: string): string`, `ordinal(n: number): string` ("1st", "2nd", "11th", "21st").
  - `src/domain/errors.ts`: `notOpenMessage(status: string): string` (the community's words, never the internal status: "This break is closed. Every line is taken and paid."), `takenMessage(numbers: number[]): string`, `capMessage(kind: string, limit: number): string`.
  - `src/lib/action-result.ts`: `type CapKind = "per_person" | "host" | "global" | "bonus"`, `type FailureDetails = { taken?: number[]; limit?: number; capKind?: CapKind }`, `type ActionFailure = { ok: false; code: string; message: string; details?: FailureDetails }`, `type ActionResult<T> = { ok: true; data: T } | ActionFailure`, `toFailure(e: DomainError): ActionFailure`.
  - `src/lib/action.ts` re-exports `ActionResult`, `ActionFailure`, `FailureDetails`, `CapKind` and keeps `action<T>(fn): Promise<ActionResult<T>>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { joinAnd, plural, ordinal } from "./list";

describe("joinAnd", () => {
  it("names one, two and many items without a serial comma", () => {
    expect(joinAnd([])).toBe("");
    expect(joinAnd([4])).toBe("4");
    expect(joinAnd([4, 11])).toBe("4 and 11");
    expect(joinAnd([4, 11, 27])).toBe("4, 11 and 27");
    expect(joinAnd(["a", "b", "c", "d"])).toBe("a, b, c and d");
  });
});

describe("plural", () => {
  it("picks the singular only for one", () => {
    expect(plural(1, "line", "lines")).toBe("line");
    expect(plural(0, "line", "lines")).toBe("lines");
    expect(plural(3, "line", "lines")).toBe("lines");
  });
});

describe("ordinal", () => {
  it("handles the teens and the twenties", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});
```

`src/lib/action-result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toFailure } from "./action-result";
import { CapExceeded, LineTaken, NotOpen } from "@/domain/errors";

describe("toFailure", () => {
  it("carries the taken numbers and says what to do", () => {
    expect(toFailure(new LineTaken([7]))).toEqual({ ok: false, code: "LINE_TAKEN", message: "Line 7 was just taken. Pick another.", details: { taken: [7] } });
  });
  it("names several taken lines", () => {
    expect(toFailure(new LineTaken([4, 7, 12])).message).toBe("Lines 4, 7 and 12 were just taken. Pick others.");
    expect(toFailure(new LineTaken([])).message).toBe("Those lines were just taken. Pick others.");
  });
  it("carries the cap limit and which cap bit", () => {
    expect(toFailure(new CapExceeded("lines per person", 5))).toEqual({ ok: false, code: "CAP_EXCEEDED", message: "You can hold 5 lines in this break.", details: { limit: 5, capKind: "per_person" } });
    expect(toFailure(new CapExceeded("host-held lines", 1)).message).toBe("Hosts can hold 1 line in their own break.");
    expect(toFailure(new CapExceeded("open unpaid claims", 30))).toMatchObject({ message: "You can have 30 unpaid lines across breaks. Pay for some first.", details: { capKind: "global" } });
    expect(toFailure(new CapExceeded("bonus lines", 5))).toMatchObject({ message: "This break has used all 5 bonus lines.", details: { capKind: "bonus" } });
  });
  it("has no details for other domain errors, and never shows an internal status word", () => {
    expect(toFailure(new NotOpen("filled"))).toEqual({ ok: false, code: "NOT_OPEN", message: "This break is closed. Every line is taken and paid." });
    expect(toFailure(new NotOpen("drawing")).message).toBe("The draw is running. The result is in about a minute.");
    expect(toFailure(new NotOpen("draft")).message).toBe("This break isn't open yet.");
  });
  it("keeps a message a command rewrote after construction", () => {
    const e = new LineTaken([]);
    e.message = "Only 2 lines are open.";
    expect(toFailure(e)).toEqual({ ok: false, code: "LINE_TAKEN", message: "Only 2 lines are open.", details: { taken: [] } });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/lib/list.test.ts src/lib/action-result.test.ts`
Expected: FAIL with `Failed to resolve import "./list"` and `Failed to resolve import "./action-result"`.

- [ ] **Step 3: Write the list helpers**

`src/lib/list.ts`:

```ts
/** "4", "4 and 11", "4, 11 and 27" — how the design names lines (no serial comma, no middle dots). */
export function joinAnd(items: readonly (string | number)[]): string {
  const s = items.map(String);
  if (s.length <= 1) return s[0] ?? "";
  return `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}
```

- [ ] **Step 4: Rewrite the two error messages**

In `src/domain/errors.ts`, add at the top:

```ts
import { joinAnd, plural } from "@/lib/list";

/** State words buyers know (design §6): never "filled" or "drawing". */
export function notOpenMessage(s: string): string {
  switch (s) {
    case "draft": return "This break isn't open yet.";
    case "filled": return "This break is closed. Every line is taken and paid.";
    case "drawing": return "The draw is running. The result is in about a minute.";
    case "drawn": return "This break has run. See the result.";
    case "cancelled": return "This break was cancelled.";
    default: return "This break isn't open.";
  }
}

export function takenMessage(numbers: number[]): string {
  if (numbers.length === 0) return "Those lines were just taken. Pick others.";
  if (numbers.length === 1) return `Line ${numbers[0]} was just taken. Pick another.`;
  return `Lines ${joinAnd(numbers)} were just taken. Pick others.`;
}

export function capMessage(kind: string, limit: number): string {
  const lines = `${limit} ${plural(limit, "line", "lines")}`;
  switch (kind) {
    case "lines per person": return `You can hold ${lines} in this break.`;
    case "host-held lines": return `Hosts can hold ${lines} in their own break.`;
    case "open unpaid claims": return `You can have ${limit} unpaid lines across breaks. Pay for some first.`;
    case "bonus lines": return `This break has used all ${limit} bonus ${plural(limit, "line", "lines")}.`;
    default: return `Limit of ${limit} reached.`;
  }
}
```

and replace three class lines (the block above has pushed them down, so find them by text, not by line number). Replace the `NotOpen` class line (originally line 7) with:

```ts
export class NotOpen extends DomainError { constructor(status: string) { super("NOT_OPEN", notOpenMessage(status), 409); } }
```

the `LineTaken` class line (originally line 10) with:

```ts
export class LineTaken extends DomainError { constructor(public numbers: number[]) { super("LINE_TAKEN", takenMessage(numbers), 409); } }
```
and the `CapExceeded` class line (originally line 12) with:

```ts
export class CapExceeded extends DomainError { constructor(public kind: string, public limit: number) { super("CAP_EXCEEDED", capMessage(kind, limit), 409); } }
```

- [ ] **Step 5: Write the failure mapping**

`src/lib/action-result.ts`:

```ts
import { CapExceeded, LineTaken, type DomainError } from "@/domain/errors";

export type CapKind = "per_person" | "host" | "global" | "bonus";
export type FailureDetails = { taken?: number[]; limit?: number; capKind?: CapKind };
export type ActionFailure = { ok: false; code: string; message: string; details?: FailureDetails };
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

const CAP_KIND: Record<string, CapKind> = {
  "lines per person": "per_person",
  "host-held lines": "host",
  "open unpaid claims": "global",
  "bonus lines": "bonus",
};

/** Domain error → the wire shape clients branch on. Typed details let the grid clear exactly the taken cells. */
export function toFailure(e: DomainError): ActionFailure {
  const base: ActionFailure = { ok: false, code: e.code, message: e.message };
  if (e instanceof LineTaken) return { ...base, details: { taken: [...e.numbers] } };
  if (e instanceof CapExceeded) return { ...base, details: { limit: e.limit, capKind: CAP_KIND[e.kind] } };
  return base;
}
```

Replace `src/lib/action.ts` with:

```ts
import { unstable_rethrow } from "next/navigation";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { DomainError } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";
import { toFailure, type ActionResult } from "./action-result";

export type { ActionResult, ActionFailure, FailureDetails, CapKind } from "./action-result";

export async function action<T>(fn: (tx: Tx, caller: Caller) => Promise<T>): Promise<ActionResult<T>> {
  const caller = await getCaller();
  if (!caller) return { ok: false, code: "NOT_SIGNED_IN", message: "Sign in to continue" };
  try {
    const data = await db.transaction((tx) => fn(tx, caller));
    return { ok: true, data };
  } catch (e) {
    // Let NEXT_REDIRECT / NEXT_NOT_FOUND propagate. Note a redirect thrown inside `fn` rolls the
    // transaction back; callers should redirect after `action` returns instead.
    unstable_rethrow(e);
    if (e instanceof DomainError) return toFailure(e);
    console.error(e);
    return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/lib/list.test.ts src/lib/action-result.test.ts`
Expected: PASS.

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: green. (No domain test asserts the old "are taken", "Limit of" or "This break is …" text; the `NotOpen` tests check the class only.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/list.ts src/lib/list.test.ts src/lib/action-result.ts src/lib/action-result.test.ts src/lib/action.ts src/domain/errors.ts
git commit -m "feat(actions): typed failure details for taken lines and caps"
```

---
### Task 4: Host ledger domain — per-buyer ledger, one-transaction release, bonus lines (model: opus)

The ledger in the design lists every buyer (paid ones too), filters by Sent, Unpaid and Overdue, says "4 h late", releases a buyer's lines in one confirmed step, and adds bonus lines. Today `unpaidByBuyer` returns unpaid buyers only, Release loops N separate transactions with no overdue reason (deferred finding, Task 13), and no bonus command exists. This task adds the query and the two commands, wires the existing host panel to them (still the old look), and removes the N-transaction loop.

**Files:**
- Create: `src/domain/lines/ledger.ts`, `src/domain/lines/ledger.test.ts`
- Modify: `src/domain/breaks/rules.ts` (append `bonusAllowance`)
- Modify: `src/domain/lines/queries.ts:24-33` (replace `unpaidByBuyer` with `ledgerByBuyer`)
- Modify: `src/domain/lines/commands.ts` (append `releaseForBuyer`, `addBonusLine`; `unmarkPaid` skips bonus lines)
- Modify: `src/domain/lines/commands.test.ts:6-10` (imports), `:242-260` (replace the `unpaidByBuyer` block; append new blocks)
- Modify: `src/app/b/[id]/actions.ts` (whole file), `src/app/b/[id]/host-panel.tsx` (whole file), `src/app/b/[id]/page.tsx` (whole file)

**Interfaces:**
- Consumes: `assertHostOf`, `assertOnboarded`, `validateNumbers`, `isOverdue`, `appendEvent`, `markPaid`, `unmarkPaid`, `releaseLine`, `BONUS_SHARE`, `CapExceeded`, `OwnerChanged`, `InvalidInput`, `NotOpen`.
- Produces:
  - `src/domain/lines/ledger.ts`: `type BuyerStatus = "sent" | "unpaid" | "overdue" | "paid"`, `LEDGER_ORDER: Record<BuyerStatus, number>`, `buyerStatus(b: { unpaid: readonly number[]; sent: readonly number[]; overdue: readonly number[] }): BuyerStatus`, `compareLedger(a: { status: BuyerStatus; firstClaimAt: Date }, b: same): number`.
  - `src/domain/lines/queries.ts`: `type LedgerBuyer = { ownerId: string; handle: string | null; displayName: string | null; numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[]; owedCents: number; firstClaimAt: Date; overdueSince: Date | null; status: BuyerStatus }`; `ledgerByBuyer(tx: Tx, breakId: string, now: Date): Promise<LedgerBuyer[]>` (ledger order: Sent, Unpaid, Overdue, Paid, each by first claim). `unpaidByBuyer` is removed.
  - `src/domain/breaks/rules.ts`: `bonusAllowance(lineCount: number): number` = `max(1, floor(lineCount / 10))`. This follows the platform spec (§7); the UI design's "at most 10% of N" wording is aligned to it separately (recorded erratum 3), so a break under 10 lines still allows one bonus line.
  - `unmarkPaid` never un-marks a bonus line (`and is_bonus = false`): a crafted host request cannot turn a free line into an unpaid one that counts toward the buyer's unpaid cap. It throws "That line is not marked paid".
  - `releaseForBuyer(tx, caller, { breakId: string; ownerId: string; numbers: number[]; reason: "overdue" | "host_dropped" }): Promise<{ released: number[] }>` — host or admin; all lines must belong to `ownerId` and be unpaid (and overdue for that reason) or nothing is released; one `line.released {number, reason}` event per line.
  - `addBonusLine(tx, caller, { breakId: string; ownerId: string }): Promise<{ number: number }>` — host or admin; `open|filled` main breaks; recipient must hold a numbered line; at most `bonusAllowance(lineCount)`; inserts the next number above N as paid, `price_cents = 0`, `is_bonus = true`; event `line.bonus_added {number, ownerId}`.
  - Server actions in `src/app/b/[id]/actions.ts`: `unpaidForBuyer(breakId, numbers)`, `releaseBuyer(breakId, ownerId, numbers, reason)`, `giveBack(breakId, numbers)`, `addBonus(breakId, ownerId)`; `release` (single line) is removed; `claim`, `claimRandomAction`, `claimNextAction`, `claimRest`, `sent`, `paidForBuyer` are unchanged.
  - `HostRow = { ownerId: string; handle: string | null; unpaid: number[]; sent: number[]; overdue: number[]; owedCents: number; status: BuyerStatus }` exported from `host-panel.tsx` (temporary; Task 13b deletes the panel).

- [ ] **Step 1: Write the failing pure tests**

`src/domain/lines/ledger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buyerStatus, compareLedger } from "./ledger";
import { bonusAllowance } from "@/domain/breaks/rules";

describe("buyerStatus", () => {
  it("is paid when nothing is unpaid", () => expect(buyerStatus({ unpaid: [], sent: [], overdue: [] })).toBe("paid"));
  it("is overdue as soon as one unpaid line is overdue, even with sent lines", () => expect(buyerStatus({ unpaid: [11, 12], sent: [11], overdue: [12] })).toBe("overdue"));
  it("is sent only when every unpaid line is sent", () => {
    expect(buyerStatus({ unpaid: [2, 5], sent: [2, 5], overdue: [] })).toBe("sent");
    expect(buyerStatus({ unpaid: [2, 5], sent: [2], overdue: [] })).toBe("unpaid");
  });
});

describe("compareLedger", () => {
  it("orders Sent, Unpaid, Overdue, Paid, then by first claim", () => {
    const t = (h: number) => new Date(Date.UTC(2026, 9, 13, h));
    const rows = [
      { id: "paid", status: "paid" as const, firstClaimAt: t(1) },
      { id: "late", status: "overdue" as const, firstClaimAt: t(2) },
      { id: "unpaid-b", status: "unpaid" as const, firstClaimAt: t(5) },
      { id: "unpaid-a", status: "unpaid" as const, firstClaimAt: t(4) },
      { id: "sent", status: "sent" as const, firstClaimAt: t(9) },
    ];
    expect([...rows].sort(compareLedger).map((r) => r.id)).toEqual(["sent", "unpaid-a", "unpaid-b", "late", "paid"]);
  });
});

describe("bonusAllowance", () => {
  it("is 10% of N, at least one", () => expect([2, 6, 12, 20, 30, 50].map(bonusAllowance)).toEqual([1, 1, 1, 2, 3, 5]));
});
```

- [ ] **Step 2: Write the failing DB tests**

In `src/domain/lines/commands.test.ts`, replace the import lines from `./commands`, `./rules`, `./queries` (both of them, including the `globalUnpaidCount` import Task 2 added), `@/db/schema` and `@/domain/errors` with:

```ts
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill, releaseForBuyer, addBonusLine } from "./commands";
import { isOverdue } from "./rules";
import { ledgerByBuyer, globalUnpaidCount } from "./queries";
import { breaks, lines, events } from "@/db/schema";
import { CapExceeded, InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
```

Replace the whole `describe("unpaidByBuyer", …)` block with:

```ts
describe("ledgerByBuyer", () => {
  it("lists every buyer in ledger order with per-buyer numbers, owed and overdue", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const alice = await makeUser(tx); const dave = await makeUser(tx); const carol = await makeUser(tx);
      const bob = await makeUser(tx); const erin = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12, linePriceCents: 500 });
      const claim = (u: { id: string }, numbers: number[]) => claimLines(tx, c(u), { breakId: b.id, numbers, batchId: randomUUID() });
      await claim(alice, [2, 5]); await markSent(tx, c(alice), { breakId: b.id, numbers: [2, 5] });
      await claim(dave, [4]);
      await claim(carol, [9]);
      await claim(bob, [7]); await markPaid(tx, c(host, "host"), { breakId: b.id, number: 7, expectedOwnerId: bob.id });
      await claim(erin, [10, 11, 12]);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 10, expectedOwnerId: erin.id });
      await markSent(tx, c(erin), { breakId: b.id, numbers: [11] });
      await tx.execute(sql`update lines set claimed_at = now() - interval '30 hours' where break_id = ${b.id} and number = 9`);
      await tx.execute(sql`update lines set claimed_at = now() - interval '29 hours' where break_id = ${b.id} and number = 12`);

      const rows = await ledgerByBuyer(tx, b.id, new Date());
      expect(rows.map((r) => r.ownerId)).toEqual([alice.id, dave.id, carol.id, erin.id, bob.id]);
      const by = Object.fromEntries(rows.map((r) => [r.ownerId, r]));
      expect(by[alice.id]).toMatchObject({ status: "sent", handle: alice.handle, unpaid: [2, 5], sent: [2, 5], overdue: [], paid: [], owedCents: 1000, overdueSince: null });
      expect(by[dave.id]).toMatchObject({ status: "unpaid", unpaid: [4], owedCents: 500 });
      expect(by[carol.id]).toMatchObject({ status: "overdue", overdue: [9], owedCents: 500 });
      expect(by[carol.id].overdueSince).toBeInstanceOf(Date);
      // Review Focus 4: one paid, one sent, one overdue line.
      expect(by[erin.id]).toMatchObject({ status: "overdue", numbers: [10, 11, 12], paid: [10], sent: [11], overdue: [12], unpaid: [11, 12], owedCents: 1000 });
      expect(by[bob.id]).toMatchObject({ status: "paid", paid: [7], unpaid: [], owedCents: 0 });
    });
  });
  it("is empty for a break nobody has claimed in", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      expect(await ledgerByBuyer(tx, b.id, new Date())).toEqual([]);
    });
  });
});

describe("releaseForBuyer", () => {
  it("releases a buyer's lines in one call and logs one event per line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 4, 6], batchId: randomUUID() });
      expect(await releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [6, 3], reason: "host_dropped" })).toEqual({ released: [3, 6] });
      const rows = await lineRows(tx, b.id);
      expect([rows[2].ownerId, rows[3].ownerId, rows[5].ownerId]).toEqual([null, a.id, null]);
      expect(rows[2].claimedAt).toBeNull(); expect(rows[2].priceCents).toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.released'`)
        .orderBy(sql`(${events.payload}->>'number')::int`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 3, reason: "host_dropped" }, { number: 6, reason: "host_dropped" }]);
    });
  });
  it("releases nothing if one line changed hands or is paid", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 3], batchId: randomUUID() });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [2], batchId: randomUUID() });
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 2], reason: "host_dropped" })).rejects.toBeInstanceOf(OwnerChanged);
      expect((await lineRows(tx, b.id))[0].ownerId).toBe(a.id);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id });
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 3], reason: "host_dropped" })).rejects.toThrow(/paid/);
      expect((await lineRows(tx, b.id))[0].ownerId).toBe(a.id);
    });
  });
  it("needs every line overdue for the overdue reason, and only the host may release", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const other = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await tx.execute(sql`update lines set claimed_at = now() - interval '25 hours' where break_id = ${b.id} and number = 1`);
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 2], reason: "overdue" })).rejects.toThrow(/not overdue yet/);
      await expect(releaseForBuyer(tx, c(other), { breakId: b.id, ownerId: a.id, numbers: [1], reason: "overdue" })).rejects.toBeInstanceOf(NotAuthorized);
      expect(await releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1], reason: "overdue" })).toEqual({ released: [1] });
    });
  });
});

describe("addBonusLine", () => {
  it("adds the next number above N as a paid bonus line, within 10% of N", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      expect(await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).toEqual({ number: 13 });
      const [l] = (await lineRows(tx, b.id)).filter((r) => r.number === 13);
      expect(l).toMatchObject({ ownerId: a.id, isBonus: true, priceCents: 0 });
      expect(l.paidAt).not.toBeNull(); expect(l.claimedAt).not.toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.bonus_added'`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 13, ownerId: a.id }]);
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(CapExceeded);
      expect(await status(tx, b.id)).toBe("open");
    });
  });
  it("cannot be un-marked paid", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      const { number } = await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id });
      await expect(unmarkPaid(tx, c(host, "host"), { breakId: b.id, number })).rejects.toThrow(/not marked paid/);
      const [l] = (await lineRows(tx, b.id)).filter((r) => r.number === number);
      expect(l.paidAt).not.toBeNull();
    });
  });
  it("only goes to someone holding a line, and only the host may add it", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const stranger = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: stranger.id })).rejects.toThrow(/holds a line/);
      await expect(addBonusLine(tx, c(a), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm test src/domain/lines`
Expected: FAIL. `ledger.test.ts` fails with `Failed to resolve import "./ledger"`. In `commands.test.ts` the new blocks fail with `TypeError: ledgerByBuyer is not a function`, `TypeError: releaseForBuyer is not a function` and `TypeError: addBonusLine is not a function` (missing named exports are `undefined` at runtime).

- [ ] **Step 4: Write the pure ledger rules and the bonus allowance**

`src/domain/lines/ledger.ts`:

```ts
export type BuyerStatus = "sent" | "unpaid" | "overdue" | "paid";

/** Fixed ledger order (design §5.5): Sent first, then unpaid by claim time, then overdue, then paid at the bottom. */
export const LEDGER_ORDER: Record<BuyerStatus, number> = { sent: 0, unpaid: 1, overdue: 2, paid: 3 };

export function buyerStatus(b: { unpaid: readonly number[]; sent: readonly number[]; overdue: readonly number[] }): BuyerStatus {
  if (b.unpaid.length === 0) return "paid";
  if (b.overdue.length > 0) return "overdue";
  if (b.sent.length === b.unpaid.length) return "sent";
  return "unpaid";
}

export function compareLedger(a: { status: BuyerStatus; firstClaimAt: Date }, b: { status: BuyerStatus; firstClaimAt: Date }): number {
  return LEDGER_ORDER[a.status] - LEDGER_ORDER[b.status] || a.firstClaimAt.getTime() - b.firstClaimAt.getTime();
}
```

Append to `src/domain/breaks/rules.ts`:

```ts
/** Bonus lines a host may add: 10% of N, at least one (spec §7). */
export const bonusAllowance = (lineCount: number): number => Math.max(1, Math.floor(lineCount * BONUS_SHARE));
```

- [ ] **Step 5: Replace `unpaidByBuyer` with `ledgerByBuyer`**

In `src/domain/lines/queries.ts`, change line 1 to

```ts
import { sql, eq, desc, asc } from "drizzle-orm";
```
add after line 3

```ts
import { isOverdue } from "./rules";
import { buyerStatus, compareLedger, type BuyerStatus } from "./ledger";
```
and replace the `unpaidByBuyer` function (lines 24-33) with:

```ts
export type LedgerBuyer = {
  ownerId: string; handle: string | null; displayName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; firstClaimAt: Date; overdueSince: Date | null; status: BuyerStatus;
};

/** Host ledger: every buyer in the break (paid ones too), grouped, in the fixed ledger order. `now` decides overdue. */
export async function ledgerByBuyer(tx: Tx, breakId: string, now: Date): Promise<LedgerBuyer[]> {
  const [b] = await tx.select({ paymentWindowHours: breaks.paymentWindowHours }).from(breaks).where(eq(breaks.id, breakId));
  if (!b) return [];
  const rows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, handle: users.handle, displayName: users.displayName,
    claimedAt: lines.claimedAt, sentAt: lines.sentAt, paidAt: lines.paidAt, priceCents: lines.priceCents, isBonus: lines.isBonus,
  }).from(lines).innerJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  const by = new Map<string, LedgerBuyer>();
  for (const r of rows) {
    const ownerId = r.ownerId!;
    const claimedAt = r.claimedAt!; // lines_owned_claimed_chk: owned lines always have claimed_at
    const g: LedgerBuyer = by.get(ownerId) ?? {
      ownerId, handle: r.handle, displayName: r.displayName, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [],
      owedCents: 0, firstClaimAt: claimedAt, overdueSince: null, status: "paid",
    };
    g.numbers.push(r.number);
    if (r.isBonus) g.bonus.push(r.number);
    if (r.paidAt) {
      g.paid.push(r.number);
    } else {
      g.unpaid.push(r.number);
      g.owedCents += r.priceCents ?? 0;
      if (r.sentAt) g.sent.push(r.number);
      if (isOverdue(r, b, now)) {
        g.overdue.push(r.number);
        const due = new Date(claimedAt.getTime() + b.paymentWindowHours * 3_600_000);
        if (!g.overdueSince || due < g.overdueSince) g.overdueSince = due;
      }
    }
    if (claimedAt < g.firstClaimAt) g.firstClaimAt = claimedAt;
    by.set(ownerId, g);
  }
  return [...by.values()].map((g) => ({ ...g, status: buyerStatus(g) })).sort(compareLedger);
}
```

- [ ] **Step 6: Add the two commands**

In `src/domain/lines/commands.ts`, change the imports on lines 1-8 to:

```ts
import { sql, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, lines } from "@/db/schema";
import { lockBreak, assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { CapExceeded, InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { bonusAllowance } from "@/domain/breaks/rules";
import { assertCaps, isOverdue, validateNumbers } from "./rules";
```

Append to the end of the file:

```ts
/** Host releases several of one buyer's unpaid lines in one transaction: all of them or none. */
export async function releaseForBuyer(tx: Tx, caller: Caller, p: { breakId: string; ownerId: string; numbers: number[]; reason: "overdue" | "host_dropped" }): Promise<{ released: number[] }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, p.breakId); // locks the break row first
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  const numbers = validateNumbers(p.numbers, b.lineCount);
  const current = await tx.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${inArray(lines.number, numbers)}`).for("update");
  for (const n of numbers) {
    const l = current.find((r) => r.number === n);
    if (!l || l.ownerId !== p.ownerId) throw new OwnerChanged();
    if (l.paidAt) throw new InvalidInput(`Line ${n} is paid. Un-mark it first.`);
    if (p.reason === "overdue" && !isOverdue(l, b)) throw new InvalidInput(`Line ${n} is not overdue yet`);
  }
  await tx.update(lines).set({ ownerId: null, claimedAt: null, sentAt: null, priceCents: null, claimBatchId: null })
    .where(sql`${lines.breakId} = ${b.id} and ${inArray(lines.number, numbers)} and ${lines.ownerId} = ${p.ownerId} and ${lines.paidAt} is null`);
  for (const n of numbers) {
    await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.released", payload: { number: n, reason: p.reason } });
  }
  return { released: numbers };
}

/** Host gives a participant a free, already-paid line numbered above N (spec §7 bonus). */
export async function addBonusLine(tx: Tx, caller: Caller, p: { breakId: string; ownerId: string }): Promise<{ number: number }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, p.breakId); // locks the break row first
  if (b.status !== "open" && b.status !== "filled") throw new NotOpen(b.status);
  if (b.kind !== "main") throw new InvalidInput("Bonus lines are for main breaks only");
  const [held] = await tx.select({ n: sql<number>`count(*)::int` }).from(lines)
    .where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} = ${p.ownerId} and ${lines.number} <= ${b.lineCount}`);
  if (held.n === 0) throw new InvalidInput("A bonus line goes to someone who holds a line in this break");
  const [agg] = await tx.select({
    used: sql<number>`(count(*) filter (where ${lines.isBonus}))::int`,
    top: sql<number>`coalesce(max(${lines.number}), 0)::int`,
  }).from(lines).where(sql`${lines.breakId} = ${b.id}`);
  const max = bonusAllowance(b.lineCount);
  if (agg.used >= max) throw new CapExceeded("bonus lines", max);
  const number = Math.max(agg.top, b.lineCount) + 1;
  const now = new Date();
  await tx.insert(lines).values({ breakId: b.id, number, ownerId: p.ownerId, claimedAt: now, paidAt: now, priceCents: 0, isBonus: true });
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "line.bonus_added", payload: { number, ownerId: p.ownerId } });
  return { number };
}
```

In `unmarkPaid`, replace the update statement (originally line 136)

```ts
  const rows = await tx.execute<{ owner_id: string }>(sql`update lines set paid_at = null where break_id = ${b.id} and number = ${p.number} and paid_at is not null and award_id is null returning owner_id`);
```
with
```ts
  // Bonus lines are free and always paid: never un-mark them (they would count toward the buyer's unpaid cap).
  const rows = await tx.execute<{ owner_id: string }>(sql`update lines set paid_at = null where break_id = ${b.id} and number = ${p.number} and paid_at is not null and award_id is null and is_bonus = false returning owner_id`);
```

(`recomputeFill` is not needed after either new command: releasing touches unpaid lines only, so it cannot change a filled break, and a bonus line is above N and already paid.)

- [ ] **Step 7: Run the domain tests to see them pass**

Run: `pnpm test src/domain/lines`
Expected: PASS.

- [ ] **Step 8: Rewrite the break actions**

Replace `src/app/b/[id]/actions.ts` with:

```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { action } from "@/lib/action";
import { hashIp } from "@/lib/ip-hash";
import { parseInput } from "@/lib/parse-input";
import {
  claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, releaseForBuyer, addBonusLine,
} from "@/domain/lines/commands";

const uuid = z.string().uuid();
const nums = z.array(z.number().int().min(1).max(1100)).min(1).max(200);

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return ip ? hashIp(ip) : undefined;
}
const done = (breakId: string) => revalidatePath(`/b/${breakId}`);

export async function claim(breakId: string, numbers: number[], batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums, batchId: uuid }), { breakId, numbers, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimLines(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRandomAction(breakId: string, count: number, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }), { breakId, count, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimRandom(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimNextAction(breakId: string, count: number, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }), { breakId, count, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimNext(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRest(breakId: string, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, batchId: uuid }), { breakId, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimAllOpen(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function sent(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => markSent(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
/** Buyer gives back unpaid lines (reason `withdrawn`), all in one transaction. */
export async function giveBack(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await releaseLine(tx, c, { breakId: p.breakId, number, reason: "withdrawn" });
    return { released: p.numbers };
  });
  if (r.ok) done(breakId);
  return r;
}
export async function paidForBuyer(breakId: string, ownerId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid, numbers: nums }), { breakId, ownerId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    let filled = false;
    for (const number of p.numbers) filled = (await markPaid(tx, c, { breakId: p.breakId, number, expectedOwnerId: p.ownerId })).filled;
    return { filled };
  });
  if (r.ok) done(breakId);
  return r;
}
/** Host undoes Paid (the ledger's Undo and per-line un-mark); each line logs `line.unpaid`. */
export async function unpaidForBuyer(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await unmarkPaid(tx, c, { breakId: p.breakId, number });
    return null;
  });
  if (r.ok) done(breakId);
  return r;
}
export async function releaseBuyer(breakId: string, ownerId: string, numbers: number[], reason: "overdue" | "host_dropped") {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid, numbers: nums, reason: z.enum(["overdue", "host_dropped"]) }), { breakId, ownerId, numbers, reason });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => releaseForBuyer(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
export async function addBonus(breakId: string, ownerId: string) {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid }), { breakId, ownerId });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => addBonusLine(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
```

- [ ] **Step 9: Point the old host panel at the new query and action**

Replace `src/app/b/[id]/host-panel.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { paidForBuyer, releaseBuyer } from "./actions";
import { formatCents } from "@/lib/money";
import { requestDrawAction, finaliseDrawAction } from "./draw-actions";
import { openBreakAction } from "./host-actions";
import { releasePrompt } from "./release-prompt";
import type { ActionResult } from "@/lib/action";
import type { BuyerStatus } from "@/domain/lines/ledger";

export type HostRow = { ownerId: string; handle: string | null; unpaid: number[]; sent: number[]; overdue: number[]; owedCents: number; status: BuyerStatus };

export function HostPanel({ breakId, status, rows }: { breakId: string; status: string; rows: HostRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message); });
  const unpaid = rows.filter((u) => u.status !== "paid");
  const confirmRelease = (u: HostRow) => {
    if (!window.confirm(releasePrompt({ handle: u.handle, numbers: u.unpaid, sentNumbers: u.sent }))) return;
    const reason = u.overdue.length > 0 && u.overdue.length === u.unpaid.length ? "overdue" : "host_dropped";
    run(() => releaseBuyer(breakId, u.ownerId, u.unpaid, reason));
  };
  return (
    <section className="mt-4 space-y-2 rounded border border-black p-3">
      <h2 className="font-medium">Host</h2>
      {status === "draft" && (
        <>
          <p className="text-sm text-neutral-600">This break is a draft. Nobody can claim lines until you open it.</p>
          <button disabled={pending} onClick={() => run(() => openBreakAction(breakId))} className="w-full rounded bg-black p-3 text-white">Open for claims</button>
        </>
      )}
      {status === "open" && unpaid.length === 0 && <p className="text-sm text-neutral-600">No unpaid claims.</p>}
      {unpaid.map((u) => (
        <div key={u.ownerId} className="flex items-center justify-between rounded bg-neutral-50 p-2 text-sm">
          <div><b>{u.handle ?? "?"}</b> · lines {u.unpaid.join(", ")} · {formatCents(u.owedCents)} {u.status === "sent" && <span className="text-blue-700">· sent</span>}</div>
          <div className="flex gap-1">
            <button disabled={pending} onClick={() => run(() => paidForBuyer(breakId, u.ownerId, u.unpaid))} className="rounded bg-green-700 px-2 py-1 text-white">Paid</button>
            <button disabled={pending} onClick={() => confirmRelease(u)} className="rounded border px-2 py-1">Release</button>
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

In `src/app/b/[id]/page.tsx` (the Task 2 version), change the import

```tsx
import { unpaidByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
```
to
```tsx
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
```
replace

```tsx
  const unpaid = isHost ? await db.transaction((tx) => unpaidByBuyer(tx, id)) : [];
```
with
```tsx
  const ledger = isHost ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];
```
and replace the `HostPanel` line with:

```tsx
      {isHost && <HostPanel breakId={id} status={page.break.status} rows={ledger.map((u) => ({ ownerId: u.ownerId, handle: u.handle, unpaid: u.unpaid, sent: u.sent, overdue: u.overdue, owedCents: u.owedCents, status: u.status }))} />}
```

(Dates in `LedgerBuyer` stay on the server; the client panel receives only arrays, numbers and strings.)

- [ ] **Step 10: Run everything, including the journey**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm test:concurrency && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green. The concurrency suite still passes (`releaseForBuyer` and `addBonusLine` lock the break row first via `assertHostOf`, then lines). The journey still finds one "Paid" button per unpaid buyer and "· sent" for the buyer who marked sent.

- [ ] **Step 11: Commit**

```bash
git add src/domain/lines src/domain/breaks/rules.ts "src/app/b/[id]/actions.ts" "src/app/b/[id]/host-panel.tsx" "src/app/b/[id]/page.tsx"
git commit -m "feat(ledger): per-buyer ledger, one-transaction release and bonus lines"
```

---

### Task 5: Money and local-time formats, the session viewer, and the journey on test ids (model: sonnet)

Three small foundations the screens need, plus the e2e re-keying that must happen before any task rewrites copy. `formatMoney` gives "$5", "$5.50", "$1,250" (the deferred finding "formatCents no thousands separator"). The time helpers take the zone as a parameter, so the pure tests stay deterministic, and absolute times reach the viewer in their own zone: the audience is US and UK hobbyists, and the deadline is the one line that decides whether they lose their lines. The server renders a fallback in the zone from a `tz` cookie (unlabelled) or, with no valid cookie, in America/New_York labelled with its short name ("9:40 pm EDT tomorrow"); the client `LocalTime` component renders that fallback first, so hydration matches byte for byte, then reformats in the browser's zone. A one-line client effect in the root layout writes the cookie, so from the second page view server and client agree and nothing reflows. Relative strings ("4 h late") stay plain server strings. `getSessionViewer` feeds the header (handle, display name, role, email) from the row `getCaller` already upserts, with no second query.

The journey is re-keyed on `data-testid` attributes added to today's components; later tasks keep these ids on the replacement elements. **This task updates `e2e/journey-1.spec.ts`.**

**Files:**
- Modify: `src/lib/money.ts`, `src/lib/money.test.ts`
- Create: `src/lib/time.ts`, `src/lib/time.test.ts`, `src/lib/zone.ts`, `src/components/local-time.tsx`, `src/components/tz-cookie.tsx`
- Modify: `src/auth/session.ts` (`syncUser` also returns `email`; new cached `getSessionUser`; `getCaller` derives from it)
- Create: `src/auth/viewer.ts`, `src/auth/viewer.test.ts`
- Modify: `src/app/layout.tsx` (mount `<TzCookie />`)
- Modify: `src/app/b/[id]/claim-panel.tsx` (whole file), `src/app/b/[id]/host-panel.tsx` (whole file), `src/app/b/[id]/page.tsx` (whole file)
- Modify: `src/app/b/[id]/result/reveal.tsx:18`, `src/app/b/[id]/result/verify.tsx:11`, `src/app/host/new/form.tsx:26`
- Modify: `e2e/journey-1.spec.ts` (whole file)

**Interfaces:**
- Consumes: `users` table, `syncUser`, `toCaller`, `db`.
- Produces:
  - `formatMoney(cents: number): string` in `src/lib/money.ts` (`formatCents` stays for machine-facing text).
  - In `src/lib/time.ts` (pure, safe on server and client): `DEFAULT_TZ = "America/New_York"`; `type Zone = { tz: string; labelled: boolean }`; `zoneLabel(tz: string, at?: Date): string` (Intl short name: "EDT", "EST"); `isTimeZone(v: unknown): v is string` (`"UTC"` or a member of `Intl.supportedValuesOf("timeZone")`); `resolveZone(cookie: string | undefined): Zone` (valid cookie: that zone, unlabelled; else `DEFAULT_TZ`, labelled); `formatClock(d: Date, tz: string): string` ("9:40 pm"); `formatDeadline(deadline: Date, now: Date, tz: string, labelled?: boolean): string` ("9:40 pm today" / "9:40 pm tomorrow" / "9:40 pm on Fri, Oct 16"; labelled: "9:40 pm EDT tomorrow"); `formatDateTime(d: Date, tz: string, labelled?: boolean): string` ("Oct 13, 2026 at 9:40 pm"; labelled: "… 9:40 pm EDT"); `formatMonthYear(d: Date, tz?: string): string` ("Oct 2026"); `formatLate(since: Date, now: Date): string` ("35 min late", "4 h late", "3 days late"); `daysSince(d: Date, now: Date): number`.
  - `viewerZone(): Promise<Zone>` in `src/lib/zone.ts` (`server-only`; reads the `tz` cookie through `resolveZone`).
  - `<LocalTime iso fallback kind />` in `src/components/local-time.tsx` (client; `kind: "deadline" | "datetime"`; renders `<time dateTime={iso}>{fallback}</time>`, then reformats in the browser's zone in `useEffect`).
  - `<TzCookie />` in `src/components/tz-cookie.tsx` (client; writes `tz=<IANA>; path=/; max-age=31536000; samesite=lax` when missing or different; renders nothing).
  - `src/auth/session.ts`: `type SessionUser = UserRow & { email: string }`; `syncUser(…): Promise<SessionUser>`; `getSessionUser(): Promise<SessionUser | null>` (React `cache`d; one upsert per request); `getCaller` unchanged in signature, now `toCaller(await getSessionUser())`.
  - `src/auth/viewer.ts` (`server-only`): `type Viewer = { id: string; handle: string | null; displayName: string | null; role: Role; email: string }`; `toViewer(u: SessionUser): Viewer`; `getSessionViewer(): Promise<Viewer | null>` (React `cache`d; no query of its own).
  - Test ids used by the journey from now on: `composer-open`, `cell-<n>`, `claim-submit`, `owed`, `mark-sent`, `sent-note`, `claim-rest`, `ledger-row` (with `data-status="sent|unpaid|overdue|paid"`), `ledger-paid`, `paid-count`, `run-draw`, `finish-draw`, `see-result`, `winner`, `verify-status`, `verify-run`.

- [ ] **Step 1: Write the failing helper tests**

Replace `src/lib/money.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { formatCents, formatMoney } from "./money";

describe("formatCents", () => {
  it("always prints two decimals (deep links, machine text)", () => {
    expect(formatCents(2000)).toBe("$20.00"); expect(formatCents(250)).toBe("$2.50"); expect(formatCents(0)).toBe("$0.00");
  });
});

describe("formatMoney", () => {
  it("drops zero cents and groups thousands", () => {
    expect(formatMoney(500)).toBe("$5");
    expect(formatMoney(550)).toBe("$5.50");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(125000)).toBe("$1,250");
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(100000000)).toBe("$1,000,000");
    expect(formatMoney(-250)).toBe("-$2.50");
  });
});
```

`src/lib/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TZ, daysSince, formatClock, formatDateTime, formatDeadline, formatLate, formatMonthYear, isTimeZone, resolveZone, zoneLabel } from "./time";

const now = new Date("2026-10-13T16:00:00Z"); // Tuesday: 12:00 pm in New York (EDT), 5:00 pm in London (BST)

// One row per zone. The UK leaves summer time on 2026-10-25, a week before the US (2026-11-01).
const ZONES = [
  {
    tz: "America/New_York",
    clock: ["9:40 pm", "9:05 am"],
    days: ["9:40 pm today", "9:40 pm tomorrow", "9:40 pm on Fri, Oct 16"],
    focus5: "11:30 pm today",
    ukChange: ["5:00 am tomorrow", "7:30 pm today"],
    usChange: "9:00 am tomorrow",
    dateTime: "Oct 13, 2026 at 9:40 pm",
  },
  {
    tz: "Europe/London",
    clock: ["2:40 am", "2:05 pm"],
    days: ["2:40 am tomorrow", "2:40 am on Thu, Oct 15", "2:40 am on Sat, Oct 17"],
    focus5: "4:30 am tomorrow",
    ukChange: ["9:00 am tomorrow", "12:30 am tomorrow"],
    usChange: "2:00 pm tomorrow",
    dateTime: "Oct 14, 2026 at 2:40 am",
  },
] as const;

describe.each(ZONES)("absolute times in $tz", (z) => {
  it("prints a lowercase 12-hour clock in the zone", () => {
    expect(formatClock(new Date("2026-10-14T01:40:00Z"), z.tz)).toBe(z.clock[0]);
    expect(formatClock(new Date("2026-10-13T13:05:00Z"), z.tz)).toBe(z.clock[1]);
  });
  it("says today, tomorrow or the date, decided in the zone", () => {
    expect(formatDeadline(new Date("2026-10-14T01:40:00Z"), now, z.tz)).toBe(z.days[0]);
    expect(formatDeadline(new Date("2026-10-15T01:40:00Z"), now, z.tz)).toBe(z.days[1]);
    expect(formatDeadline(new Date("2026-10-17T01:40:00Z"), now, z.tz)).toBe(z.days[2]);
  });
  it("decides the day in the viewer's zone, not UTC (Review Focus 5)", () => {
    // 03:30 UTC on the 14th: 11:30 pm on the 13th in New York, 4:30 am on the 14th in London.
    expect(formatDeadline(new Date("2026-10-14T03:30:00Z"), now, z.tz)).toBe(z.focus5);
  });
  it("keeps the wall-clock hour across the UK clock change (2026-10-25)", () => {
    const sat = new Date("2026-10-24T16:00:00Z");
    expect(formatDeadline(new Date("2026-10-25T09:00:00Z"), sat, z.tz)).toBe(z.ukChange[0]);
    expect(formatDeadline(new Date("2026-10-24T23:30:00Z"), sat, z.tz)).toBe(z.ukChange[1]);
  });
  it("keeps the wall-clock hour across the US clock change (2026-11-01)", () => {
    expect(formatDeadline(new Date("2026-11-01T14:00:00Z"), new Date("2026-10-31T16:00:00Z"), z.tz)).toBe(z.usChange);
  });
  it("formats a date and time, unlabelled", () => {
    expect(formatDateTime(new Date("2026-10-14T01:40:00Z"), z.tz)).toBe(z.dateTime);
  });
});

describe("the server fallback zone", () => {
  it("labels the default zone with its short name, which follows the clock change", () => {
    expect(zoneLabel(DEFAULT_TZ, new Date("2026-10-14T01:40:00Z"))).toBe("EDT");
    expect(zoneLabel(DEFAULT_TZ, new Date("2026-11-14T01:40:00Z"))).toBe("EST");
    expect(formatDeadline(new Date("2026-10-14T03:30:00Z"), now, DEFAULT_TZ, true)).toBe("11:30 pm EDT today");
    expect(formatDateTime(new Date("2026-10-14T01:40:00Z"), DEFAULT_TZ, true)).toBe("Oct 13, 2026 at 9:40 pm EDT");
  });
  it("trusts a valid tz cookie, unlabelled, and falls back to the labelled default otherwise", () => {
    expect(resolveZone("Europe/London")).toEqual({ tz: "Europe/London", labelled: false });
    expect(resolveZone("UTC")).toEqual({ tz: "UTC", labelled: false });
    expect(resolveZone(undefined)).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(resolveZone("Mars/Olympus")).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(resolveZone("x".repeat(200))).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(isTimeZone(42)).toBe(false);
  });
});

describe("relative times and dates", () => {
  it("uses minutes, then hours, then days", () => {
    expect(formatLate(new Date(now.getTime() - 35 * 60_000), now)).toBe("35 min late");
    expect(formatLate(new Date(now.getTime() - 4 * 3_600_000 - 59 * 60_000), now)).toBe("4 h late");
    expect(formatLate(new Date(now.getTime() - 3 * 86_400_000), now)).toBe("3 days late");
    expect(formatLate(now, now)).toBe("1 min late");
  });
  it("counts whole days and names the month", () => {
    expect(daysSince(new Date(now.getTime() - 3.5 * 86_400_000), now)).toBe(3);
    expect(formatMonthYear(new Date("2026-10-01T12:00:00Z"))).toBe("Oct 2026");
    expect(formatMonthYear(new Date("2026-10-01T12:00:00Z"), "Europe/London")).toBe("Oct 2026");
  });
});
```

`src/auth/viewer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { syncUser } from "./session";
import { toViewer } from "./viewer";
import { withTx } from "../../tests/helpers/db";
import { makeUser } from "../../tests/helpers/fixtures";

describe("toViewer", () => {
  it("builds the viewer from the row syncUser already returns (email included, no second query)", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { role: "host" });
      const email = `${u.handle}@example.com`;
      const row = await syncUser(tx, u.id, email, false);
      expect(row.email).toBe(email);
      expect(toViewer(row)).toEqual({ id: u.id, handle: u.handle, displayName: u.handle, role: "host", email });
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/lib/money.test.ts src/lib/time.test.ts src/auth/viewer.test.ts`
Expected: FAIL. `money.test.ts` fails with `TypeError: formatMoney is not a function` (a missing export from an existing module is `undefined`); `time.test.ts` fails with `Failed to resolve import "./time"`; `viewer.test.ts` fails with `Failed to resolve import "./viewer"`.

- [ ] **Step 3: Implement the helpers, the session viewer, `LocalTime` and the tz cookie**

Replace `src/lib/money.ts` with:

```ts
/** "$20.00": always two decimals. Machine-facing text only (deep links use their own amount format). */
export const formatCents = (n: number) => `$${(n / 100).toFixed(2)}`;

/** UI money (design §6): "$5", "$5.50", "$1,250". Whole dollars drop the cents. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = abs % 100;
  return `${sign}$${whole}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}
```

`src/lib/time.ts`:

```ts
/**
 * Time strings. Pure and zone-explicit, so the same module runs on the server (fallback text) and in
 * the browser (LocalTime). Absolute times are shown in the viewer's zone; relative ones are zone-free.
 */
export const DEFAULT_TZ = "America/New_York";
export type Zone = { tz: string; labelled: boolean };

let known: Set<string> | null = null;
/** "UTC" or an IANA name this runtime knows (Intl.supportedValuesOf omits "UTC" in V8). */
export function isTimeZone(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 64) return false;
  if (v === "UTC") return true;
  known ??= new Set(Intl.supportedValuesOf("timeZone"));
  return known.has(v);
}

/** The server's fallback zone: the viewer's own (from the tz cookie), unlabelled; else the default, labelled. */
export function resolveZone(cookie: string | undefined): Zone {
  return isTimeZone(cookie) ? { tz: cookie, labelled: false } : { tz: DEFAULT_TZ, labelled: true };
}

/** Short zone name at a given instant ("EDT" in October, "EST" in November). */
export function zoneLabel(tz: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((x) => x.type === "timeZoneName");
  return part?.value ?? tz;
}

const dayKey = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayNumber = (d: Date, tz: string) => Date.parse(`${dayKey(d, tz)}T00:00:00Z`) / 86_400_000;

export function formatClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d).replace(/\s+/g, " ").toLowerCase();
}

/** "9:40 pm tomorrow"; labelled (server fallback without a tz cookie): "9:40 pm EDT tomorrow". */
export function formatDeadline(deadline: Date, now: Date, tz: string, labelled = false): string {
  const clock = labelled ? `${formatClock(deadline, tz)} ${zoneLabel(tz, deadline)}` : formatClock(deadline, tz);
  const days = dayNumber(deadline, tz) - dayNumber(now, tz);
  if (days === 0) return `${clock} today`;
  if (days === 1) return `${clock} tomorrow`;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(deadline);
  return `${clock} on ${date}`;
}

export function formatDateTime(d: Date, tz: string, labelled = false): string {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d);
  return `${date} at ${formatClock(d, tz)}${labelled ? ` ${zoneLabel(tz, d)}` : ""}`;
}

export function formatMonthYear(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "numeric" }).format(d);
}

export function formatLate(since: Date, now: Date): string {
  const mins = Math.max(1, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (mins < 60) return `${mins} min late`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h late`;
  return `${Math.floor(hours / 24)} days late`;
}

export function daysSince(d: Date, now: Date): number {
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}
```

In `src/auth/session.ts`, replace the `UserRow` type line (line 12) with:

```ts
type UserRow = Pick<typeof users.$inferSelect, "id" | "role" | "handle" | "displayName" | "ageConfirmedAt" | "bannedAt">;
/** What syncUser returns: the caller fields plus the email, so the shell needs no second query. */
export type SessionUser = UserRow & { email: string };
```

replace the `syncUser` signature line

```ts
export async function syncUser(tx: Tx, id: string, email: string, promote: boolean): Promise<UserRow> {
```
with
```ts
export async function syncUser(tx: Tx, id: string, email: string, promote: boolean): Promise<SessionUser> {
```

in its `.returning({ … })` call, add `email: users.email` after `id: users.id`:

```ts
    .returning({ id: users.id, email: users.email, role: users.role, handle: users.handle, displayName: users.displayName, ageConfirmedAt: users.ageConfirmedAt, bannedAt: users.bannedAt });
```

and replace the whole `getCaller` definition with:

```ts
/** The signed-in user's row, upserted once per request (React cache). Null when signed out. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { id } = data.user;
  const email = data.user.email ?? "";
  const promote = shouldPromote(email, data.user.email_confirmed_at, env().ADMIN_EMAILS);
  return db.transaction((tx) => syncUser(tx, id, email, promote));
});

export const getCaller = cache(async (): Promise<Caller | null> => {
  const u = await getSessionUser();
  return u ? toCaller(u) : null;
});
```

(`toCaller` keeps its narrower `UserRow` parameter, so the existing `session.test.ts` fixtures, which have no email, still type-check.)

`src/auth/viewer.ts`:

```ts
import "server-only";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "./session";
import type { Role } from "@/domain/types";

export type Viewer = { id: string; handle: string | null; displayName: string | null; role: Role; email: string };

export function toViewer(u: SessionUser): Viewer {
  return { id: u.id, handle: u.handle, displayName: u.displayName, role: u.role as Role, email: u.email };
}

/** Per-request viewer for the shell and onboarding: built from the row getCaller already upserted. */
export const getSessionViewer = cache(async (): Promise<Viewer | null> => {
  const u = await getSessionUser();
  return u ? toViewer(u) : null;
});
```

`src/lib/zone.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { resolveZone, type Zone } from "./time";

/** The zone for server-rendered fallbacks: the tz cookie when valid (unlabelled), else America/New_York, labelled. */
export async function viewerZone(): Promise<Zone> {
  return resolveZone((await cookies()).get("tz")?.value);
}
```

`src/components/local-time.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { formatDateTime, formatDeadline } from "@/lib/time";

/**
 * Renders the server's fallback on the first pass (hydration matches byte for byte), then reformats in
 * the browser's own zone, with the browser's own "now" deciding today and tomorrow. No JS: the fallback stays.
 */
export function LocalTime({ iso, fallback, kind }: { iso: string; fallback: string; kind: "deadline" | "datetime" }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    setText(kind === "deadline" ? formatDeadline(new Date(iso), new Date(), tz) : formatDateTime(new Date(iso), tz));
  }, [iso, kind]);
  return <time dateTime={iso}>{text}</time>;
}
```

`src/components/tz-cookie.tsx`:

```tsx
"use client";
import { useEffect } from "react";

/** Writes the browser's zone to the tz cookie so the next server render already speaks local time. */
export function TzCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
      if (current === tz) return;
      // IANA names are [A-Za-z0-9/_+-], all valid cookie characters; the server validates the value anyway.
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // cookies blocked: the server keeps its labelled fallback
    }
  }, []);
  return null;
}
```

In `src/app/layout.tsx`, add the import below `import "./globals.css";`

```tsx
import { TzCookie } from "@/components/tz-cookie";
```
and replace

```tsx
      <body className="antialiased">{children}</body>
```
with
```tsx
      <body className="antialiased">
        {children}
        <TzCookie />
      </body>
```

- [ ] **Step 4: Run the helper tests to see them pass**

Run: `pnpm test src/lib/money.test.ts src/lib/time.test.ts src/auth`
Expected: PASS, including the existing `session.test.ts`.

- [ ] **Step 5: Add test ids and `formatMoney` to today's components**

Replace `src/app/b/[id]/claim-panel.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { claim, claimRandomAction, claimRest, sent } from "./actions";
import { formatMoney } from "@/lib/money";
import { payLinks } from "@/lib/pay-links";
import type { ActionResult } from "@/lib/action";

type Mine = { number: number; sentAt: Date | null; paidAt: Date | null };
type ClaimData = { got: number[]; taken?: number[] };

export function ClaimPanel(p: { breakId: string; openNumbers: number[]; allowRandom: boolean; mine: Mine[]; priceCents: number; paymentHandles: { venmo?: string; paypal?: string }; paymentInstructions: string; seedCommitment: string | null }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [count, setCount] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const unpaidMine = p.mine.filter((m) => !m.paidAt);
  const unsentMine = unpaidMine.filter((m) => !m.sentAt);
  const sentMine = unpaidMine.filter((m) => m.sentAt);
  // Lines already marked sent are not owed again; only unsent lines go into the amount and the pay links.
  const owed = unsentMine.length * p.priceCents;
  const links = payLinks(p.paymentHandles, owed);
  const lock = p.seedCommitment ? ` · Draw locked before opening: ${p.seedCommitment.slice(0, 16)}…` : "";

  const runClaim = (fn: () => Promise<ActionResult<ClaimData>>) => start(async () => {
    const r = await fn();
    if (r.ok) {
      const { got, taken = [] } = r.data;
      const parts = [got.length ? `Got ${got.join(", ")}` : "Got none"];
      if (taken.length) parts.push(`${taken.join(", ")} ${taken.length === 1 ? "was" : "were"} taken`);
      setMsg(parts.join("; ") + (got.length ? lock : ""));
      setPicked([]); setBatchId(crypto.randomUUID());
    } else setMsg(r.message);
  });
  const runSent = (numbers: number[]) => start(async () => {
    const r = await sent(p.breakId, numbers);
    setMsg(r.ok ? "Marked as sent. The host will confirm once it arrives." : r.message);
  });
  const toggle = (n: number) => setPicked((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  return (
    <section className="mt-4 space-y-3 rounded border p-3">
      <h2 className="font-medium">Claim lines</h2>
      <div className="flex flex-wrap gap-1">{p.openNumbers.map((n) => <button key={n} data-testid={`cell-${n}`} onClick={() => toggle(n)} className={`rounded border px-2 py-1 text-sm ${picked.includes(n) ? "bg-black text-white" : ""}`}>{n}</button>)}</div>
      <div className="flex gap-2">
        <button data-testid="claim-submit" disabled={pending || picked.length === 0} onClick={() => runClaim(() => claim(p.breakId, picked, batchId))} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40">Claim {picked.length || ""}</button>
        {p.allowRandom && <>
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Math.floor(+e.target.value || 1))))} className="w-16 rounded border p-1 text-sm" />
          <button disabled={pending || p.openNumbers.length === 0} onClick={() => runClaim(() => claimRandomAction(p.breakId, count, batchId))} className="rounded border px-3 py-2 text-sm">Random</button>
        </>}
        <button data-testid="claim-rest" disabled={pending || p.openNumbers.length === 0} onClick={() => runClaim(() => claimRest(p.breakId, batchId))} className="rounded border px-3 py-2 text-sm">Take the rest</button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {sentMine.length > 0 && (
        <p data-testid="sent-note" className="rounded bg-blue-50 p-3 text-sm">Sent — awaiting host confirmation: lines {sentMine.map((m) => m.number).join(", ")}.</p>
      )}
      {unsentMine.length > 0 && (
        <div className="rounded bg-neutral-50 p-3 text-sm">
          <p>You owe <b data-testid="owed">{formatMoney(owed)}</b> for lines {unsentMine.map((m) => m.number).join(", ")}.</p>
          <p className="whitespace-pre-line text-neutral-700">{p.paymentInstructions}</p>
          <p className="text-xs text-neutral-600">Leave the payment note blank.</p>
          <div className="mt-2 flex gap-2">
            {links.venmo && <a href={links.venmo} className="rounded bg-blue-600 px-3 py-2 text-white">Open Venmo</a>}
            {links.paypal && <a href={links.paypal} target="_blank" rel="noreferrer" className="rounded bg-yellow-500 px-3 py-2">Open PayPal</a>}
            {p.paymentHandles.venmo && <button onClick={() => navigator.clipboard.writeText(p.paymentHandles.venmo!)} className="rounded border px-3 py-2">Copy handle</button>}
          </div>
          <button data-testid="mark-sent" disabled={pending} onClick={() => runSent(unsentMine.map((m) => m.number))} className="mt-2 w-full rounded bg-green-700 p-2 text-white">I&apos;ve sent payment</button>
        </div>
      )}
    </section>
  );
}
```

Replace `src/app/b/[id]/host-panel.tsx` with the Task 4 version plus test ids and `formatMoney`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { paidForBuyer, releaseBuyer } from "./actions";
import { formatMoney } from "@/lib/money";
import { requestDrawAction, finaliseDrawAction } from "./draw-actions";
import { openBreakAction } from "./host-actions";
import { releasePrompt } from "./release-prompt";
import type { ActionResult } from "@/lib/action";
import type { BuyerStatus } from "@/domain/lines/ledger";

export type HostRow = { ownerId: string; handle: string | null; unpaid: number[]; sent: number[]; overdue: number[]; owedCents: number; status: BuyerStatus };

export function HostPanel({ breakId, status, rows }: { breakId: string; status: string; rows: HostRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.message); });
  const unpaid = rows.filter((u) => u.status !== "paid");
  const confirmRelease = (u: HostRow) => {
    if (!window.confirm(releasePrompt({ handle: u.handle, numbers: u.unpaid, sentNumbers: u.sent }))) return;
    const reason = u.overdue.length > 0 && u.overdue.length === u.unpaid.length ? "overdue" : "host_dropped";
    run(() => releaseBuyer(breakId, u.ownerId, u.unpaid, reason));
  };
  return (
    <section className="mt-4 space-y-2 rounded border border-black p-3">
      <h2 className="font-medium">Host</h2>
      {status === "draft" && (
        <>
          <p className="text-sm text-neutral-600">This break is a draft. Nobody can claim lines until you open it.</p>
          <button disabled={pending} onClick={() => run(() => openBreakAction(breakId))} className="w-full rounded bg-black p-3 text-white">Open for claims</button>
        </>
      )}
      {status === "open" && unpaid.length === 0 && <p className="text-sm text-neutral-600">No unpaid claims.</p>}
      {unpaid.map((u) => (
        <div key={u.ownerId} data-testid="ledger-row" data-status={u.status} className="flex items-center justify-between rounded bg-neutral-50 p-2 text-sm">
          <div><b>{u.handle ?? "?"}</b> · lines {u.unpaid.join(", ")} · {formatMoney(u.owedCents)} {u.status === "sent" && <span className="text-blue-700">· sent</span>}</div>
          <div className="flex gap-1">
            <button data-testid="ledger-paid" disabled={pending} onClick={() => run(() => paidForBuyer(breakId, u.ownerId, u.unpaid))} className="rounded bg-green-700 px-2 py-1 text-white">Paid</button>
            <button disabled={pending} onClick={() => confirmRelease(u)} className="rounded border px-2 py-1">Release</button>
          </div>
        </div>
      ))}
      {status === "filled" && <button data-testid="run-draw" disabled={pending} onClick={() => run(() => requestDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Run draw</button>}
      {status === "drawing" && <button data-testid="finish-draw" disabled={pending} onClick={() => run(() => finaliseDrawAction(breakId))} className="w-full rounded bg-black p-3 text-white">Finish draw (beacon ready?)</button>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </section>
  );
}
```

Replace `src/app/b/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getCaller } from "@/auth/session";
import { formatMoney } from "@/lib/money";
import { isUuid } from "@/lib/is-uuid";
import { Grid, type GridLine } from "./grid";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

export default async function BreakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(page.break.status, isHostView(page.break.hostId, caller))) notFound();
  const now = new Date();
  const globalUnpaid = caller ? await db.transaction((tx) => globalUnpaidCount(tx, caller.id)) : 0;
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);
  const isHost = grid.hostView;
  const openNumbers = grid.cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
  const paid = grid.counts.paid;
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const gridLines: GridLine[] = grid.cells.map((c) => ({
    number: c.number,
    isBonus: c.bonus,
    mine: c.mine,
    label: c.holder,
    state: c.overdue ? "overdue" : c.state === "taken" ? "claimed" : c.state,
  }));
  const ledger = isHost ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{page.break.title}</h1>
      <p className="text-sm text-neutral-600">{openNumbers.length} of {page.break.lineCount} open · {formatMoney(page.break.linePriceCents)} a line · <span data-testid="paid-count">{paid} of {page.break.lineCount} paid</span></p>
      <p className="text-sm">Host: {page.host.handle
        ? <Link href={`/h/${page.host.handle}`} className="underline">{page.host.displayName ?? page.host.handle}</Link>
        : <span>{page.host.displayName ?? "unknown"}</span>}</p>
      <ul className="mt-2 text-sm">{page.items.map((i) => <li key={i.id}>• {i.name}</li>)}</ul>
      {page.items.length > 1 && <p className="text-xs text-neutral-600">Winner picks one.</p>}
      {page.break.status === "drawn" && <Link data-testid="see-result" href={`/b/${id}/result`} className="mt-3 block rounded bg-green-700 p-3 text-center text-white">See the result</Link>}
      {page.break.status === "drawing" && <p className="mt-3 rounded bg-amber-100 p-3 text-sm">Draw requested — waiting for the public beacon.</p>}

      <Grid lines={gridLines} lineCount={page.break.lineCount} />

      {caller && page.break.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={page.break.claimMode === "pick_or_random"}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={page.break.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={page.break.paymentInstructions} seedCommitment={page.break.seedCommitment} />
      )}
      {!caller && page.break.status === "open" && <Link href={`/login?next=/b/${id}`} className="mt-4 block rounded bg-black p-3 text-center text-white">Sign in to claim lines</Link>}
      {isHost && <HostPanel breakId={id} status={page.break.status} rows={ledger.map((u) => ({ ownerId: u.ownerId, handle: u.handle, unpaid: u.unpaid, sent: u.sent, overdue: u.overdue, owedCents: u.owedCents, status: u.status }))} />}
      {page.break.seedCommitment && <p className="mt-6 text-xs text-neutral-500">Draw locked before opening: <code>{page.break.seedCommitment.slice(0, 16)}…</code></p>}
    </main>
  );
}
```

In `src/app/b/[id]/result/reveal.tsx`, replace line 18

```tsx
        <div className="rounded bg-green-700 p-4 text-white">
```
with
```tsx
        <div data-testid="winner" className="rounded bg-green-700 p-4 text-white">
```

In `src/app/b/[id]/result/verify.tsx`, replace line 11

```tsx
      <button onClick={() => setState(verifyInputs(inputs))} className="mt-2 rounded border px-3 py-1">Check it yourself</button>
```
with
```tsx
      <button data-testid="verify-run" onClick={() => setState(verifyInputs(inputs))} className="mt-2 rounded border px-3 py-1">Check it yourself</button>
```

In `src/app/host/new/form.tsx`, replace line 26

```tsx
      <button disabled={pending} className="w-full rounded bg-black p-3 text-white">{pending ? "Saving…" : "Post break"}</button>
```
with
```tsx
      <button data-testid="composer-open" disabled={pending} className="w-full rounded bg-black p-3 text-white">{pending ? "Saving…" : "Post break"}</button>
```

- [ ] **Step 6: Re-key the journey on test ids (updates `e2e/journey-1.spec.ts`)**

Replace `e2e/journey-1.spec.ts` with:

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
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("owed")).toContainText("$10");
  await alice.getByTestId("mark-sent").click();
  await expect(alice.getByTestId("sent-note")).toBeVisible();

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.getByTestId("claim-rest").click();
  await expect(bob.getByTestId("owed")).toContainText("$5");

  await host.reload(); // pick up claims made in the other contexts
  await expect(host.locator("[data-testid=ledger-row][data-status=sent]")).toHaveCount(1);
  const paid = host.getByTestId("ledger-paid");
  await expect(paid).toHaveCount(2); // one per buyer
  await paid.first().click();
  await expect(paid).toHaveCount(1);
  await paid.first().click();
  await expect(paid).toHaveCount(0);
  await expect(host.getByTestId("paid-count")).toContainText("3 of 3 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("see-result").click();
  await expect(host.getByTestId("winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
});
```

- [ ] **Step 7: Run everything**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green; the journey passes on test ids.

- [ ] **Step 8: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts src/lib/time.ts src/lib/time.test.ts src/lib/zone.ts src/components/local-time.tsx src/components/tz-cookie.tsx src/auth/session.ts src/auth/viewer.ts src/auth/viewer.test.ts src/app/layout.tsx "src/app/b/[id]" src/app/host/new/form.tsx e2e/journey-1.spec.ts
git commit -m "feat(ui): money format, local-time helpers, session viewer, journey on test ids"
```

---
### Task 6: Tokens, fonts and the root layout (model: sonnet)

Replaces the create-next-app CSS (dark by default, Arial) with the board tokens on Tailwind v4's CSS-first theme, loads Barlow, and sets the viewport. Nothing on screen is restyled yet beyond the paper background and the font; the journey keeps passing.

**Files:**
- Create: `src/app/tokens.css`, `src/app/fonts.ts`, `src/lib/contrast.ts`, `src/app/tokens.test.ts`
- Modify: `src/app/globals.css` (replace), `src/app/layout.tsx` (replace)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - CSS variables on `:root`: `--paper`, `--card`, `--ink`, `--ink-2`, `--wire-strong`, `--wire`, `--wire-2`, `--green`, `--red`, `--bar-h` (64px, the bar's minimum row), `--tab-h` (56px). `--bar-total` (the sticky bar's measured height, safe area included) is written on `<html>` by `StickyBar` (Task 8); until then the CSS falls back to `--bar-h` plus the safe area.
  - Tailwind utilities via `@theme inline`: colours `paper card ink ink-2 wire-strong wire wire-2 green red` (as `bg-*`, `text-*`, `border-*`, …); fonts `font-sans` (Barlow) and `font-condensed` (Barlow Condensed); text sizes `text-display` 34/36, `text-title` 26/28, `text-grid` 18/1, `text-headline` 20/26, `text-body` 16/24, `text-small` 14/20, `text-micro` 12/16; radii `rounded-input` 4px, `rounded-card` 8px; `shadow-sheet`.
  - Custom utilities: `bg-hatch` (taken/sent cell face), `tabular` (tabular numerals), `pb-safe` (`max(12px, env(safe-area-inset-bottom))`).
  - Animations `animate-deal`, `animate-lift` (used by Task 14).
  - Global rules: focus ring 2px green at 2px offset; `[data-sticky-bar]` and `[data-tab-bar]` reserve body padding and `scroll-padding-bottom` (the bar's real height via `--bar-total`); the sticky bar hides while a text input outside the bar is focused (its own stepper input never hides it); reduced motion collapses animations.
  - `src/app/fonts.ts`: `barlow` (`--font-barlow`), `barlowCondensed` (`--font-barlow-condensed`).
  - `src/lib/contrast.ts`: `luminance(hex)`, `contrast(a, b)`, `readTokens(css): Record<string, string>`.
  - Root `viewport` export with `viewportFit: "cover"`; skip link "Skip to content" targeting `#content`; `<TzCookie />` (Task 5) stays mounted.

- [ ] **Step 1: Write the failing token test**

`src/app/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrast, readTokens } from "@/lib/contrast";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const t = readTokens(css);

describe("design tokens", () => {
  it("defines every design colour exactly", () => {
    expect(t).toMatchObject({
      paper: "#F6F5F1", card: "#FFFFFF", ink: "#000000", "ink-2": "#5C5A55", "wire-strong": "#86827A",
      wire: "#C9C6BE", "wire-2": "#E6E4DE", green: "#1E7A4C", red: "#C8102E",
    });
  });
  it("keeps every text pair at 4.5:1 or more", () => {
    // ["card", "ink"]: every paid cell's number is white on black, the viewer's own included (recorded erratum 1).
    const pairs: [string, string][] = [["ink", "paper"], ["ink-2", "paper"], ["ink-2", "card"], ["card", "green"], ["card", "red"], ["green", "paper"], ["red", "card"], ["card", "ink"]];
    for (const [fg, bg] of pairs) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
  it("never puts a green number on a black cell", () => {
    // Owner ruling (recorded erratum 1): green on ink measures 3.9:1, so a paid cell that is yours keeps a white
    // number and shows "mine" with the white corner flag and "yours" in its name. Do not bring the green back.
    expect(contrast(t.green, t.ink)).toBeLessThan(4.5);
  });
  it("keeps state-bearing edges at 3:1 or more", () => {
    expect(contrast(t["wire-strong"], t.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["wire-strong"], t.paper)).toBeGreaterThanOrEqual(3);
  });
  it("maps the tokens through @theme inline and has no tailwind config file", () => {
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-ink-2: var(--ink-2)");
    for (const f of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs"]) expect(existsSync(f)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/app/tokens.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/contrast"` (imports resolve before the file is read; once `contrast.ts` exists, the next failure would be `ENOENT … tokens.css`).

- [ ] **Step 3: Write the contrast helper**

`src/lib/contrast.ts`:

```ts
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Raw hex tokens declared as `--name: #RRGGBB;` (the @theme block uses var(), so it is skipped). */
export function readTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}
```

- [ ] **Step 4: Write the tokens**

`src/app/tokens.css`:

```css
/* Board tokens (UI design §3). Raw values live on :root so a later dark mode is a variable remap. */
:root {
  --paper: #F6F5F1;
  --card: #FFFFFF;
  --ink: #000000;
  --ink-2: #5C5A55;
  --wire-strong: #86827A;
  --wire: #C9C6BE;
  --wire-2: #E6E4DE;
  --green: #1E7A4C;
  --red: #C8102E;
  --bar-h: 64px;
  --tab-h: 56px;
}

@theme inline {
  --color-paper: var(--paper);
  --color-card: var(--card);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-wire-strong: var(--wire-strong);
  --color-wire: var(--wire);
  --color-wire-2: var(--wire-2);
  --color-green: var(--green);
  --color-red: var(--red);

  --font-sans: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
  --font-condensed: var(--font-barlow-condensed), var(--font-barlow), ui-sans-serif, sans-serif;

  --text-display: 34px;
  --text-display--line-height: 36px;
  --text-title: 26px;
  --text-title--line-height: 28px;
  --text-grid: 18px;
  --text-grid--line-height: 1;
  --text-headline: 20px;
  --text-headline--line-height: 26px;
  --text-body: 16px;
  --text-body--line-height: 24px;
  --text-small: 14px;
  --text-small--line-height: 20px;
  --text-micro: 12px;
  --text-micro--line-height: 16px;

  --radius-input: 4px;
  --radius-card: 8px;

  --shadow-sheet: 0 -8px 24px rgb(0 0 0 / 0.12);
}
```

- [ ] **Step 5: Run the token test to see it pass**

Run: `pnpm test src/app/tokens.test.ts`
Expected: PASS (ink-2 on card 6.9, card on green 5.3, green on paper 4.9, card on ink 21, green on ink 3.9, wire-strong on paper 3.5).

- [ ] **Step 6: Replace the global stylesheet**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "./tokens.css";

/* Taken and sent cells: a 45° hatch, ink-2 at 35%, 1px every 4px (design §4). */
@utility bg-hatch {
  background-color: var(--card);
  background-image: repeating-linear-gradient(45deg, rgb(92 90 85 / 0.35) 0 1px, transparent 1px 4px);
}
@utility tabular {
  font-variant-numeric: tabular-nums;
}
@utility pb-safe {
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

@theme {
  --animate-deal: deal 240ms ease-out both;
  --animate-lift: lift 300ms ease-out forwards;
  @keyframes deal {
    from { opacity: 0; transform: translateY(-16px) scale(0.9); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lift {
    from { transform: none; }
    to { transform: translateY(-6px) scale(1.12); }
  }
}

@layer base {
  html {
    background-color: var(--paper);
    color: var(--ink);
    -webkit-text-size-adjust: 100%;
  }
  body {
    background-color: var(--paper);
    color: var(--ink);
    font-family: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
    font-size: 16px;
    line-height: 24px;
  }
  :focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  /* The claim bar is fixed: reserve its real height (StickyBar measures it into --bar-total, safe area included)
     so the last content and any focused cell stay visible even when the bar grows to two rows. */
  body:has([data-sticky-bar]) {
    padding-bottom: var(--bar-total, calc(var(--bar-h) + max(12px, env(safe-area-inset-bottom))));
  }
  :root:has([data-sticky-bar]) {
    scroll-padding-bottom: var(--bar-total, calc(var(--bar-h) + max(12px, env(safe-area-inset-bottom))));
  }
  @media (max-width: 639px) {
    body:has([data-tab-bar]) {
      padding-bottom: calc(var(--tab-h) + max(12px, env(safe-area-inset-bottom)));
    }
  }
  /* One bar at a time: the claim bar steps aside while the keyboard is up, except for the bar's own
     inputs (the Pick for me stepper), which must not hide the bar they live in. */
  body:has(:is(input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select):focus:not([data-sticky-bar] *)) [data-sticky-bar] {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 7: Load the fonts and set the viewport**

`src/app/fonts.ts`:

```ts
import { Barlow, Barlow_Condensed } from "next/font/google";

// Barlow is not a variable font, so the weights are listed. A build that cannot reach Google Fonts is
// reported as BLOCKED: fonts (see Global Constraints); do not vendor the files here.
export const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });
export const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-barlow-condensed", display: "swap" });
```

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { barlow, barlowCondensed } from "./fonts";
import { TzCookie } from "@/components/tz-cookie";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Breaks", template: "%s | Breaks" },
  description: "Group buys for darts gear, with a draw you can check.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F5F1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-body text-ink antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-input focus:bg-card focus:px-4 focus:py-3 focus:text-ink">
          Skip to content
        </a>
        <div id="content" tabIndex={-1} className="outline-none">{children}</div>
        <TzCookie />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Build and run the journey**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: the build downloads Barlow at build time and succeeds; the journey passes (no keyed copy changed). If the build fails or hangs fetching fonts.googleapis.com or fonts.gstatic.com (symptom: stuck or error in next-font-loader), stop and report BLOCKED: fonts. Do not vendor fonts or change fonts.ts.

- [ ] **Step 9: Commit**

```bash
git add src/app/tokens.css src/app/tokens.test.ts src/app/fonts.ts src/app/globals.css src/app/layout.tsx src/lib/contrast.ts
git commit -m "feat(ui): board tokens, Barlow fonts and root layout"
```

---

### Task 7: Static primitives — Cell, Grid, GridPreview, MiniCells, Legend, FillBar, StatusPill, Avatar, Button, Banner (model: sonnet)

All server-safe (no hooks, no `"use client"`), so server pages and client islands share them. `Cell` and `Grid` take an optional `onPress`: without it they render inert markup (thumbnails, legend, previews); with it each cell is a native `<button>` with `aria-pressed` / `aria-disabled` and an accessible name that never contains a handle. Columns come from the grid's own width through container queries and a literal class map.

**Files:**
- Create: `src/components/grid/cell-label.ts`, `src/components/grid/cell-label.test.ts`, `src/components/grid/layout.ts`, `src/components/grid/layout.test.ts`, `src/components/grid/cell.tsx`, `src/components/grid/grid.tsx`, `src/components/grid/grid-preview.tsx`
- Create: `src/components/status-word.ts`, `src/components/status-word.test.ts`, `src/components/status-pill.tsx`, `src/components/mini-cells.tsx`, `src/components/legend.tsx`, `src/components/fill-bar.tsx`, `src/components/avatar.tsx`, `src/components/button.tsx`, `src/components/banner.tsx`

**Interfaces:**
- Consumes: `GridCell`, `CellState` (`import type` from `@/domain/breaks/grid`); tokens from Task 6.
- Produces:
  - `type CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus">`; `cellLabel(c: CellData): string` ("Line 7, open", "Line 9, yours, sent", "Line 4, taken, overdue", "Line 51, bonus, paid"); `cellStateWord(c: CellData): string`.
  - `type GridTier = "s" | "m" | "l"`; `gridTier(count: number): GridTier`; `GRID_COLS: Record<GridTier, string>`; `GRID_MAX_W: Record<GridTier, string>`; `columnsFor(count: number, width: number): number`; `nextFocusIndex(index: number, key: string, cols: number, count: number): number | null`; `thumbColumns(count: number): number`.
  - `<Cell cell size? boxed? selected? struck? disabled? label? testId? tabIndex? onPress? />` (`size: "md" | "sm" | "xs"`); interactive cells carry `data-cell`, `data-state` and `focus-visible:z-10` (the ring is never painted over by a touching neighbour). Number colour: paid cells always white (recorded erratum 1), overdue cells ink on the chip, taken and reserved ink-2, the rest ink. Selected keeps weight 600 (recorded erratum 2). Bonus plus mine shows both marks: the corner flag and a "+" at the bottom left.
  - `<Grid cells lineCount label selected? struck? disabledOpen? readOnly? onPress? onKeyDown? />`; the group is `role="group"` named by `label`; the rows element carries `data-grid-rows`; interactive cells get `data-testid="cell-<n>"` and a roving `tabIndex`.
  - `<GridPreview count cells? size? />` (decorative, `aria-hidden`).
  - `<MiniCells cells onPress? labelFor? label? />` (interactive mini cells get `data-testid="mini-<n>"`).
  - `<Legend />`, `<FillBar total paid taken label? />`, `<StatusPill status />`, `<Avatar name size? />`, `<Banner tone? role? />`.
  - `type BreakStatus = "draft" | "open" | "filled" | "drawing" | "drawn" | "cancelled"`; `STATUS_WORD`; `statusWord(status: string): string` (Draft, Open, Closed, Running draw, Ran, Cancelled).
  - `type ButtonVariant = "primary" | "secondary" | "text"`; `buttonClass(variant?, full?, extra?): string`; `<Button variant? full? …buttonProps />`; `<ButtonLink variant? full? …linkProps />`.

- [ ] **Step 1: Write the failing pure tests**

`src/components/grid/cell-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cellLabel, cellStateWord, type CellData } from "./cell-label";

const c = (o: Partial<CellData> & { number: number }): CellData => ({ state: "open", mine: false, overdue: false, bonus: false, ...o });

describe("cellLabel", () => {
  it("names the line and its state, shape-first words only", () => {
    expect(cellLabel(c({ number: 7 }))).toBe("Line 7, open");
    expect(cellLabel(c({ number: 12, state: "taken" }))).toBe("Line 12, taken");
    expect(cellLabel(c({ number: 12, state: "paid" }))).toBe("Line 12, paid");
    expect(cellLabel(c({ number: 9, state: "sent", mine: true }))).toBe("Line 9, yours, sent");
    expect(cellLabel(c({ number: 4, state: "taken", overdue: true }))).toBe("Line 4, taken, overdue");
    expect(cellLabel(c({ number: 51, state: "paid", bonus: true }))).toBe("Line 51, bonus, paid");
    expect(cellLabel(c({ number: 3, state: "reserved" }))).toBe("Line 3, reserved for a mini");
  });
  it("never includes a holder handle", () => {
    const withHolder = { ...c({ number: 5, state: "paid" }), holder: "mike" };
    expect(cellLabel(withHolder)).not.toContain("mike");
  });
  it("gives a short state word", () => {
    expect(cellStateWord(c({ number: 1, state: "paid", mine: true }))).toBe("yours, paid");
    expect(cellStateWord(c({ number: 1, state: "taken", overdue: true }))).toBe("taken, overdue");
  });
});
```

`src/components/grid/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gridTier, columnsFor, nextFocusIndex, thumbColumns, GRID_COLS, GRID_MAX_W } from "./layout";

describe("grid columns (design §4)", () => {
  it("tiers by line count", () => {
    expect([2, 12, 13, 30, 31, 55].map(gridTier)).toEqual(["s", "s", "m", "m", "l", "l"]);
  });
  it("fits 8, 7 and 6 columns at 390, 360 and 320 pt phones, and 10 above 640", () => {
    expect(columnsFor(50, 358)).toBe(8);
    expect(columnsFor(50, 328)).toBe(7);
    expect(columnsFor(50, 288)).toBe(6);
    // Above 640 the page column is 600 wide with 24 pt gutters, so the grid box is 552.
    expect(columnsFor(55, 552)).toBe(10);
    expect(columnsFor(55, 539)).toBe(8);
    expect(columnsFor(20, 358)).toBe(6);
    expect(columnsFor(6, 358)).toBe(4);
  });
  it("keeps literal class strings for the scanner", () => {
    expect(GRID_COLS.l).toBe("grid-cols-6 @min-[308px]:grid-cols-7 @min-[352px]:grid-cols-8 @min-[540px]:grid-cols-10");
    expect(GRID_MAX_W.l).toBe("max-w-[552px]");
  });
  it("moves focus with the arrow keys and stops at the edges", () => {
    expect(nextFocusIndex(0, "ArrowRight", 8, 50)).toBe(1);
    expect(nextFocusIndex(0, "ArrowLeft", 8, 50)).toBeNull();
    expect(nextFocusIndex(3, "ArrowDown", 8, 50)).toBe(11);
    expect(nextFocusIndex(45, "ArrowDown", 8, 50)).toBeNull();
    expect(nextFocusIndex(11, "ArrowUp", 8, 50)).toBe(3);
    expect(nextFocusIndex(20, "Home", 8, 50)).toBe(0);
    expect(nextFocusIndex(20, "End", 8, 50)).toBe(49);
    expect(nextFocusIndex(20, "Enter", 8, 50)).toBeNull();
  });
  it("sizes thumbnails as a near-square", () => {
    expect([2, 6, 12, 50, 55].map(thumbColumns)).toEqual([2, 3, 4, 8, 8]);
  });
});
```

`src/components/status-word.test.ts`:

```ts
import { it, expect } from "vitest";
import { statusWord } from "./status-word";

it("uses the community's state words", () => {
  expect(["draft", "open", "filled", "drawing", "drawn", "cancelled"].map(statusWord)).toEqual(["Draft", "Open", "Closed", "Running draw", "Ran", "Cancelled"]);
  expect(statusWord("weird")).toBe("weird");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components`
Expected: FAIL with `Failed to resolve import "./cell-label"`, `"./layout"` and `"./status-word"`.

- [ ] **Step 3: Write the pure modules**

`src/components/grid/cell-label.ts`:

```ts
import type { GridCell } from "@/domain/breaks/grid";

export type CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus">;

const STATE_WORD: Record<CellData["state"], string> = {
  open: "open", taken: "taken", sent: "sent", paid: "paid", reserved: "reserved for a mini",
};

/** "yours, paid", "taken, overdue": the words a cell's shape already says. */
export function cellStateWord(c: CellData): string {
  const parts: string[] = [];
  if (c.mine) parts.push("yours");
  if (c.bonus) parts.push("bonus");
  parts.push(STATE_WORD[c.state]);
  if (c.overdue) parts.push("overdue");
  return parts.join(", ");
}

/** Accessible name. Buyer-side names never include another buyer's handle (design §4). */
export function cellLabel(c: CellData): string {
  return `Line ${c.number}, ${cellStateWord(c)}`;
}
```

`src/components/grid/layout.ts`:

```ts
export type GridTier = "s" | "m" | "l";

/** 2–12 lines: up to 4 columns; 13–30: up to 6; 31–55: up to 8 (10 above 640, where the grid box is 552). */
export function gridTier(count: number): GridTier {
  return count <= 12 ? "s" : count <= 30 ? "m" : "l";
}

/** Literal class strings so Tailwind's scanner sees them; widths are the grid's own (container queries). */
export const GRID_COLS: Record<GridTier, string> = {
  s: "grid-cols-4",
  m: "grid-cols-6",
  l: "grid-cols-6 @min-[308px]:grid-cols-7 @min-[352px]:grid-cols-8 @min-[540px]:grid-cols-10",
};

/**
 * Cells stop growing past ~64 pt on small breaks. Large breaks fill the page column: `main` is 600 wide with
 * 24 pt gutters above 640, so the grid box is 552 and ten columns give 55.2 pt cells (the design's 56, within a point).
 */
export const GRID_MAX_W: Record<GridTier, string> = { s: "max-w-[256px]", m: "max-w-[384px]", l: "max-w-[552px]" };

const MAX_COLS: Record<GridTier, number> = { s: 4, m: 6, l: 8 };

/** What the CSS above resolves to: cols = min(max, floor(width / 44)), and 10 at 540+ for 31–55 lines. */
export function columnsFor(count: number, width: number): number {
  const tier = gridTier(count);
  if (tier === "l" && width >= 540) return 10;
  return Math.max(1, Math.min(MAX_COLS[tier], Math.floor(width / 44)));
}

/** Arrow-key focus movement inside the grid group. Null means "do nothing". */
export function nextFocusIndex(index: number, key: string, cols: number, count: number): number | null {
  switch (key) {
    case "ArrowRight": return index + 1 < count ? index + 1 : null;
    case "ArrowLeft": return index > 0 ? index - 1 : null;
    case "ArrowDown": return index + cols < count ? index + cols : null;
    case "ArrowUp": return index - cols >= 0 ? index - cols : null;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Columns for the square thumbnail (the photo fallback). */
export function thumbColumns(count: number): number {
  return Math.min(8, Math.max(2, Math.ceil(Math.sqrt(count))));
}
```

`src/components/status-word.ts`:

```ts
export type BreakStatus = "draft" | "open" | "filled" | "drawing" | "drawn" | "cancelled";

/** The community's words (design §6). Cancelled is display-only until a cancel command exists. */
export const STATUS_WORD: Record<BreakStatus, string> = {
  draft: "Draft", open: "Open", filled: "Closed", drawing: "Running draw", drawn: "Ran", cancelled: "Cancelled",
};

export function statusWord(status: string): string {
  return STATUS_WORD[status as BreakStatus] ?? status;
}
```

- [ ] **Step 4: Run the pure tests to see them pass**

Run: `pnpm test src/components`
Expected: PASS.

- [ ] **Step 5: Write the cell and the grid**

`src/components/grid/cell.tsx`:

```tsx
import { cellLabel, type CellData } from "./cell-label";

export type CellSize = "md" | "sm" | "xs";

type Props = {
  cell: CellData;
  size?: CellSize;
  /** Standalone cell (legend, mini cells): border on all four sides. */
  boxed?: boolean;
  selected?: boolean;
  /** A selected line someone else just took. */
  struck?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  tabIndex?: number;
  onPress?: (n: number) => void;
};

const NUMBER_SIZE: Record<CellSize, string> = { md: "text-grid", sm: "text-[13px] leading-none", xs: "hidden" };

function numberColour(c: CellData): string {
  // Paid cells are always white on black, yours included: green on ink is 3.9:1 (recorded erratum 1).
  // "Mine" on a paid cell is the white corner flag plus "yours" in the accessible name.
  if (c.state === "paid") return "text-card";
  if (c.overdue) return "text-ink"; // overdue (host only): ink number on the chip
  if (c.state === "taken" || c.state === "reserved") return "text-ink-2";
  return "text-ink";
}

/** One board segment. Shape carries state (design §4): hatch, dashed edge, ink face, corner flag, glyphs. */
export function Cell({ cell, size = "md", boxed = false, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const paidFace = cell.state === "paid";
  const hatched = cell.state === "taken" || cell.state === "sent";
  const face = paidFace ? "bg-ink" : hatched ? "bg-hatch" : "bg-card";
  const edge = boxed ? "border border-wire-strong" : "border-r border-b border-wire-strong";
  const chip = hatched || cell.state === "reserved";
  const flag = size === "xs" ? "border-l-[5px] border-t-[5px]" : "border-l-[10px] border-t-[10px]";
  const glyphs = size !== "xs";

  const body = (
    <>
      <span aria-hidden className={`${NUMBER_SIZE[size]} font-condensed font-semibold tabular ${chip ? "bg-card px-0.5" : ""} ${numberColour(cell)} ${struck ? "line-through decoration-red decoration-2" : ""}`}>
        {cell.number}
      </span>
      {cell.state === "sent" && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-dashed border-ink" />}
      {cell.overdue && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-red" />}
      {cell.overdue && glyphs && <span aria-hidden className="absolute right-1 bottom-0.5 text-micro font-semibold text-red">!</span>}
      {cell.state === "reserved" && <span aria-hidden className="pointer-events-none absolute inset-0.5 border-[3px] border-double border-wire-strong" />}
      {cell.state === "reserved" && glyphs && <span aria-hidden className="absolute top-0.5 left-1 text-micro text-ink-2">m</span>}
      {selected && <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--ink)]" />}
      {/* Selected keeps weight 600: 700 is not loaded (recorded erratum 2); the ring and the check carry it. */}
      {selected ? (
        glyphs && <span aria-hidden className="absolute top-0 right-0.5 text-micro font-semibold text-ink">✓</span>
      ) : cell.mine ? (
        <span aria-hidden className={`absolute top-0 right-0 h-0 w-0 border-l-transparent ${flag} ${paidFace ? "border-t-card" : "border-t-green"}`} />
      ) : cell.bonus && glyphs ? (
        <span aria-hidden className={`absolute top-0 right-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      ) : null}
      {/* Bonus and mine: the flag takes the corner, so the "+" moves to the bottom left and both marks survive. */}
      {!selected && cell.mine && cell.bonus && glyphs && (
        <span aria-hidden className={`absolute bottom-0.5 left-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      )}
    </>
  );

  const base = `relative flex aspect-square w-full items-center justify-center select-none ${face} ${edge} transition-colors duration-[120ms] motion-reduce:transition-none`;
  if (!onPress) {
    return <div role="img" aria-label={label ?? cellLabel(cell)} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell
      data-testid={testId}
      data-state={cell.state}
      aria-label={label ?? cellLabel(cell)}
      aria-pressed={cell.state === "open" ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={() => onPress(cell.number)}
      className={`${base} touch-manipulation focus-visible:z-10 ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {body}
    </button>
  );
}
```

`src/components/grid/grid.tsx`:

```tsx
import type { GridCell } from "@/domain/breaks/grid";
import { Cell } from "./cell";
import { GRID_COLS, GRID_MAX_W, gridTier } from "./layout";

type Props = {
  cells: GridCell[];
  lineCount: number;
  /** e.g. "Lines, 19 of 50 open" */
  label: string;
  selected?: ReadonlySet<number>;
  struck?: ReadonlySet<number>;
  /** Selection reached the viewer's allowance: unselected open cells become aria-disabled. */
  disabledOpen?: boolean;
  /** Straight fill or not open: open cells cannot be selected. */
  readOnly?: boolean;
  onPress?: (n: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

/** The board laid flat: cells touch along shared wires, no gap; bonus lines sit on their own row after N. */
export function Grid({ cells, lineCount, label, selected, struck, disabledOpen = false, readOnly = false, onPress, onKeyDown }: Props) {
  const tier = gridTier(lineCount);
  const numbered = cells.filter((c) => !c.bonus);
  const bonus = cells.filter((c) => c.bonus);
  const focusNumber = onPress
    ? (numbered.find((c) => selected?.has(c.number)) ?? numbered.find((c) => c.state === "open") ?? numbered[0])?.number
    : undefined;

  const renderCell = (c: GridCell) => {
    const isSelected = selected?.has(c.number) ?? false;
    const disabled = c.state !== "open" || readOnly || (disabledOpen && !isSelected);
    return (
      <Cell
        key={c.number}
        cell={c}
        selected={isSelected}
        struck={struck?.has(c.number) ?? false}
        disabled={disabled}
        onPress={onPress}
        testId={onPress ? `cell-${c.number}` : undefined}
        tabIndex={onPress ? (c.number === focusNumber ? 0 : -1) : undefined}
      />
    );
  };

  return (
    <div role="group" aria-label={label} onKeyDown={onKeyDown} className={`@container w-full ${GRID_MAX_W[tier]} touch-manipulation`}>
      <div data-grid-rows className={`grid ${GRID_COLS[tier]} border-t border-l border-wire-strong`}>{numbered.map(renderCell)}</div>
      {bonus.length > 0 && (
        <>
          <p className="mt-3 text-micro font-medium text-ink-2">Bonus</p>
          <div className={`mt-1 grid ${GRID_COLS[tier]} border-t border-l border-wire-strong`}>{bonus.map(renderCell)}</div>
        </>
      )}
    </div>
  );
}
```

`src/components/grid/grid-preview.tsx`:

```tsx
import type { CellData } from "./cell-label";
import { Cell } from "./cell";
import { thumbColumns } from "./layout";

/** Decorative mini grid: the photo fallback on the break page and the composer preview. */
export function GridPreview({ count, cells, size = 88 }: { count: number; cells?: CellData[]; size?: number }) {
  const list: CellData[] = (cells ?? Array.from({ length: count }, (_, i) => ({ number: i + 1, state: "open" as const, mine: false, overdue: false, bonus: false })))
    .filter((c) => !c.bonus)
    .map((c) => ({ ...c, overdue: false }));
  const cols = thumbColumns(list.length);
  return (
    <div aria-hidden className="shrink-0 overflow-hidden rounded-input border border-wire bg-card p-1" style={{ width: size, height: size }}>
      <div className="grid border-t border-l border-wire-strong" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {list.map((c) => <Cell key={c.number} cell={c} size="xs" />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the remaining static primitives**

`src/components/button.tsx`:

```tsx
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "text";

const BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-input px-4 text-body font-semibold transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50";
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-card hover:bg-ink/85",
  secondary: "border border-wire-strong bg-card text-ink hover:bg-wire-2",
  text: "px-1 text-ink underline underline-offset-4 hover:no-underline",
};

/** Primary: ink on paper. Secondary: outlined in wire-strong. Text: ink underlined. Red is never a button background. */
export function buttonClass(variant: ButtonVariant = "primary", full = false, extra = ""): string {
  return [BASE, VARIANT[variant], full ? "w-full" : "", extra].filter(Boolean).join(" ");
}

export function Button({ variant = "primary", full = false, className = "", type = "button", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }) {
  return <button type={type} className={buttonClass(variant, full, className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", full = false, className = "", ...rest }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; full?: boolean }) {
  return <Link className={buttonClass(variant, full, className)} {...rest} />;
}
```

`src/components/banner.tsx`:

```tsx
export function Banner({ tone = "neutral", role, children }: { tone?: "neutral" | "success" | "error"; role?: "status" | "alert"; children: React.ReactNode }) {
  const tones = { neutral: "border-wire text-ink", success: "border-green text-green", error: "border-red text-red" } as const;
  return <div role={role} className={`rounded-card border bg-card px-4 py-3 text-small ${tones[tone]}`}>{children}</div>;
}
```

`src/components/avatar.tsx`:

```tsx
/** The signed-in person's initial; decorative (the header gives the name to screen readers). */
export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-full bg-ink font-condensed font-semibold text-card" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      {initial}
    </span>
  );
}
```

`src/components/status-pill.tsx`:

```tsx
import { statusWord, type BreakStatus } from "./status-word";

const TONE: Record<BreakStatus, string> = {
  draft: "border-wire-strong text-ink-2",
  open: "border-ink text-ink",
  filled: "border-ink bg-ink text-card",
  drawing: "border-wire-strong text-ink",
  drawn: "border-green text-green",
  cancelled: "border-red text-red",
};

/** The word carries the state; the border and fill only reinforce it. */
export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status as BreakStatus] ?? TONE.draft;
  return <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-micro font-medium ${tone}`}>{statusWord(status)}</span>;
}
```

`src/components/fill-bar.tsx`:

```tsx
/** Two-tone fill: paid in ink, taken (claimed, unpaid) in hatch. One component for "19 of 50 left" and "19 of 50 paid". */
export function FillBar({ total, paid, taken, label }: { total: number; paid: number; taken: number; label?: string }) {
  const pct = (n: number) => `${total > 0 ? Math.min(100, (n / total) * 100) : 0}%`;
  return (
    <div role="img" aria-label={label ?? `${paid} of ${total} paid, ${taken} taken`} className="flex h-2 w-full overflow-hidden rounded-full border border-wire-strong bg-card">
      <span className="h-full bg-ink" style={{ width: pct(paid) }} />
      <span className="h-full bg-hatch" style={{ width: pct(taken) }} />
    </div>
  );
}
```

`src/components/legend.tsx`:

```tsx
import { Cell } from "./grid/cell";
import type { CellData } from "./grid/cell-label";

const sample = (o: Partial<CellData>): CellData => ({ number: 0, state: "open", mine: false, overdue: false, bonus: false, ...o });
const ITEMS: { word: string; cell: CellData }[] = [
  { word: "open", cell: sample({}) },
  { word: "taken", cell: sample({ state: "taken" }) },
  { word: "sent", cell: sample({ state: "sent" }) },
  { word: "paid", cell: sample({ state: "paid" }) },
  { word: "yours", cell: sample({ mine: true }) },
];

/** Five swatches with words, no icons (design §4). */
export function Legend() {
  return (
    <ul aria-label="What the cells mean" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-ink-2">
      {ITEMS.map((i) => (
        <li key={i.word} className="flex items-center gap-1.5">
          <span aria-hidden className="block size-4"><Cell cell={i.cell} size="xs" boxed /></span>
          {i.word}
        </li>
      ))}
    </ul>
  );
}
```

`src/components/mini-cells.tsx`:

```tsx
import { Cell } from "./grid/cell";
import type { CellData } from "./grid/cell-label";

/** A row of small cells (claim sheet, ledger rows). Interactive ones are 44 pt targets. */
export function MiniCells({ cells, onPress, labelFor, label }: { cells: CellData[]; onPress?: (n: number) => void; labelFor?: (c: CellData) => string; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {cells.map((c) => (
        <li key={c.number} className={onPress ? "w-11" : "w-7"}>
          <Cell cell={c} size="sm" boxed onPress={onPress} label={labelFor?.(c)} testId={onPress ? `mini-${c.number}` : undefined} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: Type-check, lint and build**

Run: `pnpm test src/components && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: green. Nothing renders these yet; Task 8's gallery shows them.

- [ ] **Step 8: Commit**

```bash
git add src/components
git commit -m "feat(ui): board cell, grid and static primitives"
```

---

### Task 8: Interactive primitives — Sheet, StickyBar, Stepper, CopyButton, CopyField, SegmentedControl, FilterChips, Toast — and the dev gallery (model: sonnet)

**Files:**
- Create: `src/components/stepper-math.ts`, `src/components/stepper-math.test.ts`, `src/components/sheet.tsx`, `src/components/sticky-bar.tsx`, `src/components/stepper.tsx`, `src/components/copy-button.tsx`, `src/components/copy-field.tsx`, `src/components/segmented-control.tsx`, `src/components/filter-chips.tsx`, `src/components/toast.tsx`
- Create: `src/app/dev/components/page.tsx`, `src/app/dev/components/demo.tsx`
- Modify: `src/middleware.ts:4` (make `/dev/` public; the page itself 404s in production)

**Interfaces:**
- Consumes: `Button`, `buttonClass`, `Cell`, `Grid`, `GridPreview`, `MiniCells`, `Legend`, `FillBar`, `StatusPill`, `Avatar`, `Banner`, `GridCell`.
- Produces:
  - `clampStep(value: number, min: number, max: number): number`; `stepState(value: number, min: number, max: number): { canDec: boolean; canInc: boolean }`; `draftValue(draft: string, min: number, max: number): number | null` (a whole number inside the bounds, else null: keep typing); `commitDraft(draft: string, min: number, max: number, fallback: number): number` (on blur or Enter: clamp what was typed; junk falls back).
  - `<Sheet open onClose title full? testId? hideTitle? />` — native `<dialog>` with `showModal()`; Escape and backdrop close; focus returns to the opener, or, when the opener has unmounted (the claim button becomes "You owe"), to the first button or link in `[data-sticky-bar]`; page scroll locked while open.
  - `<StickyBar id? />` (client) — fixed bottom bar with `data-sticky-bar`; a `ResizeObserver` writes its real height to `--bar-total` on `<html>`, which `globals.css` uses for body padding and `scroll-padding-bottom` (keyboard hiding also comes from `globals.css`).
  - `<Stepper value min max onChange label name? testId? />` (− input + with 44 pt targets; the input keeps a local draft string and commits a complete number, or clamps on blur and Enter, so typing "30" over "3" never snaps to the minimum).
  - `<CopyButton value label? copiedLabel? variant? full? testId? />` (polite "Copied." status).
  - `<CopyField label value />`.
  - `<SegmentedControl<T> options value onChange label />` (segments `min-h-11 min-w-11`, a 44 pt floor), `<FilterChips<T> options value onChange label />` (both `role="radiogroup"`).
  - `<Toast message action? onAction? offset? />` (polite live region; `offset: "bar" | "sheet-action" | "none"`, default `"bar"`: above the claim bar, above a sheet's sticky bottom action, or at the safe-area edge; render it inside the sheet that owns it).
  - Route `/dev/components` (development only).

- [ ] **Step 1: Write the failing test**

`src/components/stepper-math.test.ts`:

```ts
import { it, expect } from "vitest";
import { clampStep, commitDraft, draftValue, stepState } from "./stepper-math";

it("clamps to the bounds and survives junk input", () => {
  expect(clampStep(3, 1, 5)).toBe(3);
  expect(clampStep(9, 1, 5)).toBe(5);
  expect(clampStep(0, 1, 5)).toBe(1);
  expect(clampStep(Number.NaN, 1, 5)).toBe(1);
  expect(clampStep(2.6, 1, 5)).toBe(3);
  expect(clampStep(4, 1, 0)).toBe(1); // no allowance: stays at min; the caller disables the control
});

it("knows which buttons work", () => {
  expect(stepState(1, 1, 5)).toEqual({ canDec: false, canInc: true });
  expect(stepState(5, 1, 5)).toEqual({ canDec: true, canInc: false });
  expect(stepState(1, 1, 1)).toEqual({ canDec: false, canInc: false });
});

it("commits a typed number only once it is complete and in bounds", () => {
  // Composer stepper, 2..50: clearing "30" and typing "25" must not snap to 2 on the way.
  expect(draftValue("", 2, 50)).toBeNull();
  expect(draftValue("2", 2, 50)).toBe(2);
  expect(draftValue("25", 2, 50)).toBe(25);
  expect(draftValue("1", 2, 50)).toBeNull(); // below min: maybe the start of "15"
  expect(draftValue("51", 2, 50)).toBeNull();
  expect(draftValue("2.5", 2, 50)).toBeNull();
  expect(draftValue(" 7 ", 2, 50)).toBe(7);
});

it("clamps on blur or Enter, and falls back on junk", () => {
  expect(commitDraft("1", 2, 50, 30)).toBe(2);
  expect(commitDraft("99", 2, 50, 30)).toBe(50);
  expect(commitDraft("", 2, 50, 30)).toBe(30);
  expect(commitDraft("abc", 2, 50, 30)).toBe(30);
  expect(commitDraft("12", 2, 50, 30)).toBe(12);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/components/stepper-math.test.ts`
Expected: FAIL with `Failed to resolve import "./stepper-math"`.

- [ ] **Step 3: Write the math and run the test to see it pass**

`src/components/stepper-math.ts`:

```ts
export function clampStep(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function stepState(value: number, min: number, max: number): { canDec: boolean; canInc: boolean } {
  return { canDec: value > min, canInc: value < max };
}

/** While typing: commit only a whole number inside the bounds; null means "keep the draft, don't commit yet". */
export function draftValue(draft: string, min: number, max: number): number | null {
  const t = draft.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** On blur or Enter: clamp whatever was typed; anything that is not a number keeps the last good value. */
export function commitDraft(draft: string, min: number, max: number, fallback: number): number {
  const t = draft.trim();
  return clampStep(/^\d+$/.test(t) ? Number(t) : fallback, min, max);
}
```

Run: `pnpm test src/components/stepper-math.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the interactive primitives**

`src/components/sheet.tsx`:

```tsx
"use client";
import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Full-screen (host ledger) instead of a bottom sheet. */
  full?: boolean;
  testId?: string;
  hideTitle?: boolean;
};

/** Native <dialog> with showModal(): focus is trapped, Escape closes, the backdrop closes, focus returns to the opener. */
export function Sheet({ open, onClose, title, children, full = false, testId, hideTitle = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => () => { document.documentElement.style.overflow = ""; }, []);

  const handleClose = () => {
    document.documentElement.style.overflow = "";
    // Return focus to the opener; if it unmounted meanwhile (the claim button became "You owe"), to the bar.
    const el = opener.current;
    const target = el instanceof HTMLElement && el.isConnected && el !== document.body
      ? el
      : document.querySelector<HTMLElement>("[data-sticky-bar] button, [data-sticky-bar] a");
    target?.focus();
    if (open) onClose();
  };

  const shape = full
    ? "m-0 h-dvh max-h-dvh w-full max-w-none bg-paper sm:mx-auto sm:max-w-[960px]"
    : "m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-card bg-card shadow-sheet sm:mx-auto sm:mb-auto sm:max-w-[600px] sm:rounded-card";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={handleClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      className={`${shape} p-0 text-ink`}
    >
      <div className={`sticky top-0 z-10 flex min-h-14 items-center justify-between gap-4 border-b border-wire px-4 ${full ? "bg-paper" : "bg-card"}`}>
        <h2 id={titleId} className={hideTitle ? "sr-only" : "text-headline font-semibold"}>{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} className="-mr-2 inline-flex min-h-11 items-center px-2 text-small font-semibold underline underline-offset-4">
          Close
        </button>
      </div>
      <div className="px-4 pt-4 pb-safe">{children}</div>
    </dialog>
  );
}
```

`src/components/sticky-bar.tsx`:

```tsx
"use client";
import { useLayoutEffect, useRef } from "react";

/**
 * One job at a time at the bottom of the break page. The bar can grow (a note above the controls), so its
 * real height, safe area included, is written to --bar-total; globals.css reserves exactly that much body
 * padding and scroll padding, and keyboard hiding also lives there.
 */
export function StickyBar({ id, children }: { id?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty("--bar-total", `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--bar-total"); };
  }, []);
  return (
    <div ref={ref} id={id} tabIndex={-1} data-sticky-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-wire bg-card pb-safe outline-none">
      <div className="mx-auto flex min-h-[var(--bar-h)] max-w-[600px] items-center gap-3 px-4 pt-2">{children}</div>
    </div>
  );
}
```

`src/components/stepper.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { clampStep, commitDraft, draftValue, stepState } from "./stepper-math";

export function Stepper({ value, min, max, onChange, label, name, testId }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; name?: string; testId?: string }) {
  const { canDec, canInc } = stepState(value, min, max);
  // The input keeps what was typed; a complete number commits at once, anything else waits for blur or Enter.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = commitDraft(draft, min, max, value);
    setDraft(String(v));
    if (v !== value) onChange(v);
  };
  const btn = "inline-flex size-11 items-center justify-center border border-wire-strong bg-card text-headline font-semibold disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center">
      <button type="button" aria-label={`Decrease ${label}`} disabled={!canDec} onClick={() => onChange(clampStep(value - 1, min, max))} className={`${btn} rounded-l-input`}>−</button>
      <input
        name={name}
        aria-label={label}
        data-testid={testId}
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = draftValue(e.target.value, min, max);
          if (v !== null && v !== value) onChange(v);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="h-11 w-14 border-y border-wire-strong bg-card text-center font-condensed text-grid font-semibold tabular"
      />
      <button type="button" aria-label={`Increase ${label}`} disabled={!canInc} onClick={() => onChange(clampStep(value + 1, min, max))} className={`${btn} rounded-r-input`}>+</button>
    </div>
  );
}
```

`src/components/copy-button.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button, type ButtonVariant } from "./button";

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", variant = "secondary", full = false, testId }: { value: string; label?: string; copiedLabel?: string; variant?: ButtonVariant; full?: boolean; testId?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed"); // clipboard blocked (some in-app browsers): the value stays visible to select
    }
    window.setTimeout(() => setState("idle"), 2000);
  }
  return (
    <>
      <Button variant={variant} full={full} onClick={copy} data-testid={testId}>
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed. Select it instead." : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">{state === "copied" ? `${copiedLabel}.` : ""}</span>
    </>
  );
}
```

`src/components/copy-field.tsx`:

```tsx
"use client";
import { useId } from "react";
import { CopyButton } from "./copy-button";

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-small text-ink-2">{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-input border border-wire-strong bg-card px-3 font-mono text-small" />
        <CopyButton value={value} />
      </div>
    </div>
  );
}
```

`src/components/segmented-control.tsx`:

```tsx
"use client";

export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-input border border-wire-strong bg-card p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`min-h-11 min-w-11 rounded-[3px] px-4 text-small font-semibold ${on ? "bg-ink text-card" : "text-ink underline-offset-4 hover:underline"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/filter-chips.tsx`:

```tsx
"use client";

export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-small font-medium ${on ? "border-ink bg-ink text-card" : "border-wire-strong bg-card text-ink"}`}>
            {o.label}{o.count !== undefined ? <span className="ml-1.5 tabular">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/toast.tsx`:

```tsx
"use client";

export type ToastOffset = "bar" | "sheet-action" | "none";

/** Where the snackbar sits: above the claim bar, above a sheet's sticky bottom action, or at the bottom edge. */
const BOTTOM: Record<ToastOffset, string> = {
  bar: "calc(var(--bar-total, calc(var(--bar-h) + max(12px, env(safe-area-inset-bottom)))) + 8px)",
  "sheet-action": "calc(68px + max(12px, env(safe-area-inset-bottom)) + 8px)",
  none: "max(12px, env(safe-area-inset-bottom))",
};

/** Polite snackbar. Render it inside the sheet that owns it (outside elements are inert under a modal). */
export function Toast({ message, action, onAction, offset = "bar" }: { message: string | null; action?: string; onAction?: () => void; offset?: ToastOffset }) {
  return (
    <div role="status" aria-live="polite" style={{ bottom: BOTTOM[offset] }} className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4">
      {message && (
        <div className="pointer-events-auto flex min-h-11 max-w-[568px] items-center gap-4 rounded-card bg-ink px-4 py-2 text-small text-card">
          <span>{message}</span>
          {action && onAction && <button type="button" onClick={onAction} className="min-h-11 font-semibold underline underline-offset-4">{action}</button>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the dev gallery**

`src/app/dev/components/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { GridCell } from "@/domain/breaks/grid";
import { Grid } from "@/components/grid/grid";
import { GridPreview } from "@/components/grid/grid-preview";
import { MiniCells } from "@/components/mini-cells";
import { Legend } from "@/components/legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };

const STATES: GridCell["state"][] = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"];
const cells: GridCell[] = [
  ...Array.from({ length: 50 }, (_, i): GridCell => ({
    number: i + 1, state: STATES[i % STATES.length], mine: i % 11 === 3, overdue: i % 13 === 1, bonus: false, holder: null,
  })),
  ...Array.from({ length: 5 }, (_, i): GridCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null })),
];

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 50 + 5 bonus</h2>
        <Grid cells={cells} lineCount={50} label="Lines, 7 of 50 open" />
        <Legend />
      </section>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 6</h2>
        <Grid cells={cells.slice(0, 6)} lineCount={6} label="Lines, 2 of 6 open" />
      </section>
      <section className="flex items-center gap-3">
        <GridPreview count={50} cells={cells} />
        <GridPreview count={12} size={64} />
        <MiniCells cells={cells.slice(0, 5)} />
      </section>
      <section className="space-y-2">
        <FillBar total={50} paid={19} taken={12} />
        <div className="flex flex-wrap gap-2">{["draft", "open", "filled", "drawing", "drawn", "cancelled"].map((s) => <StatusPill key={s} status={s} />)}</div>
        <div className="flex items-center gap-2"><Avatar name="Jim" /><Avatar name={null} size={44} /></div>
      </section>
      <section className="space-y-2">
        <Banner>Neutral banner.</Banner>
        <Banner tone="success">You have lines 4 and 11.</Banner>
        <Banner tone="error">Line 7 was just taken. Pick another.</Banner>
        <div className="flex flex-wrap gap-2"><Button>Claim 2 lines</Button><Button variant="secondary">Pay with Venmo</Button><Button variant="text">I&apos;ll pay later</Button></div>
      </section>
      <Demo />
    </main>
  );
}
```

`src/app/dev/components/demo.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { Stepper } from "@/components/stepper";
import { CopyButton } from "@/components/copy-button";
import { CopyField } from "@/components/copy-field";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterChips } from "@/components/filter-chips";
import { Toast } from "@/components/toast";
import { Button } from "@/components/button";
import { StickyBar } from "@/components/sticky-bar";

export function Demo() {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [n, setN] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "sent" | "unpaid" | "overdue">("all");
  const [toast, setToast] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <h2 className="text-headline font-semibold">Interactive</h2>
      <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      <FilterChips label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: 12 }, { value: "sent", label: "Sent", count: 3 }, { value: "unpaid", label: "Unpaid", count: 5 }, { value: "overdue", label: "Overdue", count: 1 }]} />
      <Stepper label="Number of lines" value={n} min={1} max={5} onChange={setN} />
      <CopyButton value="@Jim-Roberts-36" label="Copy handle" />
      <CopyField label="Commitment" value={"ab".repeat(32)} />
      <div className="flex gap-2">
        <Button onClick={() => setOpen(true)}>Bottom sheet</Button>
        <Button variant="secondary" onClick={() => setFull(true)}>Full sheet</Button>
        <Button variant="text" onClick={() => setToast("Marked @dave paid (3 lines, $15).")}>Toast</Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pay for your lines">
        <p>Sheet content. Escape, the backdrop and Close all close it.</p>
        <input className="mt-3 h-11 w-full rounded-input border border-wire-strong px-3" placeholder="Focus me: the bar hides" />
      </Sheet>
      <Sheet full open={full} onClose={() => setFull(false)} title="Host tools"><p>Full-screen sheet.</p></Sheet>
      <Toast message={toast} action="Undo" onAction={() => setToast(null)} />
      <StickyBar><p className="flex-1 text-small">Lines 7, 12, $10</p><Stepper label="Lines in the bar" value={n} min={1} max={5} onChange={setN} /><Button>Claim 2 lines</Button></StickyBar>
    </section>
  );
}
```

In `src/middleware.ts`, replace line 4 with:

```ts
const PUBLIC = [/^\/$/, /^\/login(\/|$)/, /^\/auth\//, /^\/b\//, /^\/breaks(\/|$)/, /^\/h\//, /^\/legal(\/|$)/, /^\/api\//, /^\/test\//, /^\/dev\//, /^\/_next\//, /^\/favicon/];
```

- [ ] **Step 6: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. Open http://localhost:3000/dev/components at 390 × 844 and at 360 and 320 widths. Check: 8, 7 and 6 columns respectively and 10 above 640; the bonus row after a "Bonus" label (cell 51 shows the corner flag and a "+" at the bottom left); Tab into the 50-line grid and arrow across it: the full green focus ring shows on all four sides of every cell, never cut off by a neighbour; Tab reaches the sheet buttons; Escape closes the sheet and focus returns to its button; focusing the sheet input hides the sticky bar, focusing the stepper inside the bar does not; typing "3" then "0" into a stepper (max 5) leaves "30" in the field until blur, which clamps it to 5.

- [ ] **Step 7: Build (required)**

Run: `pnpm test src/components && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/components src/app/dev src/middleware.ts
git commit -m "feat(ui): sheet, sticky bar, stepper, copy and chip primitives with a dev gallery"
```

---

### Task 9: Shell — AppHeader, TabBar, Footer (model: sonnet)

Header with the wordmark and Sign in or the avatar initial; a bottom tab bar on phones that moves into the header above 640, hides on `/b/*`, and hides when there would be fewer than two destinations (members and signed-out viewers get no one-item "Browse" bar; Plan B brings it back with My lines); a one-line footer. In Plan A the destinations are Browse (`/`) and Host (hosts and admins only); Plan B adds My lines (`/me`) and points Browse at `/breaks`. The footer omits Contact until the owner picks an address.

**Files:**
- Create: `src/components/shell/nav.ts`, `src/components/shell/nav.test.ts`, `src/components/shell/nav-links.tsx`, `src/components/shell/app-header.tsx`, `src/components/shell/tab-bar.tsx`, `src/components/shell/footer.tsx`
- Modify: `src/app/layout.tsx` (whole file)

**Interfaces:**
- Consumes: `getSessionViewer`, `Viewer`, `Avatar`, `ButtonLink`, `Role`.
- Produces: `navItems(role: Role | null): NavItem[]` where `NavItem = { href: string; label: string; match: (path: string) => boolean }`; `showTabBar(path: string, role: Role | null): boolean` (false on `/b/*` and below two destinations); `<NavLinks role variant />` (client); `<AppHeader viewer />` (server; `Viewer` from `@/auth/viewer`); `<TabBar role />` (client, `data-tab-bar`); `<Footer />`; the layout keeps `<TzCookie />`.

- [ ] **Step 1: Write the failing test**

`src/components/shell/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { navItems, showTabBar } from "./nav";

describe("navItems", () => {
  it("shows Host only to hosts and admins", () => {
    expect(navItems(null).map((i) => i.label)).toEqual(["Browse"]);
    expect(navItems("member").map((i) => i.label)).toEqual(["Browse"]);
    expect(navItems("host").map((i) => i.label)).toEqual(["Browse", "Host"]);
    expect(navItems("admin").map((i) => i.label)).toEqual(["Browse", "Host"]);
  });
  it("marks the active destination", () => {
    const [browse, host] = navItems("host");
    expect(browse.match("/")).toBe(true);
    expect(browse.match("/host")).toBe(false);
    expect(host.match("/host/new")).toBe(true);
  });
});

describe("showTabBar", () => {
  it("hides on break pages so there is one bar at the bottom", () => {
    expect(showTabBar("/b/123", "host")).toBe(false);
    expect(showTabBar("/b/123/result", "host")).toBe(false);
    expect(showTabBar("/", "host")).toBe(true);
    expect(showTabBar("/host/new", "admin")).toBe(true);
  });
  it("hides a one-item bar (members and signed-out viewers only have Browse in Plan A)", () => {
    expect(showTabBar("/", "member")).toBe(false);
    expect(showTabBar("/", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/components/shell/nav.test.ts`
Expected: FAIL with `Failed to resolve import "./nav"`.

- [ ] **Step 3: Write `nav.ts` and run the test to see it pass**

`src/components/shell/nav.ts`:

```ts
import type { Role } from "@/domain/types";

export type NavItem = { href: string; label: string; match: (path: string) => boolean };

/** Plan A destinations. Plan B adds "My lines" (/me) and points Browse at /breaks. */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") }];
  if (role === "host" || role === "admin") items.push({ href: "/host", label: "Host", match: (p) => p.startsWith("/host") });
  return items;
}

/**
 * The break page owns the bottom of the screen (claim bar), so the tab bar steps aside there. A bar with one
 * destination is worse than none, so it also hides below two items (the header still carries Host for hosts).
 */
export function showTabBar(path: string, role: Role | null): boolean {
  return !path.startsWith("/b/") && navItems(role).length >= 2;
}
```

Run: `pnpm test src/components/shell/nav.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the shell components**

`src/components/shell/nav-links.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/types";
import { navItems } from "./nav";

export function NavLinks({ role, variant }: { role: Role | null; variant: "header" | "tabs" }) {
  const path = usePathname() ?? "/";
  const items = navItems(role);
  return (
    <ul className={variant === "tabs" ? "flex h-14" : "flex gap-2"}>
      {items.map((it) => {
        const active = it.match(path);
        const tone = active ? "text-ink underline decoration-2 underline-offset-8" : "text-ink-2";
        return (
          <li key={it.href} className={variant === "tabs" ? "flex-1" : undefined}>
            <Link href={it.href} aria-current={active ? "page" : undefined}
              className={variant === "tabs" ? `flex h-full items-center justify-center text-small font-semibold ${tone}` : `inline-flex min-h-11 items-center px-2 text-small font-semibold ${tone}`}>
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

`src/components/shell/app-header.tsx`:

```tsx
import Link from "next/link";
import type { Viewer } from "@/auth/viewer";
import { Avatar } from "@/components/avatar";
import { ButtonLink } from "@/components/button";
import { NavLinks } from "./nav-links";

export function AppHeader({ viewer }: { viewer: Pick<Viewer, "handle" | "displayName" | "role"> | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-wire bg-paper">
      <div className="mx-auto flex h-14 max-w-[960px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="font-condensed text-[22px] leading-none font-semibold text-ink">Breaks</Link>
        <nav aria-label="Main" className="hidden sm:block"><NavLinks role={viewer?.role ?? null} variant="header" /></nav>
        <div className="ml-auto">
          {viewer ? (
            <span className="inline-flex min-h-11 items-center">
              <Avatar name={viewer.displayName ?? viewer.handle} />
              <span className="sr-only">Signed in as {viewer.handle ? `@${viewer.handle}` : "a new account"}</span>
            </span>
          ) : (
            <ButtonLink href="/login" variant="text">Sign in</ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
```

`src/components/shell/tab-bar.tsx`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/types";
import { NavLinks } from "./nav-links";
import { showTabBar } from "./nav";

/** Phones only; above 640 the same links sit in the header. Body padding comes from globals.css ([data-tab-bar]). */
export function TabBar({ role }: { role: Role | null }) {
  const path = usePathname() ?? "/";
  if (!showTabBar(path, role)) return null;
  return (
    <nav aria-label="Main" data-tab-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-wire bg-card pb-safe sm:hidden">
      <NavLinks role={role} variant="tabs" />
    </nav>
  );
}
```

`src/components/shell/footer.tsx`:

```tsx
import Link from "next/link";

/** Terms and how draws work. Contact joins once the owner picks an address (design §8). */
export function Footer() {
  const link = "inline-flex min-h-11 items-center underline underline-offset-4";
  return (
    <footer className="mx-auto max-w-[960px] px-4 py-6 text-small text-ink-2 sm:px-6">
      <nav aria-label="Footer">
        <ul className="flex flex-wrap gap-x-4">
          <li><Link className={link} href="/legal/terms">Terms</Link></li>
          <li><Link className={link} href="/legal/draw">How draws work</Link></li>
        </ul>
      </nav>
    </footer>
  );
}
```

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { barlow, barlowCondensed } from "./fonts";
import { getSessionViewer } from "@/auth/viewer";
import { AppHeader } from "@/components/shell/app-header";
import { TabBar } from "@/components/shell/tab-bar";
import { Footer } from "@/components/shell/footer";
import { TzCookie } from "@/components/tz-cookie";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Breaks", template: "%s | Breaks" },
  description: "Group buys for darts gear, with a draw you can check.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F5F1",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getSessionViewer();
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-body text-ink antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-input focus:bg-card focus:px-4 focus:py-3 focus:text-ink">
          Skip to content
        </a>
        <AppHeader viewer={viewer ? { handle: viewer.handle, displayName: viewer.displayName, role: viewer.role } : null} />
        <div id="content" tabIndex={-1} className="outline-none">{children}</div>
        <Footer />
        <TabBar role={viewer?.role ?? null} />
        <TzCookie />
      </body>
    </html>
  );
}
```

(The layout now reads the session, which makes every route dynamic; every route except `/legal/*` and `/` already was. `getSessionViewer` reuses the row `getCaller` upserts, so the layout adds no query.)

- [ ] **Step 5: Run everything, including the journey**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: green. The journey does not key on the header.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell src/app/layout.tsx
git commit -m "feat(ui): app header, tab bar and footer"
```

---
### Task 10: Break page frame — media row, count, status, host line, legend, share, details fold (model: sonnet)

The server-rendered frame of `/b/{id}` on the new primitives, laid out to the design's pixel budget: media row (88 pt grid thumbnail standing in for the photo, title, "19 of 50 left", "$5 a line", status pill), the host line with the interim trust text, the board grid (read-only in this task), legend, "You have 4, 11 and 27.", the draw-lock line, Share and Host tools, and the details fold with prizes, rules and copyable payment handles.

Deferred, with the design's fallback: photos (thumbnail is the grid), the trust percentage (interim "new host" below five breaks run, else "N breaks run since Oct 2026"), the question thread ("Questions? Ask Jim." is plain text), the host profile link (`/h/{handle}` is Plan B, so the host line is text). The old `ClaimPanel` and `HostPanel` stay below the frame until Tasks 11b and 13b replace them, so the journey keeps its ids; the old `grid.tsx` is deleted. The journey file is unchanged by this task (`paid-count` moves into the host section with the same id).

**Files:**
- Create: `src/lib/share-text.ts`, `src/lib/share-text.test.ts`, `src/components/break/frame-copy.ts`, `src/components/break/frame-copy.test.ts`, `src/components/break/details-fold.tsx`, `src/domain/breaks/queries.test.ts`
- Modify: `src/domain/breaks/queries.ts` (append `hostTrust`)
- Modify: `src/app/b/[id]/page.tsx` (whole file)
- Delete: `src/app/b/[id]/grid.tsx`

**Interfaces:**
- Consumes: `shapeGrid`, `canViewBreak`, `isHostView`, `getBreakPage`, `ledgerByBuyer`, `globalUnpaidCount`, `getDrawResult`, `formatMoney`, `formatMonthYear`, `joinAnd`, `ordinal`, `plural`, `Grid`, `GridPreview`, `Legend`, `StatusPill`, `CopyButton`, `ButtonLink`, `buttonClass`, `ClaimPanel`, `HostPanel`, `env`.
- Produces:
  - `type ShareInput = { state: "open"; title: string; lineCount: number; priceCents: number; openCount: number; url: string } | { state: "closed"; title: string; url: string } | { state: "running"; title: string; url: string } | { state: "ran"; topLine: number; topHandle: string | null; url: string }`; `shareText(i: ShareInput): string`.
  - `type ShareSource = { status: string; title: string; url: string; lineCount: number; priceCents: number; openCount: number; top: { line: number; handle: string | null } | null }`; `pageShare(p: ShareSource): string | null` (open → open text, filled → closed, drawing → running, drawn → ran; draft, cancelled, or drawn without a result → `null`, which hides Share).
  - In `frame-copy.ts`: `leftText(open: number, total: number): string`, `payWithinText(hours: number): string`, `youHaveText(numbers: readonly number[]): string | null`, `trustText(t: { breaksRun: number; since: Date }): string`, `prizeLines(prizes: readonly { rank: number; itemId: string | null }[], items: readonly { id: string; name: string }[]): string[]`, `pickingText(mode: ClaimMode): string`, `perPersonText(max: number | null): string`, `closesText(hostName: string): string`, `orList(items: readonly string[]): string`.
  - `hostTrust(tx: Tx, hostId: string): Promise<{ breaksRun: number; since: Date }>` in `src/domain/breaks/queries.ts`.
  - `<DetailsFold description prizes perPerson picking closes handles instructions hostName />` (prose capped at `max-w-[65ch]`, D§3).
  - Page test ids: `left-count`, `you-have`, `share`, `paid-count` (host section), `see-result` (in-flow link in this task only; Task 11b moves it into the bar as `bar-result`). `host-tools` is an element `id` here (the anchor target), not a test id; Task 13b turns it into the `host-tools` test id on a button.
  - The page checks `canViewBreak` right after `getBreakPage`, before any other query.

- [ ] **Step 1: Write the failing tests**

`src/lib/share-text.test.ts`:

```ts
import { it, expect } from "vitest";
import { pageShare, shareText } from "./share-text";

const url = "https://breaks.example/b/1";

it("writes state-specific share text (design §6)", () => {
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 19, url })).toBe(`Taylor Chronos break. 50 lines at $5. Pick yours: ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 3, url })).toBe(`Only 3 spots left. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 1, url })).toBe(`Only 1 spot left. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "open", title: "Taylor Chronos", lineCount: 50, priceCents: 500, openCount: 0, url })).toBe(`Every spot is taken. If you've claimed, please send payment. ${url}`);
  expect(shareText({ state: "closed", title: "Taylor Chronos", url })).toBe(`CLOSED. Taylor Chronos. Draw tonight. ${url}`);
  expect(shareText({ state: "running", title: "Taylor Chronos", url })).toBe(`CLOSED. Taylor Chronos. Draw running now. ${url}`);
  expect(shareText({ state: "ran", topLine: 7, topHandle: "mike", url: `${url}/result` })).toBe(`CLOSED n RAN. Top spot: line 7, @mike. Check the draw: ${url}/result`);
  expect(shareText({ state: "ran", topLine: 7, topHandle: null, url })).toBe(`CLOSED n RAN. Top spot: line 7. Check the draw: ${url}`);
});

it("picks the share text by break state, and hides Share where there is nothing to share", () => {
  const src = { title: "Taylor Chronos", url, lineCount: 50, priceCents: 500, openCount: 19, top: null };
  expect(pageShare({ ...src, status: "open" })).toBe(`Taylor Chronos break. 50 lines at $5. Pick yours: ${url}`);
  expect(pageShare({ ...src, status: "filled" })).toBe(`CLOSED. Taylor Chronos. Draw tonight. ${url}`);
  expect(pageShare({ ...src, status: "drawing" })).toBe(`CLOSED. Taylor Chronos. Draw running now. ${url}`);
  expect(pageShare({ ...src, status: "drawn", top: { line: 7, handle: "mike" } })).toBe(`CLOSED n RAN. Top spot: line 7, @mike. Check the draw: ${url}/result`);
  expect(pageShare({ ...src, status: "drawn" })).toBeNull();
  expect(pageShare({ ...src, status: "draft" })).toBeNull();
  expect(pageShare({ ...src, status: "cancelled" })).toBeNull();
});
```

`src/components/break/frame-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { closesText, leftText, orList, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "./frame-copy";

describe("frame copy", () => {
  it("counts and deadlines read as sentences, no middle dots", () => {
    expect(leftText(19, 50)).toBe("19 of 50 left");
    expect(payWithinText(24)).toBe("Pay within 24 hours.");
    expect(payWithinText(1)).toBe("Pay within 1 hour.");
  });
  it("names the viewer's lines", () => {
    expect(youHaveText([])).toBeNull();
    expect(youHaveText([4])).toBe("You have line 4.");
    expect(youHaveText([4, 11, 27])).toBe("You have 4, 11 and 27.");
  });
  it("uses the interim trust line until the reputation plan lands", () => {
    const since = new Date("2026-10-01T12:00:00Z");
    expect(trustText({ breaksRun: 0, since })).toBe("new host");
    expect(trustText({ breaksRun: 4, since })).toBe("new host");
    expect(trustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026");
  });
  it("describes prizes, choices and 2nd place", () => {
    const items = [{ id: "a", name: "Chronos 22g" }, { id: "b", name: "Chronos 24g" }, { id: "c", name: "Flight pack" }];
    expect(prizeLines([{ rank: 1, itemId: "a" }], items)).toEqual(["Top spot gets Chronos 22g."]);
    expect(prizeLines([{ rank: 1, itemId: "a" }, { rank: 1, itemId: "b" }, { rank: 2, itemId: "c" }], items))
      .toEqual(["Top spot gets a choice: Chronos 22g or Chronos 24g.", "2nd place gets Flight pack."]);
    expect(orList(["a", "b", "c"])).toBe("a, b or c");
  });
  it("states the rules", () => {
    expect(pickingText("pick_or_random")).toBe("Pick your lines or take random ones.");
    expect(pickingText("pick_only")).toBe("Pick your lines. No randoms.");
    expect(pickingText("straight")).toBe("Straight fill. Lines go out in order.");
    expect(perPersonText(null)).toBe("No limit per person.");
    expect(perPersonText(1)).toBe("Up to 1 line per person.");
    expect(perPersonText(5)).toBe("Up to 5 lines per person.");
    expect(closesText("Jim")).toBe("When every line is paid, the break closes and Jim runs the draw.");
  });
});
```

`src/domain/breaks/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak } from "../../../tests/helpers/fixtures";
import { hostTrust } from "./queries";

describe("hostTrust", () => {
  it("counts the host's drawn breaks and reports when they joined", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await makeBreak(tx, { hostId: host.id, status: "drawn" });
      await makeBreak(tx, { hostId: host.id, status: "drawn" });
      await makeBreak(tx, { hostId: host.id, status: "open" });
      const t = await hostTrust(tx, host.id);
      expect(t.breaksRun).toBe(2);
      expect(t.since).toBeInstanceOf(Date);
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/lib/share-text.test.ts src/components/break/frame-copy.test.ts src/domain/breaks/queries.test.ts`
Expected: FAIL. `share-text.test.ts` and `frame-copy.test.ts` fail with `Failed to resolve import "./share-text"` and `"./frame-copy"`; `queries.test.ts` fails with `TypeError: hostTrust is not a function`.

- [ ] **Step 3: Implement**

`src/lib/share-text.ts`:

```ts
import { formatMoney } from "./money";

export type ShareInput =
  | { state: "open"; title: string; lineCount: number; priceCents: number; openCount: number; url: string }
  | { state: "closed"; title: string; url: string }
  | { state: "running"; title: string; url: string }
  | { state: "ran"; topLine: number; topHandle: string | null; url: string };

/** Copied to the clipboard by Share (design §6). "CLOSED n RAN" is quoted community idiom, the one caps exception. */
export function shareText(i: ShareInput): string {
  switch (i.state) {
    case "open":
      if (i.openCount === 0) return `Every spot is taken. If you've claimed, please send payment. ${i.url}`;
      if (i.openCount <= 5) return `Only ${i.openCount} ${i.openCount === 1 ? "spot" : "spots"} left. If you've claimed, please send payment. ${i.url}`;
      return `${i.title} break. ${i.lineCount} lines at ${formatMoney(i.priceCents)}. Pick yours: ${i.url}`;
    case "closed":
      return `CLOSED. ${i.title}. Draw tonight. ${i.url}`;
    case "running":
      return `CLOSED. ${i.title}. Draw running now. ${i.url}`;
    case "ran":
      return `CLOSED n RAN. Top spot: line ${i.topLine}${i.topHandle ? `, @${i.topHandle}` : ""}. Check the draw: ${i.url}`;
  }
}

export type ShareSource = {
  status: string; title: string; url: string; lineCount: number; priceCents: number; openCount: number;
  top: { line: number; handle: string | null } | null;
};

/** The break page's Share text by state. Null hides Share: drafts are private and a cancelled break has nothing to share. */
export function pageShare(p: ShareSource): string | null {
  switch (p.status) {
    case "open": return shareText({ state: "open", title: p.title, lineCount: p.lineCount, priceCents: p.priceCents, openCount: p.openCount, url: p.url });
    case "filled": return shareText({ state: "closed", title: p.title, url: p.url });
    case "drawing": return shareText({ state: "running", title: p.title, url: p.url });
    case "drawn": return p.top ? shareText({ state: "ran", topLine: p.top.line, topHandle: p.top.handle, url: `${p.url}/result` }) : null;
    default: return null;
  }
}
```

`src/components/break/frame-copy.ts`:

```ts
import type { ClaimMode } from "@/domain/breaks/rules";
import { joinAnd, ordinal, plural } from "@/lib/list";
import { formatMonthYear } from "@/lib/time";

export const leftText = (open: number, total: number) => `${open} of ${total} left`;
export const payWithinText = (hours: number) => `Pay within ${hours} ${plural(hours, "hour", "hours")}.`;

export function youHaveText(numbers: readonly number[]): string | null {
  if (numbers.length === 0) return null;
  return numbers.length === 1 ? `You have line ${numbers[0]}.` : `You have ${joinAnd(numbers)}.`;
}

/** Interim trust line (design §5.3) until the reputation plan adds "98% would buy again". */
export function trustText(t: { breaksRun: number; since: Date }): string {
  return t.breaksRun < 5 ? "new host" : `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}`;
}

export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function prizeLines(prizes: readonly { rank: number; itemId: string | null }[], items: readonly { id: string; name: string }[]): string[] {
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  const byRank = new Map<number, string[]>();
  for (const p of prizes) {
    const name = p.itemId ? nameOf.get(p.itemId) : undefined;
    if (name) byRank.set(p.rank, [...(byRank.get(p.rank) ?? []), name]);
  }
  return [...byRank.entries()].sort(([a], [b]) => a - b).map(([rank, names]) => {
    const who = rank === 1 ? "Top spot gets" : `${ordinal(rank)} place gets`;
    return names.length === 1 ? `${who} ${names[0]}.` : `${who} a choice: ${orList(names)}.`;
  });
}

const PICKING: Record<ClaimMode, string> = {
  pick_or_random: "Pick your lines or take random ones.",
  pick_only: "Pick your lines. No randoms.",
  straight: "Straight fill. Lines go out in order.",
};
export const pickingText = (mode: ClaimMode) => PICKING[mode];

export const perPersonText = (max: number | null) => (max === null ? "No limit per person." : `Up to ${max} ${plural(max, "line", "lines")} per person.`);

export const closesText = (hostName: string) => `When every line is paid, the break closes and ${hostName} runs the draw.`;
```

Append to `src/domain/breaks/queries.ts`:

```ts
/** Interim trust figures (the reputation plan replaces them): drawn breaks and member-since. */
export async function hostTrust(tx: Tx, hostId: string): Promise<{ breaksRun: number; since: Date }> {
  const [r] = await tx.select({
    since: users.createdAt,
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${users.id} and b.status = 'drawn')`,
  }).from(users).where(eq(users.id, hostId));
  return { breaksRun: r?.breaksRun ?? 0, since: r?.since ?? new Date(0) };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/lib/share-text.test.ts src/components/break/frame-copy.test.ts src/domain/breaks/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the details fold**

`src/components/break/details-fold.tsx`:

```tsx
import { CopyButton } from "@/components/copy-button";

type Props = {
  description: string;
  prizes: string[];
  perPerson: string;
  picking: string;
  closes: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  hostName: string;
};

/** Everything below the fold (design §5.4). Payment handles are public here, as the design specifies. */
export function DetailsFold({ description, prizes, perPerson, picking, closes, handles, instructions, hostName }: Props) {
  return (
    <details className="mt-6 rounded-card border border-wire bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Details</summary>
      <div className="space-y-4 px-4 pb-4">
        {description && <p className="max-w-[65ch] whitespace-pre-line">{description}</p>}
        {prizes.length > 0 && <ul className="space-y-1">{prizes.map((p) => <li key={p}>{p}</li>)}</ul>}
        <ul className="space-y-1 text-small text-ink-2">
          <li>{perPerson}</li>
          <li>{picking}</li>
          <li>{closes}</li>
        </ul>
        {(handles.venmo || handles.paypal) && (
          <div className="space-y-2">
            <h3 className="text-small font-semibold">How to pay {hostName}</h3>
            {handles.venmo && (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">Venmo <b>{handles.venmo}</b></span>
                <CopyButton value={handles.venmo} label="Copy" />
              </div>
            )}
            {handles.paypal && (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">PayPal <b>paypal.me/{handles.paypal}</b></span>
                <CopyButton value={`paypal.me/${handles.paypal}`} label="Copy" />
              </div>
            )}
          </div>
        )}
        {instructions && <p className="max-w-[65ch] whitespace-pre-line text-small text-ink-2">{instructions}</p>}
        <p className="text-small text-ink-2">Questions? Ask {hostName}.</p>
      </div>
    </details>
  );
}
```

- [ ] **Step 6: Rebuild the page frame**

Delete `src/app/b/[id]/grid.tsx`. Replace `src/app/b/[id]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getBreakPage, hostTrust } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getCaller } from "@/auth/session";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatMoney } from "@/lib/money";
import { pageShare } from "@/lib/share-text";
import { Grid } from "@/components/grid/grid";
import { GridPreview } from "@/components/grid/grid-preview";
import { Legend } from "@/components/legend";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import { ButtonLink, buttonClass } from "@/components/button";
import { DetailsFold } from "@/components/break/details-fold";
import { closesText, leftText, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { ClaimPanel } from "./claim-panel";
import { HostPanel } from "./host-panel";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page || page.break.status === "draft") return {};
  return { title: page.break.title, description: `${page.break.lineCount} lines at ${formatMoney(page.break.linePriceCents)}.` };
}

export default async function BreakPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const b = page.break;
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(b.status, isHostView(b.hostId, caller))) notFound();
  const now = new Date();
  const { trust, globalUnpaid } = await db.transaction(async (tx) => ({
    trust: await hostTrust(tx, page.host.id),
    globalUnpaid: caller ? await globalUnpaidCount(tx, caller.id) : 0,
  }));
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const hostName = page.host.displayName ?? page.host.handle ?? "the host";
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const url = `${env().APP_URL}/b/${id}`;
  let top: { line: number; handle: string | null } | null = null;
  if (b.status === "drawn") {
    const res = await db.transaction((tx) => getDrawResult(tx, id));
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
  const share = pageShare({ status: b.status, title: b.title, url, lineCount: b.lineCount, priceCents: b.linePriceCents, openCount: grid.counts.open, top });
  const openNumbers = grid.cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
  const mine = caller ? page.lines.filter((l) => l.ownerId === caller.id) : [];
  const youHave = grid.viewer ? youHaveText(grid.viewer.held) : null;
  const ledger = grid.hostView ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];

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
      <p className="mt-2 flex min-h-11 items-center text-small text-ink-2">
        {payWithinText(b.paymentWindowHours)} Hosted by {hostRef}, {trustText(trust)}.
      </p>
      {b.status === "drawn" && <div className="mt-2"><ButtonLink href={`/b/${id}/result`} full data-testid="see-result">See the result</ButtonLink></div>}

      <div className="mt-3">
        <Grid cells={grid.cells} lineCount={b.lineCount} label={`Lines, ${grid.counts.open} of ${b.lineCount} open`} />
      </div>
      <div className="mt-3"><Legend /></div>
      {youHave && <p className="mt-2 text-small" data-testid="you-have">{youHave}</p>}
      {b.seedCommitment && (
        <p className="mt-1 text-small text-ink-2">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {share && <CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" />}
        {grid.hostView && <a href="#host-tools" className={buttonClass("secondary")}>Host tools</a>}
      </div>

      {caller && b.status === "open" && (
        <ClaimPanel breakId={id} openNumbers={openNumbers} allowRandom={b.claimMode === "pick_or_random"}
          mine={mine.map((l) => ({ number: l.number, sentAt: l.sentAt, paidAt: l.paidAt }))} priceCents={b.linePriceCents}
          paymentHandles={page.host.paymentHandles} paymentInstructions={b.paymentInstructions} seedCommitment={b.seedCommitment} />
      )}
      {!caller && b.status === "open" && <div className="mt-4"><ButtonLink href={`/login?next=/b/${id}`} full>Sign in to claim lines</ButtonLink></div>}

      <DetailsFold
        description={b.description}
        prizes={prizeLines(page.prizes, page.items)}
        perPerson={perPersonText(b.maxLinesPerUser)}
        picking={pickingText(b.claimMode)}
        closes={closesText(hostName)}
        handles={page.host.paymentHandles}
        instructions={b.paymentInstructions}
        hostName={hostName}
      />

      {grid.hostView && (
        <section id="host-tools" className="mt-6 space-y-2">
          <h2 className="text-headline font-semibold">Host tools</h2>
          <p className="text-small tabular" data-testid="paid-count">{grid.counts.paid} of {b.lineCount} paid</p>
          <HostPanel breakId={id} status={b.status} rows={ledger.map((u) => ({ ownerId: u.ownerId, handle: u.handle, unpaid: u.unpaid, sent: u.sent, overdue: u.overdue, owedCents: u.owedCents, status: u.status }))} />
        </section>
      )}
    </main>
  );
}
```

(`<a href="#host-tools">` is an in-page anchor, so `@next/next/no-html-link-for-pages` does not apply. Task 13b replaces it with the ledger sheet.)

- [ ] **Step 7: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. Open a 50-line open break at 390 × 664: the media row, the host line and all seven grid rows sit above the fold (the claim bar and its pixel budget arrive in Task 11b, where `e2e/layout.spec.ts` pins them). As an anonymous viewer, no cell shows a handle and no red edge appears on an overdue claim; a draft's URL 404s when signed out.

- [ ] **Step 8: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green; the journey passes unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/lib/share-text.ts src/lib/share-text.test.ts src/components/break src/domain/breaks/queries.ts src/domain/breaks/queries.test.ts "src/app/b/[id]"
git commit -m "feat(break-page): board frame with media row, legend, share and details"
```

---

### Task 11a: Selection and claim-bar state as pure modules (model: opus)

The logic of the break page's client island, written and tested before any UI touches it: parsing `?pick=`, reconciling a selection with fresh server cells, toggling within the allowance, the bar and announcement copy, and the sticky bar's state function that encodes the design's §5.4 table row by row. Nothing imports these modules yet, so the app is unchanged and every gate passes after this task.

**Files:**
- Create: `src/components/break/selection.ts`, `src/components/break/selection.test.ts`, `src/components/break/claim-bar-state.ts`, `src/components/break/claim-bar-state.test.ts`

**Interfaces:**
- Consumes: `GridCell`, `Allowance` (`import type` from `@/domain/breaks/grid`), `ClaimMode` (`import type`), `BreakStatus` (`import type`), `cellStateWord`, `formatMoney`, `joinAnd`, `plural`.
- Produces:
  - `selection.ts`: `parsePick(raw: string | string[] | undefined, lineCount: number): number[]`; `reconcileSelection(selected: readonly number[], cells: readonly GridCell[]): { kept: number[]; dropped: number[] }`; `toggleSelection(selected: readonly number[], n: number, remaining: number): { next: number[]; blocked: boolean }`; `selectionSummary(numbers: readonly number[], priceCents: number, maxShown?: number): string`; `selectionAnnouncement(count: number, priceCents: number): string`; `takenAnnouncement(numbers: readonly number[]): string`; `outcomeText(got: readonly number[], taken: readonly number[]): string`; `cellNote(c: GridCell): string`; `loginHref(breakId: string, pick: readonly number[]): string`; `onboardingHref(breakId: string, pick: readonly number[]): string`.
  - `claim-bar-state.ts`: `type BarInput = { status: BreakStatus; signedIn: boolean; claimMode: ClaimMode; selected: readonly number[]; priceCents: number; openCount: number; allowance: Allowance; owe: { cents: number; numbers: readonly number[] } | null; justSent: boolean; hostName: string; payee: string; closedDaysAgo: number | null }`; `type Bar = { kind: "none" } | { kind: "message"; text: string } | { kind: "result" } | { kind: "selection"; summary: string; action: "claim" | "sign-in"; label: string } | { kind: "owe"; summary: string } | { kind: "idle"; note: string | null; stepper: { max: number; action: "random" | "next" } | null; lastN: number | null; hint: string | null; signIn: boolean }`; `claimBar(i: BarInput): Bar`; `limitText(a: Allowance): string`; `stepLabel(action: "random" | "next", count: number): string`; `lastLabel(n: number): string`.
  - Rules pinned here: signed out with nothing selected, the idle bar carries `signIn: true` (a "Sign in to claim" button; on straight fill the only way in); a host whose allowance is 0 (a break under 10 lines) gets an idle bar with no stepper and no hint.

- [ ] **Step 1: Write the failing tests**

`src/components/break/selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import {
  cellNote, loginHref, onboardingHref, outcomeText, parsePick, reconcileSelection, selectionAnnouncement, selectionSummary, takenAnnouncement, toggleSelection,
} from "./selection";

const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, ...o });
const board = (n: number, taken: Record<number, Partial<GridCell>> = {}) => Array.from({ length: n }, (_, i) => cell(i + 1, taken[i + 1]));

describe("parsePick and reconcileSelection", () => {
  it("keeps only real, open, de-duplicated lines from ?pick= (Review Focus 3)", () => {
    const picked = parsePick("7,abc,4,7,0,99,12", 50);
    expect(picked).toEqual([4, 7, 12]);
    const cells = board(50, { 4: { state: "taken" } });
    expect(reconcileSelection(picked, cells)).toEqual({ kept: [7, 12], dropped: [4] });
  });
  it("accepts repeated params and nothing", () => {
    expect(parsePick(["3", "5"], 10)).toEqual([3, 5]);
    expect(parsePick(undefined, 10)).toEqual([]);
    expect(parsePick("1e2, 2 ,-3", 10)).toEqual([2]);
  });
  it("announces lines others took, and drops my own optimistic lines silently (Review Focus 2)", () => {
    const cells = board(20, { 7: { state: "taken" }, 12: { state: "taken", mine: true } });
    expect(reconcileSelection([7, 12], cells)).toEqual({ kept: [], dropped: [7] });
    expect(reconcileSelection([3, 99], cells)).toEqual({ kept: [3], dropped: [] });
  });
});

describe("toggleSelection", () => {
  it("adds, removes and stops at the allowance", () => {
    expect(toggleSelection([3], 1, 5)).toEqual({ next: [1, 3], blocked: false });
    expect(toggleSelection([1, 3], 3, 5)).toEqual({ next: [1], blocked: false });
    expect(toggleSelection([1, 3], 4, 2)).toEqual({ next: [1, 3], blocked: true });
    expect(toggleSelection([1, 3], 3, 2)).toEqual({ next: [1], blocked: false });
  });
});

describe("copy", () => {
  it("names the lines in the bar, then truncates past three", () => {
    expect(selectionSummary([7], 500)).toBe("Line 7, $5");
    expect(selectionSummary([7, 12], 500)).toBe("Lines 7, 12, $10");
    expect(selectionSummary([7, 12, 31], 500)).toBe("Lines 7, 12, 31, $15");
    expect(selectionSummary([7, 12, 31, 40, 44], 500)).toBe("Lines 7, 12, 31 +2, $25");
  });
  it("announces selections, taken lines and outcomes", () => {
    expect(selectionAnnouncement(3, 500)).toBe("3 lines selected, $15");
    expect(selectionAnnouncement(1, 550)).toBe("1 line selected, $5.50");
    expect(selectionAnnouncement(0, 500)).toBe("No lines selected");
    expect(takenAnnouncement([7])).toBe("Line 7 was just taken.");
    expect(takenAnnouncement([4, 7])).toBe("Lines 4 and 7 were just taken.");
    expect(outcomeText([4, 11], [7])).toBe("You have lines 4 and 11. Line 7 was just taken.");
    expect(outcomeText([4], [])).toBe("You have line 4.");
    expect(outcomeText([], [7, 9])).toBe("Lines 7 and 9 were just taken.");
  });
  it("explains a tapped taken cell without leaking a handle the server withheld", () => {
    expect(cellNote(cell(7, { state: "paid", holder: "mike" }))).toBe("Line 7: @mike, paid");
    expect(cellNote(cell(7, { state: "taken" }))).toBe("Line 7: taken");
    expect(cellNote(cell(9, { state: "sent", mine: true, holder: "me" }))).toBe("Line 9: yours, sent");
  });
  it("keeps the selection through sign-in and onboarding", () => {
    expect(loginHref("b1", [4, 7])).toBe("/login?next=%2Fb%2Fb1%3Fpick%3D4%2C7");
    expect(loginHref("b1", [])).toBe("/login?next=%2Fb%2Fb1");
    expect(onboardingHref("b1", [4])).toBe("/onboarding?next=%2Fb%2Fb1%3Fpick%3D4");
  });
});
```

`src/components/break/claim-bar-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { claimBar, lastLabel, limitText, stepLabel, type BarInput } from "./claim-bar-state";

const base: BarInput = {
  status: "open", signedIn: true, claimMode: "pick_or_random", selected: [], priceCents: 500, openCount: 19,
  allowance: { remaining: 5, reason: "per_person", limit: 5 }, owe: null, justSent: false,
  hostName: "Jim", payee: "@Jim-Roberts-36", closedDaysAgo: null,
};

describe("claimBar (design §5.4 table)", () => {
  it("signed out with a selection: sign in to claim", () => {
    expect(claimBar({ ...base, signedIn: false, selected: [7, 12] })).toEqual({ kind: "selection", summary: "Lines 7, 12, $10", action: "sign-in", label: "Sign in to claim 2 lines" });
  });
  it("signed in with a selection: claim", () => {
    expect(claimBar({ ...base, selected: [7] })).toEqual({ kind: "selection", summary: "Line 7, $5", action: "claim", label: "Claim 1 line" });
  });
  it("nothing selected: pick for me, bounded by open lines and the allowance", () => {
    expect(claimBar(base)).toEqual({ kind: "idle", note: null, stepper: { max: 5, action: "random" }, lastN: null, hint: null, signIn: false });
    expect(claimBar({ ...base, openCount: 2 })).toMatchObject({ stepper: { max: 2 }, lastN: 2 });
  });
  it("take the last N only when 5 or fewer are open and the allowance covers them", () => {
    expect(claimBar({ ...base, openCount: 3 })).toMatchObject({ lastN: 3 });
    expect(claimBar({ ...base, openCount: 3, allowance: { remaining: 2, reason: "per_person", limit: 5 } })).toMatchObject({ lastN: null, stepper: { max: 2 } });
  });
  it("owes for unsent lines", () => {
    expect(claimBar({ ...base, owe: { cents: 1000, numbers: [4, 11] } })).toEqual({ kind: "owe", summary: "You owe $10 to @Jim-Roberts-36" });
    expect(claimBar({ ...base, owe: { cents: 1000, numbers: [4, 11] }, selected: [7] })).toMatchObject({ kind: "selection" });
  });
  it("just sent: the note shows and the claim controls return", () => {
    expect(claimBar({ ...base, justSent: true })).toMatchObject({ kind: "idle", note: "Sent. Jim will tick you off when it arrives.", stepper: { max: 5 }, signIn: false });
  });
  it("limit reached: says which cap", () => {
    expect(claimBar({ ...base, allowance: { remaining: 0, reason: "per_person", limit: 5 } })).toMatchObject({ kind: "idle", stepper: null, hint: "You can hold 5 lines in this break." });
    expect(claimBar({ ...base, allowance: { remaining: 0, reason: "host", limit: 1 } })).toMatchObject({ kind: "idle", stepper: null, hint: "Hosts can hold 1 line in their own break." });
  });
  it("a host of a break under 10 lines may hold none: no stepper and no hint, rather than \"0 lines\"", () => {
    expect(claimBar({ ...base, openCount: 3, allowance: { remaining: 0, reason: "host", limit: 0 } })).toEqual({ kind: "idle", note: null, stepper: null, lastN: null, hint: null, signIn: false });
  });
  it("pick only: no randoms; straight fill: say how many", () => {
    expect(claimBar({ ...base, claimMode: "pick_only" })).toMatchObject({ stepper: null, hint: "Tap the open lines you want." });
    expect(claimBar({ ...base, claimMode: "straight" })).toEqual({ kind: "idle", note: null, stepper: { max: 5, action: "next" }, lastN: null, hint: "Straight fill. Say how many; you get the next open numbers.", signIn: false });
  });
  it("signed out with nothing selected: a hint and a way to sign in (the only way in on straight fill)", () => {
    expect(claimBar({ ...base, signedIn: false })).toEqual({ kind: "idle", note: null, stepper: null, lastN: null, hint: "Tap the open lines you want.", signIn: true });
    expect(claimBar({ ...base, signedIn: false, claimMode: "straight" })).toMatchObject({ hint: "Straight fill. Sign in, then say how many.", signIn: true });
  });
  it("closed, running draw, ran, cancelled, draft", () => {
    expect(claimBar({ ...base, status: "filled" })).toEqual({ kind: "message", text: "Closed. Every line is paid. Waiting for Jim to run the draw." });
    expect(claimBar({ ...base, status: "filled", closedDaysAgo: 3 })).toEqual({ kind: "message", text: "Closed 3 days ago, not drawn yet." });
    expect(claimBar({ ...base, status: "drawing" })).toEqual({ kind: "message", text: "Jim started the draw. The result is in about a minute." });
    expect(claimBar({ ...base, status: "drawn" })).toEqual({ kind: "result" });
    expect(claimBar({ ...base, status: "cancelled" })).toEqual({ kind: "message", text: "Cancelled by Jim. Your refund comes from Jim, not Breaks." });
    expect(claimBar({ ...base, status: "draft" })).toEqual({ kind: "none" });
  });
  it("labels", () => {
    expect(limitText({ remaining: 0, reason: "global", limit: 30 })).toBe("You can have 30 unpaid lines across breaks. Pay for some first.");
    expect(limitText({ remaining: 0, reason: "host", limit: 1 })).toBe("Hosts can hold 1 line in their own break.");
    expect([stepLabel("random", 1), stepLabel("random", 3), stepLabel("next", 1), stepLabel("next", 4)]).toEqual(["Claim 1 random", "Claim 3 random", "Claim the next line", "Claim the next 4"]);
    expect([lastLabel(1), lastLabel(3)]).toEqual(["Take the last line", "Take the last 3"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/break`
Expected: FAIL with `Failed to resolve import "./selection"` and `Failed to resolve import "./claim-bar-state"`.

- [ ] **Step 3: Write the two pure modules**

`src/components/break/selection.ts`:

```ts
import type { GridCell } from "@/domain/breaks/grid";
import { formatMoney } from "@/lib/money";
import { joinAnd, plural } from "@/lib/list";
import { cellStateWord } from "@/components/grid/cell-label";

/** `?pick=4,7,11` → sorted, unique, in-range line numbers. Anything else is ignored. */
export function parsePick(raw: string | string[] | undefined, lineCount: number): number[] {
  const s = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const t = part.trim();
    if (!/^\d{1,3}$/.test(t)) continue;
    const n = Number(t);
    if (n >= 1 && n <= lineCount) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** After fresh server props: keep open lines; announce lines someone else took; drop my own optimistic lines quietly. */
export function reconcileSelection(selected: readonly number[], cells: readonly GridCell[]): { kept: number[]; dropped: number[] } {
  const byNumber = new Map(cells.map((c) => [c.number, c]));
  const kept: number[] = [];
  const dropped: number[] = [];
  for (const n of selected) {
    const c = byNumber.get(n);
    if (c && c.state === "open" && !c.bonus) kept.push(n);
    else if (c && !c.mine) dropped.push(n);
  }
  return { kept, dropped };
}

export function toggleSelection(selected: readonly number[], n: number, remaining: number): { next: number[]; blocked: boolean } {
  if (selected.includes(n)) return { next: selected.filter((x) => x !== n), blocked: false };
  if (selected.length >= remaining) return { next: [...selected], blocked: true };
  return { next: [...selected, n].sort((a, b) => a - b), blocked: false };
}

/** "Lines 7, 12, 31, $15"; past three: "Lines 7, 12, 31 +2, $25". */
export function selectionSummary(numbers: readonly number[], priceCents: number, maxShown = 3): string {
  const total = formatMoney(numbers.length * priceCents);
  if (numbers.length === 1) return `Line ${numbers[0]}, ${total}`;
  const more = numbers.length > maxShown ? ` +${numbers.length - maxShown}` : "";
  return `Lines ${numbers.slice(0, maxShown).join(", ")}${more}, ${total}`;
}

export function selectionAnnouncement(count: number, priceCents: number): string {
  if (count === 0) return "No lines selected";
  return `${count} ${plural(count, "line", "lines")} selected, ${formatMoney(count * priceCents)}`;
}

export function takenAnnouncement(numbers: readonly number[]): string {
  return numbers.length === 1 ? `Line ${numbers[0]} was just taken.` : `Lines ${joinAnd(numbers)} were just taken.`;
}

/** Partial success is normal: "You have lines 4 and 11. Line 7 was just taken." */
export function outcomeText(got: readonly number[], taken: readonly number[]): string {
  const have = got.length === 0 ? "" : got.length === 1 ? `You have line ${got[0]}.` : `You have lines ${joinAnd(got)}.`;
  const lost = taken.length === 0 ? "" : takenAnnouncement(taken);
  return [have, lost].filter(Boolean).join(" ");
}

/** The popover text shown when a taken cell is tapped (also announced in the live region). The handle appears only if the server sent it. */
export function cellNote(c: GridCell): string {
  if (!c.mine && c.holder) return `Line ${c.number}: @${c.holder}, ${cellStateWord(c)}`;
  return `Line ${c.number}: ${cellStateWord(c)}`;
}

const breakPath = (breakId: string, pick: readonly number[]) => (pick.length ? `/b/${breakId}?pick=${pick.join(",")}` : `/b/${breakId}`);
export const loginHref = (breakId: string, pick: readonly number[]) => `/login?next=${encodeURIComponent(breakPath(breakId, pick))}`;
export const onboardingHref = (breakId: string, pick: readonly number[]) => `/onboarding?next=${encodeURIComponent(breakPath(breakId, pick))}`;
```

`src/components/break/claim-bar-state.ts`:

```ts
import type { Allowance } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { BreakStatus } from "@/components/status-word";
import { formatMoney } from "@/lib/money";
import { plural } from "@/lib/list";
import { selectionSummary } from "./selection";

export type BarInput = {
  status: BreakStatus;
  signedIn: boolean;
  claimMode: ClaimMode;
  selected: readonly number[];
  priceCents: number;
  openCount: number;
  allowance: Allowance;
  /** Unpaid lines not yet marked sent. */
  owe: { cents: number; numbers: readonly number[] } | null;
  justSent: boolean;
  hostName: string;
  payee: string;
  closedDaysAgo: number | null;
};

export type Bar =
  | { kind: "none" }
  | { kind: "message"; text: string }
  | { kind: "result" }
  | { kind: "selection"; summary: string; action: "claim" | "sign-in"; label: string }
  | { kind: "owe"; summary: string }
  | { kind: "idle"; note: string | null; stepper: { max: number; action: "random" | "next" } | null; lastN: number | null; hint: string | null; signIn: boolean };

export function limitText(a: Allowance): string {
  const lines = `${a.limit} ${plural(a.limit, "line", "lines")}`;
  switch (a.reason) {
    case "per_person": return `You can hold ${lines} in this break.`;
    case "host": return `Hosts can hold ${lines} in their own break.`;
    case "global": return `You can have ${a.limit} unpaid lines across breaks. Pay for some first.`;
  }
}

export const stepLabel = (action: "random" | "next", count: number) =>
  action === "next" ? (count === 1 ? "Claim the next line" : `Claim the next ${count}`) : `Claim ${count} random`;
export const lastLabel = (n: number) => (n === 1 ? "Take the last line" : `Take the last ${n}`);

/** The sticky bar has one job at a time (design §5.4). */
export function claimBar(i: BarInput): Bar {
  switch (i.status) {
    case "draft": return { kind: "none" };
    case "filled":
      return { kind: "message", text: i.closedDaysAgo !== null && i.closedDaysAgo >= 3 ? `Closed ${i.closedDaysAgo} days ago, not drawn yet.` : `Closed. Every line is paid. Waiting for ${i.hostName} to run the draw.` };
    case "drawing": return { kind: "message", text: `${i.hostName} started the draw. The result is in about a minute.` };
    case "drawn": return { kind: "result" };
    case "cancelled": return { kind: "message", text: `Cancelled by ${i.hostName}. Your refund comes from ${i.hostName}, not Breaks.` };
    case "open": break;
  }
  const n = i.selected.length;
  if (n > 0) {
    const lines = `${n} ${plural(n, "line", "lines")}`;
    return { kind: "selection", summary: selectionSummary(i.selected, i.priceCents), action: i.signedIn ? "claim" : "sign-in", label: i.signedIn ? `Claim ${lines}` : `Sign in to claim ${lines}` };
  }
  if (i.owe && i.owe.numbers.length > 0) return { kind: "owe", summary: `You owe ${formatMoney(i.owe.cents)} to ${i.payee}` };
  const note = i.justSent ? `Sent. ${i.hostName} will tick you off when it arrives.` : null;
  if (!i.signedIn) {
    // Signed out with nothing selected still gets a way in: on straight fill it is the only one.
    return { kind: "idle", note, stepper: null, lastN: null, hint: i.claimMode === "straight" ? "Straight fill. Sign in, then say how many." : "Tap the open lines you want.", signIn: true };
  }
  // Hosts cannot claim in a break under 10 lines (10% rounds down to 0): say nothing rather than "0 lines".
  if (i.allowance.reason === "host" && i.allowance.limit === 0) return { kind: "idle", note, stepper: null, lastN: null, hint: null, signIn: false };
  const max = Math.min(i.openCount, i.allowance.remaining);
  const limit = i.allowance.remaining === 0 ? limitText(i.allowance) : null;
  if (i.claimMode === "straight") {
    return { kind: "idle", note, stepper: max > 0 ? { max, action: "next" } : null, lastN: null, hint: limit ?? "Straight fill. Say how many; you get the next open numbers.", signIn: false };
  }
  const lastN = i.openCount > 0 && i.openCount <= 5 && i.allowance.remaining >= i.openCount ? i.openCount : null;
  const stepper = i.claimMode === "pick_or_random" && max > 0 ? { max, action: "random" as const } : null;
  return { kind: "idle", note, stepper, lastN, hint: limit ?? (i.claimMode === "pick_only" ? "Tap the open lines you want." : null), signIn: false };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/components/break`
Expected: PASS (Review Focus 2 and 3 included).

- [ ] **Step 5: Run every gate**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: green. Nothing imports the new modules yet, so the app and the journey are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/break/selection.ts src/components/break/selection.test.ts src/components/break/claim-bar-state.ts src/components/break/claim-bar-state.test.ts
git commit -m "feat(break-page): selection and claim-bar state as tested pure modules"
```

---

### Task 11b: BreakInteractive — the island, the claim bar, pick-for-me, recovery, auto-refresh (model: opus)

The one client island on the break page, built on the Task 11a modules. It owns selection (client-only), applies `useOptimistic` over the server's cells (never a copied `lines` state), commits a claim immediately, recovers when a selected line is taken by someone else, refreshes itself every 20 s while visible (open, closed and running-draw breaks) and on returning to the tab, and drives the sticky bar through `claimBar`. A signed-out selection survives sign-in in `?pick=`. Tapping a taken cell opens a small popover under it ("Line 7: @mike, paid") and says the same in the polite live region. The old `ClaimPanel` is deleted; until Task 12 adds the pay sheet, the claim outcome shows in a banner and "I've sent it" sits in the bar.

Layout, to the design's 390 × 664 pixel budget: the small line ("Pay within 24 hours. Hosted by …") and the Grid | List toggle share one row; "See the result" moves from the page flow into the bar (`bar-result`); the idle bar stays one row (the "Pick for me" label is a micro label stacked above the stepper), and when it grows anyway its measured height drives the page's padding (`--bar-total`, Task 8). This task adds `e2e/layout.spec.ts`, which pins these claims in a real browser.

Deferred: "Refund received" on Cancelled (no cancel command yet; the bar shows the Cancelled message only).

**This task updates `e2e/journey-1.spec.ts`** (buyers now claim through the grid and the bar: `mark-sent` becomes `bar-sent`; the host reaches the result through `bar-result`) **and creates `e2e/layout.spec.ts`.**

**Files:**
- Create: `src/components/break/use-auto-refresh.ts`, `src/components/break/claim-bar.tsx`, `src/components/break/line-list.tsx`, `src/components/break/break-interactive.tsx`, `e2e/layout.spec.ts`
- Modify: `src/app/b/[id]/page.tsx` (whole file), `e2e/journey-1.spec.ts` (whole file)
- Delete: `src/app/b/[id]/claim-panel.tsx`

**Interfaces:**
- Consumes: from Task 11a `parsePick`, `reconcileSelection`, `toggleSelection`, `selectionAnnouncement`, `takenAnnouncement`, `outcomeText`, `cellNote`, `loginHref`, `onboardingHref`, `claimBar`, `limitText`, `stepLabel`, `lastLabel`, `type Bar`; `GridCell`, `GridCounts`, `Allowance` (types), `ClaimMode`, `BreakStatus`, `ActionResult`; server actions `claim`, `claimRandomAction`, `claimNextAction`, `claimRest`, `sent`; `Grid`, `nextFocusIndex`, `SegmentedControl`, `Stepper`, `StickyBar`, `Button`, `ButtonLink`, `Banner`, `clampStep`, `cellStateWord`; `shapeGrid`, `canViewBreak`, `isHostView`, `formatDeadline`, `daysSince`, `viewerZone`, `pageShare`, `payWithinText`, `trustText`.
- Produces:
  - `useAutoRefresh(enabled: boolean, everyMs?: number): void` (enabled for `open`, `filled` and `drawing`).
  - `<ClaimBar bar pending count onCount onClaim signInHref onStep onLast onSent onOweTap? resultHref />` (renders nothing for `none` and for an idle bar with nothing to show).
  - `<LineList cells title shareUrl />`.
  - `type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null }`; `type BreakInteractiveProps = { breakId; status; claimMode; priceCents; lineCount; title; shareUrl; smallLine: string; cells; counts; signedIn; allowance; owe: Owe | null; hostName; payee; closedDaysAgo; initialPick; children? }`; `<BreakInteractive …props>{children}</BreakInteractive>`.
  - Ids: `cell-<n>`, `claim-submit`, `claim-signin`, `claim-step`, `claim-rest`, `owed`, `bar-summary`, `bar-sent`, `sent-note`, `bar-hint`, `bar-message`, `bar-result`, `bar-note`, `cell-note`, `claim-outcome` (Task 12 replaces `claim-outcome` with the pay sheet; no test uses it). The page no longer renders `see-result`.
  - `e2e/layout.spec.ts`: a 50-line open break created once in `beforeAll` through `/test/login` and the composer (as journey-1 does); checks the pixel budget at 390 × 664 and 360 × 640, the column count at 390, 360, 320 and 1024 wide, and that an anonymous viewer's cell names carry no handle. Tasks 12, 13b and 16 extend it.

- [ ] **Step 1: Write the failing layout spec**

`e2e/layout.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

// The design's layout and accessibility claims, checked in a real browser (no jsdom). One 50-line open break
// serves the whole file; it is created through the composer exactly as journey-1 creates its break.
test.describe.configure({ mode: "serial" });

const run = Date.now();
const hostEmail = `lh${run}@e2e.test`;
const buyerHandle = `lb${run}`; // /test/login derives the handle from the email's local part
let url = "";

async function signedIn(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

async function anonymous(browser: Browser, width: number, height: number): Promise<Page> {
  const mobile = width < 640;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  return ctx.newPage();
}

test.beforeAll(async ({ browser }) => {
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto("/host/new");
  await host.fill("input[name=title]", "Layout fifty");
  await host.fill("textarea[name=items]", "Chronos 22g");
  await host.fill("input[name=lineCount]", "50");
  await host.fill("input[name=linePrice]", "5");
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  url = host.url();
  // A buyer claims two lines, so the grid has taken cells whose holder the server must withhold from strangers.
  const buyer = await signedIn(browser, `${buyerHandle}@e2e.test`);
  await buyer.goto(url);
  await buyer.getByTestId("cell-3").click();
  await buyer.getByTestId("cell-9").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("owed")).toBeVisible();
});

test("the whole 50-line grid and the legend sit above the claim bar at 390 × 664 (D§5.4)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  const bar = await page.locator("[data-sticky-bar]").boundingBox();
  expect(legend).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(legend!.y + legend!.height).toBeLessThanOrEqual(bar!.y);
});

test("at 360 × 640 the legend sits at the fold (D§5.4)", async ({ browser }) => {
  const page = await anonymous(browser, 360, 640);
  await page.goto(url);
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  expect(legend).not.toBeNull();
  expect(legend!.y).toBeLessThanOrEqual(640);
});

for (const [width, cols] of [[390, 8], [360, 7], [320, 6], [1024, 10]] as const) {
  test(`shows ${cols} grid columns at ${width} wide (D§4)`, async ({ browser }) => {
    const page = await anonymous(browser, width, 800);
    await page.goto(url);
    const n = await page.locator("[data-grid-rows]").first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    expect(n).toBe(cols);
  });
}

test("an anonymous viewer's cell names never carry a handle (D§4)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  const names = await page.locator("button[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(50);
  expect(names.filter((n) => n.includes(buyerHandle) || n.includes("@"))).toEqual([]);
  expect(names[2]).toBe("Line 3, taken");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test:e2e e2e/layout.spec.ts`
Expected: FAIL. `beforeAll` passes (the old claim panel still has `cell-<n>`, `claim-submit` and `owed`). The pixel-budget test fails because `[data-sticky-bar]` does not exist yet (`boundingBox()` returns null), and the name test fails with `expected [] to have a length of 50` (the Task 10 grid is read-only, so it has no `button[data-cell]`). The four column tests and the 360×640 legend test already pass against the Task 10 frame.

- [ ] **Step 3: Write the hook, the bar, the list and the island**

`src/components/break/use-auto-refresh.ts`:

```ts
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh server props every `everyMs` while the tab is visible, and at once on returning to it (design §4). */
export function useAutoRefresh(enabled: boolean, everyMs = 20_000): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const start = () => { stop(); timer = window.setInterval(() => router.refresh(), everyMs); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { router.refresh(); start(); } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [enabled, everyMs, router]);
}
```

`src/components/break/claim-bar.tsx`:

```tsx
"use client";
import { Button, ButtonLink } from "@/components/button";
import { Stepper } from "@/components/stepper";
import { StickyBar } from "@/components/sticky-bar";
import { lastLabel, stepLabel, type Bar } from "./claim-bar-state";

type Props = {
  bar: Bar;
  pending: boolean;
  count: number;
  onCount: (n: number) => void;
  onClaim: () => void;
  /** Sign-in link carrying the selection in ?pick= (also used by the idle bar's "Sign in to claim"). */
  signInHref: string;
  onStep: () => void;
  onLast: () => void;
  onSent: () => void;
  /** When set, the owed amount is a button that reopens the pay sheet. */
  onOweTap?: () => void;
  resultHref: string;
};

/** An idle bar with nothing to say (a host who may not claim) is not rendered at all. */
const emptyIdle = (b: Bar) => b.kind === "idle" && !b.note && !b.hint && !b.stepper && b.lastN === null && !b.signIn;

export function ClaimBar({ bar, pending, count, onCount, onClaim, signInHref, onStep, onLast, onSent, onOweTap, resultHref }: Props) {
  if (bar.kind === "none" || emptyIdle(bar)) return null;
  return (
    <StickyBar id="claim-bar">
      {bar.kind === "message" && <p className="flex-1 py-2 text-small" data-testid="bar-message">{bar.text}</p>}
      {bar.kind === "result" && <ButtonLink href={resultHref} full data-testid="bar-result">See the result</ButtonLink>}
      {bar.kind === "selection" && (
        <>
          <p className="min-w-0 flex-1 truncate font-condensed text-[18px] leading-6 font-semibold tabular" data-testid="bar-summary">{bar.summary}</p>
          {bar.action === "claim"
            ? <Button onClick={onClaim} disabled={pending} data-testid="claim-submit">{bar.label}</Button>
            : <ButtonLink href={signInHref} data-testid="claim-signin">{bar.label}</ButtonLink>}
        </>
      )}
      {bar.kind === "owe" && (
        <>
          {onOweTap
            ? <button type="button" onClick={onOweTap} data-testid="owed" className="min-h-11 min-w-0 flex-1 text-left text-small font-semibold underline underline-offset-4">{bar.summary}</button>
            : <p data-testid="owed" className="min-w-0 flex-1 text-small font-semibold">{bar.summary}</p>}
          <Button onClick={onSent} disabled={pending} data-testid="bar-sent">I&apos;ve sent it</Button>
        </>
      )}
      {bar.kind === "idle" && (
        <div className="flex w-full flex-col gap-2 py-1">
          {(bar.note || bar.hint || bar.signIn) && (
            <div className="flex items-center gap-3">
              {(bar.note ?? bar.hint) && <p className="min-w-0 flex-1 text-small" data-testid={bar.note ? "sent-note" : "bar-hint"}>{bar.note ?? bar.hint}</p>}
              {bar.signIn && <ButtonLink href={signInHref} data-testid="claim-signin">Sign in to claim</ButtonLink>}
            </div>
          )}
          {/* With 5 or fewer open, "Take the last N" leads and the stepper drops to a second row; otherwise one row. */}
          {bar.lastN !== null && <Button onClick={onLast} disabled={pending} data-testid="claim-rest">{lastLabel(bar.lastN)}</Button>}
          {bar.stepper && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col">
                <span className="text-micro font-medium text-ink-2">{bar.stepper.action === "next" ? "How many" : "Pick for me"}</span>
                <Stepper label="Number of lines" value={count} min={1} max={bar.stepper.max} onChange={onCount} />
              </div>
              <Button variant="secondary" onClick={onStep} disabled={pending} data-testid="claim-step">{stepLabel(bar.stepper.action, count)}</Button>
            </div>
          )}
        </div>
      )}
    </StickyBar>
  );
}
```

`src/components/break/line-list.tsx`:

```tsx
import type { GridCell } from "@/domain/breaks/grid";
import { cellStateWord } from "@/components/grid/cell-label";

/** The screenshot surface: title and link on top, one row per line; holders only where the server sent them. */
export function LineList({ cells, title, shareUrl }: { cells: GridCell[]; title: string; shareUrl: string }) {
  return (
    <div className="rounded-card border border-wire bg-card p-4">
      <p className="font-condensed text-headline font-semibold">{title}</p>
      <p className="break-all text-small text-ink-2">{shareUrl}</p>
      <ol aria-label="Lines" className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {cells.map((c) => (
          <li key={c.number} className="flex min-h-6 items-center gap-3 border-b border-wire-2 text-small">
            <span className="w-8 font-condensed text-grid font-semibold tabular">{c.number}</span>
            <span className="min-w-0 flex-1 truncate">{c.holder ? `@${c.holder}` : ""}</span>
            <span className="text-ink-2">{cellStateWord(c)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

`src/components/break/break-interactive.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest, sent } from "@/app/b/[id]/actions";
import { Grid } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { SegmentedControl } from "@/components/segmented-control";
import { Banner } from "@/components/banner";
import { clampStep } from "@/components/stepper-math";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import { claimBar, limitText } from "./claim-bar-state";
import { cellNote, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
import { useAutoRefresh } from "./use-auto-refresh";

/** What the viewer owes for unsent lines. The deadline travels as ISO plus the server's fallback text (LocalTime). */
export type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null };

export type BreakInteractiveProps = {
  breakId: string;
  status: BreakStatus;
  claimMode: ClaimMode;
  priceCents: number;
  lineCount: number;
  title: string;
  shareUrl: string;
  /** "Pay within 24 hours. Hosted by @jim, new host." It shares one row with the Grid | List toggle (pixel budget). */
  smallLine: string;
  cells: GridCell[];
  counts: GridCounts;
  signedIn: boolean;
  allowance: Allowance;
  owe: Owe | null;
  hostName: string;
  payee: string;
  closedDaysAgo: number | null;
  initialPick: number[];
  children?: React.ReactNode;
};

type ClaimData = { got: number[]; taken?: number[] };
type TapNote = { text: string; top: number; left: number };

export function BreakInteractive(p: BreakInteractiveProps) {
  const router = useRouter();
  // Server props are the truth; the optimistic layer only marks lines being claimed right now.
  const [cells, markClaimed] = useOptimistic(p.cells, (cur: GridCell[], numbers: number[]) =>
    cur.map((c) => (numbers.includes(c.number) && c.state === "open" ? { ...c, state: "taken" as const, mine: true } : c)));
  const [selected, setSelected] = useState<number[]>(() => reconcileSelection(p.initialPick, p.cells).kept);
  const [struck, setStruck] = useState<number[]>([]);
  const [announce, setAnnounce] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [tapNote, setTapNote] = useState<TapNote | null>(null);
  const [outcome, setOutcome] = useState<{ got: number[]; taken: number[] } | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [count, setCount] = useState(1);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const gridWrap = useRef<HTMLDivElement>(null);

  // Open: claims move. Closed: the host may start the draw. Running draw: the result lands. Keep all three fresh.
  useAutoRefresh(p.status === "open" || p.status === "filled" || p.status === "drawing");

  // When fresh props show a selected line taken by someone else: strike it, drop it, say so.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastCells = useRef(p.cells);
  useEffect(() => {
    if (lastCells.current === p.cells) return;
    lastCells.current = p.cells;
    const { kept, dropped } = reconcileSelection(selectedRef.current, p.cells);
    if (kept.length !== selectedRef.current.length) setSelected(kept);
    if (dropped.length > 0) {
      setStruck(dropped);
      setAnnounce(takenAnnouncement(dropped));
    }
  }, [p.cells]);

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
  const stepMax = bar.kind === "idle" && bar.stepper ? bar.stepper.max : 1;
  const stepCount = clampStep(count, 1, stepMax);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const struckSet = useMemo(() => new Set(struck), [struck]);
  const canPick = p.status === "open" && p.claimMode !== "straight";

  /** "Line 7: @mike, paid" in a small popover under the tapped cell, and in the polite live region. */
  const showCellNote = (c: GridCell) => {
    const text = cellNote(c);
    setAnnounce(text);
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
    if (c.state !== "open") { showCellNote(c); return; }
    if (!canPick) return;
    setTapNote(null);
    const r = toggleSelection(selected, n, p.allowance.remaining);
    if (r.blocked) {
      const text = limitText(p.allowance);
      setNote(text);
      setAnnounce(text);
      return;
    }
    setNote(null);
    setStruck([]);
    setOutcome(null);
    setSelected(r.next);
    setAnnounce(selectionAnnouncement(r.next.length, p.priceCents));
  };

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setBatchId(crypto.randomUUID());
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setOutcome({ got: r.data.got, taken });
      setAnnounce(outcomeText(r.data.got, taken));
      return;
    }
    if (r.code === "NOT_SIGNED_IN") { router.push(loginHref(p.breakId, requested)); return; }
    if (r.code === "NOT_ONBOARDED") { router.push(onboardingHref(p.breakId, requested)); return; }
    const taken = r.details?.taken ?? [];
    if (taken.length > 0) {
      setSelected((cur) => cur.filter((n) => !taken.includes(n)));
      setStruck(taken);
    }
    setNote(r.message);
    setAnnounce(r.message);
  };

  const runClaim = (optimistic: number[], call: () => Promise<ActionResult<ClaimData>>) => {
    startTransition(async () => {
      if (optimistic.length > 0) markClaimed(optimistic);
      finish(await call(), optimistic);
    });
  };

  const onClaim = () => { const numbers = selected; runClaim(numbers, () => claim(p.breakId, numbers, batchId)); };
  const onStep = () => {
    if (bar.kind !== "idle" || !bar.stepper) return;
    const action = bar.stepper.action;
    const n = stepCount;
    runClaim([], () => (action === "next" ? claimNextAction(p.breakId, n, batchId) : claimRandomAction(p.breakId, n, batchId)));
  };
  const onLast = () => {
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    runClaim(open, () => claimRest(p.breakId, batchId));
  };
  const onSent = () => {
    if (!p.owe) return;
    const numbers = p.owe.numbers;
    startTransition(async () => {
      const r = await sent(p.breakId, numbers);
      if (r.ok) {
        setJustSent(true);
        setOutcome(null);
        setAnnounce(`Sent. ${p.hostName} will tick you off when it arrives.`);
      } else {
        setNote(r.message);
        setAnnounce(r.message);
      }
    });
  };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-cell]"));
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (index < 0) return;
    const rows = e.currentTarget.querySelector<HTMLElement>("[data-grid-rows]");
    const cols = rows ? getComputedStyle(rows).gridTemplateColumns.split(" ").filter(Boolean).length : 1;
    const next = nextFocusIndex(index, e.key, cols, buttons.length);
    if (next === null) return;
    e.preventDefault();
    buttons.forEach((b, i) => { b.tabIndex = i === next ? 0 : -1; });
    buttons[next].focus();
  };

  return (
    <>
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-2">{p.smallLine}</p>
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      <a href="#claim-bar" className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus:text-small focus:underline">Skip to claim bar</a>
      {outcome && <div className="mt-3" data-testid="claim-outcome"><Banner tone="success">{outcomeText(outcome.got, outcome.taken)}</Banner></div>}
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
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {p.children}
      <ClaimBar
        bar={bar}
        pending={pending}
        count={stepCount}
        onCount={setCount}
        onClaim={onClaim}
        signInHref={loginHref(p.breakId, selected)}
        onStep={onStep}
        onLast={onLast}
        onSent={onSent}
        resultHref={`/b/${p.breakId}/result`}
      />
    </>
  );
}
```

- [ ] **Step 4: Mount the island on the page**

Delete `src/app/b/[id]/claim-panel.tsx`. Replace `src/app/b/[id]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { getBreakPage, hostTrust } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getCaller } from "@/auth/session";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatMoney } from "@/lib/money";
import { daysSince, formatDeadline } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { pageShare } from "@/lib/share-text";
import { GridPreview } from "@/components/grid/grid-preview";
import { Legend } from "@/components/legend";
import { StatusPill } from "@/components/status-pill";
import { CopyButton } from "@/components/copy-button";
import { buttonClass } from "@/components/button";
import type { BreakStatus } from "@/components/status-word";
import { DetailsFold } from "@/components/break/details-fold";
import { BreakInteractive } from "@/components/break/break-interactive";
import { onboardingHref, parsePick } from "@/components/break/selection";
import { closesText, leftText, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { HostPanel } from "./host-panel";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page || page.break.status === "draft") return {};
  return { title: page.break.title, description: `${page.break.lineCount} lines at ${formatMoney(page.break.linePriceCents)}.` };
}

export default async function BreakPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const b = page.break;
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(b.status, isHostView(b.hostId, caller))) notFound();
  const { pick } = await searchParams;
  const initialPick = parsePick(pick, b.lineCount);
  if (caller && !caller.onboarded && initialPick.length > 0) redirect(onboardingHref(id, initialPick));
  const now = new Date();
  const zone = await viewerZone();
  const { trust, globalUnpaid } = await db.transaction(async (tx) => ({
    trust: await hostTrust(tx, page.host.id),
    globalUnpaid: caller ? await globalUnpaidCount(tx, caller.id) : 0,
  }));
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const status = b.status as BreakStatus;
  const hostName = page.host.displayName ?? page.host.handle ?? "the host";
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const handles = page.host.paymentHandles;
  const payee = handles.venmo ?? (handles.paypal ? `paypal.me/${handles.paypal}` : hostName);
  const url = `${env().APP_URL}/b/${id}`;
  let top: { line: number; handle: string | null } | null = null;
  if (status === "drawn") {
    const res = await db.transaction((tx) => getDrawResult(tx, id));
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
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
  const ledger = grid.hostView ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];

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
        smallLine={`${payWithinText(b.paymentWindowHours)} Hosted by ${hostRef}, ${trustText(trust)}.`}
        cells={grid.cells}
        counts={grid.counts}
        signedIn={!!caller}
        allowance={grid.allowance}
        owe={owe}
        hostName={hostName}
        payee={payee}
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
          {grid.hostView && <a href="#host-tools" className={buttonClass("secondary")}>Host tools</a>}
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
        {grid.hostView && (
          <section id="host-tools" className="mt-6 space-y-2">
            <h2 className="text-headline font-semibold">Host tools</h2>
            <p className="text-small tabular" data-testid="paid-count">{grid.counts.paid} of {b.lineCount} paid</p>
            <HostPanel breakId={id} status={b.status} rows={ledger.map((u) => ({ ownerId: u.ownerId, handle: u.handle, unpaid: u.unpaid, sent: u.sent, overdue: u.overdue, owedCents: u.owedCents, status: u.status }))} />
          </section>
        )}
      </BreakInteractive>
    </main>
  );
}
```

- [ ] **Step 5: Move the buyers in the journey to the grid and the bar (updates `e2e/journey-1.spec.ts`)**

Replace `e2e/journey-1.spec.ts` with:

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
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await expect(alice.getByTestId("bar-summary")).toHaveText("Lines 1, 2, $10");
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("owed")).toContainText("$10");
  await alice.getByTestId("bar-sent").click();
  await expect(alice.getByTestId("sent-note")).toBeVisible();

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.getByTestId("claim-rest").click();
  await expect(bob.getByTestId("owed")).toContainText("$5");

  await host.reload(); // pick up claims made in the other contexts
  await expect(host.locator("[data-testid=ledger-row][data-status=sent]")).toHaveCount(1);
  const paid = host.getByTestId("ledger-paid");
  await expect(paid).toHaveCount(2); // one per buyer
  await paid.first().click();
  await expect(paid).toHaveCount(1);
  await paid.first().click();
  await expect(paid).toHaveCount(0);
  await expect(host.getByTestId("paid-count")).toContainText("3 of 3 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("bar-result").click(); // "See the result" now lives in the claim bar
  await expect(host.getByTestId("winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
});
```

- [ ] **Step 6: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. With two browsers: select lines 7 and 12 in one; claim 7 in the other; within 20 s the first shows 7 struck, drops it, and a screen reader hears "Line 7 was just taken." Tap a taken cell: a popover under it reads "Line 7: taken" (with the handle only for participants and the host) and closes on the next tap or Escape. Signed out, select 4 and 7, tap "Sign in to claim 2 lines": after sign-in the page returns with 4 and 7 selected. Focus the "Pick for me" input: the bar stays. Arrow keys move focus across the grid; Tab leaves it.

- [ ] **Step 7: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green, including every test in `e2e/layout.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/components/break "src/app/b/[id]" e2e/journey-1.spec.ts e2e/layout.spec.ts
git commit -m "feat(break-page): claim through the grid with a sticky bar, recovery and auto-refresh"
```

---
### Task 12: PaySheet — copy the handle, deep links with a web fallback, I've sent it, pay later, give back (model: sonnet (code given verbatim))

After a claim commits, a bottom sheet opens on the outcome and the pay block: "Send $10 to @Jim-Roberts-36", **Copy handle** first, **Pay with Venmo** / **Pay with PayPal** (Venmo's `venmo://` deep link falls back to the web profile when the in-app browser blocks the scheme), "Leave the note blank.", the draw-lock commitment, **I've sent it** with a one-time hint, the absolute deadline above **I'll pay later** (in the viewer's own time through `LocalTime`), and **Give back these lines** with a confirm. Tapping the owed amount in the bar reopens the sheet. If the claim resolves before the refreshed props arrive, the sheet opens on a provisional amount (earlier unsent lines plus the new ones) rather than an empty "Your lines". Escape or Close returns focus to the bar when the claim button that opened the sheet has gone (Task 8 `Sheet`).

The island is replaced whole rather than patched (about a dozen lines change); the code below is complete and should be copied verbatim.

**This task updates `e2e/journey-1.spec.ts`** (buyers now pay from the sheet: `pay-amount`, `pay-sent`) **and extends `e2e/layout.spec.ts`** (Escape closes the pay sheet and focus lands on the bar).

**Files:**
- Modify: `src/lib/pay-links.ts` (whole file), `src/lib/pay-links.test.ts` (whole file)
- Create: `src/components/break/pay-copy.ts`, `src/components/break/pay-copy.test.ts`, `src/components/break/pay-sheet.tsx`
- Modify: `src/components/break/break-interactive.tsx` (whole file), `src/app/b/[id]/page.tsx` (three props on `<BreakInteractive>`), `e2e/journey-1.spec.ts` (whole file), `e2e/layout.spec.ts` (append one test)

**Interfaces:**
- Consumes: `Sheet`, `Button`, `buttonClass`, `CopyButton`, `MiniCells`, `LocalTime`, `giveBack` and `claimRandomAction` (server actions), `outcomeText`, `formatMoney`, `joinAnd`, `type Owe` and the rest of the Task 11b island.
- Produces:
  - `type PayLink = { app: string; web: string }`; `payLinks(h: { venmo?: string; paypal?: string }, amountCents: number): { venmo?: PayLink; paypal?: PayLink }` (Venmo web fallback `https://account.venmo.com/u/<handle>`; PayPal is web for both).
  - `pay-copy.ts`: `SENT_HINT: string`, `SENT_HINT_KEY: string`, `payHeadline(cents: number, payee: string): string`, `releaseText(hostName: string): string` ("or Jim can release your lines."; the sheet renders "Pay by <LocalTime …/> " before it), `giveBackPrompt(numbers: readonly number[]): { text: string; confirm: string }`, `retryRandomLabel(n: number): string`, `commitmentShort(c: string | null): string | null`.
  - `<PaySheet open onClose breakId outcome owe payee handles instructions hostName commitment retryMax onRetry onSent pending />` with `owe: Owe | null` (`Owe` from Task 11b: `{ numbers; cents; payByIso; payByFallback }`).
  - `BreakInteractiveProps` gains `handles: { venmo?: string; paypal?: string }`, `instructions: string`, `commitment: string | null`. The island passes `p.owe ?? pendingOwe` to the sheet.
  - Ids: `pay-sheet`, `pay-outcome`, `pay-amount`, `pay-copy`, `pay-sent`, `pay-by`, `give-back-confirm`.

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/pay-links.test.ts` with:

```ts
import { it, expect } from "vitest";
import { payLinks } from "./pay-links";

it("builds a venmo deep link with a web fallback, and a paypal.me link", () => {
  expect(payLinks({ venmo: "@Jim-Roberts-36", paypal: "JamesRoberts603182" }, 4000)).toEqual({
    venmo: { app: "venmo://paycharge?txn=pay&recipients=Jim-Roberts-36&amount=40.00&note=", web: "https://account.venmo.com/u/Jim-Roberts-36" },
    paypal: { app: "https://paypal.me/JamesRoberts603182/40.00", web: "https://paypal.me/JamesRoberts603182/40.00" },
  });
});
it("omits links for missing handles", () => { expect(payLinks({}, 100)).toEqual({}); });
```

`src/components/break/pay-copy.test.ts`:

```ts
import { it, expect } from "vitest";
import { commitmentShort, giveBackPrompt, payHeadline, releaseText, retryRandomLabel, SENT_HINT } from "./pay-copy";

it("writes the pay block", () => {
  expect(payHeadline(1000, "@Jim-Roberts-36")).toBe("Send $10 to @Jim-Roberts-36");
  // The sheet renders "Pay by " + <LocalTime> (the viewer's own time) + " " + releaseText(host).
  expect(releaseText("Jim")).toBe("or Jim can release your lines.");
  expect(SENT_HINT).toBe("No need to comment Sent on Facebook.");
  expect(commitmentShort("ab".repeat(32))).toBe("abababababab");
  expect(commitmentShort(null)).toBeNull();
});

it("confirms giving lines back by naming them", () => {
  expect(giveBackPrompt([4])).toEqual({ text: "Give back line 4? It goes back on the board.", confirm: "Give back 1 line" });
  expect(giveBackPrompt([4, 11])).toEqual({ text: "Give back lines 4 and 11? They go back on the board.", confirm: "Give back 2 lines" });
});

it("offers random lines in place of taken ones", () => {
  expect(retryRandomLabel(1)).toBe("Take a random open line instead");
  expect(retryRandomLabel(2)).toBe("Take 2 random open lines instead");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/lib/pay-links.test.ts src/components/break/pay-copy.test.ts`
Expected: FAIL. `pay-links.test.ts` fails on an assertion (the venmo value is still a string, not `{ app, web }`); `pay-copy.test.ts` fails with `Failed to resolve import "./pay-copy"`.

- [ ] **Step 3: Implement the links and the copy**

Replace `src/lib/pay-links.ts` with:

```ts
export type PayLink = { app: string; web: string };

/** Deep links with an empty note. Venmo's scheme is often blocked in in-app browsers, so it carries a web fallback. */
export function payLinks(h: { venmo?: string; paypal?: string }, amountCents: number): { venmo?: PayLink; paypal?: PayLink } {
  const amount = (amountCents / 100).toFixed(2);
  const out: { venmo?: PayLink; paypal?: PayLink } = {};
  if (h.venmo) {
    const v = encodeURIComponent(h.venmo.replace(/^@/, ""));
    out.venmo = { app: `venmo://paycharge?txn=pay&recipients=${v}&amount=${amount}&note=`, web: `https://account.venmo.com/u/${v}` };
  }
  if (h.paypal) {
    const link = `https://paypal.me/${encodeURIComponent(h.paypal.replace(/^@/, ""))}/${amount}`;
    out.paypal = { app: link, web: link };
  }
  return out;
}
```

`src/components/break/pay-copy.ts`:

```ts
import { formatMoney } from "@/lib/money";
import { joinAnd } from "@/lib/list";

export const SENT_HINT = "No need to comment Sent on Facebook.";
export const SENT_HINT_KEY = "breaks.sentHintSeen";

export const payHeadline = (cents: number, payee: string) => `Send ${formatMoney(cents)} to ${payee}`;
/** Follows "Pay by <LocalTime>" in the sheet; the deadline itself is rendered in the viewer's zone. */
export const releaseText = (hostName: string) => `or ${hostName} can release your lines.`;

export function giveBackPrompt(numbers: readonly number[]): { text: string; confirm: string } {
  if (numbers.length === 1) return { text: `Give back line ${numbers[0]}? It goes back on the board.`, confirm: "Give back 1 line" };
  return { text: `Give back lines ${joinAnd(numbers)}? They go back on the board.`, confirm: `Give back ${numbers.length} lines` };
}

export const retryRandomLabel = (n: number) => (n === 1 ? "Take a random open line instead" : `Take ${n} random open lines instead`);

export const commitmentShort = (c: string | null) => (c ? c.slice(0, 12) : null);
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/lib/pay-links.test.ts src/components/break/pay-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the sheet**

`src/components/break/pay-sheet.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { Button, buttonClass } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { MiniCells } from "@/components/mini-cells";
import { LocalTime } from "@/components/local-time";
import { payLinks, type PayLink } from "@/lib/pay-links";
import { giveBack } from "@/app/b/[id]/actions";
import { outcomeText } from "./selection";
import { giveBackPrompt, payHeadline, releaseText, retryRandomLabel, SENT_HINT, SENT_HINT_KEY } from "./pay-copy";
import type { Owe } from "./break-interactive";

type Props = {
  open: boolean;
  onClose: () => void;
  breakId: string;
  outcome: { got: number[]; taken: number[] } | null;
  owe: Owe | null;
  payee: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  hostName: string;
  commitment: string | null;
  /** How many random lines may replace taken ones (0 hides the offer). */
  retryMax: number;
  onRetry: (count: number) => void;
  onSent: () => void;
  pending: boolean;
};

/** Try the app; if the page is still visible after a moment (scheme blocked), open the web profile instead. */
function openPayLink(link: PayLink) {
  if (link.app === link.web) { window.location.href = link.web; return; }
  let left = false;
  const onHide = () => { if (document.visibilityState === "hidden") left = true; };
  document.addEventListener("visibilitychange", onHide);
  window.location.href = link.app;
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left) window.location.href = link.web;
  }, 1200);
}

export function PaySheet(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giving, startGive] = useTransition();

  useEffect(() => {
    try { setShowHint(window.localStorage.getItem(SENT_HINT_KEY) !== "1"); } catch { setShowHint(true); }
  }, []);
  useEffect(() => { if (!p.open) { setConfirming(false); setError(null); } }, [p.open]);

  const links = p.owe ? payLinks(p.handles, p.owe.cents) : {};
  const prompt = p.owe ? giveBackPrompt(p.owe.numbers) : null;
  const retryCount = p.outcome ? Math.min(p.outcome.taken.length, p.retryMax) : 0;

  const markSent = () => {
    try { window.localStorage.setItem(SENT_HINT_KEY, "1"); } catch { /* storage blocked: the hint shows again next time */ }
    setShowHint(false);
    p.onSent();
  };
  const doGiveBack = () => {
    if (!p.owe) return;
    const numbers = p.owe.numbers;
    startGive(async () => {
      const r = await giveBack(p.breakId, numbers);
      if (r.ok) { setConfirming(false); p.onClose(); } else setError(r.message);
    });
  };

  return (
    <Sheet open={p.open} onClose={p.onClose} title={p.owe ? "Pay for your lines" : "Your lines"} testId="pay-sheet">
      <div className="space-y-4 pb-2">
        {p.outcome && (p.outcome.got.length > 0 || p.outcome.taken.length > 0) && (
          <div className="space-y-1">
            <p className="font-semibold" data-testid="pay-outcome">{outcomeText(p.outcome.got, p.outcome.taken)}</p>
            {retryCount > 0 && (
              <Button variant="text" onClick={() => p.onRetry(retryCount)} disabled={p.pending}>{retryRandomLabel(retryCount)}</Button>
            )}
          </div>
        )}
        {p.owe ? (
          <>
            <MiniCells label="Your unpaid lines" cells={p.owe.numbers.map((n) => ({ number: n, state: "taken" as const, mine: true, overdue: false, bonus: false }))} />
            <p className="font-condensed text-headline font-semibold tabular" data-testid="pay-amount">{payHeadline(p.owe.cents, p.payee)}</p>
            <div className="space-y-2">
              {p.handles.venmo && <CopyButton value={p.handles.venmo} label="Copy handle" copiedLabel="Handle copied" full testId="pay-copy" />}
              {!p.handles.venmo && p.handles.paypal && <CopyButton value={`paypal.me/${p.handles.paypal}`} label="Copy PayPal link" copiedLabel="Link copied" full testId="pay-copy" />}
              {links.venmo && (
                <a href={links.venmo.app} onClick={(e) => { e.preventDefault(); openPayLink(links.venmo!); }} className={buttonClass("secondary", true)}>Pay with Venmo</a>
              )}
              {links.paypal && <a href={links.paypal.web} target="_blank" rel="noreferrer" className={buttonClass("secondary", true)}>Pay with PayPal</a>}
            </div>
            <p className="text-small font-semibold">Leave the note blank.</p>
            {p.instructions && <p className="whitespace-pre-line text-small text-ink-2">{p.instructions}</p>}
            {p.commitment && (
              <p className="text-small text-ink-2">
                Draw locked before you joined: <code className="font-mono">{p.commitment}</code>. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link>
              </p>
            )}
            <div className="space-y-2">
              <Button full onClick={markSent} disabled={p.pending} data-testid="pay-sent">I&apos;ve sent it</Button>
              {showHint && <p className="text-small text-ink-2">{SENT_HINT}</p>}
              {p.owe.payByIso && p.owe.payByFallback && (
                <p className="text-small" data-testid="pay-by">
                  Pay by <LocalTime iso={p.owe.payByIso} fallback={p.owe.payByFallback} kind="deadline" /> {releaseText(p.hostName)}
                </p>
              )}
              <Button variant="text" full onClick={p.onClose}>I&apos;ll pay later</Button>
              {confirming && prompt ? (
                <div className="space-y-2 rounded-card border border-wire p-3">
                  <p className="text-small">{prompt.text}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={doGiveBack} disabled={giving} data-testid="give-back-confirm">{prompt.confirm}</Button>
                    <Button variant="text" onClick={() => setConfirming(false)}>Keep</Button>
                  </div>
                </div>
              ) : (
                <Button variant="text" full onClick={() => setConfirming(true)}>Give back these lines</Button>
              )}
              {error && <p role="alert" className="text-small text-red">{error}</p>}
            </div>
          </>
        ) : (
          <Button variant="secondary" full onClick={p.onClose}>Close</Button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 6: Open the sheet from the island**

Replace `src/components/break/break-interactive.tsx` with:

```tsx
"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Allowance, GridCell, GridCounts } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { claim, claimNextAction, claimRandomAction, claimRest, sent } from "@/app/b/[id]/actions";
import { Grid } from "@/components/grid/grid";
import { nextFocusIndex } from "@/components/grid/layout";
import { SegmentedControl } from "@/components/segmented-control";
import { clampStep } from "@/components/stepper-math";
import { ClaimBar } from "./claim-bar";
import { LineList } from "./line-list";
import { PaySheet } from "./pay-sheet";
import { claimBar, limitText } from "./claim-bar-state";
import { cellNote, loginHref, onboardingHref, outcomeText, reconcileSelection, selectionAnnouncement, takenAnnouncement, toggleSelection } from "./selection";
import { useAutoRefresh } from "./use-auto-refresh";

/** What the viewer owes for unsent lines. The deadline travels as ISO plus the server's fallback text (LocalTime). */
export type Owe = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null };

export type BreakInteractiveProps = {
  breakId: string;
  status: BreakStatus;
  claimMode: ClaimMode;
  priceCents: number;
  lineCount: number;
  title: string;
  shareUrl: string;
  /** "Pay within 24 hours. Hosted by @jim, new host." It shares one row with the Grid | List toggle (pixel budget). */
  smallLine: string;
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

type ClaimData = { got: number[]; taken?: number[] };
type TapNote = { text: string; top: number; left: number };

export function BreakInteractive(p: BreakInteractiveProps) {
  const router = useRouter();
  // Server props are the truth; the optimistic layer only marks lines being claimed right now.
  const [cells, markClaimed] = useOptimistic(p.cells, (cur: GridCell[], numbers: number[]) =>
    cur.map((c) => (numbers.includes(c.number) && c.state === "open" ? { ...c, state: "taken" as const, mine: true } : c)));
  const [selected, setSelected] = useState<number[]>(() => reconcileSelection(p.initialPick, p.cells).kept);
  const [struck, setStruck] = useState<number[]>([]);
  const [announce, setAnnounce] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [tapNote, setTapNote] = useState<TapNote | null>(null);
  const [outcome, setOutcome] = useState<{ got: number[]; taken: number[] } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The claim can resolve before the refreshed props arrive: the sheet shows a provisional amount until they do.
  const [pendingOwe, setPendingOwe] = useState<Owe | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [count, setCount] = useState(1);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const gridWrap = useRef<HTMLDivElement>(null);

  // Open: claims move. Closed: the host may start the draw. Running draw: the result lands. Keep all three fresh.
  useAutoRefresh(p.status === "open" || p.status === "filled" || p.status === "drawing");

  // When fresh props show a selected line taken by someone else: strike it, drop it, say so.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastCells = useRef(p.cells);
  useEffect(() => {
    if (lastCells.current === p.cells) return;
    lastCells.current = p.cells;
    const { kept, dropped } = reconcileSelection(selectedRef.current, p.cells);
    if (kept.length !== selectedRef.current.length) setSelected(kept);
    if (dropped.length > 0) {
      setStruck(dropped);
      setAnnounce(takenAnnouncement(dropped));
    }
  }, [p.cells]);

  // Fresh server props carry the real amount and deadline; drop the provisional one.
  useEffect(() => { setPendingOwe(null); }, [p.owe]);
  const owe = p.owe ?? pendingOwe;

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
  const stepMax = bar.kind === "idle" && bar.stepper ? bar.stepper.max : 1;
  const stepCount = clampStep(count, 1, stepMax);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const struckSet = useMemo(() => new Set(struck), [struck]);
  const canPick = p.status === "open" && p.claimMode !== "straight";
  const retryMax = p.status === "open" && p.claimMode === "pick_or_random" ? Math.min(p.counts.open, p.allowance.remaining) : 0;

  /** "Line 7: @mike, paid" in a small popover under the tapped cell, and in the polite live region. */
  const showCellNote = (c: GridCell) => {
    const text = cellNote(c);
    setAnnounce(text);
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
    if (c.state !== "open") { showCellNote(c); return; }
    if (!canPick) return;
    setTapNote(null);
    const r = toggleSelection(selected, n, p.allowance.remaining);
    if (r.blocked) {
      const text = limitText(p.allowance);
      setNote(text);
      setAnnounce(text);
      return;
    }
    setNote(null);
    setStruck([]);
    setSelected(r.next);
    setAnnounce(selectionAnnouncement(r.next.length, p.priceCents));
  };

  const finish = (r: ActionResult<ClaimData>, requested: number[]) => {
    if (r.ok) {
      const taken = r.data.taken ?? [];
      setSelected([]);
      setBatchId(crypto.randomUUID());
      setJustSent(false);
      setNote(null);
      setStruck(taken);
      setOutcome({ got: r.data.got, taken });
      setAnnounce(outcomeText(r.data.got, taken));
      if (r.data.got.length > 0) {
        setPendingOwe({
          numbers: [...(p.owe?.numbers ?? []), ...r.data.got].sort((x, y) => x - y),
          cents: (p.owe?.cents ?? 0) + r.data.got.length * p.priceCents,
          payByIso: p.owe?.payByIso ?? null,
          payByFallback: p.owe?.payByFallback ?? null,
        });
      }
      setSheetOpen(true); // the claim is committed; now the pay step
      return;
    }
    if (r.code === "NOT_SIGNED_IN") { router.push(loginHref(p.breakId, requested)); return; }
    if (r.code === "NOT_ONBOARDED") { router.push(onboardingHref(p.breakId, requested)); return; }
    const taken = r.details?.taken ?? [];
    if (taken.length > 0) {
      setSelected((cur) => cur.filter((n) => !taken.includes(n)));
      setStruck(taken);
    }
    setNote(r.message);
    setAnnounce(r.message);
  };

  const runClaim = (optimistic: number[], call: () => Promise<ActionResult<ClaimData>>) => {
    startTransition(async () => {
      if (optimistic.length > 0) markClaimed(optimistic);
      finish(await call(), optimistic);
    });
  };

  const onClaim = () => { const numbers = selected; runClaim(numbers, () => claim(p.breakId, numbers, batchId)); };
  const onStep = () => {
    if (bar.kind !== "idle" || !bar.stepper) return;
    const action = bar.stepper.action;
    const n = stepCount;
    runClaim([], () => (action === "next" ? claimNextAction(p.breakId, n, batchId) : claimRandomAction(p.breakId, n, batchId)));
  };
  const onLast = () => {
    const open = cells.filter((c) => c.state === "open" && !c.bonus).map((c) => c.number);
    runClaim(open, () => claimRest(p.breakId, batchId));
  };
  const onRetry = (n: number) => runClaim([], () => claimRandomAction(p.breakId, n, batchId));
  const onSent = () => {
    if (!owe) return;
    const numbers = owe.numbers;
    startTransition(async () => {
      const r = await sent(p.breakId, numbers);
      if (r.ok) {
        setJustSent(true);
        setOutcome(null);
        setSheetOpen(false);
        setAnnounce(`Sent. ${p.hostName} will tick you off when it arrives.`);
      } else {
        setNote(r.message);
        setAnnounce(r.message);
      }
    });
  };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-cell]"));
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (index < 0) return;
    const rows = e.currentTarget.querySelector<HTMLElement>("[data-grid-rows]");
    const cols = rows ? getComputedStyle(rows).gridTemplateColumns.split(" ").filter(Boolean).length : 1;
    const next = nextFocusIndex(index, e.key, cols, buttons.length);
    if (next === null) return;
    e.preventDefault();
    buttons.forEach((b, i) => { b.tabIndex = i === next ? 0 : -1; });
    buttons[next].focus();
  };

  return (
    <>
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-2">{p.smallLine}</p>
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      <a href="#claim-bar" className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus:text-small focus:underline">Skip to claim bar</a>
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
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {p.children}
      <ClaimBar
        bar={bar}
        pending={pending}
        count={stepCount}
        onCount={setCount}
        onClaim={onClaim}
        signInHref={loginHref(p.breakId, selected)}
        onStep={onStep}
        onLast={onLast}
        onSent={onSent}
        onOweTap={() => { setOutcome(null); setSheetOpen(true); }}
        resultHref={`/b/${p.breakId}/result`}
      />
      <PaySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        breakId={p.breakId}
        outcome={outcome}
        owe={owe}
        payee={p.payee}
        handles={p.handles}
        instructions={p.instructions}
        hostName={p.hostName}
        commitment={p.commitment}
        retryMax={retryMax}
        onRetry={onRetry}
        onSent={onSent}
        pending={pending}
      />
    </>
  );
}
```

In `src/app/b/[id]/page.tsx`, add `commitmentShort` to the imports:

```tsx
import { commitmentShort } from "@/components/break/pay-copy";
```
and in the `<BreakInteractive …>` props, after `payee={payee}`, add:

```tsx
        handles={handles}
        instructions={b.paymentInstructions}
        commitment={commitmentShort(b.seedCommitment)}
```

- [ ] **Step 7: Pay from the sheet in the journey (updates `e2e/journey-1.spec.ts`)**

Replace `e2e/journey-1.spec.ts` with:

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
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await expect(alice.getByTestId("bar-summary")).toHaveText("Lines 1, 2, $10");
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("pay-outcome")).toHaveText("You have lines 1 and 2.");
  await expect(alice.getByTestId("pay-amount")).toContainText("$10");
  await alice.getByTestId("pay-sent").click();
  await expect(alice.getByTestId("sent-note")).toBeVisible();

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.getByTestId("claim-rest").click();
  await expect(bob.getByTestId("pay-amount")).toContainText("$5");

  await host.reload(); // pick up claims made in the other contexts
  await expect(host.locator("[data-testid=ledger-row][data-status=sent]")).toHaveCount(1);
  const paid = host.getByTestId("ledger-paid");
  await expect(paid).toHaveCount(2); // one per buyer
  await paid.first().click();
  await expect(paid).toHaveCount(1);
  await paid.first().click();
  await expect(paid).toHaveCount(0);
  await expect(host.getByTestId("paid-count")).toContainText("3 of 3 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("bar-result").click();
  await expect(host.getByTestId("winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
});
```

- [ ] **Step 8: Pin focus return in the layout spec (extends `e2e/layout.spec.ts`)**

Append to `e2e/layout.spec.ts`:

```ts
test("Escape closes the pay sheet and focus lands on the claim bar (D§7)", async ({ browser }) => {
  const page = await signedIn(browser, `lf${run}@e2e.test`);
  await page.goto(url);
  await page.getByTestId("cell-20").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pay-sheet")).toBeHidden();
  expect(await page.evaluate(() => !!document.activeElement?.closest("[data-sticky-bar]"))).toBe(true);
});
```

- [ ] **Step 9: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. Claim two lines: the sheet opens on "You have lines … ." with the handle copy first and the deadline in your own time ("Pay by 9:40 pm tomorrow …"); Escape closes it and focus lands in the bar, which now reads "You owe $10 to …"; tapping it reopens the sheet. In a browser where `venmo://` is unhandled, "Pay with Venmo" lands on account.venmo.com after about a second. "Give back these lines" asks first and then reopens the lines.

- [ ] **Step 10: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green, including the new layout test.

- [ ] **Step 11: Commit**

```bash
git add src/lib/pay-links.ts src/lib/pay-links.test.ts src/components/break "src/app/b/[id]/page.tsx" e2e/journey-1.spec.ts e2e/layout.spec.ts
git commit -m "feat(break-page): pay sheet with handle copy, deep links and give back"
```

---

### Task 13a: Ledger view logic as a pure module (model: opus)

The host ledger's logic, written and tested before its UI: filters and search (name, handle or amount), the order frozen when the ledger opens, chip counts, the snackbar, release and Paid-button copy, the overdue release reason, the bonus allowance text, and each buyer's lines as mini cells. Nothing imports the module yet, so the app is unchanged and every gate passes after this task.

**Files:**
- Create: `src/components/ledger/ledger-view.ts`, `src/components/ledger/ledger-view.test.ts`

**Interfaces:**
- Consumes: `BuyerStatus` (`import type` from `@/domain/lines/ledger`), `CellData` (`import type`), `formatMoney`, `joinAnd`, `plural`.
- Produces (all in `src/components/ledger/ledger-view.ts`):
  - `type LedgerRowView = { ownerId: string; handle: string | null; displayName: string | null; numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[]; owedCents: number; status: BuyerStatus; lateText: string | null }`; `type LedgerFilter = "all" | "sent" | "unpaid" | "overdue"`.
  - `matchesFilter(r: LedgerRowView, f: LedgerFilter): boolean`; `matchesQuery(r: LedgerRowView, q: string): boolean`; `freezeOrder(rows: readonly LedgerRowView[]): string[]`; `applyOrder(rows: readonly LedgerRowView[], order: readonly string[]): LedgerRowView[]`; `chipCounts(rows: readonly LedgerRowView[]): Record<LedgerFilter, number>`.
  - `markPaidLabel(r: Pick<LedgerRowView, "handle" | "displayName" | "owedCents">): string` ("Mark Dave paid, $5"); `paidToast(r: Pick<LedgerRowView, "handle" | "displayName">, numbers: readonly number[], cents: number): string`; `releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent">, numbers: readonly number[]): { text: string; confirm: string; warning: string | null }`; `releaseReason(r: Pick<LedgerRowView, "unpaid" | "overdue">): "overdue" | "host_dropped"`; `bonusText(used: number, max: number): string`; `rowStateWord(r: Pick<LedgerRowView, "status">): string`; `rowCells(r: LedgerRowView): CellData[]`.

- [ ] **Step 1: Write the failing tests**

`src/components/ledger/ledger-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyOrder, bonusText, chipCounts, freezeOrder, markPaidLabel, matchesFilter, matchesQuery, paidToast, releaseConfirm, releaseReason, rowCells, rowStateWord, type LedgerRowView,
} from "./ledger-view";

const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
  handle: null, displayName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
});
const alice = row({ ownerId: "a", handle: "alice", displayName: "Alice Smith", numbers: [2, 5], unpaid: [2, 5], sent: [2, 5], owedCents: 1000, status: "sent" });
const dave = row({ ownerId: "d", handle: "dave", displayName: "Dave", numbers: [4], unpaid: [4], owedCents: 500, status: "unpaid" });
const erin = row({ ownerId: "e", handle: "erin", numbers: [10, 11, 12], paid: [10], unpaid: [11, 12], sent: [11], overdue: [12], owedCents: 1050, status: "overdue", lateText: "4 h late" });
const bob = row({ ownerId: "b", handle: "bob", numbers: [7, 13], paid: [7, 13], bonus: [13], status: "paid" });

describe("filters and search", () => {
  it("filters by what a buyer still has in each state (Review Focus 4)", () => {
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "sent")).map((r) => r.ownerId)).toEqual(["a", "e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "unpaid")).map((r) => r.ownerId)).toEqual(["a", "d", "e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "overdue")).map((r) => r.ownerId)).toEqual(["e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "all"))).toHaveLength(4);
    expect(chipCounts([alice, dave, erin, bob])).toEqual({ all: 4, sent: 2, unpaid: 3, overdue: 1 });
  });
  it("matches display name, handle or the owed amount", () => {
    expect(matchesQuery(alice, "")).toBe(true);
    expect(matchesQuery(alice, "@ali")).toBe(true);
    expect(matchesQuery(alice, "smith")).toBe(true);
    expect(matchesQuery(alice, "$10")).toBe(true);
    expect(matchesQuery(alice, "10")).toBe(true);
    expect(matchesQuery(erin, "10.50")).toBe(true);
    expect(matchesQuery(dave, "10")).toBe(false);
    expect(matchesQuery(dave, "zzz")).toBe(false);
  });
});

describe("fixed order", () => {
  it("keeps the order frozen at open and appends newcomers", () => {
    const order = freezeOrder([alice, dave, erin]);
    const fresh = [{ ...dave, status: "paid" as const }, erin, bob, alice];
    expect(applyOrder(fresh, order).map((r) => r.ownerId)).toEqual(["a", "d", "e", "b"]);
  });
});

describe("row copy", () => {
  it("names the Paid button's action for screen readers (design §6 \"Mark paid\")", () => {
    expect(markPaidLabel(dave)).toBe("Mark Dave paid, $5");
    expect(markPaidLabel(erin)).toBe("Mark @erin paid, $10.50");
  });
  it("confirms paid in a snackbar", () => {
    expect(paidToast(dave, [4], 500)).toBe("Marked @dave paid (1 line, $5).");
    expect(paidToast(row({ ownerId: "x", displayName: "Zed" }), [1, 2, 3], 1500)).toBe("Marked Zed paid (3 lines, $15).");
  });
  it("names the lines and the consequence when releasing, and warns about sent lines", () => {
    expect(releaseConfirm(dave, [4])).toEqual({ text: "Release line 4 from @dave? It reopens now.", confirm: "Release 1 line", warning: null });
    expect(releaseConfirm(erin, [11, 12])).toEqual({
      text: "Release lines 11 and 12 from @erin? They reopen now.", confirm: "Release 2 lines",
      warning: "@erin marked line 11 as sent. Check your payments before releasing.",
    });
  });
  it("uses the overdue reason only when every unpaid line is overdue", () => {
    expect(releaseReason(erin)).toBe("host_dropped");
    expect(releaseReason(row({ ownerId: "z", unpaid: [3], overdue: [3] }))).toBe("overdue");
  });
  it("shows the bonus allowance and the row state word", () => {
    expect(bonusText(2, 5)).toBe("3 of 5 bonus lines left");
    expect(bonusText(0, 1)).toBe("1 of 1 bonus line left");
    expect([alice, dave, erin, bob].map(rowStateWord)).toEqual(["Sent", "Unpaid", "Overdue", "Paid"]);
  });
  it("draws each line's state as a mini cell", () => {
    expect(rowCells(erin)).toEqual([
      { number: 10, state: "paid", mine: false, overdue: false, bonus: false },
      { number: 11, state: "sent", mine: false, overdue: false, bonus: false },
      { number: 12, state: "taken", mine: false, overdue: true, bonus: false },
    ]);
    expect(rowCells(bob)[1]).toEqual({ number: 13, state: "paid", mine: false, overdue: false, bonus: true });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/ledger`
Expected: FAIL with `Failed to resolve import "./ledger-view"`.

- [ ] **Step 3: Write the pure view module and run the tests to see them pass**

`src/components/ledger/ledger-view.ts`:

```ts
import type { BuyerStatus } from "@/domain/lines/ledger";
import type { CellData } from "@/components/grid/cell-label";
import { formatMoney } from "@/lib/money";
import { joinAnd, plural } from "@/lib/list";

/** One buyer as the host ledger shows it; dates already turned into strings on the server. */
export type LedgerRowView = {
  ownerId: string; handle: string | null; displayName: string | null;
  numbers: number[]; unpaid: number[]; sent: number[]; overdue: number[]; paid: number[]; bonus: number[];
  owedCents: number; status: BuyerStatus; lateText: string | null;
};
export type LedgerFilter = "all" | "sent" | "unpaid" | "overdue";

export function matchesFilter(r: LedgerRowView, f: LedgerFilter): boolean {
  switch (f) {
    case "all": return true;
    case "sent": return r.sent.length > 0;
    case "unpaid": return r.unpaid.length > 0;
    case "overdue": return r.overdue.length > 0;
  }
}

/** "Name, handle or amount": a Venmo notice says "$10 from Alice Smith". */
export function matchesQuery(r: LedgerRowView, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/^@/, "");
  if (!s) return true;
  const money = s.replace(/^\$/, "");
  if (/^\d+(\.\d{1,2})?$/.test(money) && Math.round(Number(money) * 100) === r.owedCents) return true;
  return [r.handle, r.displayName].some((v) => v?.toLowerCase().includes(s) ?? false);
}

export const freezeOrder = (rows: readonly LedgerRowView[]) => rows.map((r) => r.ownerId);

/** Rows keep the order frozen when the ledger opened; buyers who appear later go to the end. */
export function applyOrder(rows: readonly LedgerRowView[], order: readonly string[]): LedgerRowView[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((r, i) => ({ r, k: pos.get(r.ownerId) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
}

export function chipCounts(rows: readonly LedgerRowView[]): Record<LedgerFilter, number> {
  return {
    all: rows.length,
    sent: rows.filter((r) => matchesFilter(r, "sent")).length,
    unpaid: rows.filter((r) => matchesFilter(r, "unpaid")).length,
    overdue: rows.filter((r) => matchesFilter(r, "overdue")).length,
  };
}

const who = (r: Pick<LedgerRowView, "handle" | "displayName">) => (r.handle ? `@${r.handle}` : r.displayName ?? "this buyer");
const linesPhrase = (numbers: readonly number[]) => (numbers.length === 1 ? `line ${numbers[0]}` : `lines ${joinAnd(numbers)}`);

/** The visible button says "Paid" (design §5.5); its accessible name says what it does (design §6 "Mark paid"). */
export function markPaidLabel(r: Pick<LedgerRowView, "handle" | "displayName" | "owedCents">): string {
  const name = r.displayName ?? (r.handle ? `@${r.handle}` : "this buyer");
  return `Mark ${name} paid, ${formatMoney(r.owedCents)}`;
}

export function paidToast(r: Pick<LedgerRowView, "handle" | "displayName">, numbers: readonly number[], cents: number): string {
  return `Marked ${who(r)} paid (${numbers.length} ${plural(numbers.length, "line", "lines")}, ${formatMoney(cents)}).`;
}

export function releaseConfirm(r: Pick<LedgerRowView, "handle" | "displayName" | "sent">, numbers: readonly number[]): { text: string; confirm: string; warning: string | null } {
  const sentAmong = r.sent.filter((n) => numbers.includes(n));
  return {
    text: `Release ${linesPhrase(numbers)} from ${who(r)}? ${numbers.length === 1 ? "It reopens" : "They reopen"} now.`,
    confirm: `Release ${numbers.length} ${plural(numbers.length, "line", "lines")}`,
    warning: sentAmong.length ? `${who(r)} marked ${linesPhrase(sentAmong)} as sent. Check your payments before releasing.` : null,
  };
}

export const releaseReason = (r: Pick<LedgerRowView, "unpaid" | "overdue">): "overdue" | "host_dropped" =>
  r.overdue.length > 0 && r.overdue.length === r.unpaid.length ? "overdue" : "host_dropped";

export const bonusText = (used: number, max: number) => `${max - used} of ${max} bonus ${plural(max, "line", "lines")} left`;

const WORD: Record<BuyerStatus, string> = { sent: "Sent", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" };
export const rowStateWord = (r: Pick<LedgerRowView, "status">) => WORD[r.status];

export function rowCells(r: LedgerRowView): CellData[] {
  return r.numbers.map((n): CellData => ({
    number: n,
    state: r.paid.includes(n) ? "paid" : r.sent.includes(n) ? "sent" : "taken",
    mine: false,
    overdue: r.overdue.includes(n),
    bonus: r.bonus.includes(n),
  }));
}
```

Run: `pnpm test src/components/ledger`
Expected: PASS.

- [ ] **Step 4: Run every gate**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: green. Nothing imports `ledger-view.ts` yet; the old host panel and `release-prompt.ts` still serve the page.

- [ ] **Step 5: Commit**

```bash
git add src/components/ledger/ledger-view.ts src/components/ledger/ledger-view.test.ts
git commit -m "feat(ledger): ledger filters, fixed order and copy as a tested pure module"
```

---

### Task 13b: LedgerSheet — host tools in a full-screen sheet (model: opus)

Replaces the old host panel with the design's ledger, built on the Task 13a module: "19 of 50 paid" with the two-tone bar, search by name, handle or amount, filter chips (All, Sent, Unpaid, Overdue), rows grouped by buyer in a fixed order that never moves under the thumb, **Paid** in place (its accessible name says "Mark Dave paid, $5") with **Undo** for 8 s and a polite snackbar placed above the sheet's bottom action, an expanded row with per-line marking, **Release** with a confirm that names the lines (one transaction via `releaseBuyer`), **Add a bonus line** with the allowance shown, and the bottom action for the break state (Open break, Run draw, the running-draw wait, See the result) pinned to the bottom of the sheet. Above 640 the rows become a table (name | lines | state | owed | action) with a header row.

Deferred: the payment name ("pays as John Smith"; in the plan's top-level Deferred list, it needs a `users.payment_name` migration and an onboarding field), the late history micro line (reputation plan), Remind / Remind all (messaging plan), Mark shipped (reputation plan), the `/host` merged ledger and the "7 sent, waiting for you" strip (Plan B). The release confirm drops the design's "and Mike is told" until messaging exists, so it never promises a notification that is not sent.

**This task updates `e2e/journey-1.spec.ts`** (the host opens `host-tools` first; the result link in the ledger is `ledger-result`) **and extends `e2e/layout.spec.ts`** (focusing the ledger search hides the claim bar).

**Files:**
- Create: `src/components/ledger/ledger-row.tsx`, `src/components/ledger/ledger-sheet.tsx`, `src/components/ledger/host-tools.tsx`
- Modify: `src/app/b/[id]/page.tsx` (whole file), `e2e/journey-1.spec.ts` (whole file), `e2e/layout.spec.ts` (append one test)
- Delete: `src/app/b/[id]/host-panel.tsx`, `src/app/b/[id]/release-prompt.ts`, `src/app/b/[id]/release-prompt.test.ts`

**Interfaces:**
- Consumes: from Task 13a `LedgerRowView`, `LedgerFilter`, `matchesFilter`, `matchesQuery`, `freezeOrder`, `applyOrder`, `chipCounts`, `markPaidLabel`, `paidToast`, `releaseConfirm`, `releaseReason`, `bonusText`, `rowStateWord`, `rowCells`; `LedgerBuyer`, `BuyerStatus`, `ledgerByBuyer`, `bonusAllowance`, `formatLate`; server actions `paidForBuyer`, `unpaidForBuyer`, `releaseBuyer`, `addBonus`, `requestDrawAction`, `finaliseDrawAction`, `openBreakAction`; `Sheet`, `FillBar`, `FilterChips`, `Toast` (with `offset="sheet-action"`), `MiniCells`, `Button`, `ButtonLink`, `cellLabel`, `CellData`; the Task 11b/12 island and page (`BreakInteractive`, `smallLine`, `Owe`, `viewerZone`, `pageShare`, `commitmentShort`).
- Produces:
  - `LEDGER_COLS` (the table's literal grid classes above 640) and `<LedgerRow row recentlyPaid pending expanded bonusUsed bonusMax onToggle onPaid onUndo onMarkLine onUnmarkLine onRelease onBonus />` in `ledger-row.tsx`.
  - `type LedgerSheetProps = { open: boolean; onClose: () => void; breakId: string; status: BreakStatus; rows: LedgerRowView[]; counts: { paid: number; taken: number; total: number }; bonus: { used: number; max: number } }`; `<LedgerSheet …LedgerSheetProps />`; `<HostTools breakId status rows counts bonus />`.
  - Ids: `host-tools`, `ledger`, `ledger-row` (+ `data-status`), `ledger-paid`, `ledger-undo`, `ledger-release`, `ledger-release-confirm`, `ledger-bonus`, `paid-count`, `open-break`, `run-draw`, `finish-draw`, `ledger-result`, `mini-<n>`.

- [ ] **Step 1: Pin the bar hiding in the layout spec (extends `e2e/layout.spec.ts`)**

Append to `e2e/layout.spec.ts`:

```ts
test("focusing the ledger search hides the claim bar (D§5.1)", async ({ browser }) => {
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto(url);
  await expect(host.locator("[data-sticky-bar]")).toBeVisible(); // a 50-line break: the host may hold 5, so the bar shows
  await host.getByTestId("host-tools").click();
  await host.getByPlaceholder("Name, handle or amount").focus();
  await expect(host.locator("[data-sticky-bar]")).toBeHidden();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test:e2e e2e/layout.spec.ts`
Expected: FAIL in the new test only: `getByTestId("host-tools")` resolves to nothing (Host tools is still an anchor without that test id), so the click times out.

- [ ] **Step 3: Write the row, the sheet and the trigger**

`src/components/ledger/ledger-row.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/button";
import { MiniCells } from "@/components/mini-cells";
import { cellLabel } from "@/components/grid/cell-label";
import { formatMoney } from "@/lib/money";
import { bonusText, markPaidLabel, releaseConfirm, rowCells, rowStateWord, type LedgerRowView } from "./ledger-view";

type Props = {
  row: LedgerRowView;
  recentlyPaid: boolean;
  pending: boolean;
  expanded: boolean;
  bonusUsed: number;
  bonusMax: number;
  onToggle: () => void;
  onPaid: () => void;
  onUndo: () => void;
  onMarkLine: (n: number) => void;
  onUnmarkLine: (n: number) => void;
  onRelease: () => void;
  onBonus: () => void;
};

/** Columns of the ledger table above 640 (design §5: the ledger widens and becomes a table). Shared with the header row. */
export const LEDGER_COLS = "sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_5rem_7rem] sm:items-center";

/**
 * One buyer, at least 56 pt tall. Paid sits on the right; Release lives only in the expanded row. On phones the
 * row is two stacked columns; above 640 `sm:contents` flattens it into the table's five cells:
 * name | lines | state | owed | action.
 */
export function LedgerRow(p: Props) {
  const r = p.row;
  const [confirm, setConfirm] = useState<{ kind: "release" } | { kind: "unmark"; n: number } | null>(null);
  const name = r.displayName ?? (r.handle ? `@${r.handle}` : "Buyer");
  const release = releaseConfirm(r, r.unpaid);
  const cells = rowCells(r);
  const pressLine = (n: number) => {
    if (r.bonus.includes(n)) return;
    if (r.paid.includes(n)) setConfirm({ kind: "unmark", n });
    else p.onMarkLine(n);
  };

  return (
    <li data-testid="ledger-row" data-status={r.status} className="border-b border-wire bg-card">
      <div className={`flex min-h-14 gap-3 px-4 py-2 ${LEDGER_COLS}`}>
        <div className="min-w-0 flex-1 sm:contents">
          <button type="button" onClick={p.onToggle} aria-expanded={p.expanded} className="flex min-h-11 w-full min-w-0 items-baseline gap-2 text-left">
            <span className="truncate font-semibold">{name}</span>
            {r.handle && r.displayName && <span className="truncate text-small text-ink-2">@{r.handle}</span>}
          </button>
          <div className="flex flex-wrap items-center gap-2 text-small sm:contents">
            <MiniCells cells={cells} />
            <span className="flex items-center gap-2 text-small">
              <span>{rowStateWord(r)}</span>
              {r.lateText && <span className="font-semibold text-red">{r.lateText}</span>}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-1 sm:contents">
          {r.owedCents > 0
            ? <span className="font-condensed text-[20px] leading-6 font-semibold tabular sm:text-right">{formatMoney(r.owedCents)}</span>
            : <span aria-hidden className="hidden sm:block" />}
          <div className="sm:justify-self-end">
            {p.recentlyPaid ? (
              <span className="flex items-center gap-1">
                <span className="text-small font-semibold text-green">Paid</span>
                <Button variant="text" onClick={p.onUndo} disabled={p.pending} data-testid="ledger-undo">Undo</Button>
              </span>
            ) : r.unpaid.length > 0 ? (
              <Button onClick={p.onPaid} disabled={p.pending} aria-label={markPaidLabel(r)} data-testid="ledger-paid">Paid</Button>
            ) : (
              <span className="inline-flex min-h-11 items-center text-small font-semibold text-green">Paid</span>
            )}
          </div>
        </div>
      </div>

      {p.expanded && (
        <div className="space-y-3 border-t border-wire-2 px-4 py-3">
          <p className="text-small text-ink-2">Tap a line to mark it paid. Tap a paid line to un-mark it.</p>
          <MiniCells cells={cells} onPress={pressLine} labelFor={(c) => (c.bonus ? cellLabel(c) : `${cellLabel(c)}. ${c.state === "paid" ? "Un-mark paid" : "Mark paid"}`)} />
          {confirm?.kind === "unmark" && (
            <div className="space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">Un-mark line {confirm.n} as paid? It is logged, and the line stays with {name}.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { p.onUnmarkLine(confirm.n); setConfirm(null); }} disabled={p.pending}>Un-mark</Button>
                <Button variant="text" onClick={() => setConfirm(null)}>Keep</Button>
              </div>
            </div>
          )}
          {r.unpaid.length > 0 && (confirm?.kind === "release" ? (
            <div className="space-y-2 rounded-card border border-wire p-3">
              <p className="text-small">{release.text}</p>
              {release.warning && <p className="text-small text-red">{release.warning}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setConfirm(null); p.onRelease(); }} disabled={p.pending} data-testid="ledger-release-confirm">{release.confirm}</Button>
                <Button variant="text" onClick={() => setConfirm(null)}>Keep</Button>
              </div>
            </div>
          ) : (
            <Button variant="text" onClick={() => setConfirm({ kind: "release" })} data-testid="ledger-release">Release</Button>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="text" onClick={p.onBonus} disabled={p.pending || p.bonusUsed >= p.bonusMax} data-testid="ledger-bonus">Add a bonus line</Button>
            <span className="text-small text-ink-2">{bonusText(p.bonusUsed, p.bonusMax)}</span>
          </div>
        </div>
      )}
    </li>
  );
}
```

`src/components/ledger/ledger-sheet.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { FillBar } from "@/components/fill-bar";
import { FilterChips } from "@/components/filter-chips";
import { Toast } from "@/components/toast";
import { Button, ButtonLink } from "@/components/button";
import type { ActionResult } from "@/lib/action";
import type { BreakStatus } from "@/components/status-word";
import { addBonus, paidForBuyer, releaseBuyer, unpaidForBuyer } from "@/app/b/[id]/actions";
import { finaliseDrawAction, requestDrawAction } from "@/app/b/[id]/draw-actions";
import { openBreakAction } from "@/app/b/[id]/host-actions";
import { LEDGER_COLS, LedgerRow } from "./ledger-row";
import { applyOrder, chipCounts, freezeOrder, matchesFilter, matchesQuery, paidToast, releaseReason, type LedgerFilter, type LedgerRowView } from "./ledger-view";

export type LedgerSheetProps = {
  open: boolean;
  onClose: () => void;
  breakId: string;
  status: BreakStatus;
  rows: LedgerRowView[];
  counts: { paid: number; taken: number; total: number };
  bonus: { used: number; max: number };
};

const UNDO_MS = 8000;

export function LedgerSheet(p: LedgerSheetProps) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<string[]>(() => freezeOrder(p.rows));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recent, setRecent] = useState<Record<string, { numbers: number[]; until: number }>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rowsRef = useRef(p.rows);
  rowsRef.current = p.rows;

  // Order is fixed when the ledger opens and when the host changes the filter; rows never move under the thumb.
  useEffect(() => {
    if (p.open) setOrder(freezeOrder(rowsRef.current));
  }, [p.open, filter]);

  // Undo lasts 8 s per row.
  useEffect(() => {
    const ids = Object.keys(recent);
    if (ids.length === 0) return;
    const soonest = Math.min(...ids.map((id) => recent[id].until));
    const t = window.setTimeout(() => {
      const now = Date.now();
      setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now)));
      setToast(null);
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(t);
  }, [recent]);

  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onOk?.();
      else setError(r.message);
    });

  const markPaid = (row: LedgerRowView) => {
    const numbers = row.unpaid;
    const cents = row.owedCents;
    run(() => paidForBuyer(p.breakId, row.ownerId, numbers), () => {
      setRecent((cur) => ({ ...cur, [row.ownerId]: { numbers, until: Date.now() + UNDO_MS } }));
      setToast(paidToast(row, numbers, cents));
    });
  };
  const undo = (ownerId: string) => {
    const r = recent[ownerId];
    if (!r) return;
    run(() => unpaidForBuyer(p.breakId, r.numbers), () => {
      setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => id !== ownerId)));
      setToast(null);
    });
  };

  const visible = applyOrder(p.rows, order).filter((r) => recent[r.ownerId] || (matchesFilter(r, filter) && matchesQuery(r, query)));
  const chips = chipCounts(p.rows);

  return (
    <Sheet full open={p.open} onClose={p.onClose} title="Host tools" testId="ledger">
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="font-condensed text-headline font-semibold tabular" data-testid="paid-count">{p.counts.paid} of {p.counts.total} paid</p>
          <FillBar total={p.counts.total} paid={p.counts.paid} taken={p.counts.taken} />
        </div>
        <label className="block">
          <span className="sr-only">Search buyers</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, handle or amount" className="h-11 w-full rounded-input border border-wire-strong bg-card px-3" />
        </label>
        <FilterChips label="Show" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All", count: chips.all },
          { value: "sent", label: "Sent", count: chips.sent },
          { value: "unpaid", label: "Unpaid", count: chips.unpaid },
          { value: "overdue", label: "Overdue", count: chips.overdue },
        ]} />
        {error && <p role="alert" className="text-small text-red">{error}</p>}
        <ul className="-mx-4 border-t border-wire">
          {/* Column names: screen readers always, sighted users only where the rows become a table (above 640). */}
          <li className={`sr-only gap-3 text-micro font-medium text-ink-2 sm:not-sr-only sm:px-4 sm:py-2 ${LEDGER_COLS}`}>
            <span>Buyer</span><span>Lines</span><span>State</span><span className="sm:text-right">Owed</span><span className="sm:text-right">Action</span>
          </li>
          {visible.map((r) => (
            <LedgerRow
              key={r.ownerId}
              row={r}
              recentlyPaid={!!recent[r.ownerId]}
              pending={pending}
              expanded={expanded === r.ownerId}
              bonusUsed={p.bonus.used}
              bonusMax={p.bonus.max}
              onToggle={() => setExpanded((cur) => (cur === r.ownerId ? null : r.ownerId))}
              onPaid={() => markPaid(r)}
              onUndo={() => undo(r.ownerId)}
              onMarkLine={(n) => run(() => paidForBuyer(p.breakId, r.ownerId, [n]))}
              onUnmarkLine={(n) => run(() => unpaidForBuyer(p.breakId, [n]))}
              onRelease={() => run(() => releaseBuyer(p.breakId, r.ownerId, r.unpaid, releaseReason(r)))}
              onBonus={() => run(() => addBonus(p.breakId, r.ownerId))}
            />
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-small text-ink-2">{p.rows.length === 0 ? "No claims yet. Share the break to get it moving." : "Nobody matches."}</li>
          )}
        </ul>
        {/* The bottom action stays in reach: a host with 30 buyers should not scroll to the end to draw. */}
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-wire bg-paper px-4 pt-3 pb-safe">
          {p.status === "draft" && (
            <>
              <p className="text-small text-ink-2">This break is a draft. Only you can see it.</p>
              <Button full onClick={() => run(() => openBreakAction(p.breakId))} disabled={pending} data-testid="open-break">Open break</Button>
            </>
          )}
          {p.status === "open" && <p className="text-small text-ink-2">Run draw unlocks when every line is paid.</p>}
          {p.status === "filled" && <Button full onClick={() => run(() => requestDrawAction(p.breakId))} disabled={pending} data-testid="run-draw">Run draw</Button>}
          {p.status === "drawing" && (
            <>
              <p className="text-small">Running draw. The result is in about a minute.</p>
              <Button variant="secondary" full onClick={() => run(() => finaliseDrawAction(p.breakId))} disabled={pending} data-testid="finish-draw">Check for the result</Button>
            </>
          )}
          {p.status === "drawn" && <ButtonLink href={`/b/${p.breakId}/result`} full data-testid="ledger-result">See the result</ButtonLink>}
        </div>
      </div>
      <Toast message={toast} offset="sheet-action" />
    </Sheet>
  );
}
```

`src/components/ledger/host-tools.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/button";
import { LedgerSheet, type LedgerSheetProps } from "./ledger-sheet";

/** Page-level button under the legend (the global header cannot know the break). */
export function HostTools(props: Omit<LedgerSheetProps, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="host-tools">Host tools</Button>
      <LedgerSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Mount it on the page**

Delete `src/app/b/[id]/host-panel.tsx`, `src/app/b/[id]/release-prompt.ts` and `src/app/b/[id]/release-prompt.test.ts` (their logic and tests now live in `ledger-view.ts`). Replace `src/app/b/[id]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { getBreakPage, hostTrust } from "@/domain/breaks/queries";
import { shapeGrid, canViewBreak, isHostView } from "@/domain/breaks/grid";
import { bonusAllowance } from "@/domain/breaks/rules";
import { ledgerByBuyer, globalUnpaidCount } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getCaller } from "@/auth/session";
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
import { closesText, leftText, payWithinText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { HostTools } from "@/components/ledger/host-tools";
import type { LedgerRowView } from "@/components/ledger/ledger-view";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page || page.break.status === "draft") return {};
  return { title: page.break.title, description: `${page.break.lineCount} lines at ${formatMoney(page.break.linePriceCents)}.` };
}

export default async function BreakPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = await db.transaction((tx) => getBreakPage(tx, id));
  if (!page) notFound();
  const b = page.break;
  const caller = await getCaller();
  // Drafts 404 for everyone but their host (and admins) before any further query.
  if (!canViewBreak(b.status, isHostView(b.hostId, caller))) notFound();
  const { pick } = await searchParams;
  const initialPick = parsePick(pick, b.lineCount);
  if (caller && !caller.onboarded && initialPick.length > 0) redirect(onboardingHref(id, initialPick));
  const now = new Date();
  const zone = await viewerZone();
  const { trust, globalUnpaid } = await db.transaction(async (tx) => ({
    trust: await hostTrust(tx, page.host.id),
    globalUnpaid: caller ? await globalUnpaidCount(tx, caller.id) : 0,
  }));
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid } : null, now);

  const status = b.status as BreakStatus;
  const hostName = page.host.displayName ?? page.host.handle ?? "the host";
  const hostRef = page.host.handle ? `@${page.host.handle}` : hostName;
  const handles = page.host.paymentHandles;
  const payee = handles.venmo ?? (handles.paypal ? `paypal.me/${handles.paypal}` : hostName);
  const url = `${env().APP_URL}/b/${id}`;
  let top: { line: number; handle: string | null } | null = null;
  if (status === "drawn") {
    const res = await db.transaction((tx) => getDrawResult(tx, id));
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
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
  const ledger = grid.hostView ? await db.transaction((tx) => ledgerByBuyer(tx, id, now)) : [];
  const ledgerRows: LedgerRowView[] = ledger.map((r) => ({
    ownerId: r.ownerId, handle: r.handle, displayName: r.displayName,
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
        smallLine={`${payWithinText(b.paymentWindowHours)} Hosted by ${hostRef}, ${trustText(trust)}.`}
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

- [ ] **Step 5: Open host tools in the journey (updates `e2e/journey-1.spec.ts`)**

Replace `e2e/journey-1.spec.ts` with:

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
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await expect(alice.getByTestId("bar-summary")).toHaveText("Lines 1, 2, $10");
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("pay-outcome")).toHaveText("You have lines 1 and 2.");
  await expect(alice.getByTestId("pay-amount")).toContainText("$10");
  await alice.getByTestId("pay-sent").click();
  await expect(alice.getByTestId("sent-note")).toBeVisible();

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.getByTestId("claim-rest").click();
  await expect(bob.getByTestId("pay-amount")).toContainText("$5");

  await host.reload(); // pick up claims made in the other contexts
  await host.getByTestId("host-tools").click();
  await expect(host.locator("[data-testid=ledger-row][data-status=sent]")).toHaveCount(1);
  const paid = host.getByTestId("ledger-paid");
  await expect(paid).toHaveCount(2); // one per buyer with unpaid lines
  await paid.first().click();
  await expect(paid).toHaveCount(1); // the row stays, showing Paid and Undo
  await expect(host.getByTestId("ledger-undo")).toHaveCount(1);
  await paid.first().click();
  await expect(paid).toHaveCount(0);
  await expect(host.getByTestId("paid-count")).toContainText("3 of 3 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("ledger-result").click();
  await expect(host.getByTestId("winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
});
```

- [ ] **Step 6: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. As a host with four buyers: open Host tools; the rows read Sent, Unpaid, Overdue, Paid top to bottom; tapping Paid leaves the row where it is with "Paid" and Undo, and a screen reader hears "Marked @dave paid (3 lines, $15)." (the button itself is announced as "Mark Dave paid, $15"); the snackbar sits above the bottom action; after 8 s Undo goes; changing the filter re-sorts. Search "$15" finds the buyer who owes $15. Expand a row: Release asks "Release lines 4 and 11 from @mike? They reopen now." and releases in one step; Add a bonus line shows "4 of 5 bonus lines left" afterwards. Scroll a long ledger: Run draw stays pinned at the bottom. At 1024 wide the rows line up as a table under the column names.

- [ ] **Step 7: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green, including the new layout test.

- [ ] **Step 8: Commit**

```bash
git add src/components/ledger "src/app/b/[id]" e2e/journey-1.spec.ts e2e/layout.spec.ts
git commit -m "feat(ledger): host tools sheet with fixed order, undo, release and bonus lines"
```

---
### Task 14: Result page — server-rendered winner, the deal, copy fields, verifier fold, share (model: sonnet)

Today the winner exists only after a client-side timer (no-JS viewers never see it), the draw time uses the server locale, values cannot be copied, and the voided note points at details that are not rendered (deferred findings, Task 14). This task renders the final state on the server ("Top spot: line 7", the handle, the large green cell, the full order), plays the CSS deal once per viewer in an `aria-hidden` layer with Skip and Replay, moves the commitment, beacon round and seed into copy fields inside a "Check it yourself" fold that runs the browser verifier, builds the "CLOSED n RAN" share text, shows the draw time in the viewer's own time (`LocalTime`), and draws the test-draw warning as a red hairline box at the top in plain words.

The winner must not flash before the deal hides it: a tiny inline script marks `<html data-deal>` before first paint when this viewer has not seen the deal (and does not prefer reduced motion), CSS hides the final state while the mark is there, and `Reveal` removes it once the deal layer is up (a 4 s safety timeout removes it too). Without JavaScript the script never runs, so the final state shows as before.

**This task updates `e2e/journey-1.spec.ts`** (the winner heading reads "Top spot: line N"; the verifier button sits inside the `verify-fold` summary).

**Files:**
- Create: `src/app/b/[id]/result/reveal-plan.ts`, `src/app/b/[id]/result/reveal-plan.test.ts`
- Modify: `src/app/b/[id]/result/page.tsx` (whole file), `src/app/b/[id]/result/reveal.tsx` (whole file), `src/app/b/[id]/result/verify.tsx` (whole file), `src/app/globals.css` (append one rule), `e2e/journey-1.spec.ts` (last lines)
- Delete: `src/app/b/[id]/result/share.tsx`

**Interfaces:**
- Consumes: `getDrawResult`, `PublicInputs`, `verifyInputs`, `QUICKNET`, `shareText`, `formatDateTime(d, tz, labelled)`, `viewerZone`, `LocalTime`, `ordinal`, `CopyButton`, `CopyField`, `Button`, `env`, the `animate-deal` / `animate-lift` utilities from Task 6.
- Produces:
  - `reveal-plan.ts`: `DEAL_MS = 1500`, `dealDelays(count: number, total?: number): number[]` (index = rank position; the top spot is dealt last), `seenKey(breakId: string): string`, `topSpotText(line: number): string`, `placeLabel(rank: number): string` ("Top spot", "2nd", "3rd", …).
  - `dealGateScript(breakId: string): string` in `reveal-plan.ts` (the inline pre-paint script; reads `seenKey(breakId)`).
  - `<Reveal breakId ranking handleOf awards />` (client; renders the final state on the server inside `[data-reveal-final]`; clears `<html data-deal>` once the deal layer is mounted or skipped).
  - CSS: `[data-deal] [data-reveal-final] { visibility: hidden; }` in `globals.css`.
  - `<Verify inputs seed relayUrl />` (client).
  - Ids: `winner`, `reveal-skip`, `reveal-replay`, `verify-status`, `verify-fold`, `verify-run`, `fake-beacon`, `share`.

- [ ] **Step 1: Write the failing test**

`src/app/b/[id]/result/reveal-plan.test.ts`:

```ts
import { it, expect } from "vitest";
import { dealDelays, dealGateScript, DEAL_MS, placeLabel, seenKey, topSpotText } from "./reveal-plan";

it("deals the order worst first so the top spot lands last, within about 1.5 s", () => {
  expect(dealDelays(3)).toEqual([240, 120, 0]);
  const fifty = dealDelays(50);
  expect(fifty[0]).toBe(Math.max(...fifty));
  expect(fifty[49]).toBe(0);
  expect(fifty[0]).toBeLessThanOrEqual(DEAL_MS);
  expect(dealDelays(1)).toEqual([0]);
});

it("names places and keys the once-per-viewer flag by break", () => {
  expect([1, 2, 3, 4, 11, 21].map(placeLabel)).toEqual(["Top spot", "2nd", "3rd", "4th", "11th", "21st"]);
  expect(topSpotText(7)).toBe("Top spot: line 7");
  expect(seenKey("b1")).toBe("breaks.reveal.b1");
});

it("gates the pre-paint hide on the same once-per-viewer key and on reduced motion", () => {
  const js = dealGateScript("b1");
  expect(js).toContain(JSON.stringify(seenKey("b1")));
  expect(js).toContain("prefers-reduced-motion: reduce");
  expect(js).toContain("dataset.deal");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test reveal-plan`
Expected: FAIL with `Failed to resolve import "./reveal-plan"`.

- [ ] **Step 3: Write the plan module and run the test to see it pass**

`src/app/b/[id]/result/reveal-plan.ts`:

```ts
import { ordinal } from "@/lib/list";

export const DEAL_MS = 1500;

/** Delay per rank position (0 = top spot). Worst rank is dealt first; the top spot last, then it lifts. */
export function dealDelays(count: number, total = DEAL_MS): number[] {
  if (count <= 1) return [0];
  const step = Math.min(120, total / count);
  return Array.from({ length: count }, (_, i) => Math.round((count - 1 - i) * step));
}

export const seenKey = (breakId: string) => `breaks.reveal.${breakId}`;
export const topSpotText = (line: number) => `Top spot: line ${line}`;
export const placeLabel = (rank: number) => (rank === 1 ? "Top spot" : ordinal(rank));

/**
 * Inline, pre-paint: mark <html data-deal> when this viewer will see the deal, so CSS hides the final state
 * until the deal layer covers it (no spoiler flash). Removed by Reveal, or after 4 s whatever happens.
 */
export function dealGateScript(breakId: string): string {
  return `try{if(!localStorage.getItem(${JSON.stringify(seenKey(breakId))})&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.deal="1";setTimeout(function(){delete document.documentElement.dataset.deal},4000)}}catch(e){}`;
}
```

Run: `pnpm test reveal-plan`
Expected: PASS.

- [ ] **Step 4: Rewrite the reveal, the verifier and the page**

Replace `src/app/b/[id]/result/reveal.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { dealDelays, DEAL_MS, placeLabel, seenKey, topSpotText } from "./reveal-plan";

type Award = { rank: number; winnerHandle: string | null; itemName: string | null };

/**
 * The final state is server-rendered and readable without JavaScript. The deal is a decorative,
 * aria-hidden layer played once per viewer (Replay afterwards); reduced motion skips it.
 */
export function Reveal({ breakId, ranking, handleOf, awards }: { breakId: string; ranking: number[]; handleOf: Record<number, string>; awards: Award[] }) {
  const [dealing, setDealing] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [canReplay, setCanReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const top = ranking[0];

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = true;
    try {
      seen = window.localStorage.getItem(seenKey(breakId)) === "1";
      window.localStorage.setItem(seenKey(breakId), "1");
    } catch {
      seen = true; // storage blocked: never force the animation
    }
    setCanReplay(true);
    if (!seen && !reduced) setDealing(true);
    setReady(true);
  }, [breakId]);

  // The deal layer (if any) is committed now: lift the pre-paint hide set by dealGateScript.
  useEffect(() => {
    if (ready) delete document.documentElement.dataset.deal;
  }, [ready]);

  useEffect(() => {
    if (!dealing) return;
    setLifted(false);
    const lift = window.setTimeout(() => setLifted(true), DEAL_MS);
    const end = window.setTimeout(() => setDealing(false), DEAL_MS + 700);
    return () => { window.clearTimeout(lift); window.clearTimeout(end); };
  }, [dealing]);

  const delays = dealDelays(ranking.length);
  const winner = awards.find((a) => a.rank === 1);
  const others = awards.filter((a) => a.rank > 1);
  const handle = (n: number) => (handleOf[n] ? `@${handleOf[n]}` : "");

  return (
    <section aria-labelledby="top-spot" className="relative mt-2">
      <div className="relative z-20 flex min-h-11 justify-end">
        {dealing
          ? <Button variant="text" onClick={() => setDealing(false)} data-testid="reveal-skip">Skip</Button>
          : canReplay && <Button variant="text" onClick={() => setDealing(true)} data-testid="reveal-replay">Replay the draw</Button>}
      </div>
      <div data-reveal-final>
      <h1 id="top-spot" data-testid="winner" className="font-condensed text-display font-semibold">{topSpotText(top)}</h1>
      <p className="text-headline font-semibold">{handle(top)}</p>
      {winner?.itemName && <p className="text-ink-2">Wins {winner.itemName}.</p>}
      {winner && !winner.itemName && <p className="text-ink-2">Picks one of the prize choices.</p>}
      <div aria-hidden className="mt-4 flex size-28 items-center justify-center bg-green font-condensed text-[56px] leading-none font-semibold text-card">{top}</div>
      {others.length > 0 && (
        <ul className="mt-4 space-y-1">
          {others.map((a) => <li key={a.rank}>{placeLabel(a.rank)} place: {a.winnerHandle ? `@${a.winnerHandle}` : "unknown"}{a.itemName ? `, ${a.itemName}` : ""}.</li>)}
        </ul>
      )}
      <h2 className="mt-6 text-headline font-semibold">Full order</h2>
      <ol className="mt-2 divide-y divide-wire-2 rounded-card border border-wire bg-card">
        {ranking.map((n, i) => (
          <li key={n} className="flex min-h-11 items-center gap-3 px-4 text-small">
            <span className="w-20 text-ink-2">{placeLabel(i + 1)}</span>
            <span className="w-16 font-condensed text-grid font-semibold tabular">Line {n}</span>
            <span className="min-w-0 truncate">{handle(n)}</span>
          </li>
        ))}
      </ol>
      </div>
      {dealing && (
        <div aria-hidden className="absolute inset-0 z-10 bg-paper pt-12">
          <div className="flex flex-wrap content-start gap-1">
            {ranking.map((n, i) => (
              <span
                key={n}
                className={`flex size-11 items-center justify-center border border-wire-strong font-condensed text-grid font-semibold ${i === 0 && lifted ? "animate-lift bg-green text-card" : "animate-deal bg-card text-ink"}`}
                style={{ animationDelay: i === 0 && lifted ? "0ms" : `${delays[i]}ms` }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
```

Replace `src/app/b/[id]/result/verify.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { verifyInputs, type PublicInputs } from "@/crypto/verify";
import { Button } from "@/components/button";
import { CopyField } from "@/components/copy-field";

export function Verify({ inputs, seed, relayUrl }: { inputs: PublicInputs; seed: string; relayUrl: string }) {
  const [state, setState] = useState<null | { ok: boolean; reasons: string[] }>(null);
  useEffect(() => { setState(verifyInputs(inputs)); }, [inputs]); // check automatically on load

  const status = state === null
    ? "Checking the draw in your browser."
    : state.ok
      ? "Checked. Locked before opening, mixed with public randomness."
      : "Check failed. The published inputs do not reproduce this result.";

  return (
    <section className="mt-6 space-y-3">
      <p data-testid="verify-status" role="status" className={state && !state.ok ? "font-semibold text-red" : "font-semibold"}>{status}</p>
      <details className="rounded-card border border-wire bg-card">
        <summary data-testid="verify-fold" className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Check it yourself</summary>
        <div className="space-y-4 px-4 pb-4">
          <p className="max-w-[65ch] text-small text-ink-2">This recomputes the draw in your browser from the published inputs. Anyone can do the same with the verify script.</p>
          <Button variant="secondary" onClick={() => setState(verifyInputs(inputs))} data-testid="verify-run">Run the check again</Button>
          {state && !state.ok && <ul className="list-disc pl-5 text-small text-red">{state.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <CopyField label="Commitment, shown before the break opened" value={inputs.seedCommitment ?? ""} />
          <CopyField label={`Public randomness, drand quicknet round ${inputs.beaconRound}`} value={inputs.beaconRandomness} />
          <CopyField label="Seed" value={seed} />
          <CopyField label="Secret, revealed after the draw" value={inputs.secret} />
          <p className="text-small">
            <a className="underline underline-offset-4" href={relayUrl} target="_blank" rel="noreferrer">See this round on a public relay</a>.{" "}
            <a className="underline underline-offset-4" href={`/b/${inputs.breakId}/result.json`}>Download the inputs</a>.{" "}
            <Link className="underline underline-offset-4" href="/legal/draw">How draws work</Link>.
          </p>
        </div>
      </details>
    </section>
  );
}
```

(`result.json` is a route handler, not a page, so a plain `<a>` is right there.)

Delete `src/app/b/[id]/result/share.tsx`. Replace `src/app/b/[id]/result/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
import { QUICKNET } from "@/crypto/beacon";
import type { PublicInputs } from "@/crypto/verify";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatDateTime } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { shareText } from "@/lib/share-text";
import { CopyButton } from "@/components/copy-button";
import { LocalTime } from "@/components/local-time";
import { dealGateScript } from "./reveal-plan";
import { Reveal } from "./reveal";
import { Verify } from "./verify";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  return res ? { title: `${res.breakTitle}: result`, description: `Top spot: line ${res.ranking[0]}. Check the draw yourself.` } : {};
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) notFound();
  const handleOf: Record<number, string> = Object.fromEntries(res.entries.map((e) => [e.number, e.handleAtDraw]));
  const publicInputs: PublicInputs = {
    breakId: id,
    version: res.draw.algorithmVersion,
    secret: res.draw.secret,
    beaconRound: res.draw.beaconRound,
    beaconRandomness: res.draw.beaconRandomness,
    entries: res.entries.map((e) => ({ number: e.number, ownerId: e.ownerId })),
    ranking: res.ranking,
    resultHash: res.draw.resultHash,
    seedCommitment: res.seedCommitment,
  };
  const top = res.ranking[0];
  const share = shareText({ state: "ran", topLine: top, topHandle: handleOf[top] || null, url: `${env().APP_URL}/b/${id}/result` });
  const relayUrl = `${QUICKNET.relays[0]}/${QUICKNET.chainHash}/public/${res.draw.beaconRound}`;
  const zone = await viewerZone();
  const when = (d: Date) => <LocalTime iso={d.toISOString()} fallback={formatDateTime(d, zone.tz, zone.labelled)} kind="datetime" />;

  return (
    <main className="mx-auto max-w-[600px] px-4 pb-8 sm:px-6">
      {/* Before first paint: hide the final state while the deal is about to play (no spoiler flash). */}
      <script dangerouslySetInnerHTML={{ __html: dealGateScript(id) }} />
      {res.draw.beaconSignature === "fake" && (
        <div role="alert" data-testid="fake-beacon" className="mt-4 rounded-card border border-red bg-card px-4 py-3 text-small text-red">
          Test draw. This used stand-in randomness, so it proves nothing. Real draws never show this box.
        </div>
      )}
      <p className="mt-4 text-small"><Link href={`/b/${id}`} className="underline underline-offset-4">{res.breakTitle}</Link></p>
      <Reveal breakId={id} ranking={res.ranking} handleOf={handleOf} awards={res.awards} />
      <p className="mt-4 max-w-[65ch] text-small text-ink-2">
        Ran {when(res.draw.createdAt)}. Requested by {res.hostHandle ? `@${res.hostHandle}` : "the host"}
        {res.request.onBehalfNote ? `, run by an admin: ${res.request.onBehalfNote}` : ""}.
      </p>
      <div className="mt-4"><CopyButton value={share} label="Share" copiedLabel="Copied" testId="share" /></div>
      <Verify inputs={publicInputs} seed={res.draw.seed} relayUrl={relayUrl} />
      <details className="mt-3 rounded-card border border-wire bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Entries</summary>
        <ol className="space-y-1 px-4 pb-4 text-small">
          {res.entries.map((e) => <li key={e.number}>Line {e.number}: {e.handleAtDraw ? `@${e.handleAtDraw}` : "unknown"}{e.isBonus ? ", bonus" : ""}</li>)}
        </ol>
      </details>
      {res.voided.length > 0 && (
        <section className="mt-4 text-small">
          <h2 className="font-semibold">Earlier draws, voided by an admin</h2>
          <ul className="mt-1 space-y-1 text-ink-2">
            {res.voided.map((v, i) => <li key={i}>{when(v.createdAt)}: {v.voidReason ?? "no reason recorded"}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
```

Append to `src/app/globals.css` (after the `@layer base` block):

```css
/* Result page: while <html data-deal> is set (pre-paint script), the final state waits under the deal layer. */
[data-deal] [data-reveal-final] {
  visibility: hidden;
}
```

- [ ] **Step 5: Key the result steps in the journey on the new markup (updates `e2e/journey-1.spec.ts`)**

In `e2e/journey-1.spec.ts` (the Task 13b version), replace the last four lines of the test

```ts
  await expect(host.getByTestId("winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
```
with
```ts
  await expect(host.getByTestId("winner")).toContainText("Top spot: line", { timeout: 15_000 }); // server-rendered (text is present even while the deal hides it)
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-fold").click();
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
```

- [ ] **Step 6: Optional: check by hand**

Only if you have a browser tool. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. Open a drawn break's result with JavaScript disabled: the winner, the green cell and the full order are all there. With JavaScript on, the first visit never shows the winner before the deal (no flash), deals the order and lifts the top spot; Skip ends it at once; a reload offers "Replay the draw". With "reduce motion" on, nothing animates or hides. "Ran …" reads in your own time. The test-draw box shows on draws made with `BEACON=fake`.

- [ ] **Step 7: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add "src/app/b/[id]/result" src/app/globals.css e2e/journey-1.spec.ts
git commit -m "feat(result): server-rendered winner, CSS deal, copy fields and share text"
```

---

### Task 15: Sign-in (code first, same tab) and onboarding (one screen) (model: opus)

Inside Facebook's in-app browser the emailed link opens another browser and loses the session, so the code is the main path: "We emailed you a 6-digit code. Type it here.", with the link as the fallback. Supabase errors map to fixed messages (deferred finding, Task 11b). After a code sign-in, someone who is not onboarded goes straight to onboarding with `next` kept, so a `?pick=` selection survives. Onboarding is one screen: the handle prefilled from the email, 18+ and terms, **Continue to claim** when arriving from a claim, display name optional and defaulting to the handle.

Deferred: live handle availability (Plan B; uniqueness is still enforced on submit), `/account` for editing the display name later (Plan B).

Model note: opus, because this task changes the auth redirect contract (`verifyOtp` sends callers who are not onboarded to onboarding; every `next` passes through `safeNext`).

**Files:**
- Create: `src/app/(auth)/login/messages.ts`, `src/app/(auth)/login/messages.test.ts`, `src/domain/users/suggest-handle.ts`, `src/domain/users/suggest-handle.test.ts`
- Modify: `src/domain/users/commands.ts:10` (export `RESERVED_HANDLES`)
- Modify: `src/app/(auth)/login/actions.ts` (whole file), `src/app/(auth)/login/form.tsx` (whole file)
- Modify: `src/app/onboarding/page.tsx`, `src/app/onboarding/form.tsx`, `src/app/onboarding/actions.ts` (whole files)
- Modify: `src/app/auth/callback/page.tsx` (whole file)

**Interfaces:**
- Consumes: `normalizeHandle`, `getCaller` (its `onboarded` flag decides "already set up"), `getSessionViewer` (the email for the prefill; no extra query), `safeNext`, `Button`, `Banner`.
- Produces:
  - `sendErrorMessage(e: { status?: number; code?: string } | null): string | null`; `codeHelp(email: string): string`.
  - `RESERVED_HANDLES: ReadonlySet<string>` exported from `src/domain/users/commands.ts`.
  - `suggestHandle(email: string): string` (always passes `normalizeHandle`).
  - `fromClaim(next: string): boolean` in `suggest-handle.ts` (true when `next` carries `pick=`).
  - `verifyOtp` returns `{ redirect: "/onboarding?next=…" }` for a caller who is not onboarded.
  - Ids: `login-send`, `login-verify`, `onboarding-submit`.

- [ ] **Step 1: Write the failing tests**

`src/app/(auth)/login/messages.test.ts`:

```ts
import { it, expect } from "vitest";
import { codeHelp, sendErrorMessage } from "./messages";

it("maps Supabase errors to fixed messages", () => {
  expect(sendErrorMessage(null)).toBeNull();
  expect(sendErrorMessage({ status: 429 })).toBe("Too many emails sent. Wait a minute, then try again.");
  expect(sendErrorMessage({ code: "over_email_send_rate_limit" })).toBe("Too many emails sent. Wait a minute, then try again.");
  expect(sendErrorMessage({ status: 500, code: "unexpected_failure" })).toBe("We couldn't send the email. Check the address and try again.");
});

it("leads with the code", () => {
  expect(codeHelp("a@b.co")).toBe("We emailed you a 6-digit code at a@b.co. Type it here.");
});
```

`src/domain/users/suggest-handle.test.ts`:

```ts
import { it, expect } from "vitest";
import { fromClaim, suggestHandle } from "./suggest-handle";
import { normalizeHandle } from "./commands";

it("derives a valid handle from the email", () => {
  expect(suggestHandle("Jim.Roberts+darts@example.com")).toBe("jim_roberts_darts");
  expect(suggestHandle("admin@example.com")).toBe("admin_1");
  expect(suggestHandle("jo@example.com")).toBe("jo_");
  expect(suggestHandle("@example.com")).toBe("user");
  expect(suggestHandle("averyveryverylongemailname@example.com")).toHaveLength(20);
  for (const e of ["Jim.Roberts+darts@example.com", "admin@example.com", "jo@example.com", "émile@example.com", "__@x.y"]) {
    expect(() => normalizeHandle(suggestHandle(e))).not.toThrow();
  }
});

it("knows when onboarding came from a claim", () => {
  expect(fromClaim("/b/123?pick=4,7")).toBe(true);
  expect(fromClaim("/b/123")).toBe(false);
  expect(fromClaim("/")).toBe(false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test login/messages suggest-handle`
Expected: FAIL with `Failed to resolve import "./messages"` and `Failed to resolve import "./suggest-handle"`.

- [ ] **Step 3: Implement**

In `src/domain/users/commands.ts`, replace line 10 with:

```ts
export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["admin", "administrator", "host", "support", "breaks", "system", "mod", "moderator", "staff", "help", "me"]);
const RESERVED = RESERVED_HANDLES;
```

`src/domain/users/suggest-handle.ts`:

```ts
import { RESERVED_HANDLES } from "./commands";

/** Prefill for onboarding: the email's local part shaped to [a-z0-9_]{3,20}, never a reserved name. */
export function suggestHandle(email: string): string {
  const local = (email.split("@")[0] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let h = local.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
  if (!h) h = "user";
  if (h.length < 3) h = h.padEnd(3, "_");
  if (RESERVED_HANDLES.has(h)) h = `${h}_1`.slice(0, 20);
  return h;
}

/** Onboarding reached from a claim keeps the lines: its `next` carries ?pick=. */
export function fromClaim(next: string): boolean {
  try {
    return new URL(next, "http://x").searchParams.has("pick");
  } catch {
    return false;
  }
}
```

`src/app/(auth)/login/messages.ts`:

```ts
/** Never echo provider error text to people; say what happened and what to do. */
export function sendErrorMessage(e: { status?: number; code?: string } | null): string | null {
  if (!e) return null;
  if (e.status === 429 || e.code === "over_email_send_rate_limit") return "Too many emails sent. Wait a minute, then try again.";
  return "We couldn't send the email. Check the address and try again.";
}

export const codeHelp = (email: string) => `We emailed you a 6-digit code at ${email}. Type it here.`;
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test login/messages src/domain/users`
Expected: PASS (the existing `normalizeHandle` tests still pass).

- [ ] **Step 5: Rewrite sign-in**

Replace `src/app/(auth)/login/actions.ts` with:

```ts
"use server";
import { z } from "zod";
import { createServerSupabase } from "@/auth/supabase";
import { getCaller } from "@/auth/session";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { sendErrorMessage } from "./messages";

const emailSchema = z.object({ email: z.string().email() });
export async function sendMagicLink(_: unknown, form: FormData) {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "Check the email address." };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) console.error("sign-in email failed", error.status, error.code);
  const message = sendErrorMessage(error ? { status: error.status, code: error.code } : null);
  return message ? { error: message } : { sent: true, email: parsed.data.email };
}

const otpSchema = z.object({ email: z.string().email(), token: z.string().regex(/^\d{6}$/) });
export async function verifyOtp(_: unknown, form: FormData) {
  const parsed = otpSchema.safeParse({ email: form.get("email"), token: form.get("token") });
  if (!parsed.success) return { error: "Type the 6-digit code from the email." };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or ask for a new one." };
  // Same rule as the link flow (auth/callback): new accounts set up first, keeping `next` (and any ?pick=).
  const caller = await getCaller();
  if (caller && !caller.onboarded) return { redirect: `/onboarding?next=${encodeURIComponent(next)}` };
  return { redirect: next };
}
```

Replace `src/app/(auth)/login/form.tsx` with:

```tsx
"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendMagicLink, verifyOtp } from "./actions";
import { Button } from "@/components/button";
import { Banner } from "@/components/banner";
import { codeHelp } from "./messages";

type SendState = { error?: string; sent?: boolean; email?: string } | null;
type VerifyState = { error?: string; redirect?: string } | null;

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const router = useRouter();
  const [sent, send, sending] = useActionState<SendState, FormData>(sendMagicLink, null);
  const [verified, verify, verifying] = useActionState<VerifyState, FormData>(verifyOtp, null);
  useEffect(() => { if (verified?.redirect) { router.replace(verified.redirect); router.refresh(); } }, [verified, router]);

  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Sign in</h1>
      {linkError && <div className="mt-3"><Banner tone="error" role="alert">That link expired or opened in another browser. Ask for a new code below.</Banner></div>}
      {!sent?.sent ? (
        <form key="send" action={send} className="mt-4 space-y-3">
          <p className="text-ink-2">Type your email. We&apos;ll send you a 6-digit code.</p>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email" className="block text-small font-semibold">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" className={field} />
          <Button type="submit" full disabled={sending} data-testid="login-send">{sending ? "Sending" : "Email me a code"}</Button>
          {sent?.error && <p role="alert" className="text-small text-red">{sent.error}</p>}
        </form>
      ) : (
        <form key="verify" action={verify} className="mt-4 space-y-3">
          <p>{codeHelp(sent.email ?? "your address")}</p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <label htmlFor="token" className="block text-small font-semibold">Code</label>
          <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className={`${field} text-center font-condensed text-[28px] tracking-[0.3em]`} />
          <Button type="submit" full disabled={verifying} data-testid="login-verify">Continue</Button>
          {verified?.error && <p role="alert" className="text-small text-red">{verified.error}</p>}
          <p className="text-small text-ink-2">The email also has a link. If it opens in another browser, come back here and type the code.</p>
          <Button variant="text" onClick={() => window.location.assign(`/login?next=${encodeURIComponent(next)}`)}>Use a different email</Button>
        </form>
      )}
    </main>
  );
}
```

Replace `src/app/auth/callback/page.tsx` with:

```tsx
import Link from "next/link";
import { exchange } from "./actions";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/button";

export default async function CallbackPage({ searchParams }: { searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }> }) {
  const { code, token_hash, type, next } = await searchParams;
  const nextPath = safeNext(next);
  if (!code && !token_hash) {
    return (
      <main className="mx-auto max-w-[400px] px-4 py-6">
        <p>This sign-in link is incomplete. <Link href="/login" className="underline underline-offset-4">Ask for a new code</Link>.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">You&apos;re almost in</h1>
      <form action={exchange} className="mt-4">
        {code && <input type="hidden" name="code" value={code} />}
        {token_hash && <input type="hidden" name="token_hash" value={token_hash} />}
        {type && <input type="hidden" name="type" value={type} />}
        <input type="hidden" name="next" value={nextPath} />
        <Button type="submit" full>Continue to Breaks</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Rewrite onboarding**

Replace `src/app/onboarding/actions.ts` with:

```ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { action } from "@/lib/action";
import { hashIp } from "@/lib/ip-hash";
import { safeNext } from "@/lib/safe-next";
import { completeOnboarding } from "@/domain/users/commands";

const schema = z.object({ handle: z.string(), displayName: z.string().optional(), ageConfirmed: z.literal("on").optional(), acceptedTerms: z.literal("on").optional() });

export async function finishOnboarding(_: unknown, form: FormData) {
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Fill in your handle and tick both boxes." };
  const next = safeNext(form.get("next"));
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = ip ? hashIp(ip) : undefined;
  // Display name defaults to the handle; it can be changed later.
  const displayName = p.data.displayName?.trim() || p.data.handle.trim();
  const r = await action((tx, caller) => completeOnboarding(tx, caller, { handle: p.data.handle, displayName, ageConfirmed: p.data.ageConfirmed === "on", acceptedTerms: p.data.acceptedTerms === "on", ipHash }));
  if (!r.ok) return { error: r.message };
  redirect(next);
}
```

Replace `src/app/onboarding/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { OnboardingForm } from "./form";
import { safeNext } from "@/lib/safe-next";
import { getCaller } from "@/auth/session";
import { getSessionViewer } from "@/auth/viewer";
import { fromClaim, suggestHandle } from "@/domain/users/suggest-handle";

export const metadata = { title: "Your handle" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  const viewer = await getSessionViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  // "Already set up" means onboarded (handle, display name and age), the same test the break page uses to send
  // people here; testing the handle alone would loop a half-set-up account between the two pages.
  const caller = await getCaller();
  if (caller?.onboarded) redirect(nextPath);
  return <OnboardingForm next={nextPath} suggested={suggestHandle(viewer.email)} claiming={fromClaim(nextPath)} />;
}
```

Replace `src/app/onboarding/form.tsx` with:

```tsx
"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { finishOnboarding } from "./actions";
import { Button } from "@/components/button";

type State = { error?: string } | null;
const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";

export function OnboardingForm({ next, suggested, claiming }: { next: string; suggested: string; claiming: boolean }) {
  const [state, submit, pending] = useActionState<State, FormData>(finishOnboarding, null);
  const [showName, setShowName] = useState(!claiming);
  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Your handle</h1>
      <p className="mt-1 text-ink-2">Pick a handle. Hosts and buyers see this name.</p>
      <form action={submit} className="mt-4 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1">
          <label htmlFor="handle" className="block text-small font-semibold">Handle</label>
          <input id="handle" name="handle" required defaultValue={suggested} pattern="[A-Za-z0-9_]{3,20}" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-help" className={field} />
          <p id="handle-help" className="text-small text-ink-2">3 to 20 letters, numbers or underscores.</p>
        </div>
        {showName ? (
          <div className="space-y-1">
            <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
            <input id="displayName" name="displayName" maxLength={40} placeholder="Leave blank to use your handle" className={field} />
          </div>
        ) : (
          <Button variant="text" onClick={() => setShowName(true)}>Add a display name</Button>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="ageConfirmed" required className="size-5 accent-[var(--ink)]" /> I am 18 or older
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="acceptedTerms" required className="size-5 accent-[var(--ink)]" />
          <span>I accept the <Link className="underline underline-offset-4" href="/legal/terms">terms</Link></span>
        </label>
        <Button type="submit" full disabled={pending} data-testid="onboarding-submit">{claiming ? "Continue to claim" : "Continue"}</Button>
        {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Optional: check by hand**

Only if you have a browser tool and Mailpit. Start `pnpm dev` in the background, stop it afterwards (see the :3000 rule), and report this check as not performed if you cannot do it. Never block on it. With Mailpit (http://127.0.0.1:54324): sign out, select two lines on an open break, tap "Sign in to claim 2 lines", get the code, type it in the same tab: onboarding shows the handle prefilled and "Continue to claim"; continuing lands on the break with both lines still selected. A second sign-in with an onboarded account goes straight back. Requesting codes quickly shows "Too many emails sent. Wait a minute, then try again."

- [ ] **Step 8: Run everything (required)**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e`
Expected: green (the journey and the layout spec sign in through `/test/login`, which sets a handle, display name and age, so they skip onboarding).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(auth)/login" src/app/auth/callback/page.tsx src/app/onboarding src/domain/users
git commit -m "feat(auth): code-first sign-in and one-screen onboarding that keeps the pick"
```

---

### Task 16: Composer, host list and the copy audit (model: sonnet)

The composer becomes one grouped screen: Prize ("Top spot gets" with **Add a choice** and **Add 2nd place**), Lines (stepper 2–50, price, hours to pay, lines per person, picking mode with its three values), Payment (handles, instructions), About (description), a preview strip ("50 lines at $5 = $250" and the grid shape), and **Save draft** / **Open break**. The composer starts from the host's last break (lines, price, hours to pay, lines per person, picking mode, payment instructions), because hosts run several breaks a week (D§5.6); the read is a domain query, `lastBreakDefaults`. It fixes the composer's deferred findings (Task 12): field-named error messages, a blank hours field defaulting to 24, handles that can be cleared, the price minimum, and a price typed as "$5" or "1,000". `/host` gets the board look (grouping by state is Plan B) and reads its rows through `listHostBreaks`. A copy audit test then pins the plan's writing and styling rules across the codebase, and the README records the UI conventions.

Deferred: photo field (storage plan), draft editing (Plan B; a saved draft can be opened from Host tools).

**This task updates `e2e/journey-1.spec.ts` and `e2e/layout.spec.ts`** (the composer's prize is `input[name=prize1]`, and opening needs a payment handle).

**Files:**
- Create: `src/app/host/new/parse.ts`, `src/app/host/new/parse.test.ts`, `src/app/host/new/preview.ts`, `src/lib/copy-audit.test.ts`
- Modify: `src/domain/breaks/queries.ts` (line 1 imports; append `lastBreakDefaults`, `hostPaymentHandles`, `listHostBreaks`), `src/domain/breaks/queries.test.ts` (append two blocks)
- Modify: `src/app/host/new/actions.ts`, `src/app/host/new/form.tsx`, `src/app/host/new/page.tsx`, `src/app/host/page.tsx` (whole files)
- Modify: `src/app/page.tsx:5`, `src/app/legal/terms/page.tsx:7` (default palette classes), `README.md` (append a section), `e2e/journey-1.spec.ts` and `e2e/layout.spec.ts` (one line each becomes two)

**Interfaces:**
- Consumes: `CreateDraftInput`, `createDraft`, `openBreak`, `MAX_LINES`, `CLAIM_MODES`, `ClaimMode`, `action`, `Stepper`, `GridPreview`, `Button`, `ButtonLink`, `StatusPill`, `FillBar`, `formatMoney`, `makeUser`, `makeBreak`, `openBreakWithLines`, `claimLines`, `markPaid`.
- Produces:
  - `src/app/host/new/parse.ts` (server side; zod and domain imports): `type ComposerParsed = { ok: true; input: CreateDraftInput; open: boolean } | { ok: false; error: string }`; `parseComposer(form: FormData): ComposerParsed` (a price typed as "$5" or "1,000" is read as 5 and 1000).
  - `src/app/host/new/preview.ts` (client-safe; imports only `formatMoney`): `previewText(lineCount: number, price: string): string`.
  - `src/domain/breaks/queries.ts`: `type LastBreakDefaults = { lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null; claimMode: ClaimMode; paymentInstructions: string }`; `lastBreakDefaults(tx: Tx, hostId: string): Promise<LastBreakDefaults | null>` (the host's most recent main break); `hostPaymentHandles(tx: Tx, hostId: string): Promise<{ venmo?: string; paypal?: string }>`; `type HostBreakRow = { id: string; title: string; status: string; lineCount: number; paid: number; taken: number }`; `listHostBreaks(tx: Tx, hostId: string): Promise<HostBreakRow[]>` (newest first; counts over numbered lines).
  - `<ComposerForm handles maxLines defaults />` (`maxLines: number` passed from the page; `defaults: LastBreakDefaults | null`; the client form imports domain code with `import type` only).
  - Server action `saveBreak(prev: ComposerState, form: FormData): Promise<ComposerState>` (replaces `createAndOpen`).
  - Ids: `composer-open`, `composer-draft`.

- [ ] **Step 1: Write the failing tests**

`src/app/host/new/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseComposer } from "./parse";
import { previewText } from "./preview";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  return f;
}
const base = { title: "Taylor Chronos", prize1: "Chronos 22g", lineCount: "50", linePrice: "5", venmo: "@Jim-R", intent: "open" };

describe("parseComposer", () => {
  it("fills defaults: 24 hours, no per-person limit, pick or random", () => {
    const r = parseComposer(form({ ...base, paymentWindowHours: "", maxLinesPerUser: "" }));
    expect(r).toMatchObject({ ok: true, open: true, input: { lineCount: 50, linePriceCents: 500, paymentWindowHours: 24, maxLinesPerUser: null, claimMode: "pick_or_random", items: [{ name: "Chronos 22g" }], secondPlace: [] } });
  });
  it("reads choices, 2nd place, cents and the picking mode", () => {
    const r = parseComposer(form({ ...base, prize1: ["Chronos 22g", " ", "Chronos 24g"], prize2: "Flight pack", linePrice: "5.5", claimMode: "straight", maxLinesPerUser: "3" }));
    expect(r).toMatchObject({ ok: true, input: { linePriceCents: 550, claimMode: "straight", maxLinesPerUser: 3, items: [{ name: "Chronos 22g" }, { name: "Chronos 24g" }], secondPlace: [{ name: "Flight pack" }] } });
  });
  it("reads a price typed with a dollar sign or a thousands comma", () => {
    expect(parseComposer(form({ ...base, linePrice: "$5" }))).toMatchObject({ ok: true, input: { linePriceCents: 500 } });
    expect(parseComposer(form({ ...base, linePrice: "1,000" }))).toMatchObject({ ok: true, input: { linePriceCents: 100000 } });
  });
  it("always passes the handles so a host can clear them", () => {
    const r = parseComposer(form({ ...base, venmo: "", paypal: "", intent: "draft" }));
    expect(r).toMatchObject({ ok: true, open: false, input: { paymentHandles: { venmo: "", paypal: "" } } });
  });
  it("names the field in every error", () => {
    expect(parseComposer(form({ ...base, title: " " }))).toEqual({ ok: false, error: "Add a title" });
    expect(parseComposer(form({ ...base, linePrice: "0" }))).toEqual({ ok: false, error: "Price per line: more than $0" });
    expect(parseComposer(form({ ...base, linePrice: "" }))).toEqual({ ok: false, error: "Price per line: enter an amount" });
    expect(parseComposer(form({ ...base, lineCount: "51" }))).toEqual({ ok: false, error: "Lines: at most 50" });
    expect(parseComposer(form({ ...base, lineCount: "1" }))).toEqual({ ok: false, error: "Lines: at least 2" });
    expect(parseComposer(form({ ...base, claimMode: "bogus" }))).toEqual({ ok: false, error: "Choose how buyers get lines" });
    expect(parseComposer(form({ ...base, prize1: "" }))).toEqual({ ok: false, error: "Top spot: name the prize" });
    expect(parseComposer(form({ ...base, venmo: "", paypal: "", paymentInstructions: "" }))).toEqual({ ok: false, error: "Add a Venmo or PayPal handle, or payment instructions, before opening" });
  });
});

describe("previewText", () => {
  it("multiplies lines by price", () => {
    expect(previewText(50, "5")).toBe("50 lines at $5 = $250");
    expect(previewText(12, "20.5")).toBe("12 lines at $20.50 = $246");
    expect(previewText(12, "")).toBe("");
  });
});
```

`src/lib/copy-audit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/app", "src/components", "src/lib", "src/domain"];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(p) && !/\.test\.ts$/.test(p) ? [p] : [];
  });
}
const sources = ROOTS.flatMap(files).map((path) => ({ path, text: readFileSync(path, "utf8") }));
const tsx = sources.filter((s) => s.path.endsWith(".tsx"));
const hits = (re: RegExp, list = sources) => list.filter((s) => re.test(s.text)).map((s) => s.path);

describe("copy audit (design §6, §7)", () => {
  it("has no middle dots", () => expect(hits(/·/)).toEqual([]));
  it("uses gambling-neutral words only", () => expect(hits(/\b(raffle|lottery|odds|bets?|betting|tickets?|jackpot|lucky)\b/i)).toEqual([]));
  it("formats UI money with formatMoney (toFixed only in money.ts and pay-links.ts)", () => {
    expect(hits(/toFixed\(2\)/).filter((p) => !/src\/lib\/(money|pay-links)\.ts$/.test(p))).toEqual([]);
  });
  it("uses the board tokens, not Tailwind's default palette", () => {
    expect(hits(/\b(?:bg|text|border|ring|outline|decoration|fill|stroke|divide|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/, tsx)).toEqual([]);
    expect(hits(/\b(?:bg|text|border)-(?:white|black)\b/, tsx)).toEqual([]);
  });
  it("never builds class names at runtime", () => expect(hits(/(?:grid-cols|col-span|row-span)-\$\{/)).toEqual([]));
  it("has no exclamation marks in JSX text", () => {
    // Prose "!" follows a letter and ends a word; code ("!==", "!x", "x!.y") does not match.
    const bad = tsx.filter((s) => [...s.text.matchAll(/>([^<>{}]+)</g)].some((m) => /[A-Za-z]!(\s|$)/.test(m[1]))).map((s) => s.path);
    expect(bad).toEqual([]);
  });
  it("has no tailwind config file", () => expect(hits(/tailwind\.config/)).toEqual([]));
  it("never imports formatCents into a component (UI money is formatMoney)", () => expect(hits(/\bformatCents\(/, tsx)).toEqual([]));
  it("has no caps labels", () => expect(hits(/\buppercase\b|tracking-widest/, tsx)).toEqual([]));
  it("never labels a button Submit", () => expect(hits(/>\s*Submit\s*</, tsx)).toEqual([]));
  it("uses the community's state words in UI code, never Filled, Drawing or Drawn", () => {
    const ui = sources.filter((s) => /^src\/(components|app)\//.test(s.path));
    expect(hits(/["'`](Filled|Drawing|Drawn)\b/, ui)).toEqual([]);
  });
  it("has no bullet characters", () => expect(hits(/•/)).toEqual([]));
  it("has no exclamation marks in .ts string literals", () => {
    const ts = sources.filter((s) => s.path.endsWith(".ts"));
    expect(hits(/["'`][^"'`\n]*[A-Za-z]![\s"'`]/, ts)).toEqual([]);
  });
});
```

Append to `src/domain/breaks/queries.test.ts` (and extend its imports: `import { randomUUID } from "node:crypto";`, `import { sql } from "drizzle-orm";`, `openBreakWithLines` beside `makeUser, makeBreak`, `import { claimLines, markPaid } from "@/domain/lines/commands";`, `import type { Caller } from "@/domain/types";`, and `lastBreakDefaults, listHostBreaks` beside `hostTrust`):

```ts
const asCaller = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("lastBreakDefaults", () => {
  it("returns the settings of the host's most recent main break, or null", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      expect(await lastBreakDefaults(tx, host.id)).toBeNull();
      await makeBreak(tx, { hostId: host.id, lineCount: 20, linePriceCents: 500 });
      const later = await makeBreak(tx, { hostId: host.id, lineCount: 30, linePriceCents: 750, claimMode: "straight" });
      // Same transaction, same now(): push the second one later explicitly (a draft, so nothing is frozen).
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute', payment_window_hours = 12, max_lines_per_user = 3, payment_instructions = 'Venmo only.' where id = ${later.id}`);
      expect(await lastBreakDefaults(tx, host.id)).toEqual({ lineCount: 30, linePriceCents: 750, paymentWindowHours: 12, maxLinesPerUser: 3, claimMode: "straight", paymentInstructions: "Venmo only." });
    });
  });
});

describe("listHostBreaks", () => {
  it("lists the host's breaks newest first, with paid and taken counts", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const older = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(a), { breakId: older.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, asCaller(host, "host"), { breakId: older.id, number: 1, expectedOwnerId: a.id });
      const newer = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute' where id = ${newer.id}`);
      const rows = await listHostBreaks(tx, host.id);
      expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
      expect(rows[1]).toMatchObject({ status: "open", lineCount: 4, paid: 1, taken: 1 });
      expect(rows[0]).toMatchObject({ status: "draft", paid: 0, taken: 0 });
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/app/host/new/parse.test.ts src/lib/copy-audit.test.ts src/domain/breaks/queries.test.ts`
Expected: FAIL. `parse.test.ts` fails with `Failed to resolve import "./parse"`; `queries.test.ts` fails with `TypeError: lastBreakDefaults is not a function` and `TypeError: listHostBreaks is not a function`; the audit's default-palette test lists `src/app/page.tsx`, `src/app/legal/terms/page.tsx`, `src/app/host/page.tsx` (`text-neutral-600`, `bg-black`, and a middle dot for the "has no middle dots" test) and the old composer `src/app/host/new/form.tsx` and `page.tsx` (`text-red-600`, `bg-black`).

- [ ] **Step 3: Write the parser, the preview and the queries, and run their tests to see them pass**

`src/app/host/new/parse.ts`:

```ts
import { z } from "zod";
import { MAX_LINES, CLAIM_MODES } from "@/domain/breaks/rules";
import type { CreateDraftInput } from "@/domain/breaks/commands";

const schema = z.object({
  title: z.string().trim().min(1, "Add a title").max(120, "Title: at most 120 characters"),
  description: z.string().max(2000, "Description: at most 2000 characters"),
  lineCount: z.coerce.number({ error: "Lines: enter a number" }).int("Lines: whole numbers only").min(2, "Lines: at least 2").max(MAX_LINES, `Lines: at most ${MAX_LINES}`),
  linePrice: z.coerce.number({ error: "Price per line: enter an amount" }).positive("Price per line: more than $0").max(10000, "Price per line: at most $10,000"),
  paymentWindowHours: z.coerce.number({ error: "Hours to pay: enter a number" }).int("Hours to pay: whole hours").min(1, "Hours to pay: at least 1").max(336, "Hours to pay: at most 336"),
  maxLinesPerUser: z.coerce.number({ error: "Lines per person: enter a number" }).int("Lines per person: whole numbers").min(1, "Lines per person: at least 1").max(MAX_LINES, `Lines per person: at most ${MAX_LINES}`).nullable(),
  claimMode: z.enum(CLAIM_MODES, { error: "Choose how buyers get lines" }),
  paymentInstructions: z.string().max(500, "Payment instructions: at most 500 characters"),
  venmo: z.string().max(60, "Venmo: at most 60 characters"),
  paypal: z.string().max(60, "PayPal: at most 60 characters"),
  prize1: z.array(z.string().max(120, "Top spot: at most 120 characters")),
  prize2: z.string().max(120, "2nd place: at most 120 characters"),
  intent: z.enum(["draft", "open"]),
});

export type ComposerParsed = { ok: true; input: CreateDraftInput; open: boolean } | { ok: false; error: string };

/** FormData → createDraft input. Blank optional numbers take their defaults instead of becoming 0. */
export function parseComposer(form: FormData): ComposerParsed {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const optional = (k: string) => (text(k).trim() === "" ? undefined : text(k));
  const raw = {
    title: text("title"),
    description: text("description"),
    lineCount: optional("lineCount"),
    linePrice: optional("linePrice")?.replace(/[$,\s]/g, "") || undefined, // "$5" and "1,000" are fine
    paymentWindowHours: optional("paymentWindowHours") ?? 24,
    maxLinesPerUser: optional("maxLinesPerUser") ?? null,
    claimMode: text("claimMode") || "pick_or_random",
    paymentInstructions: text("paymentInstructions"),
    venmo: text("venmo"),
    paypal: text("paypal"),
    prize1: form.getAll("prize1").filter((v): v is string => typeof v === "string"),
    prize2: text("prize2"),
    intent: text("intent") || "open",
  };
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again" };
  const d = p.data;
  const items = d.prize1.map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  if (items.length === 0) return { ok: false, error: "Top spot: name the prize" };
  const venmo = d.venmo.trim();
  const paypal = d.paypal.trim();
  if (d.intent === "open" && !venmo && !paypal && !d.paymentInstructions.trim()) {
    return { ok: false, error: "Add a Venmo or PayPal handle, or payment instructions, before opening" };
  }
  return {
    ok: true,
    open: d.intent === "open",
    input: {
      title: d.title,
      description: d.description,
      lineCount: d.lineCount,
      linePriceCents: Math.round(d.linePrice * 100),
      paymentWindowHours: d.paymentWindowHours,
      maxLinesPerUser: d.maxLinesPerUser,
      claimMode: d.claimMode,
      paymentInstructions: d.paymentInstructions,
      paymentHandles: { venmo, paypal }, // always sent, so clearing a handle sticks
      items,
      secondPlace: d.prize2.trim() ? [{ name: d.prize2.trim() }] : [],
    },
  };
}

```

`src/app/host/new/preview.ts` (imported by the client form, so it imports nothing but `formatMoney`):

```ts
import { formatMoney } from "@/lib/money";

export function previewText(lineCount: number, price: string): string {
  const cleaned = price.replace(/[$,\s]/g, "");
  const dollars = Number(cleaned);
  if (!cleaned || !Number.isFinite(dollars) || dollars <= 0) return "";
  const cents = Math.round(dollars * 100);
  return `${lineCount} lines at ${formatMoney(cents)} = ${formatMoney(lineCount * cents)}`;
}
```

In `src/domain/breaks/queries.ts`, change line 1 to

```ts
import { sql, eq, asc, desc, and } from "drizzle-orm";
```
add after the schema import

```ts
import type { ClaimMode } from "./rules";
```
and append:

```ts
export type LastBreakDefaults = {
  lineCount: number; linePriceCents: number; paymentWindowHours: number; maxLinesPerUser: number | null;
  claimMode: ClaimMode; paymentInstructions: string;
};

/** The host's most recent main break: the composer starts from it (design §5.6, hosts run several a week). */
export async function lastBreakDefaults(tx: Tx, hostId: string): Promise<LastBreakDefaults | null> {
  const [r] = await tx.select({
    lineCount: breaks.lineCount, linePriceCents: breaks.linePriceCents, paymentWindowHours: breaks.paymentWindowHours,
    maxLinesPerUser: breaks.maxLinesPerUser, claimMode: breaks.claimMode, paymentInstructions: breaks.paymentInstructions,
  }).from(breaks).where(and(eq(breaks.hostId, hostId), eq(breaks.kind, "main"))).orderBy(desc(breaks.createdAt), desc(breaks.id)).limit(1);
  return r ?? null;
}

export async function hostPaymentHandles(tx: Tx, hostId: string): Promise<{ venmo?: string; paypal?: string }> {
  const [r] = await tx.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, hostId));
  return r?.paymentHandles ?? {};
}

export type HostBreakRow = { id: string; title: string; status: string; lineCount: number; paid: number; taken: number };

/** The host's breaks for /host, newest first. Paid and taken (claimed, unpaid) count numbered lines only. */
export async function listHostBreaks(tx: Tx, hostId: string): Promise<HostBreakRow[]> {
  return tx.select({
    id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})`,
    taken: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.owner_id is not null and l.paid_at is null and l.number <= ${breaks.lineCount})`,
  }).from(breaks).where(eq(breaks.hostId, hostId)).orderBy(desc(breaks.createdAt), desc(breaks.id));
}
```

Run: `pnpm test src/app/host/new/parse.test.ts src/domain/breaks/queries.test.ts`
Expected: PASS.

- [ ] **Step 4: Rewrite the composer**

Replace `src/app/host/new/actions.ts` with:

```ts
"use server";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { createDraft, openBreak } from "@/domain/breaks/commands";
import { parseComposer } from "./parse";

export type ComposerState = { error?: string } | null;

/** Save draft or Open break, decided by the submit button's `intent`. */
export async function saveBreak(_: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = parseComposer(form);
  if (!parsed.ok) return { error: parsed.error };
  const r = await action(async (tx, caller) => {
    const { breakId } = await createDraft(tx, caller, parsed.input);
    if (parsed.open) await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message };
  redirect(`/b/${r.data}`);
}
```

Replace `src/app/host/new/form.tsx` with:

```tsx
"use client";
import { useActionState, useState } from "react";
import { saveBreak, type ComposerState } from "./actions";
import { previewText } from "./preview";
import type { LastBreakDefaults } from "@/domain/breaks/queries";
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
  handles: { venmo?: string; paypal?: string };
  /** MAX_LINES, passed from the server page so this client file imports no domain values. */
  maxLines: number;
  /** The host's last break, or null for a first break. */
  defaults: LastBreakDefaults | null;
};

export function ComposerForm({ handles, maxLines, defaults }: Props) {
  const [state, submit, pending] = useActionState<ComposerState, FormData>(saveBreak, null);
  const [lineCount, setLineCount] = useState(defaults?.lineCount ?? 50);
  const [price, setPrice] = useState(defaults ? String(defaults.linePriceCents / 100) : "5");
  const mode = defaults?.claimMode ?? "pick_or_random";
  const [choices, setChoices] = useState<string[]>([""]);
  const [second, setSecond] = useState(false);
  const preview = previewText(lineCount, price);

  return (
    <form action={submit} className="mt-4 space-y-8">
      <div className="space-y-1">
        <label htmlFor="title" className={label}>Title</label>
        <input id="title" name="title" required maxLength={120} placeholder="Target Phil Taylor Chronos" className={field} />
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
            <input id="prize2" name="prize2" maxLength={120} placeholder="Flight pack" className={field} />
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
            <input id="paymentWindowHours" name="paymentWindowHours" inputMode="numeric" placeholder="24" defaultValue={defaults ? String(defaults.paymentWindowHours) : ""} className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="maxLinesPerUser" className={label}>Lines per person</label>
            <input id="maxLinesPerUser" name="maxLinesPerUser" inputMode="numeric" placeholder="No limit" defaultValue={defaults?.maxLinesPerUser != null ? String(defaults.maxLinesPerUser) : ""} className={field} />
          </div>
        </div>
        <div role="radiogroup" aria-label="Picking mode" className="space-y-2">
          <span className={label}>Picking mode</span>
          {MODES.map((m) => (
            <label key={m.value} className="flex min-h-11 items-start gap-3 rounded-input border border-wire-strong bg-card px-3 py-2">
              <input type="radio" name="claimMode" value={m.value} defaultChecked={m.value === mode} className="mt-1 size-5 accent-[var(--ink)]" />
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
            <input id="venmo" name="venmo" defaultValue={handles.venmo ?? ""} placeholder="@Jim-Roberts-36" autoCapitalize="none" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="paypal" className={label}>PayPal.me name</label>
            <input id="paypal" name="paypal" defaultValue={handles.paypal ?? ""} placeholder="JamesRoberts603182" autoCapitalize="none" className={field} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="paymentInstructions" className={label}>Payment instructions</label>
          <textarea id="paymentInstructions" name="paymentInstructions" rows={2} maxLength={500} placeholder="Leave blank to build them from your handles" defaultValue={defaults?.paymentInstructions ?? ""} className={area} />
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-headline font-semibold">About</legend>
        <label htmlFor="description" className="sr-only">Description</label>
        <textarea id="description" name="description" rows={3} maxLength={2000} placeholder="Condition, shipping, anything buyers should know" className={area} />
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

(React 19 builds the action's `FormData` with the submitter, so `intent` carries the button that was pressed.)

Replace `src/app/host/new/page.tsx` with:

```tsx
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { hostPaymentHandles, lastBreakDefaults } from "@/domain/breaks/queries";
import { MAX_LINES } from "@/domain/breaks/rules";
import { ComposerForm } from "./form";

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
      <ComposerForm handles={handles} maxLines={MAX_LINES} defaults={defaults} />
    </main>
  );
}
```

- [ ] **Step 5: Restyle the host list and clear the last default classes**

Replace `src/app/host/page.tsx` with:

```tsx
import Link from "next/link";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { listHostBreaks } from "@/domain/breaks/queries";
import { ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { FillBar } from "@/components/fill-bar";

export const metadata = { title: "Your breaks" };

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const rows = await db.transaction((tx) => listHostBreaks(tx, caller.id));

  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-condensed text-title font-semibold">Your breaks</h1>
        <ButtonLink href="/host/new">New break</ButtonLink>
      </div>
      <ul className="mt-4 divide-y divide-wire rounded-card border border-wire bg-card">
        {rows.map((b) => (
          <li key={b.id}>
            <Link href={`/b/${b.id}`} className="block space-y-2 px-4 py-3">
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold">{b.title}</span>
                <StatusPill status={b.status} />
              </span>
              <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} />
              <span className="block text-small text-ink-2 tabular">{b.paid} of {b.lineCount} paid</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-3 text-small text-ink-2">No breaks yet. Start one with New break.</li>}
      </ul>
    </main>
  );
}
```

In `src/app/page.tsx`, replace line 5

```tsx
      <p className="mt-2 text-sm text-neutral-600">Group buys for darts gear, with a draw you can check.</p>
```
with
```tsx
      <p className="mt-2 text-small text-ink-2">Group buys for darts gear, with a draw you can check.</p>
```

In `src/app/legal/terms/page.tsx`, replace line 7

```tsx
      <p className="mt-1 text-xs text-gray-500">Version {TERMS_VERSION} (placeholder)</p>
```
with
```tsx
      <p className="mt-1 text-micro text-ink-2">Version {TERMS_VERSION} (placeholder)</p>
```

- [ ] **Step 6: Fill the new composer in both e2e specs (updates `e2e/journey-1.spec.ts` and `e2e/layout.spec.ts`)**

In `e2e/journey-1.spec.ts` (the Task 14 version), replace

```ts
  await host.fill("textarea[name=items]", "Chronos 22g");
```
with
```ts
  await host.fill("input[name=prize1]", "Chronos 22g");
  await host.fill("input[name=venmo]", "@e2e-host");
```

In `e2e/layout.spec.ts` (the Task 13b version), make the same replacement in `beforeAll`. Both specs sign in a fresh host per run, so `lastBreakDefaults` is null there and the composer starts from its plain defaults; `fill("input[name=lineCount]", "50")` types into the stepper, whose draft commits a complete in-range number at once.

- [ ] **Step 7: Record the conventions in the README**

Append to `README.md`, before `## Spec and plans`:

```markdown
## UI conventions

- Tokens live in `src/app/tokens.css` (raw colours on `:root`, mapped through Tailwind v4 `@theme inline`); there is no `tailwind.config`. Use `bg-paper`, `text-ink-2`, `border-wire-strong`, `font-condensed`, `text-title` and friends, never Tailwind's default palette.
- Shared components are in `src/components/`. In development, `/dev/components` shows them all (it 404s in production).
- Grid shaping, holder visibility and the host-only overdue flag are decided in `src/domain/breaks/grid.ts` on the server; client components receive the result.
- Copy rules (no middle dots or bullets, gambling-neutral words, `formatMoney` for money, no default palette, no caps labels, no "Submit", the community's state words, no exclamation marks) are enforced by `src/lib/copy-audit.test.ts`.
- Absolute times reach the browser as ISO plus a server fallback and render through `LocalTime` in the viewer's zone; the `tz` cookie lets the server's fallback match.
- `e2e/layout.spec.ts` pins the break page's pixel budget, grid columns, cell names, focus return and bar hiding in a real browser.
- The Playwright journey keys on `data-testid`; keep ids stable when restyling.
- Migration `0001_claim_mode` adds the picking mode (`pick_or_random`, `pick_only`, `straight`); `allow_random_claims` is kept in step and will be dropped later.
```

- [ ] **Step 8: Run everything**

Run: `lsof -ti tcp:3000 | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm test:e2e`
Expected: green, including the copy audit and both e2e specs. If the audit lists a file, fix the copy or class it names (do not loosen the test).

- [ ] **Step 9: Commit**

```bash
git add src/app/host src/app/page.tsx src/app/legal/terms/page.tsx src/domain/breaks/queries.ts src/domain/breaks/queries.test.ts src/lib/copy-audit.test.ts README.md e2e/journey-1.spec.ts e2e/layout.spec.ts
git commit -m "feat(host): grouped composer with picking mode and preview, and a copy audit"
```

---

## Self-review

Spec coverage (UI design sections in Plan A scope → task):

| Design item | Task |
|---|---|
| §3 colour, type, space, shadow, motion tokens; `@theme inline`; fonts; measured contrast (green number on black ruled out) | 6 (deal/lift keyframes used in 14) |
| §4 columns by tier and width (10 above 640 in the 552 grid box), container queries, bonus row, `touch-action`, fixed cell sizes | 7 (pinned in a browser by `e2e/layout.spec.ts`, 11b) |
| §4 state table (hatch, dashed sent, ink paid with a white number, corner flag, selected inset + check at 600, overdue red + "!" with an ink number, reserved double rule + "m", bonus "+", bonus plus mine) | 7 |
| §4 host-only overdue, holders gated | 2 (cell names checked in a browser, 11b) |
| §4 legend, "You have …", draw-lock line | 7, 10 |
| §4 Grid / List toggle (on the small-line row), list gated by server labels, tap a taken cell for a "Line 7: @mike, paid" popover announced politely | 11b |
| §4 accessibility: `role="group"`, button cells, `aria-pressed` / `aria-disabled`, names, skip link, arrow keys, live region, focus ring never clipped, `scroll-padding-bottom` equal to the measured bar | 6, 7, 8, 11b |
| §4 selection naming lines, limit note, taken recovery, 20 s refresh (open, closed, running draw), immediate claim, partial outcome + random instead, Pick for me stepper, Claim N random, Take the last N, picking modes, straight fill, sign in with `?pick=` (also from an empty bar) | 1, 2, 11a, 11b, 12, 15 |
| §5.1 header, tab bar (hidden on `/b/*` and below two destinations), footer, safe areas, `viewport-fit`, `dvh`, bar hides on focus | 6, 8, 9 |
| §5.4 media row with grid thumbnail, title, "19 of 50 left", status pill, host line with interim trust, Share by state, Host tools, details fold | 10, 11b |
| §5.4 pixel budget at 390 × 664 | 11b (`e2e/layout.spec.ts`) |
| §5.4 sticky bar table | 11a, 11b (Cancelled "Refund received" deferred) |
| §5.4 claim sheet: outcome (provisional amount if props lag), mini cells, copy handle first, deep links with fallback, "Leave the note blank.", commitment, I've sent it + hint, deadline in local time, I'll pay later, give back, focus return | 8, 12 |
| §5.5 ledger: "19 of 50 paid" + fill bar, search, chips, fixed order, Paid in place ("Mark … paid") + Undo 8 s + snackbar, expanded row per-line marking, Release confirm, Add a bonus line with allowance, sticky bottom action, table above 640 | 4, 13a, 13b (payment name, Remind, Mark shipped, `/host` strip deferred) |
| §5.6 composer: prize group, Add a choice, Add 2nd place, stepper 2–50, picking mode, handles, instructions, preview strip, Save draft / Open break, defaults from the host's last break | 1, 16 (photo, draft editing deferred) |
| §5.7 result: SSR winner with no spoiler flash, deal once with Skip and Replay, "Checked …", Check it yourself fold with copy fields, share text, test-draw box, draw time in local time | 14 |
| §5.10 code-first sign-in, one-screen onboarding, Continue to claim, display name defaults to handle | 15 (live availability deferred) |
| §6 writing rules, share text by state, no internal status words | 3, 10, 14, 16 (audit) |
| §7 quality floor: 44 pt (segmented control included), focus ring, reduced motion, native dialog, no-JS reading, server-computed relative times, local absolute times | 5, 6, 7, 8, 14 |
| §9 domain additions: `claim_mode`, ledger query, single-transaction release, `formatMoney`, viewer query, drafts private (checked before any other query), typed failures, `shapeGrid` | 1, 2, 3, 4, 5 |

Gaps closed while reviewing: `addBonusLine` had no backend (added to Task 4); `defaultPaymentInstructions` produced middle dots (fixed in Task 1); the OTP path skipped onboarding, which would have lost `?pick=` (Task 15); `NOT_ONBOARDED` claims now route to onboarding with the pick (Task 11b).

Name and type consistency checked across tasks: `shapeGrid` / `GridCell` / `Allowance` / `isHostView` / `canViewBreak` (2 → 7, 10, 11a, 11b, 12, 13b), `toFailure` / `ActionResult.details.taken` (3 → 11b), `notOpenMessage` (3), `ledgerByBuyer` / `LedgerBuyer` / `BuyerStatus` (4 → 13a, 13b), `releaseBuyer`, `unpaidForBuyer`, `addBonus`, `giveBack` (4 → 12, 13b), `formatMoney` (5 → 10–16), `formatDeadline(d, now, tz, labelled)`, `formatDateTime(d, tz, labelled)`, `formatMonthYear(d, tz?)`, `formatLate`, `daysSince`, `viewerZone`, `LocalTime`, `TzCookie` (5 → 6, 9, 10, 11b, 12, 13b, 14), `SessionUser` / `getSessionUser` / `toViewer` / `getSessionViewer` / `Viewer` from `@/auth/viewer` (5 → 9, 15), `Grid`, `Cell`, `MiniCells`, `CellData`, `cellLabel`, `cellStateWord` (7 → 10–13b), `Sheet` (focus fallback), `StickyBar` (`--bar-total`), `Stepper` (`draftValue`, `commitDraft`), `CopyButton`, `CopyField`, `FilterChips`, `Toast` (`offset`) (8 → 11b–16), `showTabBar(path, role)` (9), `shareText` / `pageShare` (10 → 11b, 12, 13b, 14), `claimBar` (idle `signIn`), `outcomeText`, `type Owe` with `payByIso` / `payByFallback` (11a, 11b → 12), `releaseText` (12), `markPaidLabel`, `LEDGER_COLS` (13a, 13b), `dealGateScript` (14), `lastBreakDefaults`, `hostPaymentHandles`, `listHostBreaks`, `previewText` from `preview.ts` (16), test ids (5 → 16).

Review Focus pins: 1 → Task 2 "overdue and holders are host-only"; 2 and 3 → Task 11a `selection.test.ts`; 4 → Task 4 `ledgerByBuyer` test and Task 13a `matchesFilter`; 5 → Task 5 `time.test.ts` ("decides the day in the viewer's zone, not UTC (Review Focus 5)", parameterised over America/New_York and Europe/London, plus the labelled fallback test).

Sequencing (every task leaves lint, test, build and e2e green for the next):

| Task | lint | test | build | e2e | Note |
|---|---|---|---|---|---|
| 1 | run | run (+ concurrency) | run | run | Composer maps its checkbox to `claimMode`; the page reads `claimMode`. |
| 2 | run | run | via e2e | run | Old `Grid` unchanged; drafts 404 before other queries. |
| 3 | run | run | not run (no UI change) | not run | Messages change; no test asserts the old text. |
| 4 | run | run (+ concurrency) | via e2e | run | Old panel still shows Paid and "· sent"; `release` removed with its only caller. |
| 5 | run | run | via e2e | run | Journey re-keyed on test ids; `TzCookie` mounted in today's layout. |
| 6 | run | run | run (Google Fonts, else BLOCKED: fonts) | run | Layout keeps `TzCookie`. |
| 7, 8 | run | run | run | not run (nothing mounts the primitives) | `/dev/components` 404s in production. |
| 9 | run | run | run | run | Tab bar hides for members and on `/b/*`. |
| 10 | run | run | via e2e | run | Old `grid.tsx` deleted with its only importer; `see-result` kept until 11b. |
| 11a | run | run | run | run | Pure modules only; nothing imports them yet. |
| 11b | run | run | via e2e | run (journey + new layout spec) | `claim-panel.tsx` deleted; `see-result` becomes `bar-result` in the same commit. |
| 12 | run | run | via e2e | run | `payLinks` shape change; its only old consumer went in 11b. |
| 13a | run | run | run | run | Pure module only. |
| 13b | run | run | via e2e | run | `host-panel` and `release-prompt{,.test}` deleted; journey opens `host-tools`. |
| 14 | run | run | via e2e | run | `share.tsx` deleted; journey's last lines replaced exactly. |
| 15 | run | run | via e2e | run | Journey and layout spec sign in via `/test/login`, so onboarding is untouched. |
| 16 | run | run (copy audit passes only after this task's own fixes) | run | run | Both e2e specs fill the new composer. |

## Panel revisions

Applied after the three-reviewer panel (D = design fidelity, X = executability, C = code review), following the project lead's rulings.

- Header: recorded design errata (paid number white, selected weight 600, bonus allowance per platform spec); branch rule; "Before any task" environment preflight (X Must 4, X Should 12, D Must 8, D Should 6).
- Global Constraints: kill anything on :3000 before every e2e (X Must 1); fonts BLOCKED rule with the `next-font-loader` CI symptom (X Must 2, C 12); manual checks optional and non-blocking, every "check by hand" step relabelled (X Must 3); local absolute times via `LocalTime` (D Must 4); selected weight erratum (D Should 6).
- Deferred list gains payment name on ledger rows and in search (D Should 13, deferred to Plan B by ruling).
- Task 1: fixtures `import type { ClaimMode }` (C convention 1); real failure messages in Step 4 (C 7); BLOCKED: migration on a prompt or SQL mismatch, plus the journal `when` check (C 9, X sequencing); Step 14 adds `test:concurrency`, build and e2e (X Should 6); "Choose how buyers get lines" (D copy audit).
- Task 2: `canViewBreak` before any further query (C 8); real failure text (C 7).
- Task 3: `notOpenMessage` replaces internal status words in `NotOpen` and its test (D Must 7); class lines found by text, not shifted line numbers (X Should 2).
- Task 4: `unmarkPaid` skips bonus lines, with a test (C 2); bonus allowance `max(1, floor(N/10))` stated in Interfaces as the platform rule (ruling); `test:concurrency` in Step 10 (X Should 6); real failure text (C 7).
- Task 5: zone-parameterised `time.ts` with `DEFAULT_TZ`, `zoneLabel`, `resolveZone`; `LocalTime`; `TzCookie` in the root layout; `viewerZone` server reader; tests over America/New_York and Europe/London across 2026-10-25 (D Must 4); `syncUser` returns email and `getSessionViewer` reuses it, `getViewer` dropped (C 11); page drafts check first (C 8).
- Task 6: `["card", "ink"]` text pair and a green-on-ink < 4.5 guard (D Must 8); `--bar-total` drives body and scroll padding (D Must 2b); the bar's own inputs no longer hide it (C 1, X Should 3); fonts BLOCKED in Step 8 (X Must 2).
- Task 7: paid numbers always white, overdue numbers ink (D Must 8, D Should 7); `focus-visible:z-10` (D Must 6); bonus plus mine keeps both marks (D Should 8); ten columns at 540 in a 552 box (D Must 3); selected weight comment (D Should 6).
- Task 8: `draftValue` / `commitDraft` and a draft-keeping Stepper (C 6); 44 pt segmented control (D Must 5); measuring client `StickyBar` (D Must 2b); `Toast` `offset` (D Should 4); `Sheet` focus falls back to the bar (D Should 21); gallery check for the full focus ring and the in-bar stepper, optional (D Must 6, X Must 3).
- Task 9: no one-item tab bar (`showTabBar(path, role)`) (D Should 15); `Viewer` from `@/auth/viewer`; layout keeps `TzCookie`.
- Task 10: `running` share text and `pageShare` hiding Share for draft and cancelled (D Should 5); `max-w-[65ch]` prose (D Should 20); typed `frame-copy` signatures (X Should 10); `host-tools` noted as an id (X minor); drafts checked first (C 8).
- Task 11 split into 11a (pure `selection` and `claim-bar-state`, gates green) and 11b (UI) (X Should 1); idle bar `signIn` for signed-out viewers (D Should 14); no stepper or hint for a host allowed 0 lines (C 5); `bar-summary` listed (X Should 8); small line and Grid | List share one row, "See the result" moves to `bar-result` (D Must 1a, 1b); stacked "Pick for me" label, Take the last N leads (D Must 2a); anchored taken-cell popover announced politely (D Should 3); auto-refresh while `filled` (C 10); `owe` carries `payByIso` / `payByFallback` (D Must 4d); new `e2e/layout.spec.ts` for pixel budget, columns and handle-free names (D Must 1c, D Should 17).
- Task 12: model "sonnet (code given verbatim)" (X Should 11); deadline through `LocalTime` with `releaseText` (D Must 4d); provisional `pendingOwe` (D Should 18); journey uses `bar-result`; layout spec adds Escape and focus return (D Should 17, D Should 21); typed `pay-copy` signatures (X Should 10).
- Task 13 split into 13a (pure `ledger-view`, gates green) and 13b (UI) (X Should 1 optional split); `markPaidLabel` accessible name (D Should 11); table above 640 with a header row (D Should 1); sticky bottom action (D Should 2); snackbar `offset="sheet-action"` (D Should 4); layout spec adds ledger-search bar hiding (D Should 17); typed signatures (X Should 10).
- Task 14: draw times through `LocalTime` (D Must 4d); pre-paint `dealGateScript` and `[data-deal] [data-reveal-final]` hide against the spoiler flash (D Should 9); plain test-draw copy (D Should 10); `max-w-[65ch]` on the explanation and verifier text (D Should 20).
- Task 15: model opus (X Should 11); `̀-ͯ` escape (X Should 4, C 4); onboarding checks `caller?.onboarded` (X Should 5, C 3); `h1` "Your handle" (D Should 19).
- Task 16: `previewText` in client-safe `preview.ts` and `maxLines` passed as a prop (X Should 7); composer defaults from the host's last break via `lastBreakDefaults` (D Should 12); `listHostBreaks` and `hostPaymentHandles` in `src/domain/breaks/queries.ts` (C convention 2); copy audit gains formatCents-in-tsx, caps labels, Submit, Filled/Drawing/Drawn, bullets and `.ts` exclamation rules (D Should 16); expected audit failures list `src/app/host/page.tsx` (X Should 9); "$5" and "1,000" prices accepted (D copy audit); both e2e specs fill the new composer (D Should 17).
- Every "run to verify it fails" expectation now states the real runtime failure (C 7); Self-review gains the sequencing table for 11a/11b/13a/13b.
