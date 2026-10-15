# Plan C: Mosaic (the second visual direction: flights, kits, the lamp, the throw) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board wears the Mosaic design: every member has a flight (eight colours by four dart shapes) that marks their lines and floods them with colour when the host ticks them paid; the host's two-colour kit is the board's surround; a warm lamp brightens in five steps as the board fills; a claim lands like a dart, a refused "I've sent it" stays visible, and the draw reads out its audited order then throws one straight dart per place onto the real board with the caller's banner; strangers and every public surface see the board in the host's kit, never a flight; the checkout count ("12 to go"), the host record and a plain history are the only game structure.

**Architecture:** Domain first. A pure `flights.ts` module (palette, inks, kits, `heatStep`) and migration `0004_flights_kits` (random flight per user with backfill, kit columns, `draws.verified_at`). The holder gate stays `shapeGrid`: a cell's `flight` is set under exactly the condition that sets its `holder`; `ogModel`, the feed, the landing hero and the host profile carry only `kit` and `heat`. New board tokens under new names in `tokens.css` (no existing token changes value); Big Shoulders Display 800 as the fifth font file. Cell renders every §5 state shape-first from CSS custom properties (`--face`, `--num`, `--fc`); a pure `cellMoments(prev, next)` diff decides which cells animate and nothing animates on mount; the reveal is rewritten around a neutral dart tween (`requestAnimationFrame`, the only JS motion) and `reveal-plan.ts` totals pinned by tests. Paper surfaces (ledger, sheets, forms, `/host`, the claim bar) are untouched except the checkout count.

**Tech Stack:** Next.js 15.5 (App Router, TypeScript, `next/og` `ImageResponse`), React 19.1, Tailwind CSS 4 via `@tailwindcss/postcss`, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres-js, Supabase (Postgres, Auth), zod 4, vitest 5 (Vite 8, oxc), Playwright + `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-14-mosaic-ui-design.md` (the authority for every value in this plan; its §1.1 lists what it replaces in `2026-10-13-ui-design.md`, its §12 is the task outline this plan expands), with `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md` (positioning, legal, §12 admin) and `docs/superpowers/plans/2026-10-14-plan-b-deferred-findings.md` (the items the spec's §12 names as carried into this plan).

## Global Constraints

Plan B's Global Constraints (`docs/superpowers/plans/2026-10-14-plan-b-new-pages.md`, the section of that name, including the Plan A list it carries) apply verbatim, except the eight lines the Mosaic spec §1.1 amends. Those read, from this plan on:

- **Holders:** "Holders, flights and the overdue flag are decided only in `shapeGrid` on the server. A cell carries a `flight` under exactly the condition that it carries a `holder` (the break's host, an admin, or a viewer who holds a line in that break). Thumbnails (`feedThumbs`) are built from line state only and carry no flight. The link preview's guarantee is that `ogModel(page, now)` emits per cell only number, tone and, on won cells, place, plus the break's `kit` and `heat`; no holder, handle or flight (pinned by `og.test.ts`); the route never reads the session."
- **Green and red:** "Green keeps its two meanings on paper: mine, and money the host confirmed. On the board, mine is the ink-and-cream inner ring; green marks the 2nd and 3rd place rings; red marks the top-spot ring and the host-view overdue edge. Flight faces are never red or green."
- **Motion:** "No animation library. Per-cell motion is CSS on `transform` and `opacity` only, driven by `cellMoments` so nothing animates on mount; the one JS tween is the reveal's dart path (`requestAnimationFrame`). Everything honours `prefers-reduced-motion` (instant, or a fade of at most 150 ms)."
- **Selected cells:** "Selected cells show the four ink corner brackets, number at weight 600; 700 is not loaded."
- **Fonts:** `next/font/google` Barlow (400, 500, 600), Barlow Condensed (600) and Big Shoulders Display (800): five files. The BLOCKED: fonts rule applies to all three families.
- **Host profile public data** gains the host record counts (spec §9) and the kit.
- **Tokens:** board tokens are new names (`--board-wall`, `--board-wall-2`, `--board-cream`, `--board-cream-2`, `--board-ink`, `--board-ink-2`, `--board-steel`, `--board-ring`, `--board-text`, `--board-text-2`, `--board-text-3`, `--lamp-0` … `--lamp-4`, `--kit-dark`, `--kit-light`) in `src/app/tokens.css`; no existing token changes value; `--paper` stays `#F6F5F1`.
- **Copy:** the count everywhere is "N to go"; "19 of 50 left", "Filling fast", "Almost full", "You hold …" are retired; no caps chips; "the host's", never "his"; state words never in JSX text; "hot", "cold", "streak", "level", "lucky", "winnings", "You won" never appear (copy audit, Task 17).

Added for this plan:

- **Play borrows from darts as a sport, never from games of chance** (spec §3): no wheels, reels, flips, scratches, near misses, confetti, sound, flashing, odds, gold, levels, streaks, win totals, "You won!". Nothing ever travels across the cells (no sweep, ripple, chase); only the targeted cell changes during a throw; the uniform dim and lift are one class on the board. Flights and kits are a fixed free set: none is earned, unlocked, rare, bought or tied to results.
- **Every value comes from the spec.** Hex colours, sizes, durations, easings, copy strings and test ids in this plan are copied from `2026-10-14-mosaic-ui-design.md`; if a step and the spec disagree, the spec wins and the implementer reports the mismatch.
- **One migration, forward-only:** `0004_flights_kits` via `pnpm db:generate --name flights_kits` plus hand SQL after a `--> statement-breakpoint`; applied to `postgres`, `breaks_test` and `breaks_e2e`. Any prompt: BLOCKED: migration.
- **Render tests** (`src/components/grid/render.test.ts` and new files) use `createElement` and `react-dom/server`, test files `.ts`, and assert accessible names, ARIA state and the shape token of each state, never snapshots.
- **E2E privacy assertion:** no cell rendered for an anonymous or non-holder viewer carries `data-flight` or a `--fc` custom property; no `aria-label` ever contains a handle or a flight name.
- **Gates per task:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (sandbox off), `pnpm test:concurrency` where lines or draws change, full e2e on `breaks_e2e` (sandbox off; `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill` first; the webServer builds). Known flake rule: none tolerated; a failing spec is fixed or reported.

## Review Focus

1. **A stranger can never reconstruct a buyer.** For an open break where alice holds a sent line, an overdue line and a bonus line, the anonymous and signed-in-non-holder views of `shapeGrid` carry `flight: null` and `holder: null` on every cell; `ogModel` output contains no "alice", no user id and no flight key; the feed and landing payloads contain no flight. A holder's view carries alice's flight but her handle only in the popover data the first design already allows. Tests in Task 5 (`grid.test.ts` "sets a flight exactly where it sets a holder"; `og.test.ts` "has no flight key"; `feed.test.ts` "carries kit and heat and no flight") and the Task 20 e2e privacy assertion.
2. **Nothing animates on mount or on a view switch.** A buyer who holds no line loads a part-filled board (kit view), claims two lines, and the page re-renders in the member view: `cellMoments` yields a "drop" for exactly the two claimed cells and "still" for every other cell, including the twelve cells that changed from kit faces to flight faces. A refresh with four new third-party claims yields four "others-in" and nothing else; a refresh with nine yields eight "others-in" and one "still" (the cap). Tests in Task 9 (`cell-moments.test.ts`) and the Task 20 e2e ("the first claim as a stranger animates only the claimed cells").
3. **Every flight face reads at 5:1 or better against its number ink, at every cell size.** `flights.test.ts` (Task 2) computes the contrast of all eight faces against their ink and fails below 5.0; `tokens.test.ts` (Task 1) pins cream text on the wall at 8:1 and the steel wire at 3:1 on cream. Render tests (Task 7) check that the number ink switches per tier.
4. **The reveal's totals and order.** `reveal-plan.ts` (Task 12) returns the timeline for one, two and three prizes: set-up at most 1.8 s, order 3rd → 2nd → top, beats 300 / 300 / 800 ms, one prize about 1.6 s and three about 4.2 s after the read-out, Skip ending it within one frame with every bull in the DOM; the deal layer `aria-hidden`; the calls announced politely; no candidate number ever cycles (the chips appear once each, in order, and never change). Tests pin the totals and the order; the e2e checks Skip and Replay.
5. **The board at 50 lines on a 390 × 664 phone.** Eight columns of 44.75 px cells inside the 12 px frame drawn into the gutters; the won cell under 56 px uses the 26 px disc, 10 px glyph and 14 px top-spot number; the sticky bar and the "You have …" line stay in their budget. Render tests at 390 and 360 widths (Task 8) and the `/dev/components` density check in the Task 20 e2e.

## Cross-task contracts (every writer and implementer uses these names)

```ts
// src/domain/flights.ts (Task 2)
export type FlightColour = "petrol" | "blue" | "plum" | "yellow" | "orange" | "lime" | "sky" | "pink";
export type FlightShape = "standard" | "kite" | "slim" | "pear";
export type Flight = { colour: FlightColour; shape: FlightShape };
export const FLIGHT_COLOURS: Record<FlightColour, { face: string; ink: "#FBF7EE" | "#15130F"; tier: "dark" | "light"; label: string }>;
export const FLIGHT_SHAPES: Record<FlightShape, { path: string; label: string }>; // 16 × 16 box
export const DARK_COLOURS: readonly FlightColour[]; // petrol, blue, plum
export const LIGHT_COLOURS: readonly FlightColour[]; // yellow, orange, lime, sky, pink
export type Kit = { dark: FlightColour; light: FlightColour };
export const DEFAULT_KIT: Kit; // { dark: "blue", light: "yellow" }
export function kitFor(p: { kitDark: string | null; kitLight: string | null }): Kit;
export function isFlightColour(s: string): s is FlightColour; export function isFlightShape(s: string): s is FlightShape;
export function flightOf(u: { flightColour: string; flightShape: string }): Flight;
export type HeatStep = 0 | 1 | 2 | 3 | 4;
export function heatStep(open: number, total: number, closed: boolean): HeatStep;
export const LAMP: Record<HeatStep, string>; // the five rgba strings of spec §4
export const TOKENS: { boardWall: "#17161A"; boardCream: "#FBF7EE"; boardInk: "#15130F"; boardSteel: "#7A7D84"; boardRing: "#0F0E0C"; /* … every board hex once */ };

// src/domain/breaks/grid.ts (Task 5): GridCell gains
flight: Flight | null;      // set under exactly the condition that sets holder
// The break page model and GridModel gain
kit: Kit; heat: HeatStep;

// src/domain/breaks/og.ts (Task 5/14): OgModel gains
kit: Kit; heat: HeatStep; cells: { number: number; tone: OgTone; place?: 1 | 2 | 3 }[]; hostedBy: string; // hostedBy from Task 14
// ogModel(page: OgPage, now, draw?: OgDraw | null): OgPage is line state only, with optional `places` (Task 5); OgDraw = { ranAt } (Task 14)

// src/domain/users/commands.ts (Task 4)
updateFlight(tx, caller, { colour: FlightColour; shape: FlightShape }): Promise<void>;   // event user.profile_updated { changed: ["flight"] }
// src/domain/breaks/commands.ts (Task 4, beside savePaymentHandles)
updateHostKit(tx, caller, { dark: FlightColour; light: FlightColour }): Promise<void>;  // event host.profile_updated { changed: ["kit"] }
// Events carry the changed field names, never the values (recorded ruling 10).

// src/domain/draws/places.ts (Task 6; Tasks 12, 14 and 15 import it)
export type Place = 1 | 2 | 3;
export function placesOf(ranking: readonly number[], prizeRanks: readonly number[]): { number: number; place: Place }[];

// src/components/grid/cell-moments.ts (Task 9)
export type CellMoment = "drop" | "others-in" | "sent" | "paid" | "paid-undo" | "release" | "sniped" | "still";
export function cellMoments(prev: readonly CellView[], next: readonly CellView[], o: { view: "member" | "kit"; prevView: "member" | "kit"; mine: readonly number[] }): Map<number, CellMoment>;
// caps: at most 5 "drop" and 5 "sent", at most 8 "others-in", "paid", "paid-undo", "release" and "sniped" per diff, 8 cells in all (the
// viewer's own first); a line-count change and any unlisted transition return "still"; across a view change only the viewer's own
// "drop" (kit to member) and own "release" (member to kit) play (recorded ruling 21).

// src/app/b/[id]/result/reveal-plan.ts (Task 12)
export type RevealStep = { at: number; kind: "lights-down" | "chip" | "beat" | "throw" | "land" | "call" | "lights-up"; number?: number; place?: 1 | 2 | 3 };
export function revealPlan(order: readonly number[], places: 1 | 2 | 3, tokens?: DurationTokens): { steps: RevealStep[]; total: number }; // tokens default MOTION

// src/lib/motion.ts (Task 11): MOTION (ms numbers, one per token below), EASE, MOTION_VAR, EASE_VAR, prefersReducedMotion()
export type DurationTokens = { readonly [K in keyof typeof MOTION]: number };

// Motion tokens (spec §4 "Space, shape, motion"; CSS custom properties on :root, shipped by Task 1):
// --dur-press 70ms, --dur-unpress 120ms, --dur-drop 160ms, --dur-squash 80ms, --dur-settle 120ms, --dur-glint 220ms,
// --dur-others 120ms, --dur-sent 180ms, --dur-set 140ms, --dur-seat 100ms, --dur-release 200ms, --dur-strike 200ms,
// --dur-banner 180ms, --dur-lights 300ms, --dur-beat 300ms, --dur-beat-top 800ms, --dur-throw 260ms,
// --dur-throw-settle 140ms, --dur-shake 120ms, --dur-gap 550ms, --dur-lamp 600ms, --dur-reduced 150ms,
// --stagger-own 50ms, --stagger-others 30ms; --ease-in cubic-bezier(.55,0,1,.45), --ease-out cubic-bezier(.2,.7,.3,1),
// --ease-over cubic-bezier(.3,1.5,.5,1), --ease-inout ease-in-out.
// The read-out chips are min(30, 1500 / lines) ms apart, computed in reveal-plan.ts (not a token).

// Test ids (new): board-frame, lamp, legend, you-have, deal, caller, reveal-skip, reveal-replay, flight-picker,
// flight-<colour>-<shape>, kit-picker, kit-<dark>-<light>, host-record, flight-line (the "This is your flight" line).
// Cells keep cell-<n> and data-state; your own cells carry data-mine="true"; member-view cells add
// data-flight="<colour>-<shape>"; won cells carry data-won="1|2|3" (introduced by Task 7).
// Migration 0004 columns: users.flight_colour text NOT NULL, users.flight_shape text NOT NULL, users.flight_chosen_at
// timestamptz NULL, host_profiles.kit_dark text NULL, host_profiles.kit_light text NULL, draws.verified_at timestamptz NULL.
```

## Recorded rulings

1. Show mine does not ship in this plan; the "You have 4 and 11" line is plain text under the legend (spec §13).
2. Hosts may share a kit; the default kit is Blue with Yellow until `/host/new` nudges a host to pick (spec §13).
3. The lamp only brightens: one warm white in five alpha steps (spec §4 Heat).
4. The won cell is black with the cream bull disc in every view; place is the ring shape (double red for the top spot, single green for 2nd, dashed green for 3rd); no place word on the cell (spec §5).
5. The reveal plays on the result page only; the break page shows the "Draw starts" banner and "See the result" once run (spec §8).
6. The random default flight is a column default at row creation plus a backfill; `defaultFlight(userId)` by hash is banned (spec §10).
7. `draws.verified_at` is computed once when a draw is recorded (`verifyInputs` over its inputs) and backfilled by `scripts/verify-draws.ts`; the host record's "draws verified" is a count of it (spec §9, §10).
8. Fix loops for render tests, axe and the copy audit: one round, then record and move on (Plan B rule).
9. Kit columns and type use dark/light: `host_profiles.kit_dark` / `kit_light`, Drizzle `kitDark` / `kitLight`, `Kit = { dark, light }`, form fields `kitDark` / `kitLight`; the spec's §10 is amended to match.
10. Events carry changed-field names, never values: a flight change appends `user.profile_updated { changed: ["flight"] }`, a kit change `host.profile_updated { changed: ["kit"] }`.
11. Big Shoulders is one variable file: `Big_Shoulders` (next/font/google's export; there is no `Big_Shoulders_Display`) with `weight: "variable"` and `axes: ["opsz"]` (next/font accepts axes only on the variable weight), `preload: false`, `font-optical-sizing: auto`, and weight 800 set where it is used, so large titles get the Display cut. One file: the five-file budget holds.
12. The wall is opt-in: `data-wall` on a route's `<main>`, switched on by the task that restyles the route (Task 8 the break page, Task 13 the result page, Task 15 the feed, the landing page and the host profile).
13. The place rings on the cream disc are non-text marks: the 3:1 floor applies (green measures 4.98:1).
14. The collision rule takes the next shape cyclically from the holder's own in standard, pear, kite, slim; holders are ordered by their earliest `claimed_at` in the break, ties by owner id.
15. Error copy: "Choose one of the 32 flights", "Choose a dark colour and a light colour for your kit", "Only hosts have a kit". Shape labels: "Standard", "Kite", "Slim", "Pear".
16. Migration 0004 has no hand SQL for the random defaults (Postgres evaluates the volatile column default once per existing row, pinned by a test); the re-declared `draws_update_guard` allowing `verified_at` is its one hand SQL. `finaliseDraw` sets `verified_at` when it records a draw; `scripts/verify-draws.ts` backfills.
17. Places: `placesOf(ranking, prizeRanks)` (`src/domain/draws/places.ts`, Task 6) returns every prize rank of 1, 2 or 3 the break has with its line `ranking[rank - 1]`; a place with no prize is skipped. Task 5 carries the kit and heat on `listFeed` and the kit on `hostProfile`; Task 6 adds `latestRanBreak`'s places, kit, heat and cells, and pins the page model end to end.
18. The board: the frame wraps lines 1..N only; the bonus row is wired but unframed, its label 24 px under the board. The lamp reaches 32 px above and below and 16 px to each side (`LAMP_POSITION`, Task 8), 12 px on thumbnails; it is one fixed gradient whose step is its opacity, owned by `Grid` (`heat`, test id `lamp`).
19. Cell details: the 3rd-place dashed ring is four 60° arcs with 30° gaps; the cream glyph knockout is drawn on hatched cells only; your own won line keeps the yours ring and is named "Line 23, yours, top spot"; the sent mark sits 11 px below the centre; the number and the glyph sit at z-index 1 (the house-lights dim at 2, your own glyphs at 3 while it is down). Cell attributes: Task 3's `data-state`, `data-face`, `data-mine`, `data-bonus`, `data-overdue`, `data-selected`, `data-struck`, `data-ink` and `data-mark`, plus Task 7's `data-size`, `data-won`, `data-flight`, `data-glyph`, `data-ring`, `data-place` and the `bc-*` layer classes.
20. Legends and thumbnails: legend mini cells are 16 px, drawn in the viewer's first held flight (a host or admin with no line: a standard flight in the kit's dark colour). Board thumbnails (`GridPreview`) and card thumbnails (`KitThumb`, 96 and 112 px, the link preview's solid drawing) show no number, glyph or hatch: claimed cells carry a kit-light band, paid cells are kit dark, won cells are black with a cream disc at 48 %. Feed cards get no card face; the profile shows a decorative 16-cell open board at lamp step 0.
21. Moments: per-moment caps plus at most 8 cells at once, the viewer's own first; across a view change only the viewer's own drop (kit to member) and own release (member to kit) play. When the viewer's own last line goes, the released cells drain over `--dur-release` first, then the board re-renders in the kit view, still. The glint starts at landing; the pay sheet opens at the last landing or at 400 ms (the cap is kept in code and tests); the claim announcement says the provisional amount; "Board's full. Game on." renders only after hydration.
22. The caller banner is in flow: between the board and the legend on the break page, in a slot under the board on the result page; it drops 24 px on `--ease-over`; a banner that is not a call has a `--kit-dark` rule; a winner with no handle is called "Line 23 takes the top spot."; the result board's group label is "Lines".
23. The claim bar: "N to go" only while the break is open, the status pill on every bar; the Grid | List toggle sits under the "You have …" line; "Pay within 24 hours." leaves the media row and nothing is added to the pay sheet; `leftText` stays for the feed card and the OG caption until Tasks 15 and 14; `toGoText` lives in `frame-copy.ts` (Task 10); the bar is fed `shownOpen` from Task 11 on.
24. Paper stays paper: `MiniCells` (ledger, pay sheet) keep the first design's cell, moved verbatim to `PaperCell` (Task 7); `/me` draws your lines with the board `Cell` on the steel wire (`--wire-strong` overridden on the card, Task 18).
25. The link preview: no PNG byte snapshots (they differ across platforms). Task 14 pins `ogModel`'s JSON per status and kit, the route's 200 with a 1200 × 630 PNG (IHDR) for each status and its 404 for a draft; one PNG per status goes to `.superpowers/` for a by-eye check and is never committed. The double ring is two bands of `max(2, round(0.05 × cell))` with a `max(1, round(w / 2))` cream gap; the "Ran Oct 14" date is formatted in `DEFAULT_TZ`. Captions: "12 to go, $5 a line", "Ran Oct 14. Anyone can check the draw.".
26. `/account`: the 88 px preview cell shows Paid; the kit picker is two radio groups (`kitDark`, `kitLight`) with `kit-<dark>-<light>` on the framed four-cell preview (open, taken, paid, top spot); the `/host/new` nudge reads "Your boards wear the default kit, Blue with Yellow. Choose a kit in your account."; "This is your flight" shows while `flight_chosen_at` is null and the viewer held no line in the break before the claim (nothing new is stored).
27. The host record: "41 breaks run since Mar 2026. 40 draws verified." (`formatMonthYear`), "No breaks run yet." at zero, the verified count always shown; the profile drops "New host" (cards and the break page keep it); the ledger header gains the record (Task 15).
28. The feed: `FEED_CHIPS = ["newest", "almost"]`, the domain's `filling` sort left unused; the copy audit reads "near a kit" as the same copy segment or within two segments of it, and bans caps words with two allowlisted entries.
29. `/me`: "Unpaid." cards on a break that no longer asks for money say "Line 5 is not marked paid. Ask Jim about it."; Earlier is the plain history; `MyBreakCard`'s error, offline and disabled states are recorded as out of reach of render tests.
30. `/dev/components` opens in production only with `E2E_SECRET`; this plan's deferred-findings file is created by the first task that records into it; every Plan B amendment ends "(Amended by Plan C, Mosaic spec §1.1.)".

## Before any task

As Plan B's "Before any task", with `breaks_e2e` now required from Task 1 on (it exists; migrate it with `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate`). Execute in a worktree on a branch named `plan-c-mosaic`; never commit to `main`.

---

## Task map (writers expand each task below into full TDD steps; the stubs fix scope, files and interfaces)

| # | Task | Model | Depends on |
|---|---|---|---|
| 1 | Board tokens, fonts, theme-color | Sonnet | – |
| 2 | `flights.ts` with contrast and heat tests | Opus | – |
| 3 | Test selectors to `data-*` | Sonnet | – |
| 4 | Migration 0004, `updateFlight`, `updateHostKit`, `verify-draws` | Opus | 2 |
| 5 | The holder gate: `GridCell.flight`, kit and heat in models, `ogModel`, privacy tests | Opus | 2, 4 |
| 6 | Kit and heat through the feed, host profile, landing | Sonnet (Opus review) | 5 |
| 7 | Cell: every state, glyphs, inks, overlay face, ring, bull | Opus | 1, 2, 3, 5 |
| 8 | Grid frame, surround, lamp, legends, density tests | Sonnet | 7 |
| 9 | `cellMoments` diff | Opus | 5 |
| 10 | Claim bar: "12 to go", media row, "You have …" line | Sonnet | 8 |
| 11 | Claim moments on `cellMoments` | Opus | 7, 9, 10 |
| 12 | The reveal rewrite + `reveal-plan.ts` | Opus | 7, 8, 11 |
| 13 | Result page and copy | Sonnet | 12 |
| 14 | OG route in the kit view with heat | Opus | 5, 6, 12 |
| 15 | Feed cards, sort chips, landing hero, host profile record and framing | Sonnet (Opus review of the host record) | 6, 8 |
| 16 | `/account` flight and kit pickers, `/host/new` nudge, "This is your flight" | Sonnet (Opus review) | 4, 7 |
| 17 | Copy audit pass | Sonnet (Opus review) | 10, 13, 15, 16 |
| 18 | `/me` member view and history | Sonnet | 7, 11 |
| 19 | Docs: constraint amendments, "superseded" notes, README | Sonnet | all |
| 20 | E2E: participant and stranger views, `/account`, axe, journey 2, fixtures | Sonnet | all |

Tasks 5 and 6 split the public kit and heat (recorded ruling 17): Task 5 carries them on `listFeed`, `hostProfile` and the grid model with the privacy tests; Task 6 adds the landing hero's places, kit, heat and cells, creates `placesOf`, and pins the break page model end to end.

<!-- TASKS:BEGIN -->

### Task 1: Board tokens, fonts, theme-color (model: Sonnet)

The Mosaic board needs its own colours, the lamp's five steps, the default kit, the motion tokens, a fifth font file and a `theme-color` that follows the route, all without changing a single existing value. This task adds the board tokens to `tokens.css` under new names with the values of spec §4, maps the colours, the display face and the four display sizes through `@theme inline`, pins every new pair the spec states (cream text on the wall at 8:1 or more, the steel wire at 3:1 or more on the wall and on cream), loads Big Shoulders 800 as the fifth file, and gives the five wall routes (spec §8: `/b/{id}`, `/b/{id}/result`, `/breaks`, `/`, `/h/{handle}`) the wall's `theme-color` while every other route keeps paper. The wall background is a CSS rule that a route turns on with `data-wall`; the restyling tasks turn it on (recorded ruling 12). Nothing looks different yet, apart from the browser chrome on the wall routes.

**Files:**
- Modify: `src/app/tokens.css` (board tokens, lamp, kit, motion; `@theme inline` mappings)
- Modify: `src/app/tokens.test.ts`
- Modify: `src/app/fonts.ts` (`bigShoulders`)
- Create: `src/app/wall.ts`
- Modify: `src/app/layout.tsx` (font variable, `PAPER_THEME_COLOR`, body without `bg-paper`)
- Modify: `src/app/globals.css` (the `data-wall` rule)
- Modify: `src/app/page.tsx`, `src/app/breaks/page.tsx`, `src/app/b/[id]/page.tsx`, `src/app/b/[id]/result/page.tsx`, `src/app/h/[handle]/page.tsx` (`viewport` export)
- Modify: `e2e/layout.spec.ts` (one test)

**Interfaces:**
- Consumes: `contrast`, `readTokens` (`src/lib/contrast.ts`); `Viewport` (`next`).
- Produces:
  - Tokens on `:root`: `--board-wall` `#17161A`, `--board-wall-2` `#221F26`, `--board-cream` `#FBF7EE`, `--board-cream-2` `#EEE8DA`, `--board-ink` `#15130F`, `--board-ink-2` `#5A5246`, `--board-steel` `#7A7D84`, `--board-ring` `#0F0E0C`, `--board-text` `var(--board-cream)`, `--board-text-2` `#D4CEC3`, `--board-text-3` `#B3ADA3`, `--lamp-0` … `--lamp-4`, `--kit-dark` `#2340C4`, `--kit-light` `#F7C51B` (the default kit, Blue with Yellow; set per break later), and the spec §4 motion tokens.
  - `@theme inline`: `--color-board-*`, `--color-kit-dark`, `--color-kit-light`, `--font-shoulders`, `--text-wall-title`, `--text-caller`, `--text-checkout`, `--text-wall-display`.
  - `src/app/fonts.ts`: `bigShoulders` (`Big_Shoulders`, one variable file with `weight: "variable"` and `axes: ["opsz"]`, latin, `display: "swap"`, `preload: false`, variable `--font-big-shoulders`); every use sets weight 800 (recorded ruling 11).
  - `globals.css`: `html { font-optical-sizing: auto; }`, so large Big Shoulders titles take the Display cut.
  - `src/app/wall.ts`: `WALL_THEME_COLOR = "#17161A"`, `PAPER_THEME_COLOR = "#F6F5F1"`, `wallViewport: Viewport = { themeColor: WALL_THEME_COLOR }`.
  - `globals.css`: `html:has([data-wall]), html:has([data-wall]) body { background-color: var(--board-wall); }`.

- [ ] **Step 1: Confirm the Big Shoulders export name before anything else**

Spec §4 asks for this first, because Google reorganised the family.

Run: `node -e 'const d=require("./node_modules/next/dist/compiled/@next/font/dist/google/font-data.json");console.log(Object.keys(d).filter((k)=>k.startsWith("Big Shoulders")).join("|"));console.log(JSON.stringify(d["Big Shoulders"].weights), JSON.stringify(d["Big Shoulders"].axes.map((a)=>a.tag)))' && grep -c "export declare function Big_Shoulders<" node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts`

Expected:

```
Big Shoulders|Big Shoulders Inline|Big Shoulders Stencil
["100","200","300","400","500","600","700","800","900","variable"] ["opsz","wght"]
1
```

So the export is `Big_Shoulders`, it is a variable family with an `opsz` axis (weight 800 inside its range), and there is no `Big_Shoulders_Display` (recorded ruling 11). If the first line lists `Big Shoulders Display`, or `"variable"` or `opsz` is missing, stop and report BLOCKED: fonts.

- [ ] **Step 2: Create `wall.ts`**

Create `src/app/wall.ts`:

```ts
import type { Viewport } from "next";

/** theme-color per route (Mosaic spec §8), so an in-app browser's chrome matches the page and never flashes white. */
export const WALL_THEME_COLOR = "#17161A"; // --board-wall, pinned by tokens.test.ts
export const PAPER_THEME_COLOR = "#F6F5F1"; // --paper, pinned by tokens.test.ts

/** The wall routes (/b/{id}, /b/{id}/result, /breaks, /, /h/{handle}) export this as `viewport`; Next merges it over the root layout's. */
export const wallViewport: Viewport = { themeColor: WALL_THEME_COLOR };
```

- [ ] **Step 3: Write the failing token tests**

Replace the whole of `src/app/tokens.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrast, readTokens } from "@/lib/contrast";
import { PAPER_THEME_COLOR, WALL_THEME_COLOR, wallViewport } from "./wall";

const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
const css = read("./tokens.css");
const globals = read("./globals.css");
const fonts = read("./fonts.ts");
const t = readTokens(css);
/** `--name: value;` whatever the value (readTokens keeps `#RRGGBB` only). */
const raw = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

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

describe("Mosaic board tokens (Mosaic spec §4)", () => {
  it("adds every board colour under a new name, exactly, and the default kit", () => {
    expect(t).toMatchObject({
      "board-wall": "#17161A", "board-wall-2": "#221F26", "board-cream": "#FBF7EE", "board-cream-2": "#EEE8DA",
      "board-ink": "#15130F", "board-ink-2": "#5A5246", "board-steel": "#7A7D84", "board-ring": "#0F0E0C",
      "board-text-2": "#D4CEC3", "board-text-3": "#B3ADA3", "kit-dark": "#2340C4", "kit-light": "#F7C51B",
    });
    expect(raw("board-text")).toBe("var(--board-cream)");
  });
  it("has the lamp's five literal steps", () => {
    expect([0, 1, 2, 3, 4].map((i) => raw(`lamp-${i}`))).toEqual([
      "rgba(255,232,200,0.06)", "rgba(255,232,200,0.095)", "rgba(255,232,200,0.13)", "rgba(255,232,200,0.165)", "rgba(255,232,200,0.20)",
    ]);
  });
  it("reads cream text on the wall at 8:1 or more (Review Focus 3)", () => {
    // Spec §4: 16.8:1, 11.5:1 and 8.1:1.
    for (const fg of ["board-cream", "board-text-2", "board-text-3"]) expect(contrast(t[fg], t["board-wall"]), `${fg} on the wall`).toBeGreaterThanOrEqual(8);
  });
  it("keeps the steel wire at 3:1 or more on the wall and on cream (Review Focus 3)", () => {
    // Spec §4: 4.4:1 on the wall, 3.9:1 on cream.
    expect(contrast(t["board-steel"], t["board-wall"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t["board-steel"], t["board-cream"])).toBeGreaterThanOrEqual(3);
  });
  it("keeps the numbers on cream and on the reserved face at 4.5:1 or more", () => {
    expect(contrast(t["board-ink"], t["board-cream"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["board-ink-2"], t["board-cream-2"])).toBeGreaterThanOrEqual(4.5); // spec: 6.3:1
  });
  it("keeps the place rings on the cream disc at the 3:1 non-text floor", () => {
    // Measured: red 5.5:1, green 4.98:1 (the spec rounds it to 5.0:1).
    expect(contrast(t.red, t["board-cream"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t.green, t["board-cream"])).toBeGreaterThanOrEqual(3);
  });
  it("has the complete motion token set", () => {
    const MOTION: Record<string, string> = {
      "dur-press": "70ms", "dur-unpress": "120ms", "dur-drop": "160ms", "dur-squash": "80ms", "dur-settle": "120ms",
      "dur-glint": "220ms", "dur-others": "120ms", "dur-sent": "180ms", "dur-set": "140ms", "dur-seat": "100ms",
      "dur-release": "200ms", "dur-strike": "200ms", "dur-banner": "180ms", "dur-lights": "300ms", "dur-beat": "300ms",
      "dur-beat-top": "800ms", "dur-throw": "260ms", "dur-throw-settle": "140ms", "dur-shake": "120ms", "dur-gap": "550ms",
      "dur-lamp": "600ms", "dur-reduced": "150ms", "stagger-own": "50ms", "stagger-others": "30ms",
      "ease-in": "cubic-bezier(.55,0,1,.45)", "ease-out": "cubic-bezier(.2,.7,.3,1)", "ease-over": "cubic-bezier(.3,1.5,.5,1)", "ease-inout": "ease-in-out",
    };
    for (const [name, value] of Object.entries(MOTION)) expect(raw(name), name).toBe(value);
  });
  it("maps the board colours, the display face and its sizes through @theme inline", () => {
    for (const name of ["board-wall", "board-wall-2", "board-cream", "board-cream-2", "board-ink", "board-ink-2", "board-steel", "board-ring", "board-text", "board-text-2", "board-text-3", "kit-dark", "kit-light"]) {
      expect(css, name).toContain(`--color-${name}: var(--${name});`);
    }
    expect(css).toContain("--font-shoulders: var(--font-big-shoulders), var(--font-barlow-condensed), ui-sans-serif, sans-serif;");
    expect(raw("text-wall-title")).toBe("32px"); expect(raw("text-wall-title--line-height")).toBe("32px");
    expect(raw("text-caller")).toBe("26px"); expect(raw("text-caller--line-height")).toBe("28px");
    expect(raw("text-checkout")).toBe("22px"); expect(raw("text-checkout--line-height")).toBe("24px");
    expect(raw("text-wall-display")).toBe("40px"); expect(raw("text-wall-display--line-height")).toBe("40px");
  });
  it("paints the wall only where a route opts in with data-wall", () => {
    // Later tasks use --board-wall on board layers (the house-lights dim), so count only page backgrounds.
    expect([...globals.matchAll(/background-color: var\(--board-wall\)/g)]).toHaveLength(1);
    expect(globals).toContain("font-optical-sizing: auto;");
    expect(globals).toMatch(/html:has\(\[data-wall\]\),\s*html:has\(\[data-wall\]\) body\s*\{\s*background-color: var\(--board-wall\);\s*\}/);
  });
  it("sets theme-color to the wall on wall routes and to paper elsewhere", () => {
    expect(WALL_THEME_COLOR).toBe(t["board-wall"]);
    expect(PAPER_THEME_COLOR).toBe(t.paper);
    expect(wallViewport).toEqual({ themeColor: t["board-wall"] });
  });
  it("loads five font files: Barlow 400, 500, 600, Barlow Condensed 600, and Big Shoulders as one variable file", () => {
    expect(fonts).toMatch(/Barlow\(\{[^}]*weight: \["400", "500", "600"\]/);
    expect(fonts).toMatch(/Barlow_Condensed\(\{[^}]*weight: \["600"\]/);
    expect(fonts).toMatch(/Big_Shoulders\(\{[^}]*weight: "variable"[^}]*axes: \["opsz"\][^}]*preload: false/);
    expect(fonts).not.toMatch(/weight: \[[^\]]*"700"/);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm test src/app/tokens.test.ts`
Expected: FAIL. The first five tests pass; all eleven "Mosaic board tokens" tests fail: `toMatchObject` reports the missing `board-*` keys, `raw("lamp-0")` and the motion and mapping values are `undefined`, the globals test finds 0 matches, the theme-color test compares `#17161A` with `undefined`, and the fonts test fails on the `Big_Shoulders` regex.

- [ ] **Step 5: Write the tokens**

Replace the whole of `src/app/tokens.css` with:

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

  /* Mosaic board (Mosaic spec §4). New names only: no token above changes value. */
  --board-wall: #17161A;
  --board-wall-2: #221F26;
  --board-cream: #FBF7EE;
  --board-cream-2: #EEE8DA;
  --board-ink: #15130F;
  --board-ink-2: #5A5246;
  --board-steel: #7A7D84;
  --board-ring: #0F0E0C;
  --board-text: var(--board-cream);
  --board-text-2: #D4CEC3;
  --board-text-3: #B3ADA3;

  /* The lamp: one warm white in five alpha steps, shared with the link preview (flights.ts LAMP). */
  --lamp-0: rgba(255,232,200,0.06);
  --lamp-1: rgba(255,232,200,0.095);
  --lamp-2: rgba(255,232,200,0.13);
  --lamp-3: rgba(255,232,200,0.165);
  --lamp-4: rgba(255,232,200,0.20);

  /* The host's kit: the default, Blue with Yellow. A break sets both on its board. */
  --kit-dark: #2340C4;
  --kit-light: #F7C51B;

  /* Motion (Mosaic spec §4 "Space, shape, motion"). The --ease-* names also override Tailwind's ease-in and
     ease-out utilities, which nothing uses. */
  --dur-press: 70ms;
  --dur-unpress: 120ms;
  --dur-drop: 160ms;
  --dur-squash: 80ms;
  --dur-settle: 120ms;
  --dur-glint: 220ms;
  --dur-others: 120ms;
  --dur-sent: 180ms;
  --dur-set: 140ms;
  --dur-seat: 100ms;
  --dur-release: 200ms;
  --dur-strike: 200ms;
  --dur-banner: 180ms;
  --dur-lights: 300ms;
  --dur-beat: 300ms;
  --dur-beat-top: 800ms;
  --dur-throw: 260ms;
  --dur-throw-settle: 140ms;
  --dur-shake: 120ms;
  --dur-gap: 550ms;
  --dur-lamp: 600ms;
  --dur-reduced: 150ms;
  --stagger-own: 50ms;
  --stagger-others: 30ms;
  --ease-in: cubic-bezier(.55,0,1,.45);
  --ease-out: cubic-bezier(.2,.7,.3,1);
  --ease-over: cubic-bezier(.3,1.5,.5,1);
  --ease-inout: ease-in-out;
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

  --color-board-wall: var(--board-wall);
  --color-board-wall-2: var(--board-wall-2);
  --color-board-cream: var(--board-cream);
  --color-board-cream-2: var(--board-cream-2);
  --color-board-ink: var(--board-ink);
  --color-board-ink-2: var(--board-ink-2);
  --color-board-steel: var(--board-steel);
  --color-board-ring: var(--board-ring);
  --color-board-text: var(--board-text);
  --color-board-text-2: var(--board-text-2);
  --color-board-text-3: var(--board-text-3);
  --color-kit-dark: var(--kit-dark);
  --color-kit-light: var(--kit-light);

  --font-sans: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
  --font-condensed: var(--font-barlow-condensed), var(--font-barlow), ui-sans-serif, sans-serif;
  /* Big Shoulders 800 (Mosaic §4 type): wall titles, the caller banner, the checkout count, the result display. */
  --font-shoulders: var(--font-big-shoulders), var(--font-barlow-condensed), ui-sans-serif, sans-serif;

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
  /* Mosaic §4 type table, for Big Shoulders only. */
  --text-wall-title: 32px;
  --text-wall-title--line-height: 32px;
  --text-caller: 26px;
  --text-caller--line-height: 28px;
  --text-checkout: 22px;
  --text-checkout--line-height: 24px;
  --text-wall-display: 40px;
  --text-wall-display--line-height: 40px;

  --radius-input: 4px;
  --radius-card: 8px;

  --shadow-sheet: 0 -8px 24px rgb(0 0 0 / 0.12);
}
```

- [ ] **Step 6: Load Big Shoulders**

Replace the whole of `src/app/fonts.ts` with:

```ts
import { Barlow, Barlow_Condensed, Big_Shoulders } from "next/font/google";

// Barlow is not a variable font, so the weights are listed. A build that cannot reach Google Fonts is
// reported as BLOCKED: fonts (see Global Constraints); do not vendor the files here.
export const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });
export const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-barlow-condensed", display: "swap" });
// The fifth file (Mosaic §4). Google folded Big Shoulders Display into Big_Shoulders, one variable family with an opsz
// axis. next/font takes `axes` only with the variable weight, so this is one variable file; every use sets weight 800,
// and `font-optical-sizing: auto` (globals.css) gives large titles the Display cut (recorded ruling 11). Not preloaded:
// the root layout imports this module, so a preload would reach every route; the file loads where Big Shoulders text
// first renders, which is the wall routes only.
export const bigShoulders = Big_Shoulders({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-big-shoulders", display: "swap", preload: false });
```

- [ ] **Step 7: Root layout: the font variable, paper as the default theme-color, no body background class**

In `src/app/layout.tsx`, replace

```tsx
import { barlow, barlowCondensed } from "./fonts";
```

with

```tsx
import { barlow, barlowCondensed, bigShoulders } from "./fonts";
import { PAPER_THEME_COLOR } from "./wall";
```

replace

```tsx
  themeColor: "#F6F5F1",
```

with

```tsx
  themeColor: PAPER_THEME_COLOR, // wall routes override it with wallViewport
```

and replace

```tsx
    <html lang="en" suppressHydrationWarning className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-body text-ink antialiased">
```

with

```tsx
    <html lang="en" suppressHydrationWarning className={`${barlow.variable} ${barlowCondensed.variable} ${bigShoulders.variable}`}>
      {/* No bg-paper here: globals.css paints paper, and the wall where a route sets data-wall (a utility would beat it). */}
      <body className="min-h-dvh font-sans text-body text-ink antialiased">
```

- [ ] **Step 8: The wall rule in `globals.css`**

In `src/app/globals.css`, replace

```css
  body {
    background-color: var(--paper);
    color: var(--ink);
    font-family: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
    font-size: 16px;
    line-height: 24px;
  }
```

with

```css
  body {
    background-color: var(--paper);
    color: var(--ink);
    font-family: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
    font-size: 16px;
    line-height: 24px;
  }
  /* Wall routes (Mosaic §8) opt in with data-wall on their <main>: html and body both take the wall, so
     overscroll never shows paper. Every other route keeps paper from the two rules above. */
  html:has([data-wall]),
  html:has([data-wall]) body {
    background-color: var(--board-wall);
  }
  /* Big Shoulders is one variable file with an opsz axis: large titles take the Display cut (recorded ruling 11). */
  html {
    font-optical-sizing: auto;
  }
```

No route sets `data-wall` in this task: Tasks 8, 13 and 15 add it to the pages they restyle, because today's pages put ink text straight on the body (recorded ruling 12).

- [ ] **Step 9: The wall routes export the wall's theme-color**

In `src/app/b/[id]/page.tsx`, replace

```tsx
import { loadBreak } from "./load";
```

with

```tsx
import { wallViewport } from "@/app/wall";
import { loadBreak } from "./load";

export const viewport = wallViewport;
```

In `src/app/b/[id]/result/page.tsx`, replace

```tsx
import { Verify } from "./verify";
```

with

```tsx
import { Verify } from "./verify";
import { wallViewport } from "@/app/wall";

export const viewport = wallViewport;
```

In `src/app/breaks/page.tsx`, replace

```tsx
export const metadata: Metadata = { title: "Browse breaks" };
```

with

```tsx
export const metadata: Metadata = { title: "Browse breaks" };
export const viewport = wallViewport;
```

and add `import { wallViewport } from "@/app/wall";` below `import { feedHref, parseFeedParams, SORT_LABELS } from "./params";`.

In `src/app/page.tsx`, replace

```tsx
import { heroNumbers, ranText } from "./landing-copy";
```

with

```tsx
import { heroNumbers, ranText } from "./landing-copy";
import { wallViewport } from "./wall";

export const viewport = wallViewport;
```

In `src/app/h/[handle]/page.tsx`, replace

```tsx
import { pastText, profileTrustText } from "@/components/break/frame-copy";
```

with

```tsx
import { pastText, profileTrustText } from "@/components/break/frame-copy";
import { wallViewport } from "@/app/wall";

export const viewport = wallViewport;
```

- [ ] **Step 10: The e2e check of theme-color per route**

In `e2e/layout.spec.ts`, replace

```ts
test("an anonymous viewer's cell names never carry a handle (D§4)", async ({ browser }) => {
```

with

```ts
test("theme-color is the wall on wall routes and paper elsewhere (Mosaic §8)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  for (const path of ["/", "/breaks", url, `/h/lh${run}`]) {
    await page.goto(path);
    await expect(page.locator('meta[name="theme-color"]'), path).toHaveAttribute("content", "#17161A");
  }
  for (const path of ["/legal/draw", "/login"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="theme-color"]'), path).toHaveAttribute("content", "#F6F5F1");
  }
});

test("an anonymous viewer's cell names never carry a handle (D§4)", async ({ browser }) => {
```

- [ ] **Step 11: Run the tests to see them pass**

Run: `pnpm test src/app/tokens.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 12: Run every gate**

Run (sandbox off, 10-minute timeout): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. The build fetches the fifth font; if it hangs or errors in `next-font-loader`, stop and report BLOCKED: fonts. Every page still renders on paper (no route sets `data-wall`), so the axe test is unchanged; the new theme-color test passes.

- [ ] **Step 13: Commit**

```bash
git add src/app/tokens.css src/app/tokens.test.ts src/app/fonts.ts src/app/wall.ts src/app/layout.tsx src/app/globals.css src/app/page.tsx src/app/breaks/page.tsx "src/app/b/[id]/page.tsx" "src/app/b/[id]/result/page.tsx" "src/app/h/[handle]/page.tsx" e2e/layout.spec.ts
git commit -m "feat(ui): mosaic board tokens, Big Shoulders and a theme colour per route"
```

---

### Task 2: `flights.ts` with contrast and heat tests (model: Opus)

One pure module holds the flight set, the kits and the lamp (spec §4, §10): eight colours in two tiers with their faces, number inks and labels; four dart shapes as 16 × 16 SVG paths with the spec's aspect ratios; the fifteen kits and their default; `heatStep` and the five lamp colours; and `TOKENS`, the board's hex literals for the link preview, which cannot read CSS variables. Keys are stored by migration 0004 (Task 4) and never reorder. The tests pin Review Focus item 3 with the real WCAG luminance and contrast functions from `src/lib/contrast.ts`: every face against its number ink at 5:1 or better. They also pin the ink rule, the excluded tones, the tier rule for kits, the pinstripe on the wall, the shapes' boxes, the heat step edges and the lamp's constraints. There is no `defaultFlight(userId)` (recorded ruling 6).

**Files:**
- Create: `src/domain/flights.ts`, `src/domain/flights.test.ts`
- Modify: `src/app/tokens.test.ts` (TOKENS and LAMP against `tokens.css`)

**Interfaces:**
- Consumes: `luminance` (`src/lib/contrast.ts`).
- Produces (all in `src/domain/flights.ts`, names as the frame's contracts): `FlightColour`, `FlightShape`, `Flight`, `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `DARK_COLOURS`, `LIGHT_COLOURS`, `Kit`, `DEFAULT_KIT`, `kitFor`, `isFlightColour`, `isFlightShape`, `flightOf`, `HeatStep`, `heatStep`, `LAMP`, `TOKENS`; plus `inkFor(face: string): "#FBF7EE" | "#15130F"`, `COLLISION_ORDER: readonly FlightShape[]` (`standard, pear, kite, slim`) and `WATCHED_PAIR` (yellow and lime, petrol and plum), which Task 5 consumes.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/flights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contrast, luminance } from "@/lib/contrast";
import {
  DARK_COLOURS, DEFAULT_KIT, FLIGHT_COLOURS, FLIGHT_SHAPES, LAMP, LIGHT_COLOURS, TOKENS,
  flightOf, heatStep, inkFor, isFlightColour, isFlightShape, kitFor, type FlightColour, type FlightShape,
} from "./flights";

const colours = Object.keys(FLIGHT_COLOURS) as FlightColour[];
const shapes = Object.keys(FLIGHT_SHAPES) as FlightShape[];
const CREAM = TOKENS.boardCream;
const INK = TOKENS.boardInk;
/** Spec §4's table, "Contrast at 18 px / 600". */
const SPEC_CONTRAST: Record<FlightColour, number> = { petrol: 6.8, blue: 7.6, plum: 8.7, yellow: 11.5, orange: 8.0, lime: 10.9, sky: 9.7, pink: 9.4 };

/** Bounding box of a path written with absolute M, L, C and Z only (every number is part of an x, y pair). */
function box(path: string) {
  const n = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("the flight set (Mosaic §4)", () => {
  it("keeps its stored keys in order: eight colours in two tiers, four shapes, 32 flights", () => {
    expect(colours).toEqual(["petrol", "blue", "plum", "yellow", "orange", "lime", "sky", "pink"]);
    expect(shapes).toEqual(["standard", "kite", "slim", "pear"]);
    expect(DARK_COLOURS).toEqual(["petrol", "blue", "plum"]);
    expect(LIGHT_COLOURS).toEqual(["yellow", "orange", "lime", "sky", "pink"]);
    expect(colours.filter((c) => FLIGHT_COLOURS[c].tier === "dark")).toEqual(DARK_COLOURS);
    expect(colours.length * shapes.length).toBe(32);
    expect(colours.map((c) => FLIGHT_COLOURS[c].label)).toEqual(["Petrol", "Blue", "Plum", "Yellow", "Orange", "Lime", "Sky", "Pink"]);
  });

  it("reads every face at 5:1 or better against its number ink, at every cell size (Review Focus 3)", () => {
    // Contrast does not depend on the cell size, and the board has no sheen (Mosaic §2): the face is the number's whole background.
    for (const c of colours) {
      const { face, ink } = FLIGHT_COLOURS[c];
      const other = ink === CREAM ? INK : CREAM;
      expect(contrast(face, ink), c).toBeGreaterThanOrEqual(5);
      expect(contrast(face, ink), `${c} uses the better of the two inks`).toBeGreaterThan(contrast(face, other));
      expect(Math.abs(contrast(face, ink) - SPEC_CONTRAST[c]), `${c} matches the spec's table`).toBeLessThan(0.1);
    }
  });

  it("follows the ink rule and leaves out the mid tones", () => {
    for (const c of colours) {
      const { face, ink, tier } = FLIGHT_COLOURS[c];
      expect(ink, c).toBe(inkFor(face));
      expect(tier === "dark", c).toBe(ink === CREAM);
      const l = luminance(face);
      expect(l < 0.15 || l > 0.24, `${c} luminance ${l.toFixed(3)} is outside 0.15 to 0.24`).toBe(true);
    }
  });

  it("never uses red, green, black, cream or a board colour as a face", () => {
    const banned: string[] = [TOKENS.red, TOKENS.green, "#E8102E", "#16A34A", TOKENS.boardRing, TOKENS.boardInk, TOKENS.boardWall, TOKENS.boardWall2, TOKENS.boardCream, TOKENS.boardCream2, "#000000", "#FFFFFF"];
    for (const c of colours) expect(banned, c).not.toContain(FLIGHT_COLOURS[c].face.toUpperCase());
  });

  it("draws each shape inside the 16 × 16 box with the spec's aspect ratio", () => {
    // standard 15 × 11 (1.36), pear 13 × 13 (1.0), kite 10 × 15 (0.67), slim 6 × 15 (0.40).
    const RATIO: Record<FlightShape, number> = { standard: 1.36, pear: 1.0, kite: 0.67, slim: 0.4 };
    for (const s of shapes) {
      const b = box(FLIGHT_SHAPES[s].path);
      expect(b.minX >= 0 && b.minY >= 0 && b.maxX <= 16 && b.maxY <= 16, `${s} fits the box`).toBe(true);
      expect((b.maxX - b.minX) / (b.maxY - b.minY), s).toBeCloseTo(RATIO[s], 2);
    }
    expect(shapes.map((s) => FLIGHT_SHAPES[s].label)).toEqual(["Standard", "Kite", "Slim", "Pear"]);
  });

  it("knows the stored keys and nothing else", () => {
    expect(isFlightColour("blue")).toBe(true);
    expect(isFlightColour("red")).toBe(false);
    expect(isFlightColour("constructor")).toBe(false);
    expect(isFlightShape("pear")).toBe(true);
    expect(isFlightShape("dart")).toBe(false);
    expect(flightOf({ flightColour: "sky", flightShape: "kite" })).toEqual({ colour: "sky", shape: "kite" });
    expect(() => flightOf({ flightColour: "red", flightShape: "kite" })).toThrow(/Unknown flight red-kite/);
  });
});

describe("kits (Mosaic §4)", () => {
  it("pair one dark and one light colour: 15 kits, Blue with Yellow by default", () => {
    expect(DEFAULT_KIT).toEqual({ dark: "blue", light: "yellow" });
    expect(DARK_COLOURS.length * LIGHT_COLOURS.length).toBe(15);
    expect(kitFor({ kitDark: "petrol", kitLight: "pink" })).toEqual({ dark: "petrol", light: "pink" });
    expect(kitFor({ kitDark: null, kitLight: null })).toEqual(DEFAULT_KIT);
    expect(kitFor({ kitDark: "petrol", kitLight: null })).toEqual(DEFAULT_KIT);
    expect(kitFor({ kitDark: "yellow", kitLight: "blue" })).toEqual(DEFAULT_KIT); // tiers swapped
    expect(kitFor({ kitDark: "red", kitLight: "pink" })).toEqual(DEFAULT_KIT);
  });
  it("show the light pinstripe on the wall at 7.7:1 or more; a dark glyph on the wall is under 3:1, hence its cream keyline", () => {
    for (const c of LIGHT_COLOURS) expect(contrast(FLIGHT_COLOURS[c].face, TOKENS.boardWall), c).toBeGreaterThanOrEqual(7.7);
    for (const c of DARK_COLOURS) expect(contrast(FLIGHT_COLOURS[c].face, TOKENS.boardWall), c).toBeLessThan(3);
  });
});

describe("heat (Mosaic §4)", () => {
  it("steps at a quarter, a half and three quarters claimed, and takes the top step only when closed", () => {
    expect(heatStep(38, 50, false)).toBe(0); // 12 of 50 claimed
    expect(heatStep(37, 50, false)).toBe(1); // 13 of 50
    expect(heatStep(25, 50, false)).toBe(2); // 25 of 50
    expect(heatStep(13, 50, false)).toBe(2); // 37 of 50
    expect(heatStep(12, 50, false)).toBe(3); // 38 of 50
    expect(heatStep(0, 50, false)).toBe(3); // every line claimed, not yet closed
    expect(heatStep(0, 50, true)).toBe(4);
    expect(heatStep(50, 50, false)).toBe(0);
    expect(heatStep(0, 0, false)).toBe(0);
  });
  it("is one warm white whose alpha only rises, never above 0.20", () => {
    expect(LAMP).toEqual({
      0: "rgba(255,232,200,0.06)", 1: "rgba(255,232,200,0.095)", 2: "rgba(255,232,200,0.13)", 3: "rgba(255,232,200,0.165)", 4: "rgba(255,232,200,0.20)",
    });
    const parsed = ([0, 1, 2, 3, 4] as const).map((s) => LAMP[s].match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)!);
    expect(new Set(parsed.map((m) => m.slice(1, 4).join()))).toEqual(new Set(["255,232,200"]));
    const alphas = parsed.map((m) => Number(m[4]));
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeGreaterThan(alphas[i - 1]);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.2);
  });
});
```

In `src/app/tokens.test.ts`, replace

```ts
import { PAPER_THEME_COLOR, WALL_THEME_COLOR, wallViewport } from "./wall";
```

with

```ts
import { PAPER_THEME_COLOR, WALL_THEME_COLOR, wallViewport } from "./wall";
import { DEFAULT_KIT, FLIGHT_COLOURS, LAMP, TOKENS } from "@/domain/flights";
```

and append at the end of the file:

```ts
describe("flights.ts repeats tokens.css exactly (the link preview reads no CSS variables)", () => {
  const CSS_NAME: Record<keyof typeof TOKENS, string> = {
    boardWall: "board-wall", boardWall2: "board-wall-2", boardCream: "board-cream", boardCream2: "board-cream-2", boardInk: "board-ink",
    boardInk2: "board-ink-2", boardSteel: "board-steel", boardRing: "board-ring", boardText2: "board-text-2", boardText3: "board-text-3",
    red: "red", green: "green",
  };
  it("has every board hex once in TOKENS", () => {
    for (const k of Object.keys(TOKENS) as (keyof typeof TOKENS)[]) expect(TOKENS[k], k).toBe(t[CSS_NAME[k]]);
    const named = new Set(Object.values(CSS_NAME));
    expect(Object.keys(t).filter((k) => k.startsWith("board-") && !named.has(k))).toEqual([]);
  });
  it("has the lamp's steps in LAMP and the default kit in the kit tokens", () => {
    for (const s of [0, 1, 2, 3, 4] as const) expect(LAMP[s], `lamp-${s}`).toBe(raw(`lamp-${s}`));
    expect(t["kit-dark"]).toBe(FLIGHT_COLOURS[DEFAULT_KIT.dark].face);
    expect(t["kit-light"]).toBe(FLIGHT_COLOURS[DEFAULT_KIT.light].face);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/flights.test.ts src/app/tokens.test.ts`
Expected: FAIL. Both files fail to load with `Failed to resolve import "./flights"` (and `"@/domain/flights"`).

- [ ] **Step 3: Write the module**

Create `src/domain/flights.ts`:

```ts
import { luminance } from "@/lib/contrast";

/**
 * The flight set, the host kits and the lamp (Mosaic spec §4, §10). Colour and shape keys are stored in
 * users.flight_colour / flight_shape and host_profiles.kit_dark / kit_light (migration 0004): the set may grow, but a
 * key is never reordered or renamed. All 32 flights and all 15 kits are open to everyone from day one. Faces are never
 * red or green: those are the board's ring colours.
 */
export type FlightColour = "petrol" | "blue" | "plum" | "yellow" | "orange" | "lime" | "sky" | "pink";
export type FlightShape = "standard" | "kite" | "slim" | "pear";
export type Flight = { colour: FlightColour; shape: FlightShape };

/** The ink rule: cream numbers on faces with luminance below 0.186, ink above. */
export function inkFor(face: string): "#FBF7EE" | "#15130F" {
  return luminance(face) < 0.186 ? "#FBF7EE" : "#15130F";
}

export const FLIGHT_COLOURS: Record<FlightColour, { face: string; ink: "#FBF7EE" | "#15130F"; tier: "dark" | "light"; label: string }> = {
  petrol: { face: "#0B5E7A", ink: "#FBF7EE", tier: "dark", label: "Petrol" },
  blue: { face: "#2340C4", ink: "#FBF7EE", tier: "dark", label: "Blue" },
  plum: { face: "#82195F", ink: "#FBF7EE", tier: "dark", label: "Plum" },
  yellow: { face: "#F7C51B", ink: "#15130F", tier: "light", label: "Yellow" },
  orange: { face: "#F5913A", ink: "#15130F", tier: "light", label: "Orange" },
  lime: { face: "#AED445", ink: "#15130F", tier: "light", label: "Lime" },
  sky: { face: "#7CC4EE", ink: "#15130F", tier: "light", label: "Sky" },
  pink: { face: "#F4A0C4", ink: "#15130F", tier: "light", label: "Pink" },
};

/**
 * One silhouette per shape in a 16 × 16 box, absolute M, L, C and Z only. Boxes spaced so they survive blur:
 * standard 15 × 11 (wide, a shallow notch at the top), kite 10 × 15 (a diamond), slim 6 × 15, pear 13 × 13 (a
 * teardrop, round at the top).
 */
export const FLIGHT_SHAPES: Record<FlightShape, { path: string; label: string }> = {
  standard: { path: "M0.5 2.5 L8 4.5 L15.5 2.5 L15.5 13.5 L0.5 13.5 Z", label: "Standard" },
  kite: { path: "M8 0.5 L13 6 L8 15.5 L3 6 Z", label: "Kite" },
  slim: { path: "M8 0.5 L11 4.5 L11 15.5 L5 15.5 L5 4.5 Z", label: "Slim" },
  pear: { path: "M8 14.5 C5 12 1.5 9.5 1.5 6.5 C1.5 3.5 4.5 1.5 8 1.5 C11.5 1.5 14.5 3.5 14.5 6.5 C14.5 9.5 11 12 8 14.5 Z", label: "Pear" },
};

export const DARK_COLOURS: readonly FlightColour[] = ["petrol", "blue", "plum"];
export const LIGHT_COLOURS: readonly FlightColour[] = ["yellow", "orange", "lime", "sky", "pink"];

/** The per-break collision rule (Mosaic §5): its shape order, and the colour pairs that blur under colour-blind simulation. */
export const COLLISION_ORDER: readonly FlightShape[] = ["standard", "pear", "kite", "slim"];
export const WATCHED_PAIR: Readonly<Partial<Record<FlightColour, FlightColour>>> = { yellow: "lime", lime: "yellow", petrol: "plum", plum: "petrol" };

const COLOUR_KEYS: readonly string[] = Object.keys(FLIGHT_COLOURS);
const SHAPE_KEYS: readonly string[] = Object.keys(FLIGHT_SHAPES);
export function isFlightColour(s: string): s is FlightColour {
  return COLOUR_KEYS.includes(s);
}
export function isFlightShape(s: string): s is FlightShape {
  return SHAPE_KEYS.includes(s);
}

/** A stored flight. Migration 0004's CHECKs keep both columns to these keys, so anything else is a bug, not input. */
export function flightOf(u: { flightColour: string; flightShape: string }): Flight {
  if (!isFlightColour(u.flightColour) || !isFlightShape(u.flightShape)) throw new Error(`Unknown flight ${u.flightColour}-${u.flightShape}`);
  return { colour: u.flightColour, shape: u.flightShape };
}

export type Kit = { dark: FlightColour; light: FlightColour };
export const DEFAULT_KIT: Kit = { dark: "blue", light: "yellow" };

/** The host's kit from host_profiles. None, a half-set pair or a pair in the wrong tiers reads as the default, Blue with Yellow. */
export function kitFor(p: { kitDark: string | null; kitLight: string | null }): Kit {
  const { kitDark: dark, kitLight: light } = p;
  if (dark && light && isFlightColour(dark) && isFlightColour(light) && DARK_COLOURS.includes(dark) && LIGHT_COLOURS.includes(light)) return { dark, light };
  return { ...DEFAULT_KIT };
}

export type HeatStep = 0 | 1 | 2 | 3 | 4;

/**
 * The lamp's step (Mosaic §4 Heat). Numbered lines only; claimed means not open (taken, sent, paid or reserved for a
 * mini), which is listFeed.open. Closed from Closed on (closed, running draw, ran), so it is frozen through the draw.
 */
export function heatStep(open: number, total: number, closed: boolean): HeatStep {
  if (closed) return 4;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(3, Math.floor((4 * (total - open)) / total))) as HeatStep;
}

/** One warm white whose alpha only rises; CSS (--lamp-0 … --lamp-4) and the link preview share these strings. */
export const LAMP: Record<HeatStep, string> = {
  0: "rgba(255,232,200,0.06)",
  1: "rgba(255,232,200,0.095)",
  2: "rgba(255,232,200,0.13)",
  3: "rgba(255,232,200,0.165)",
  4: "rgba(255,232,200,0.20)",
};

/** Every board hex of tokens.css, once, for renderers that read no CSS variables (the OG route). Pinned by tokens.test.ts. */
export const TOKENS = {
  boardWall: "#17161A",
  boardWall2: "#221F26",
  boardCream: "#FBF7EE",
  boardCream2: "#EEE8DA",
  boardInk: "#15130F",
  boardInk2: "#5A5246",
  boardSteel: "#7A7D84",
  boardRing: "#0F0E0C",
  boardText2: "#D4CEC3",
  boardText3: "#B3ADA3",
  red: "#C8102E",
  green: "#1E7A4C",
} as const;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/domain/flights.test.ts src/app/tokens.test.ts`
Expected: PASS. The Review Focus 3 test finds petrol 6.78, blue 7.55, plum 8.72, yellow 11.45, orange 7.95, lime 10.87, sky 9.71 and pink 9.43, every one 5:1 or better and within 0.1 of the spec's table.

- [ ] **Step 5: Run every gate**

Run (sandbox off, 10-minute timeout): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. Nothing imports `flights.ts` outside its tests yet. The copy audit scans `src/domain` and finds none of its words.

- [ ] **Step 6: Commit**

```bash
git add src/domain/flights.ts src/domain/flights.test.ts src/app/tokens.test.ts
git commit -m "feat(flights): the flight set, host kits and the lamp's steps"
```

---

### Task 3: Test selectors to `data-*` (model: Sonnet)

Task 7 rewrites the cell, so every test that finds a state by a Tailwind class name (`bg-hatch`, `border-t-green`, `inset_0_0_0_3px`) would break for a reason that has nothing to do with state. This task gives `Cell` named data attributes (the state, the face, the number's ink and a `data-mark` on every mark) and moves the render tests onto them. It also moves the two e2e lookups of the legend by its accessible name onto a `legend` test id, because Task 8 changes the legend's wording. Nothing on screen changes. Task 7 then renames marks on purpose (brackets for the check, the ring for the flag, `+` retired) and changes `render.test.ts` in the same commit, as spec §5 requires.

Selectors moved, file by file:

| File | Before | After |
|---|---|---|
| `src/components/grid/render.test.ts`, open | `toContain("bg-card")` | `toContain('data-face="card"')` |
| same, selected | `toContain("inset_0_0_0_3px")`, `toContain("✓")` | `toContain('data-selected="true"')`, `toContain('data-mark="selected-ring"')`, `toContain('data-mark="check"')` |
| same, taken | `toContain("bg-hatch")` | `toContain('data-face="hatch"')`, `toContain('data-ink="ink-2"')` |
| same, sent and mine | `toContain("border-dashed")`, `toContain("border-t-green")` | `toContain('data-mark="sent-edge"')`, `toContain('data-mark="flag-green"')`, `toContain('data-mine="true"')` |
| same, paid and mine | `toContain("bg-ink")`, `toContain("text-card")`, `toContain("border-t-card")` | `toContain('data-face="ink"')`, `toContain('data-ink="card"')`, `toContain('data-mark="flag-card"')` |
| same, overdue | `toContain("border-red")`, `toContain(">!<")` | `toContain('data-overdue="true"')`, `toContain('data-mark="overdue-edge"')`, `toContain('data-mark="overdue-glyph"')` |
| same, bonus | `toContain(">+<")` | `toContain('data-bonus="true"')`, `toContain('data-mark="bonus-glyph"')` |
| same, new | (reserved and struck had no test) | `data-mark="reserved-rule"`, `data-mark="mini-label"`; `data-struck="true"` |
| `e2e/layout.spec.ts` (two tests) | `page.getByRole("list", { name: "What the cells mean" })` | `page.getByTestId("legend")` |

Kept as they are, because they are already data attributes, roles or names that Mosaic keeps: `button[data-cell]`, `[data-grid-rows]`, `[data-sticky-bar]`, `cell-<n>`, `mini-<n>`, `[data-reveal-final]`, `[data-testid=ledger-row][data-status=sent]`, `html[data-hydrated]`, every `aria-label` and `aria-disabled` check. `render.test.ts`'s LedgerRow test keeps `toContain("text-red")`: the ledger stays paper and is untouched by Plan C. Copy-keyed e2e lookups that later tasks change ("4 of 4 left", the "Almost full" radio, `left-count`'s text) are updated by the tasks that change that copy (10 and 15), in their own commits. `data-won="1|2|3"` and `data-flight="<colour>-<shape>"` are not added here: Task 7 adds them with the won state and the flights (recorded ruling 19).

**Files:**
- Modify: `src/components/grid/cell.tsx` (whole file)
- Modify: `src/components/grid/render.test.ts` (the Cell `describe` block)
- Modify: `src/components/legend.tsx` (`data-testid="legend"`)
- Modify: `e2e/layout.spec.ts` (two lines)

**Interfaces:**
- Consumes: `cellLabel`, `CellData` (`src/components/grid/cell-label.ts`).
- Produces: on every `Cell` root (button and display-only `role="img"`): `data-state` (`CellState`), `data-face` (`"card" | "hatch" | "ink"`), and, only when true, `data-mine`, `data-bonus`, `data-overdue`, `data-selected`, `data-struck` (value `"true"`, so your own cells read `data-mine="true"`). On the number: `data-ink` (`"card" | "ink" | "ink-2"`). On each mark: `data-mark` = `sent-edge`, `overdue-edge`, `overdue-glyph`, `reserved-rule`, `mini-label`, `selected-ring`, `check`, `flag-green`, `flag-card`, `bonus-glyph`. Legend list: `data-testid="legend"`. `Cell`'s props are unchanged.

- [ ] **Step 1: Write the failing render tests**

In `src/components/grid/render.test.ts`, replace the whole `describe("Cell: every state has a shape and a name, not only a colour (design §4)", …)` block (from that line to its closing `});`, just before `describe("Grid: one group, …`) with:

```ts
describe("Cell: every state has a shape and a name, not only a colour (design §4)", () => {
  // Shapes are read from data-face, data-ink and data-mark, never from class names (Plan C Task 3).
  it("open: a card face, a toggle, no marks", () => {
    const h = html(createElement(Cell, { cell: cell(1), onPress: noop }));
    expect(h).toContain('aria-label="Line 1, open"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain('data-state="open"');
    expect(h).toContain('data-face="card"');
    expect(h).toContain('data-ink="ink"');
    expect(h).not.toContain("data-mark");
  });
  it("selected: pressed, the inset ring and the check", () => {
    const h = html(createElement(Cell, { cell: cell(1), selected: true, onPress: noop }));
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain('data-selected="true"');
    expect(h).toContain('data-mark="selected-ring"');
    expect(h).toContain('data-mark="check"');
  });
  it("taken: the hatch, disabled but focusable, no pressed state", () => {
    const h = html(createElement(Cell, { cell: cell(2, { state: "taken" }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 2, taken"');
    expect(h).toContain('aria-disabled="true"');
    expect(h).not.toContain("aria-pressed");
    expect(h).toContain('data-face="hatch"');
    expect(h).toContain('data-ink="ink-2"');
  });
  it("sent and mine: the dashed edge and the green flag", () => {
    const h = html(createElement(Cell, { cell: cell(3, { state: "sent", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 3, yours, sent"');
    expect(h).toContain('data-mine="true"');
    expect(h).toContain('data-mark="sent-edge"');
    expect(h).toContain('data-mark="flag-green"');
  });
  it("paid and mine: the ink face, a white number and a white flag", () => {
    const h = html(createElement(Cell, { cell: cell(4, { state: "paid", mine: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 4, yours, paid"');
    expect(h).toContain('data-face="ink"');
    expect(h).toContain('data-ink="card"');
    expect(h).toContain('data-mark="flag-card"');
  });
  it("overdue (host view): the red edge and the ! glyph", () => {
    const h = html(createElement(Cell, { cell: cell(5, { state: "taken", overdue: true }), disabled: true, onPress: noop }));
    expect(h).toContain('aria-label="Line 5, taken, overdue"');
    expect(h).toContain('data-overdue="true"');
    expect(h).toContain('data-mark="overdue-edge"');
    expect(h).toContain('data-mark="overdue-glyph"');
  });
  it("reserved for a mini: the double rule and the m label", () => {
    const h = html(createElement(Cell, { cell: cell(6, { state: "reserved" }) }));
    expect(h).toContain('aria-label="Line 6, reserved for a mini"');
    expect(h).toContain('data-state="reserved"');
    expect(h).toContain('data-mark="reserved-rule"');
    expect(h).toContain('data-mark="mini-label"');
  });
  it("struck: a selected line someone else just took", () => {
    const h = html(createElement(Cell, { cell: cell(8, { state: "taken" }), struck: true, disabled: true, onPress: noop }));
    expect(h).toContain('data-struck="true"');
    expect(h).toContain('data-state="taken"');
  });
  it("bonus: the + mark; a display-only cell is an image", () => {
    const h = html(createElement(Cell, { cell: cell(51, { state: "paid", bonus: true }) }));
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="Line 51, bonus, paid"');
    expect(h).toContain('data-state="paid"');
    expect(h).toContain('data-bonus="true"');
    expect(h).toContain('data-mark="bonus-glyph"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/grid/render.test.ts`
Expected: FAIL. Every Cell test fails on its first `data-face`, `data-ink`, `data-selected`, `data-mine`, `data-overdue`, `data-mark` or `data-bonus` assertion (open and taken fail on `data-face`; the display-only cells also lack `data-state`). The Grid and LedgerRow tests pass.

- [ ] **Step 3: Write the cell with named attributes**

Replace the whole of `src/components/grid/cell.tsx` with:

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

/** The face and the number's ink by name: tests read them from data-face and data-ink, never from class names. */
type Face = "card" | "hatch" | "ink";
type NumberInk = "card" | "ink" | "ink-2";
const FACE_CLASS: Record<Face, string> = { card: "bg-card", hatch: "bg-hatch", ink: "bg-ink" };
const INK_CLASS: Record<NumberInk, string> = { card: "text-card", ink: "text-ink", "ink-2": "text-ink-2" };

function faceOf(c: CellData): Face {
  if (c.state === "paid") return "ink";
  if (c.state === "taken" || c.state === "sent") return "hatch";
  return "card";
}

function numberInk(c: CellData): NumberInk {
  // Paid cells are always white on black, yours included: green on ink is 3.9:1 (recorded erratum 1).
  // "Mine" on a paid cell is the white corner flag plus "yours" in the accessible name.
  if (c.state === "paid") return "card";
  if (c.overdue) return "ink"; // overdue (host only): ink number on the chip
  if (c.state === "taken" || c.state === "reserved") return "ink-2";
  return "ink";
}

/** One board segment. Shape carries state (design §4): hatch, dashed edge, ink face, corner flag, glyphs; each mark is named in data-mark. */
export function Cell({ cell, size = "md", boxed = false, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const face = faceOf(cell);
  const paidFace = face === "ink";
  const hatched = face === "hatch";
  const ink = numberInk(cell);
  const edge = boxed ? "border border-wire-strong" : "border-r border-b border-wire-strong";
  const chip = hatched || cell.state === "reserved";
  const flag = size === "xs" ? "border-l-[5px] border-t-[5px]" : "border-l-[10px] border-t-[10px]";
  const glyphs = size !== "xs";
  // What tests key on: the state and the shape tokens as data attributes, so a restyle never moves a selector.
  const data = {
    "data-state": cell.state,
    "data-face": face,
    "data-mine": cell.mine || undefined,
    "data-bonus": cell.bonus || undefined,
    "data-overdue": cell.overdue || undefined,
    "data-selected": selected || undefined,
    "data-struck": struck || undefined,
  };

  const body = (
    <>
      <span aria-hidden data-ink={ink} className={`${NUMBER_SIZE[size]} font-condensed font-semibold tabular ${chip ? "bg-card px-0.5" : ""} ${INK_CLASS[ink]} ${struck ? "line-through decoration-red decoration-2" : ""}`}>
        {cell.number}
      </span>
      {cell.state === "sent" && <span aria-hidden data-mark="sent-edge" className="pointer-events-none absolute inset-0 border-2 border-dashed border-ink" />}
      {cell.overdue && <span aria-hidden data-mark="overdue-edge" className="pointer-events-none absolute inset-0 border-2 border-red" />}
      {cell.overdue && glyphs && <span aria-hidden data-mark="overdue-glyph" className="absolute right-1 bottom-0.5 text-micro font-semibold text-red">!</span>}
      {cell.state === "reserved" && <span aria-hidden data-mark="reserved-rule" className="pointer-events-none absolute inset-0.5 border-[3px] border-double border-wire-strong" />}
      {cell.state === "reserved" && glyphs && <span aria-hidden data-mark="mini-label" className="absolute top-0.5 left-1 text-micro text-ink-2">m</span>}
      {selected && <span aria-hidden data-mark="selected-ring" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--ink)]" />}
      {/* Selected keeps weight 600: 700 is not loaded (recorded erratum 2); the ring and the check carry it. */}
      {selected ? (
        glyphs && <span aria-hidden data-mark="check" className="absolute top-0 right-0.5 text-micro font-semibold text-ink">✓</span>
      ) : cell.mine ? (
        <span aria-hidden data-mark={paidFace ? "flag-card" : "flag-green"} className={`absolute top-0 right-0 h-0 w-0 border-l-transparent ${flag} ${paidFace ? "border-t-card" : "border-t-green"}`} />
      ) : cell.bonus && glyphs ? (
        <span aria-hidden data-mark="bonus-glyph" className={`absolute top-0 right-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      ) : null}
      {/* Bonus and mine: the flag takes the corner, so the "+" moves to the bottom left and both marks survive. */}
      {!selected && cell.mine && cell.bonus && glyphs && (
        <span aria-hidden data-mark="bonus-glyph" className={`absolute bottom-0.5 left-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      )}
    </>
  );

  const base = `relative flex aspect-square w-full items-center justify-center select-none ${FACE_CLASS[face]} ${edge} transition-colors duration-[120ms] motion-reduce:transition-none`;
  if (!onPress) {
    return <div role="img" aria-label={label ?? cellLabel(cell)} {...data} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell={cell.number}
      data-testid={testId}
      {...data}
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

- [ ] **Step 4: Give the legend a test id**

In `src/components/legend.tsx`, replace

```tsx
    <ul aria-label="What the cells mean" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-ink-2">
```

with

```tsx
    <ul aria-label="What the cells mean" data-testid="legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-ink-2">
```

- [ ] **Step 5: Move the e2e legend lookups**

In `e2e/layout.spec.ts`, replace both occurrences (the 390 × 664 test and the 360 × 640 test; use replace-all) of

```ts
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
```

with

```ts
  const legend = await page.getByTestId("legend").boundingBox();
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/components`
Expected: PASS, including the nine Cell tests, the three Grid tests (the `data-cell`, `tabindex` and `aria-disabled` regexes still match, because the attribute order around them is unchanged) and the LedgerRow tests.

- [ ] **Step 7: Run every gate**

Run (sandbox off, 10-minute timeout): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. `e2e/layout.spec.ts` finds the legend by its test id in the same commit; no other spec keyed on what moved.

- [ ] **Step 8: Commit**

```bash
git add src/components/grid/cell.tsx src/components/grid/render.test.ts src/components/legend.tsx e2e/layout.spec.ts
git commit -m "test(grid): key cell tests on data attributes, not class names"
```

---

### Task 4: Migration 0004, `updateFlight`, `updateHostKit`, `verify-draws` (model: Opus)

Spec §10: every member has a stored flight from the start, drawn at random on the server when the `users` row is created, with existing members backfilled the same way; hosts store a kit; a draw records once whether it checks out. This task adds the columns (`users.flight_colour`, `users.flight_shape`, `users.flight_chosen_at`, `host_profiles.kit_dark`, `host_profiles.kit_light`, `draws.verified_at`) with their `CHECK`s in migration `0004_flights_kits`. The random default is a column default that picks from the eight colours and the four shapes. Because Postgres evaluates a volatile default once per existing row when the column is added, the generated statement is also the backfill and the `NOT NULL`; a test pins that (recorded ruling 16). The hand SQL after the breakpoint re-declares `draws_update_guard`: 0000's guard refuses every update except voiding, so `verified_at` could never be set without it. The task also adds `updateFlight` and `updateHostKit` (their events, onboarded and banned checks, and tier checks), the pure form parsers in `src/app/account/parse.ts`, `verified_at` at the point `finaliseDraw` records a draw, and `scripts/verify-draws.ts`, which runs `verifyInputs` over existing draws. The pickers and their server actions are Task 16.

**Files:**
- Modify: `src/db/schema.ts` (`users`, `hostProfiles`, `draws`)
- Create (generated, then appended): `src/db/migrations/0004_flights_kits.sql`; Create (generated): `src/db/migrations/meta/0004_snapshot.json`; Modify (generated): `src/db/migrations/meta/_journal.json`
- Modify: `src/db/migrations.test.ts`, `src/db/schema.test.ts`, `src/domain/flights.test.ts`
- Modify: `src/domain/users/commands.ts` (`updateFlight`), `src/domain/users/commands.test.ts`
- Modify: `src/domain/breaks/commands.ts` (`updateHostKit`), `src/domain/breaks/commands.test.ts`
- Modify: `src/app/account/parse.ts` (`parseFlight`, `parseKit`), `src/app/account/parse.test.ts`
- Create: `src/domain/draws/public-inputs.ts`, `src/domain/draws/verify-stored.ts`, `src/domain/draws/verify-stored.test.ts`
- Modify: `src/domain/draws/commands.ts` (`finaliseDraw` sets `verifiedAt`)
- Create: `scripts/verify-draws.ts`

**Interfaces:**
- Consumes: `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `DARK_COLOURS`, `LIGHT_COLOURS`, `isFlightColour`, `isFlightShape`, `FlightColour`, `FlightShape` (Task 2); `assertOnboarded` (`src/auth/authz.ts`); `appendEvent`; `InvalidInput`, `NotAuthorized`, `NotFound`; `verifyInputs`, `PublicInputs` (`src/crypto/verify.ts`); fixtures `makeUser`, `drawnBreak`.
- Produces:
  - Columns: `users.flight_colour text NOT NULL DEFAULT (array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int]` with `users_flight_colour_chk`; `users.flight_shape text NOT NULL DEFAULT (array['standard','kite','slim','pear'])[1 + floor(random() * 4)::int]` with `users_flight_shape_chk`; `users.flight_chosen_at timestamptz NULL`; `host_profiles.kit_dark text NULL` (`host_profiles_kit_dark_chk`: petrol, blue, plum), `host_profiles.kit_light text NULL` (`host_profiles_kit_light_chk`: yellow, orange, lime, sky, pink), `host_profiles_kit_pair_chk` (both null or neither); `draws.verified_at timestamptz NULL`, settable once from null on a draw that is not voided. Drizzle: `users.flightColour`, `users.flightShape`, `users.flightChosenAt`, `hostProfiles.kitDark`, `hostProfiles.kitLight`, `draws.verifiedAt`.
  - `updateFlight(tx, caller, { colour: FlightColour; shape: FlightShape }): Promise<void>` (`src/domain/users/commands.ts`): onboarded and not banned; sets the flight and `flight_chosen_at`; event `user.profile_updated` with `{ changed: ["flight"] }` (never the values, recorded ruling 10); a no-op once chosen and unchanged.
  - `updateHostKit(tx, caller, { dark: FlightColour; light: FlightColour }): Promise<void>` (`src/domain/breaks/commands.ts`): onboarded, not banned, role host or admin, own profile only; upserts `host_profiles` lazily as `savePaymentHandles` does; event `host.profile_updated` with `{ changed: ["kit"] }` (never the values, recorded ruling 10); a no-op when unchanged. Column and argument names are dark/light (recorded ruling 9).
  - `parseFlight(form)`, `parseKit(form)` (`src/app/account/parse.ts`); form fields `flight` (`"<colour>-<shape>"`), `kitDark`, `kitLight`.
  - `publicInputsOf(d, seedCommitment): PublicInputs` (`src/domain/draws/public-inputs.ts`); `verifyStoredDraws(tx): Promise<{ checked: number; verified: number }>` (`src/domain/draws/verify-stored.ts`).
  - `scripts/verify-draws.ts`: `pnpm exec tsx scripts/verify-draws.ts` (env from `ENV_FILE`, default `.env.local`; an explicit `DATABASE_URL` wins) prints `checked <n> draws, <m> verified`.

- [ ] **Step 1: Write the failing migration and constraint tests**

In `src/db/migrations.test.ts`, replace

```ts
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";
```

with

```ts
import { sql, type SQL } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks, hostProfiles } from "@/db/schema";
import type { Tx } from "@/db/client";
import { FLIGHT_COLOURS, FLIGHT_SHAPES } from "@/domain/flights";
```

and append at the end of the file:

```ts
/** A failed statement aborts the transaction, so each attempt runs in its own savepoint. Drizzle wraps the driver error; the constraint name is on `.cause`. */
async function refusal(tx: Tx, q: SQL): Promise<string> {
  const e = await tx.transaction((sp) => sp.execute(q)).then(() => null, (err: unknown) => err);
  return String((e as { cause?: unknown } | null)?.cause ?? e);
}

describe("migration 0004 flights and kits", () => {
  it("gives every new member a random flight from the 32, drawn on the server", async () => {
    await withTx(async (tx) => {
      const rows = await tx.execute<{ flight_colour: string; flight_shape: string; flight_chosen_at: Date | null }>(sql`
        insert into users (id, email) select gen_random_uuid(), 'f' || g || '@example.com' from generate_series(1, 400) g
        returning flight_colour, flight_shape, flight_chosen_at`);
      expect(rows).toHaveLength(400);
      // 400 draws miss one of eight colours with probability about 5e-23: every key shows up.
      expect(new Set(rows.map((r) => r.flight_colour))).toEqual(new Set(Object.keys(FLIGHT_COLOURS)));
      expect(new Set(rows.map((r) => r.flight_shape))).toEqual(new Set(Object.keys(FLIGHT_SHAPES)));
      expect(rows.every((r) => r.flight_chosen_at === null)).toBe(true);
    });
  });

  it("fills each existing row with its own draw when the column is added (the backfill)", async () => {
    const text = readFileSync(new URL("./migrations/0004_flights_kits.sql", import.meta.url), "utf8");
    const add = text.split("--> statement-breakpoint").map((s) => s.trim()).find((s) => s.startsWith('ALTER TABLE "users" ADD COLUMN "flight_colour"'));
    expect(add).toBe(`ALTER TABLE "users" ADD COLUMN "flight_colour" text DEFAULT (array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int] NOT NULL;`);
    await withTx(async (tx) => {
      // The migration's own statement against a stand-in table with 64 existing rows: random() runs once per row.
      await tx.execute(sql`create temp table t0004 (n int) on commit drop`);
      await tx.execute(sql`insert into t0004 select generate_series(1, 64)`);
      await tx.execute(sql.raw(add!.replace('ALTER TABLE "users"', "ALTER TABLE t0004")));
      const [r] = await tx.execute<{ kinds: number; missing: number }>(sql`
        select count(distinct flight_colour)::int as kinds, count(*) filter (where flight_colour is null)::int as missing from t0004`);
      expect(r.missing).toBe(0);
      expect(r.kinds).toBeGreaterThan(1);
    });
  });

  it("refuses a flight outside the set, and no flight at all", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await refusal(tx, sql`update users set flight_colour = 'red' where id = ${u.id}`)).toMatch(/users_flight_colour_chk/);
      expect(await refusal(tx, sql`update users set flight_shape = 'dart' where id = ${u.id}`)).toMatch(/users_flight_shape_chk/);
      expect(await refusal(tx, sql`update users set flight_colour = null where id = ${u.id}`)).toMatch(/null value/);
    });
  });

  it("keeps a kit to one dark and one light colour, or neither", async () => {
    await withTx(async (tx) => {
      const h = await makeUser(tx, { role: "host" });
      const kit = (dark: string | null, light: string | null) => sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${h.id}, ${dark}, ${light})`;
      expect(await refusal(tx, kit("yellow", "pink"))).toMatch(/host_profiles_kit_dark_chk/);
      expect(await refusal(tx, kit("petrol", "blue"))).toMatch(/host_profiles_kit_light_chk/);
      expect(await refusal(tx, kit("petrol", null))).toMatch(/host_profiles_kit_pair_chk/);
      await tx.execute(kit("petrol", "pink"));
      const [row] = await tx.select({ kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight }).from(hostProfiles).where(sql`${hostProfiles.userId} = ${h.id}`);
      expect(row).toEqual({ kitDark: "petrol", kitLight: "pink" });
    });
  });
});
```

Append at the end of `src/db/schema.test.ts`:

```ts
describe("draws.verified_at (migration 0004)", () => {
  let hostId: string;
  beforeAll(async () => {
    hostId = (await sql`insert into users (id, email, role) values (gen_random_uuid(), 'v@example.com', 'host') returning id`)[0].id;
  });

  const freshDraw = async (): Promise<string> => {
    const [b] = await sql`insert into breaks (host_id, title, line_count, line_price_cents, status, seed_commitment)
      values (${hostId}, 'v', 2, 2000, 'drawing', encode(sha256('breaks-commit-v1'::bytea || decode(${ZERO_SECRET}, 'base64')), 'hex')) returning id`;
    const [r] = await sql`insert into draw_requests (break_id, attempt, requested_by, beacon_round) values (${b.id}, 1, ${hostId}, 1) returning id`;
    const [d] = await sql`insert into draws (break_id, request_id, secret, beacon_round, beacon_randomness, beacon_signature, seed, algorithm_version, entries_snapshot, ranking, result_hash, run_by)
      values (${b.id}, ${r.id}, ${ZERO_SECRET}, 1, 'aa', 'bb', 'cc', 1, '[]'::jsonb, '[1,2]'::jsonb, 'dd', ${hostId}) returning id`;
    return d.id as string;
  };

  it("starts null and is set once, on a draw that is not voided", async () => {
    const id = await freshDraw();
    const [d] = await sql`select verified_at from draws where id = ${id}`;
    expect(d.verified_at).toBeNull();
    await expect(sql`update draws set verified_at = now() where id = ${id}`).resolves.toBeDefined();
    await expect(sql`update draws set verified_at = now() + interval '1 minute' where id = ${id}`).rejects.toThrow(/set once/);
    await expect(sql`update draws set verified_at = null where id = ${id}`).rejects.toThrow(/set once/);
  });

  it("still lets a draw be voided and changes nothing else, and a voided draw takes no check", async () => {
    const id = await freshDraw();
    await expect(sql`update draws set verified_at = now(), ranking = '[2,1]'::jsonb where id = ${id}`).rejects.toThrow(/may only be voided/);
    await expect(sql`update draws set voided_at = now(), void_reason = 'test' where id = ${id}`).resolves.toBeDefined();
    await expect(sql`update draws set verified_at = now() where id = ${id}`).rejects.toThrow(/immutable/);
  });
});
```

In `src/domain/flights.test.ts`, replace

```ts
import { describe, it, expect } from "vitest";
import { contrast, luminance } from "@/lib/contrast";
```

with

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, luminance } from "@/lib/contrast";
```

and append at the end of the file:

```ts
describe("the stored keys match migration 0004", () => {
  it("has the palette's keys in its CHECK lists and its random defaults", () => {
    const text = readFileSync(new URL("../db/migrations/0004_flights_kits.sql", import.meta.url), "utf8");
    const list = (name: string) => text.match(new RegExp(`"${name}" CHECK \\([^)]* in \\(([^)]*)\\)\\)`))?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list("users_flight_colour_chk")).toEqual(Object.keys(FLIGHT_COLOURS));
    expect(list("users_flight_shape_chk")).toEqual(Object.keys(FLIGHT_SHAPES));
    expect(list("host_profiles_kit_dark_chk")).toEqual(DARK_COLOURS);
    expect(list("host_profiles_kit_light_chk")).toEqual(LIGHT_COLOURS);
    const defaults = [...text.matchAll(/array\[([^\]]*)\]/g)].map((m) => m[1].split(",").map((s) => s.trim().replace(/'/g, "")));
    expect(defaults).toEqual([Object.keys(FLIGHT_COLOURS), Object.keys(FLIGHT_SHAPES)]);
  });
});
```

- [ ] **Step 2: Write the failing command, parser and draw tests**

In `src/domain/users/commands.test.ts`, replace

```ts
import { cleanPaymentName, completeOnboarding, nameLocked, normalizeHandle, TERMS_VERSION, updateProfile } from "./commands";
```

with

```ts
import { cleanPaymentName, completeOnboarding, nameLocked, normalizeHandle, TERMS_VERSION, updateFlight, updateProfile } from "./commands";
```

replace

```ts
import { InvalidInput } from "@/domain/errors";
```

with

```ts
import { InvalidInput, NotAuthorized, NotOnboarded } from "@/domain/errors";
```

and append at the end of the file:

```ts
describe("updateFlight", () => {
  const flightEvents = (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    tx.select().from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'user.profile_updated'`);

  it("stores the flight, marks it chosen and logs the change", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ flightColour: "pink", flightShape: "slim" }).where(sql`${users.id} = ${u.id}`);
      await updateFlight(tx, onboarded(u.id), { colour: "blue", shape: "kite" });
      const [row] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(row).toMatchObject({ flightColour: "blue", flightShape: "kite" });
      expect(row.flightChosenAt).not.toBeNull();
      // The changed field's name, never the values (recorded ruling 10).
      expect((await flightEvents(tx, u.id)).map((e) => e.payload)).toEqual([{ changed: ["flight"] }]);
    });
  });
  it("keeping the random flight counts as choosing it, once", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.update(users).set({ flightColour: "sky", flightShape: "pear" }).where(sql`${users.id} = ${u.id}`);
      await updateFlight(tx, onboarded(u.id), { colour: "sky", shape: "pear" });
      const [first] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(first.flightChosenAt).not.toBeNull();
      await updateFlight(tx, onboarded(u.id), { colour: "sky", shape: "pear" });
      const [second] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(second.flightChosenAt).toEqual(first.flightChosenAt);
      expect(await flightEvents(tx, u.id)).toHaveLength(1);
    });
  });
  it("refuses a colour or shape outside the set and changes nothing", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      const [before] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      await expect(updateFlight(tx, onboarded(u.id), { colour: "red" as never, shape: "kite" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateFlight(tx, onboarded(u.id), { colour: "blue", shape: "dart" as never })).rejects.toThrow("Choose one of the 32 flights");
      const [after] = await tx.select().from(users).where(sql`${users.id} = ${u.id}`);
      expect(after).toMatchObject({ flightColour: before.flightColour, flightShape: before.flightShape, flightChosenAt: null });
      expect(await flightEvents(tx, u.id)).toHaveLength(0);
    });
  });
  it("refuses a banned caller and one who has not finished onboarding", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await expect(updateFlight(tx, { ...onboarded(u.id), banned: true }, { colour: "blue", shape: "kite" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateFlight(tx, { ...onboarded(u.id), banned: true }, { colour: "blue", shape: "kite" })).rejects.toThrow(/suspended/);
      await expect(updateFlight(tx, { ...onboarded(u.id), onboarded: false }, { colour: "blue", shape: "kite" })).rejects.toBeInstanceOf(NotOnboarded);
    });
  });
});
```

In `src/domain/breaks/commands.test.ts`, replace

```ts
import { createDraft, openBreak, updateDraft } from "./commands";
```

with

```ts
import { createDraft, openBreak, updateDraft, updateHostKit } from "./commands";
```

and append at the end of the file:

```ts
describe("updateHostKit", () => {
  const kitEvents = (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    tx.select().from(events).where(sql`${events.actorId} = ${id} and ${events.type} = 'host.profile_updated'`);
  const profile = async (tx: Parameters<Parameters<typeof withTx>[0]>[0], id: string) =>
    (await tx.select().from(hostProfiles).where(sql`${hostProfiles.userId} = ${id}`))[0];

  it("creates the profile row when there is none and logs that the kit changed", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await updateHostKit(tx, asHost(host), { dark: "petrol", light: "pink" });
      expect(await profile(tx, host.id)).toMatchObject({ kitDark: "petrol", kitLight: "pink", paymentHandles: {} });
      expect((await kitEvents(tx, host.id)).map((e) => e.payload)).toEqual([{ changed: ["kit"] }]);
    });
  });
  it("keeps the payment handles, logs each change, and does nothing when the kit is unchanged", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await createDraft(tx, asHost(host), { ...input, paymentHandles: { venmo: "@Jim-R" } });
      await updateHostKit(tx, asHost(host), { dark: "petrol", light: "pink" });
      await updateHostKit(tx, asHost(host), { dark: "plum", light: "sky" });
      await updateHostKit(tx, asHost(host), { dark: "plum", light: "sky" });
      expect(await profile(tx, host.id)).toMatchObject({ kitDark: "plum", kitLight: "sky", paymentHandles: { venmo: "@Jim-R" } });
      const payloads = (await kitEvents(tx, host.id)).map((e) => e.payload);
      expect(payloads).toEqual([{ changed: ["kit"] }, { changed: ["kit"] }]); // never the colours (recorded ruling 10)
    });
  });
  it("refuses a colour outside the set or in the wrong tier, and stores nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(updateHostKit(tx, asHost(host), { dark: "yellow", light: "pink" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateHostKit(tx, asHost(host), { dark: "blue", light: "plum" })).rejects.toBeInstanceOf(InvalidInput);
      await expect(updateHostKit(tx, asHost(host), { dark: "blue", light: "red" as never })).rejects.toThrow("Choose a dark colour and a light colour for your kit");
      expect(await profile(tx, host.id)).toBeUndefined();
    });
  });
  it("is for hosts only, and never for a banned host", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx);
      const host = await makeUser(tx, { role: "host" });
      await expect(updateHostKit(tx, asMember(member), { dark: "blue", light: "yellow" })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(updateHostKit(tx, { ...asHost(host), banned: true }, { dark: "blue", light: "yellow" })).rejects.toThrow(/suspended/);
      expect(await kitEvents(tx, host.id)).toHaveLength(0);
    });
  });
});
```

In `src/app/account/parse.test.ts`, replace

```ts
import { parseAccount } from "./parse";
```

with

```ts
import { parseAccount, parseFlight, parseKit } from "./parse";
```

and append at the end of the file:

```ts
describe("parseFlight", () => {
  it("reads one of the 32 flights from the picker's single radio group", () => {
    expect(parseFlight(form({ flight: "blue-kite" }))).toEqual({ ok: true, input: { colour: "blue", shape: "kite" } });
    expect(parseFlight(form({ flight: "pink-standard" }))).toEqual({ ok: true, input: { colour: "pink", shape: "standard" } });
  });
  it("refuses anything else with one message", () => {
    for (const flight of ["red-kite", "blue-dart", "blue", "blue-kite-slim", ""]) {
      expect(parseFlight(form({ flight })), flight).toEqual({ ok: false, error: "Choose one of the 32 flights" });
    }
    expect(parseFlight(form({}))).toEqual({ ok: false, error: "Choose one of the 32 flights" });
  });
});

describe("parseKit", () => {
  it("reads one dark and one light colour", () => {
    expect(parseKit(form({ kitDark: "plum", kitLight: "sky" }))).toEqual({ ok: true, input: { dark: "plum", light: "sky" } });
  });
  it("refuses swapped tiers, unknown colours and a missing half", () => {
    const error = { ok: false, error: "Choose a dark colour and a light colour for your kit" };
    expect(parseKit(form({ kitDark: "sky", kitLight: "plum" }))).toEqual(error);
    expect(parseKit(form({ kitDark: "red", kitLight: "sky" }))).toEqual(error);
    expect(parseKit(form({ kitDark: "plum" }))).toEqual(error);
  });
});
```

Create `src/domain/draws/verify-stored.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, drawnBreak } from "../../../tests/helpers/fixtures";
import { breaks, draws, drawRequests } from "@/db/schema";
import type { Tx } from "@/db/client";
import { verifyInputs } from "@/crypto/verify";
import { publicInputsOf } from "./public-inputs";
import { verifyStoredDraws } from "./verify-stored";

/**
 * A ran break whose active draw predates migration 0004: the fixture's draw is voided and recorded again without
 * verified_at (a new request, the same secret, so the commitment guard passes). `tamper` reverses its ranking.
 */
async function unverifiedDraw(tx: Tx, o: { tamper?: boolean } = {}) {
  const host = await makeUser(tx, { role: "host" });
  const buyer = await makeUser(tx);
  const b = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
  const [d] = await tx.select().from(draws).where(eq(draws.id, b.drawId));
  await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "recorded again for the 0004 backfill test" }).where(eq(draws.id, d.id));
  const [req] = await tx.insert(drawRequests).values({ breakId: b.id, attempt: 2, requestedBy: host.id, beaconRound: d.beaconRound, status: "done" }).returning({ id: drawRequests.id });
  const [again] = await tx.insert(draws).values({
    breakId: d.breakId, requestId: req.id, secret: d.secret, beaconRound: d.beaconRound, beaconRandomness: d.beaconRandomness,
    beaconSignature: d.beaconSignature, seed: d.seed, algorithmVersion: d.algorithmVersion, entriesSnapshot: d.entriesSnapshot,
    ranking: o.tamper ? [...d.ranking].reverse() : d.ranking, resultHash: d.resultHash, runBy: d.runBy,
  }).returning();
  return again;
}

describe("draws.verified_at", () => {
  it("is set when finaliseDraw records a draw that checks out", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const buyer = await makeUser(tx);
      const b = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const [d] = await tx.select().from(draws).where(eq(draws.id, b.drawId));
      // The fixture's returned row predates openBreakWithLines' commitment update, so read the commitment back.
      const [{ seedCommitment }] = await tx.select({ seedCommitment: breaks.seedCommitment }).from(breaks).where(eq(breaks.id, b.id));
      expect(d.verifiedAt).toBeInstanceOf(Date);
      expect(verifyInputs(publicInputsOf(d, seedCommitment)).ok).toBe(true);
    });
  });
  it("is backfilled for a genuine draw and left empty for a tampered one", async () => {
    await withTx(async (tx) => {
      const genuine = await unverifiedDraw(tx);
      const tampered = await unverifiedDraw(tx, { tamper: true });
      expect([genuine.verifiedAt, tampered.verifiedAt]).toEqual([null, null]);
      const r = await verifyStoredDraws(tx);
      expect(r.checked).toBeGreaterThanOrEqual(2);
      expect(r.verified).toBeGreaterThanOrEqual(1);
      const [g] = await tx.select().from(draws).where(eq(draws.id, genuine.id));
      const [t] = await tx.select().from(draws).where(eq(draws.id, tampered.id));
      expect(g.verifiedAt).toBeInstanceOf(Date);
      expect(t.verifiedAt).toBeNull();
      // A second run never touches a draw it already marked.
      await verifyStoredDraws(tx);
      const [g2] = await tx.select().from(draws).where(eq(draws.id, genuine.id));
      expect(g2.verifiedAt).toEqual(g.verifiedAt);
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/db src/domain/flights.test.ts src/domain/users src/domain/breaks/commands.test.ts src/app/account src/domain/draws`
Expected: FAIL. `migrations.test.ts`: `column "flight_colour" does not exist` and `ENOENT … 0004_flights_kits.sql`; `schema.test.ts`: `column "verified_at" does not exist`; `flights.test.ts`: ENOENT; `updateFlight`, `updateHostKit`, `parseFlight` and `parseKit` are not functions; `verify-stored.test.ts` fails to resolve `./public-inputs`.

- [ ] **Step 4: Add the columns to the schema**

In `src/db/schema.ts`, in `users` replace

```ts
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_handle_lower_idx").on(sql`lower(${t.handle})`),
  check("users_role_chk", sql`${t.role} in ('member','host','admin')`),
  check("users_payment_name_chk", sql`char_length(${t.paymentName}) <= 60`),
]);
```

with

```ts
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /**
   * The member's flight (Mosaic §4): drawn at random from the 32 by the database when the row is created, never derived
   * from the id (ids and handles are public on result pages). Holder data: shapeGrid decides who sees it.
   */
  flightColour: text("flight_colour").notNull().default(sql`(array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int]`),
  flightShape: text("flight_shape").notNull().default(sql`(array['standard','kite','slim','pear'])[1 + floor(random() * 4)::int]`),
  /** Null until the member picks a flight on /account; "This is your flight" shows while it is null. */
  flightChosenAt: timestamp("flight_chosen_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_handle_lower_idx").on(sql`lower(${t.handle})`),
  check("users_role_chk", sql`${t.role} in ('member','host','admin')`),
  check("users_payment_name_chk", sql`char_length(${t.paymentName}) <= 60`),
  check("users_flight_colour_chk", sql`${t.flightColour} in ('petrol','blue','plum','yellow','orange','lime','sky','pink')`),
  check("users_flight_shape_chk", sql`${t.flightShape} in ('standard','kite','slim','pear')`),
]);
```

Replace the `hostProfiles` table with:

```ts
export const hostProfiles = pgTable("host_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  paymentHandles: jsonb("payment_handles").$type<{ venmo?: string; paypal?: string }>().notNull().default({}),
  paymentHandlesChangedAt: timestamp("payment_handles_changed_at", { withTimezone: true }),
  bio: text("bio"),
  verifiedFbSince: integer("verified_fb_since"), // nullable now; avoids a later migration
  /** The host's kit (Mosaic §4): one dark and one light flight colour. Both null is the default, Blue with Yellow. */
  kitDark: text("kit_dark"),
  kitLight: text("kit_light"),
  createdAt: createdAt(),
}, (t) => [
  check("host_profiles_kit_dark_chk", sql`${t.kitDark} in ('petrol','blue','plum')`),
  check("host_profiles_kit_light_chk", sql`${t.kitLight} in ('yellow','orange','lime','sky','pink')`),
  check("host_profiles_kit_pair_chk", sql`(${t.kitDark} is null) = (${t.kitLight} is null)`),
]);
```

In `draws`, replace

```ts
  voidReason: text("void_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("draws_active_uq").on(t.breakId).where(sql`${t.voidedAt} is null`),
]);
```

with

```ts
  voidReason: text("void_reason"),
  /** When verifyInputs passed on the recorded inputs (Mosaic §9 "draws verified"); set once, never on a voided draw. */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("draws_active_uq").on(t.breakId).where(sql`${t.voidedAt} is null`),
]);
```

- [ ] **Step 5: Generate migration 0004**

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name flights_kits`
Expected: drizzle-kit writes `src/db/migrations/0004_flights_kits.sql`, `src/db/migrations/meta/0004_snapshot.json` and a `_journal.json` entry tagged `0004_flights_kits`, without prompting. The SQL file must contain exactly these eleven statements, each ending `;--> statement-breakpoint` except the last (whitespace and drizzle-kit's statement order aside):

```sql
ALTER TABLE "users" ADD COLUMN "flight_colour" text DEFAULT (array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int] NOT NULL;
ALTER TABLE "users" ADD COLUMN "flight_shape" text DEFAULT (array['standard','kite','slim','pear'])[1 + floor(random() * 4)::int] NOT NULL;
ALTER TABLE "users" ADD COLUMN "flight_chosen_at" timestamp with time zone;
ALTER TABLE "host_profiles" ADD COLUMN "kit_dark" text;
ALTER TABLE "host_profiles" ADD COLUMN "kit_light" text;
ALTER TABLE "draws" ADD COLUMN "verified_at" timestamp with time zone;
ALTER TABLE "users" ADD CONSTRAINT "users_flight_colour_chk" CHECK ("users"."flight_colour" in ('petrol','blue','plum','yellow','orange','lime','sky','pink'));
ALTER TABLE "users" ADD CONSTRAINT "users_flight_shape_chk" CHECK ("users"."flight_shape" in ('standard','kite','slim','pear'));
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_dark_chk" CHECK ("host_profiles"."kit_dark" in ('petrol','blue','plum'));
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_light_chk" CHECK ("host_profiles"."kit_light" in ('yellow','orange','lime','sky','pink'));
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_pair_chk" CHECK (("host_profiles"."kit_dark" is null) = ("host_profiles"."kit_light" is null));
```

The first two statements are the random defaults, the backfill and the `NOT NULL` in one: adding a column with a volatile default makes Postgres rewrite `users` and evaluate `random()` once per existing row (pinned by the "fills each existing row" test), so there is no separate hand-written backfill (recorded ruling 16). If drizzle-kit prompts, or the SQL differs from the eleven statements above (a default without the outer parentheses around the array is a difference), answer nothing, stop and report BLOCKED: migration.

Then check the journal order: `node -e 'const e=require("./src/db/migrations/meta/_journal.json").entries;console.log(e[4].tag, e[4].when>e[3].when?"ok":"BAD")'` must print `0004_flights_kits ok`; if it prints `BAD`, stop and report BLOCKED: migration.

- [ ] **Step 6: Append the hand SQL: the draws guard learns `verified_at`**

0000's `draws_update_guard` raises "draws may only be voided" on every update that does not set `voided_at`, so neither the backfill nor any later check could set `verified_at`. Append to the end of `src/db/migrations/0004_flights_kits.sql` (after the last generated statement, starting on a new line):

```sql

--> statement-breakpoint
-- draws: insert-only, except voiding once (voided_at, voided_by, void_reason) and recording the check once
-- (verified_at from null to a time, on a draw that is not voided). Re-declares 0000's guard with the second rule.
create or replace function draws_update_guard() returns trigger language plpgsql as $$
begin
  if old.voided_at is not null then
    raise exception 'voided draws are immutable' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id
     or new.break_id is distinct from old.break_id
     or new.request_id is distinct from old.request_id
     or new.secret is distinct from old.secret
     or new.beacon_round is distinct from old.beacon_round
     or new.beacon_randomness is distinct from old.beacon_randomness
     or new.beacon_signature is distinct from old.beacon_signature
     or new.seed is distinct from old.seed
     or new.algorithm_version is distinct from old.algorithm_version
     or new.entries_snapshot::text is distinct from old.entries_snapshot::text
     or new.ranking::text is distinct from old.ranking::text
     or new.result_hash is distinct from old.result_hash
     or new.run_by is distinct from old.run_by
     or new.created_at is distinct from old.created_at then
    raise exception 'draws may only be voided' using errcode = 'check_violation';
  end if;
  if new.verified_at is distinct from old.verified_at then
    if old.verified_at is not null or new.verified_at is null or new.voided_at is not null then
      raise exception 'draws.verified_at is set once' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.voided_at is null then
    raise exception 'draws may only be voided' using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

The trigger `draws_update` from 0000 keeps pointing at this function by name; nothing else is re-created. The new columns need no policy: every table already has forced deny-all RLS.

- [ ] **Step 7: Apply it to the three databases**

Run: `ENV_FILE=.env.local pnpm db:migrate && ENV_FILE=.env.test pnpm db:migrate && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate`
Expected: `migrated` three times. Any error: stop and report BLOCKED: migration.

- [ ] **Step 8: Write `updateFlight`**

In `src/domain/users/commands.ts`, replace

```ts
import { assertOnboarded } from "@/auth/authz";
```

with

```ts
import { assertOnboarded } from "@/auth/authz";
import { isFlightColour, isFlightShape, type FlightColour, type FlightShape } from "@/domain/flights";
```

and append at the end of the file:

```ts
/**
 * /account "Your flight" (Mosaic §4, §10): any of the 32, at once everywhere (a flight is identity, not per break).
 * Choosing marks flight_chosen_at, keeping the random one included; once chosen, the same flight again is a no-op.
 */
export async function updateFlight(tx: Tx, caller: Caller, p: { colour: FlightColour; shape: FlightShape }): Promise<void> {
  assertOnboarded(caller);
  // Error copy: recorded ruling 15.
  if (!isFlightColour(p.colour) || !isFlightShape(p.shape)) throw new InvalidInput("Choose one of the 32 flights");
  const [cur] = await tx.select({ colour: users.flightColour, shape: users.flightShape, chosenAt: users.flightChosenAt })
    .from(users).where(sql`${users.id} = ${caller.id}`).for("update");
  if (!cur) throw new NotFound("Account not found");
  if (cur.colour === p.colour && cur.shape === p.shape && cur.chosenAt) return;
  await tx.update(users).set({ flightColour: p.colour, flightShape: p.shape, flightChosenAt: new Date() }).where(sql`${users.id} = ${caller.id}`);
  // The changed field's name, never the values (spec §10, recorded ruling 10), as updateProfile logs its fields.
  await appendEvent(tx, { actorId: caller.id, type: "user.profile_updated", payload: { changed: ["flight"] } });
}
```

- [ ] **Step 9: Write `updateHostKit`**

In `src/domain/breaks/commands.ts`, replace

```ts
import { hostPaymentHandles } from "./queries";
```

with

```ts
import { hostPaymentHandles } from "./queries";
import { DARK_COLOURS, LIGHT_COLOURS, type FlightColour } from "@/domain/flights";
```

and insert directly above the line `/** Rank-1 items (several make a choice) and rank-2 items (blank names skipped), each with its prize row. */`:

```ts
/**
 * /account "Your kit" (Mosaic §4, §10): one dark and one light colour, the board's surround. Hosts (and admins, who
 * may host) set their own only. host_profiles rows are created lazily, so this upserts exactly as savePaymentHandles
 * does and logs `host.profile_updated` with `changed: ["kit"]`, never the colours (recorded ruling 10). Kits may be
 * shared between hosts (recorded ruling 2).
 */
export async function updateHostKit(tx: Tx, caller: Caller, p: { dark: FlightColour; light: FlightColour }): Promise<void> {
  assertOnboarded(caller);
  // Error copy: recorded ruling 15.
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts have a kit");
  if (!DARK_COLOURS.includes(p.dark) || !LIGHT_COLOURS.includes(p.light)) throw new InvalidInput("Choose a dark colour and a light colour for your kit");
  const [cur] = await tx.select({ kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight }).from(hostProfiles)
    .where(eq(hostProfiles.userId, caller.id)).for("update");
  if (cur && cur.kitDark === p.dark && cur.kitLight === p.light) return;
  await tx.insert(hostProfiles).values({ userId: caller.id, kitDark: p.dark, kitLight: p.light })
    .onConflictDoUpdate({ target: hostProfiles.userId, set: { kitDark: p.dark, kitLight: p.light } });
  await appendEvent(tx, { actorId: caller.id, type: "host.profile_updated", payload: { changed: ["kit"] } });
}

```

- [ ] **Step 10: Write the form parsers**

In `src/app/account/parse.ts`, replace

```ts
import { z } from "zod";
```

with

```ts
import { z } from "zod";
import { DARK_COLOURS, LIGHT_COLOURS, isFlightColour, isFlightShape, type FlightColour, type FlightShape } from "@/domain/flights";
```

and append at the end of the file:

```ts
export type FlightInput = { colour: FlightColour; shape: FlightShape };
export type KitInput = { dark: FlightColour; light: FlightColour };

/** FormData → updateFlight input. The picker is one radio group named "flight" whose values are "<colour>-<shape>". */
export function parseFlight(form: FormData): { ok: true; input: FlightInput } | { ok: false; error: string } {
  const v = form.get("flight");
  const [colour, shape, extra] = typeof v === "string" ? v.split("-") : [];
  if (colour && shape && extra === undefined && isFlightColour(colour) && isFlightShape(shape)) return { ok: true, input: { colour, shape } };
  return { ok: false, error: "Choose one of the 32 flights" };
}

/** FormData → updateHostKit input: radio groups "kitDark" (petrol, blue, plum) and "kitLight" (yellow, orange, lime, sky, pink). */
export function parseKit(form: FormData): { ok: true; input: KitInput } | { ok: false; error: string } {
  const dark = form.get("kitDark");
  const light = form.get("kitLight");
  if (typeof dark === "string" && typeof light === "string" && isFlightColour(dark) && isFlightColour(light) && DARK_COLOURS.includes(dark) && LIGHT_COLOURS.includes(light)) {
    return { ok: true, input: { dark, light } };
  }
  return { ok: false, error: "Choose a dark colour and a light colour for your kit" };
}
```

- [ ] **Step 11: Record the check when a draw is recorded, and the backfill**

Create `src/domain/draws/public-inputs.ts`:

```ts
import type { draws } from "@/db/schema";
import type { PublicInputs } from "@/crypto/verify";

type DrawInputs = Pick<typeof draws.$inferSelect, "breakId" | "algorithmVersion" | "secret" | "beaconRound" | "beaconRandomness" | "entriesSnapshot" | "ranking" | "resultHash">;

/** A recorded draw as the result page and /result.json publish it: what verifyInputs checks. */
export function publicInputsOf(d: DrawInputs, seedCommitment: string | null): PublicInputs {
  return {
    breakId: d.breakId,
    version: d.algorithmVersion,
    secret: d.secret,
    beaconRound: d.beaconRound,
    beaconRandomness: d.beaconRandomness,
    entries: d.entriesSnapshot.map((e) => ({ number: e.number, ownerId: e.ownerId })),
    ranking: d.ranking,
    resultHash: d.resultHash,
    seedCommitment,
  };
}
```

Create `src/domain/draws/verify-stored.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws } from "@/db/schema";
import { verifyInputs } from "@/crypto/verify";
import { publicInputsOf } from "./public-inputs";

/**
 * The draws.verified_at backfill (migration 0004, scripts/verify-draws.ts): the result page's check over every active
 * draw not yet marked. A draw that fails stays null. Voided draws are immutable and never counted.
 */
export async function verifyStoredDraws(tx: Tx): Promise<{ checked: number; verified: number }> {
  const rows = await tx.select({ draw: draws, seedCommitment: breaks.seedCommitment }).from(draws)
    .innerJoin(breaks, eq(breaks.id, draws.breakId)).where(and(isNull(draws.verifiedAt), isNull(draws.voidedAt)));
  let verified = 0;
  for (const r of rows) {
    if (!verifyInputs(publicInputsOf(r.draw, r.seedCommitment)).ok) continue;
    await tx.update(draws).set({ verifiedAt: new Date() }).where(eq(draws.id, r.draw.id));
    verified += 1;
  }
  return { checked: rows.length, verified };
}
```

In `src/domain/draws/commands.ts`, replace

```ts
import { roundAfter, type BeaconSource } from "@/crypto/beacon";
```

with

```ts
import { roundAfter, type BeaconSource } from "@/crypto/beacon";
import { verifyInputs } from "@/crypto/verify";
import { publicInputsOf } from "./public-inputs";
```

and replace

```ts
  const [d] = await tx.insert(draws).values({
    breakId: b.id, requestId: req.id, secret: Buffer.from(secret).toString("base64"), beaconRound: req.beaconRound,
    beaconRandomness: bytesToHex(bv.randomness), beaconSignature: bv.signature, seed: bytesToHex(seed), algorithmVersion: ALGORITHM_VERSION,
    entriesSnapshot: entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId!, handleAtDraw: e.handle ?? "", isBonus: e.isBonus })),
    ranking, resultHash, runBy: caller.id,
  }).returning({ id: draws.id });
```

with

```ts
  const row = {
    breakId: b.id, requestId: req.id, secret: Buffer.from(secret).toString("base64"), beaconRound: req.beaconRound,
    beaconRandomness: bytesToHex(bv.randomness), beaconSignature: bv.signature, seed: bytesToHex(seed), algorithmVersion: ALGORITHM_VERSION,
    entriesSnapshot: entryRows.map((e) => ({ number: e.number, ownerId: e.ownerId!, handleAtDraw: e.handle ?? "", isBonus: e.isBonus })),
    ranking, resultHash, runBy: caller.id,
  };
  // The host record's "draws verified" (Mosaic §9, recorded ruling 7): the result page's own check, run once here.
  const verified = verifyInputs(publicInputsOf(row, b.seedCommitment)).ok;
  const [d] = await tx.insert(draws).values({ ...row, verifiedAt: verified ? new Date() : null }).returning({ id: draws.id });
```

- [ ] **Step 12: Write the backfill script**

Create `scripts/verify-draws.ts`:

```ts
// Usage: ENV_FILE=.env.local pnpm exec tsx scripts/verify-draws.ts   (an explicit DATABASE_URL wins over the file)
// Backfills draws.verified_at (migration 0004): runs verifyInputs over every active draw not yet marked. Safe to run
// again: a marked draw is never checked twice. Run it after migrating, on every database.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { verifyStoredDraws } from "../src/domain/draws/verify-stored";

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema });
    const r = await db.transaction((tx) => verifyStoredDraws(tx));
    console.log(`checked ${r.checked} draws, ${r.verified} verified`);
    return 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
```

- [ ] **Step 13: Run the tests to see them pass**

Run: `pnpm test src/db src/domain/flights.test.ts src/domain/users src/domain/breaks/commands.test.ts src/app/account src/domain/draws`
Expected: PASS, including the four "migration 0004" tests, the two `draws.verified_at` schema tests (and the existing "lets a draw be voided but not otherwise changed" and "freezes draws.id even when voiding" tests, which still match `/voided/`), the four `updateFlight` and four `updateHostKit` tests, the parser tests and both `verify-stored` tests.

- [ ] **Step 14: Run the backfill on the three databases**

Run: `ENV_FILE=.env.local pnpm exec tsx scripts/verify-draws.ts && ENV_FILE=.env.test pnpm exec tsx scripts/verify-draws.ts && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm exec tsx scripts/verify-draws.ts`
Expected: three lines `checked <n> draws, <m> verified`. On the local database `m` equals `n` (every draw there was run by the app). On `breaks_test`, the draws `schema.test.ts` leaves behind carry made-up inputs (`'aa'`, `'dd'`) and stay unverified, so `m` may be smaller. `breaks_e2e` is emptied by every e2e run, so `n` may be 0. A thrown error: stop and report it.

- [ ] **Step 15: Run every gate**

Run (sandbox off, 10-minute timeout): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:e2e`
Expected: all green. `pnpm test:concurrency` covers `finaliseDraw`, which now verifies before inserting. Users created by `/test/login` and by `makeUser` get their random flight from the column default. Nothing reads the flight or kit yet.

- [ ] **Step 16: Commit**

```bash
git add src/db/schema.ts src/db/migrations src/db/migrations.test.ts src/db/schema.test.ts src/domain/flights.test.ts src/domain/users src/domain/breaks/commands.ts src/domain/breaks/commands.test.ts src/app/account/parse.ts src/app/account/parse.test.ts src/domain/draws scripts/verify-draws.ts
git commit -m "feat(db): migration 0004 for flights, kits and verified draws, with the flight and kit commands"
```

---

### Task 5: The holder gate: `GridCell.flight`, kit and heat in models, `ogModel`, privacy tests (model: Opus)

Flights are holder data (spec §6). `getBreakPage` selects each holder's stored flight from its existing `users` join and the host's kit from its existing `hostProfiles` join, through one path for every caller. `shapeGrid` stays the only gate: a cell's `flight` is set under exactly the condition that sets its `holder` (`showHolders && l.ownerId`), after the per-break collision rule of spec §5 is applied from claim order. `GridModel` gains the public `kit` and `heat` (the lamp frozen at 4 from Closed on). `ogModel`'s input is narrowed to a line-state type with no handle or flight field (a Plan B deferred finding). It rebuilds the page field by field, so a caller passing a full `BreakPage` still leaks nothing, and it emits per cell only number, tone and, on won cells, place, plus `kit` and `heat`. `listFeed` carries `kit` and `heat` per card, `hostProfile` carries `kit`, and `feedThumbs` is unchanged. The tests pin Review Focus item 1: `grid.test.ts` "sets a flight exactly where it sets a holder", one test per viewer row of the §6 matrix, `og.test.ts` "has no flight key" and `feed.test.ts` "carries kit and heat and no flight". The e2e adds the cell assertion "no anonymous or non-holder cell has `data-flight` or `--fc`" now, so it holds from the moment Task 7 starts drawing flights. Nothing on screen changes.

**Files:**
- Modify: `src/domain/breaks/queries.ts` (`BreakPage`, `getBreakPage`, `HostProfile`, `hostProfile`)
- Modify: `src/domain/breaks/grid.ts` (whole file)
- Modify: `src/domain/breaks/og.ts` (whole file)
- Modify: `src/domain/breaks/feed.ts` (`FeedBreak`, `listFeed`)
- Modify: `src/app/b/[id]/og/route.tsx` (the `won` tone, interim)
- Modify: `src/domain/breaks/grid.test.ts`, `src/domain/breaks/og.test.ts`, `src/domain/breaks/feed.test.ts`, `src/domain/breaks/queries.test.ts`
- Modify: `src/components/grid/render.test.ts`, `src/components/break/selection.test.ts`, `src/app/dev/components/page.tsx` (`flight: null` on hand-built cells)
- Modify: `e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `flightOf`, `kitFor`, `heatStep`, `COLLISION_ORDER`, `WATCHED_PAIR`, `Flight`, `FlightColour`, `FlightShape`, `Kit`, `HeatStep` (Task 2); `users.flightColour`, `users.flightShape`, `hostProfiles.kitDark`, `hostProfiles.kitLight` (Task 4).
- Produces:
  - `BreakPage.host.kit: Kit`; `BreakPage.lines[]` gains `ownerFlightColour: string | null; ownerFlightShape: string | null`.
  - `GridCell.flight: Flight | null` (set exactly where `holder` is); `GridModel.kit: Kit; GridModel.heat: HeatStep` (always set).
  - `shownFlights(holders: readonly { id: string; firstClaimAt: Date; flight: Flight }[]): Map<string, Flight>` (`grid.ts`).
  - `OgTone = "open" | "taken" | "paid" | "reserved" | "won"`; `OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 }`; `OgModel = { title; caption; cells: OgCell[]; columns; kit: Kit; heat: HeatStep }`; `OgLine`, `OgPage` (with optional `places`); `ogModel(page: OgPage, now: Date): OgModel | null`.
  - `FeedBreak.kit: Kit; FeedBreak.heat: HeatStep`; `HostProfile.kit: Kit`.

- [ ] **Step 1: Write the failing grid tests**

In `src/domain/breaks/grid.test.ts`, replace

```ts
import { shapeGrid, canViewBreak, allowanceFor, type GridViewer } from "./grid";
```

with

```ts
import { shapeGrid, shownFlights, canViewBreak, allowanceFor, type GridViewer } from "./grid";
import type { Flight } from "@/domain/flights";
```

replace

```ts
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const held = (number: number, ownerId: string, ownerHandle: string, o: Partial<L> = {}): L =>
  ({ ...open(number), ownerId, ownerHandle, claimedAt: hoursAgo(1), priceCents: 500, ...o });
```

with

```ts
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
/** Each holder's stored flight. */
const FLIGHT: Record<string, [string, string]> = { [ALICE]: ["pink", "slim"], [BOB]: ["blue", "kite"], [HOST]: ["plum", "pear"], [CAROL]: ["sky", "standard"] };
const held = (number: number, ownerId: string, ownerHandle: string, o: Partial<L> = {}): L =>
  ({ ...open(number), ownerId, ownerHandle, ownerFlightColour: FLIGHT[ownerId][0], ownerFlightShape: FLIGHT[ownerId][1], claimedAt: hoursAgo(1), priceCents: 500, ...o });
```

replace

```ts
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: {} },
```

with

```ts
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: {}, kit: { dark: "blue", light: "yellow" } },
```

replace

```ts
    expect(cell2(null)).toEqual({ number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null });
```

with

```ts
    expect(cell2(null)).toEqual({ number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null, flight: null });
```

and append at the end of the file:

```ts
const pinkSlim: Flight = { colour: "pink", shape: "slim" };
const blueKite: Flight = { colour: "blue", shape: "kite" };
const plumPear: Flight = { colour: "plum", shape: "pear" };

// Review Focus 1: an open break where alice holds a sent line (3), an overdue line (2) and a bonus line (7);
// bob holds a paid line (4); the host holds line 5 themselves.
const focus: L[] = [
  open(1), held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice", { sentAt: hoursAgo(0.5) }),
  held(4, BOB, "bob", { paidAt: hoursAgo(2) }), held(5, HOST, "jim"), open(6),
  held(7, ALICE, "alice", { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];
const gate = (viewer: GridViewer | null) =>
  shapeGrid(page(focus), viewer, now).cells.map((c) => ({ n: c.number, holder: c.holder, flight: c.flight, mine: c.mine, overdue: c.overdue }));
const none = { holder: null, flight: null, mine: false, overdue: false };

describe("the holder gate (Mosaic §6)", () => {
  it("sets a flight exactly where it sets a holder (Review Focus 1)", () => {
    for (const viewer of [null, v(CAROL)]) {
      const g = shapeGrid(page(focus), viewer, now);
      expect(g.cells.every((c) => c.flight === null && c.holder === null && !c.overdue)).toBe(true);
      const text = JSON.stringify(g);
      for (const s of ["alice", ALICE, "pink", "slim", "kite", "pear"]) expect(text, s).not.toContain(s);
    }
    for (const viewer of [v(BOB), v(ALICE), v(HOST, "host"), v(ADMIN, "admin")]) {
      const g = shapeGrid(page(focus), viewer, now);
      for (const c of g.cells) expect(c.flight === null, `line ${c.number} for ${viewer.id}`).toBe(c.holder === null);
      expect(g.cells.filter((c) => c.holder === "alice").map((c) => c.flight)).toEqual([pinkSlim, pinkSlim, pinkSlim]);
    }
  });
  it("anonymous: no holder, no flight, nothing mine, nothing overdue", () => {
    expect(gate(null)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, ...none })));
  });
  it("signed in with no line here: the same as anonymous", () => {
    expect(gate(v(CAROL))).toEqual(gate(null));
  });
  it("holder: every holder's flight and handle, their own lines mine, never overdue", () => {
    expect(gate(v(BOB))).toEqual([
      { n: 1, ...none },
      { n: 2, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 3, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 4, holder: "bob", flight: blueKite, mine: true, overdue: false },
      { n: 5, holder: "jim", flight: plumPear, mine: false, overdue: false },
      { n: 6, ...none },
      { n: 7, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
    ]);
  });
  it("host: holders, flights, their own self-claimed line, and overdue", () => {
    expect(gate(v(HOST, "host"))).toEqual([
      { n: 1, ...none },
      { n: 2, holder: "alice", flight: pinkSlim, mine: false, overdue: true },
      { n: 3, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 4, holder: "bob", flight: blueKite, mine: false, overdue: false },
      { n: 5, holder: "jim", flight: plumPear, mine: true, overdue: false },
      { n: 6, ...none },
      { n: 7, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
    ]);
  });
  it("admin: as the host, with no line of their own", () => {
    expect(gate(v(ADMIN, "admin"))).toEqual(gate(v(HOST, "host")).map((c) => ({ ...c, mine: false })));
  });
});

describe("the per-break collision rule (Mosaic §5)", () => {
  const at = (h: number) => hoursAgo(h);
  const f = (colour: Flight["colour"], shape: Flight["shape"]): Flight => ({ colour, shape });

  it("a shared flight: the later holder shows the next shape after their own", () => {
    const m = shownFlights([{ id: "b", firstClaimAt: at(1), flight: f("blue", "kite") }, { id: "a", firstClaimAt: at(2), flight: f("blue", "kite") }]);
    expect(m.get("a")).toEqual(f("blue", "kite"));
    expect(m.get("b")).toEqual(f("blue", "slim"));
  });
  it("a shared shape in a watched pair: yellow and lime, petrol and plum", () => {
    const m = shownFlights([
      { id: "a", firstClaimAt: at(4), flight: f("yellow", "pear") }, { id: "b", firstClaimAt: at(3), flight: f("lime", "pear") },
      { id: "c", firstClaimAt: at(2), flight: f("petrol", "standard") }, { id: "d", firstClaimAt: at(1), flight: f("plum", "standard") },
    ]);
    expect(m.get("b")).toEqual(f("lime", "kite"));
    expect(m.get("d")).toEqual(f("plum", "pear"));
  });
  it("a shared shape outside a watched pair stays as stored", () => {
    const m = shownFlights([{ id: "a", firstClaimAt: at(2), flight: f("blue", "pear") }, { id: "b", firstClaimAt: at(1), flight: f("sky", "pear") }]);
    expect(m.get("b")).toEqual(f("sky", "pear"));
  });
  it("with all four shapes taken in the pair, the flight shows unchanged", () => {
    const m = shownFlights([
      { id: "a", firstClaimAt: at(5), flight: f("petrol", "standard") }, { id: "b", firstClaimAt: at(4), flight: f("plum", "pear") },
      { id: "c", firstClaimAt: at(3), flight: f("petrol", "kite") }, { id: "d", firstClaimAt: at(2), flight: f("plum", "slim") },
      { id: "e", firstClaimAt: at(1), flight: f("petrol", "standard") },
    ]);
    expect(m.get("e")).toEqual(f("petrol", "standard"));
  });
  it("is the same for every member viewer, and a release gives the shape back", () => {
    // carol shares alice's pink slim and claimed later, so she shows pink standard (the next shape after slim).
    const lines6: L[] = [open(1), held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice"), held(4, BOB, "bob"), open(5),
      held(6, CAROL, "carol", { ownerFlightColour: "pink", ownerFlightShape: "slim", claimedAt: hoursAgo(0.5) })];
    const carolCell = (ls: L[], viewer: GridViewer) => shapeGrid(page(ls), viewer, now).cells.find((c) => c.number === 6)!.flight;
    expect(carolCell(lines6, v(BOB))).toEqual(f("pink", "standard"));
    expect(carolCell(lines6, v(HOST, "host"))).toEqual(f("pink", "standard"));
    expect(carolCell(lines6, v(CAROL))).toEqual(f("pink", "standard"));
    expect(shapeGrid(page(lines6), v(BOB), now).cells.find((c) => c.number === 2)!.flight).toEqual(pinkSlim);
    const released = lines6.map((l) => (l.ownerId === ALICE ? open(l.number) : l));
    expect(carolCell(released, v(BOB))).toEqual(pinkSlim);
  });
});

describe("kit and heat on the grid model (Mosaic §4, §6)", () => {
  it("carries the host's kit and the lamp's step for every viewer, frozen from Closed on", () => {
    // `lines`: 2 of 6 numbered lines open, so 4 claimed: floor(4 × 4 / 6) = 2.
    for (const viewer of [null, v(CAROL), v(ALICE), v(HOST, "host")]) {
      const g = shapeGrid(page(lines), viewer, now);
      expect(g.kit).toEqual({ dark: "blue", light: "yellow" });
      expect(g.heat).toBe(2);
    }
    for (const status of ["filled", "drawing", "drawn"]) expect(shapeGrid(page(lines, { status }), null, now).heat).toBe(4);
    expect(shapeGrid(page(lines, { status: "cancelled" }), null, now).heat).toBe(2);
  });
});
```

- [ ] **Step 2: Write the failing preview, feed and profile tests**

In `src/domain/breaks/og.test.ts`, replace

```ts
import type { BreakPage } from "./queries";
import { ogCaption, ogModel } from "./og";
```

with

```ts
import type { BreakPage } from "./queries";
import type { Kit } from "@/domain/flights";
import { ogCaption, ogModel } from "./og";
```

replace

```ts
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const alice = (number: number, o: Partial<L> = {}): L => ({ ...open(number), ownerId: ALICE, ownerHandle: "alice", claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
```

with

```ts
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const alice = (number: number, o: Partial<L> = {}): L => ({ ...open(number), ownerId: ALICE, ownerHandle: "alice", ownerFlightColour: "pink", ownerFlightShape: "slim", claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}, kit: Kit = { dark: "blue", light: "yellow" }): BreakPage {
```

replace

```ts
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
```

with

```ts
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" }, kit },
```

replace

```ts
      columns: 4,
      cells: [
```

with

```ts
      columns: 4,
      kit: { dark: "blue", light: "yellow" },
      heat: 2,
      cells: [
```

and, inside `describe("ogModel (Review Focus 4)", …)`, after the test `"is null for a draft, whoever asks"`, add:

```ts
  it("has no flight key (Review Focus 1)", () => {
    // A full BreakPage, flights and handles included, goes in: the model is rebuilt from line state only.
    const m = ogModel(page(lines, {}, { dark: "petrol", light: "orange" }), now)!;
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "kit", "title"]);
    expect(m.kit).toEqual({ dark: "petrol", light: "orange" });
    expect(m.cells.every((c) => Object.keys(c).every((k) => ["number", "tone", "place"].includes(k)))).toBe(true);
    const text = JSON.stringify(m);
    for (const s of ["alice", ALICE, "pink", "slim", "flight", "holder", "Jim-R"]) expect(text, s).not.toContain(s);
  });
  it("marks the won places on a ran break, and only there", () => {
    const paid = [1, 2, 3, 4, 5, 6].map((n) => alice(n, { paidAt: hoursAgo(3) }));
    const places = [{ number: 4, place: 1 as const }, { number: 2, place: 2 as const }, { number: 5, place: 3 as const }];
    const ran = ogModel({ ...page(paid, { status: "drawn" }), places }, now)!;
    expect(ran.cells.filter((c) => c.tone === "won")).toEqual([{ number: 2, tone: "won", place: 2 }, { number: 4, tone: "won", place: 1 }, { number: 5, tone: "won", place: 3 }]);
    expect(ran.heat).toBe(4);
    const notRan = ogModel({ ...page(paid, { status: "filled" }), places }, now)!;
    expect(notRan.cells.some((c) => c.tone === "won")).toBe(false);
  });
```

In `src/domain/breaks/feed.test.ts`, replace

```ts
import { draws, users } from "@/db/schema";
```

with

```ts
import { draws, hostProfiles, users } from "@/db/schema";
```

and append at the end of the file:

```ts
describe("kit and heat on feed cards (Mosaic §6, §10)", () => {
  it("carries kit and heat and no flight (Review Focus 1)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const alice = await makeUser(tx);
      await tx.update(users).set({ flightColour: "pink", flightShape: "slim" }).where(eq(users.id, alice.id));
      await tx.insert(hostProfiles).values({ userId: host.id, kitDark: "petrol", kitLight: "orange" });
      const kitted = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, alice, kitted.id, [1, 2]);
      await markSent(tx, c(alice), { breakId: kitted.id, numbers: [1] });
      const other = await makeUser(tx, { role: "host" });
      const plain = await openBreakWithLines(tx, { hostId: other.id, lineCount: 4 });
      const rows = [
        ...(await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() })),
        ...(await listFeed(tx, { sort: "newest", hostHandle: other.handle, now: new Date() })),
      ];
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[kitted.id]).toMatchObject({ open: 2, kit: { dark: "petrol", light: "orange" }, heat: 2 }); // 2 of 4 claimed
      expect(by[plain.id]).toMatchObject({ open: 4, kit: { dark: "blue", light: "yellow" }, heat: 0 }); // no profile: the default kit
      const text = JSON.stringify(rows);
      expect(text).not.toMatch(/flight|pink|slim/);
      expect(text).not.toContain(alice.id);
      expect(text).not.toContain(alice.handle);
    });
  });
});
```

In `src/domain/breaks/queries.test.ts`, replace

```ts
import { breaks } from "@/db/schema";
```

with

```ts
import { breaks, hostProfiles } from "@/db/schema";
```

replace

```ts
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "handle", "id", "pastCount", "since"]);
```

with

```ts
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "handle", "id", "kit", "pastCount", "since"]);
      expect(p!.kit).toEqual({ dark: "blue", light: "yellow" });
```

and, inside `describe("hostProfile", …)`, after the test `"is null for an unknown handle, the SYSTEM user, and anyone not a host who never listed a break"`, add:

```ts
  it("carries the host's kit, and nothing else from the profile row", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await tx.insert(hostProfiles).values({ userId: host.id, kitDark: "plum", kitLight: "lime", paymentHandles: { venmo: "@Secret-Pay" } });
      const p = await hostProfile(tx, host.handle);
      expect(p!.kit).toEqual({ dark: "plum", light: "lime" });
      expect(JSON.stringify(p)).not.toContain("Secret-Pay");
    });
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/domain/breaks`
Expected: FAIL. `grid.test.ts` cannot import `shownFlights` (`… is not a function`), and the cell `toEqual` with `flight: null` fails on the missing key; `og.test.ts` fails on the missing `kit` and `heat` keys and the missing `won` tone; `feed.test.ts` and `queries.test.ts` fail on the missing `kit`.

- [ ] **Step 4: Select flights and the kit in `getBreakPage` and the kit in `hostProfile`**

In `src/domain/breaks/queries.ts`, replace

```ts
import { SYSTEM } from "@/domain/types";
```

with

```ts
import { SYSTEM } from "@/domain/types";
import { kitFor, type Kit } from "@/domain/flights";
```

replace the `BreakPage` type and `getBreakPage` (from `export type BreakPage = {` to the closing `}` of `getBreakPage`) with:

```ts
export type BreakPage = {
  break: typeof breaks.$inferSelect;
  host: { id: string; handle: string | null; displayName: string | null; paymentHandles: { venmo?: string; paypal?: string }; kit: Kit };
  items: (typeof breakItems.$inferSelect)[];
  prizes: (typeof prizes.$inferSelect)[];
  /** Holders' handles and flights are read for everyone; shapeGrid alone decides who sees them (Mosaic §6). */
  lines: {
    number: number; ownerId: string | null; ownerHandle: string | null; ownerFlightColour: string | null; ownerFlightShape: string | null;
    claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; priceCents: number | null; reservedForMiniId: string | null; isBonus: boolean;
  }[];
};

export async function getBreakPage(tx: Tx, breakId: string): Promise<BreakPage | null> {
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
  if (!b) return null;
  const [host] = await tx.select({
    id: users.id, handle: users.handle, displayName: users.displayName, paymentHandles: hostProfiles.paymentHandles,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, b.hostId));
  const items = await tx.select().from(breakItems).where(eq(breakItems.breakId, breakId)).orderBy(asc(breakItems.createdAt));
  const prizeRows = await tx.select().from(prizes).where(eq(prizes.breakId, breakId)).orderBy(asc(prizes.rank));
  const lineRows = await tx.select({
    number: lines.number, ownerId: lines.ownerId, ownerHandle: users.handle,
    ownerFlightColour: users.flightColour, ownerFlightShape: users.flightShape,
    claimedAt: lines.claimedAt, sentAt: lines.sentAt,
    paidAt: lines.paidAt, priceCents: lines.priceCents, reservedForMiniId: lines.reservedForMiniId, isBonus: lines.isBonus,
  }).from(lines).leftJoin(users, eq(users.id, lines.ownerId)).where(eq(lines.breakId, breakId)).orderBy(asc(lines.number));
  return {
    break: b,
    host: { id: host.id, handle: host.handle, displayName: host.displayName, paymentHandles: host.paymentHandles ?? {}, kit: kitFor(host) },
    items, prizes: prizeRows, lines: lineRows,
  };
}
```

Replace

```ts
export type HostProfile = { id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number };
```

with

```ts
export type HostProfile = { id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number; kit: Kit };
```

and, in `hostProfile`, replace

```ts
  const [u] = await tx.select({ id: users.id, handle: users.handle, displayName: users.displayName, since: users.createdAt, role: users.role })
    .from(users).where(sql`lower(${users.handle}) = lower(${handle})`);
```

with

```ts
  const [u] = await tx.select({
    id: users.id, handle: users.handle, displayName: users.displayName, since: users.createdAt, role: users.role,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(sql`lower(${users.handle}) = lower(${handle})`);
```

and replace

```ts
  return { id: u.id, handle: u.handle, displayName: u.displayName, since: u.since, breaksRun: c.breaksRun, pastCount: c.pastCount };
```

with

```ts
  return { id: u.id, handle: u.handle, displayName: u.displayName, since: u.since, breaksRun: c.breaksRun, pastCount: c.pastCount, kit: kitFor(u) };
```

- [ ] **Step 5: Gate the flights in `shapeGrid`, with the collision rule, the kit and the heat**

Replace the whole of `src/domain/breaks/grid.ts` with:

```ts
import type { Role } from "@/domain/types";
import { isOverdue } from "@/domain/lines/rules";
import { COLLISION_ORDER, WATCHED_PAIR, flightOf, heatStep, type Flight, type FlightColour, type FlightShape, type HeatStep, type Kit } from "@/domain/flights";
import { GLOBAL_UNPAID_CAP, SELF_CLAIM_SHARE } from "./rules";
import type { BreakPage } from "./queries";

export type CellState = "open" | "taken" | "sent" | "paid" | "reserved";
/** One grid cell as a given viewer may see it. `holder`, `flight` and `overdue` are already gated by the server. */
export type GridCell = { number: number; state: CellState; mine: boolean; overdue: boolean; bonus: boolean; holder: string | null; flight: Flight | null };
export type GridCounts = { open: number; taken: number; sent: number; paid: number; reserved: number; total: number };
export type AllowanceReason = "per_person" | "host" | "global";
export type Allowance = { remaining: number; reason: AllowanceReason; limit: number };
export type ViewerLines = { held: number[]; unsent: number[]; sent: number[]; paid: number[]; owedCents: number; payBy: Date | null };
export type GridViewer = { id: string; role: Role; globalUnpaid: number };
export type GridModel = {
  cells: GridCell[]; counts: GridCounts; hostView: boolean; participant: boolean; showHolders: boolean;
  viewer: ViewerLines | null; allowance: Allowance;
  /** Public and the same for every viewer (Mosaic §4, §6): the host's kit and the lamp's step. */
  kit: Kit; heat: HeatStep;
};

/** From Closed on (closed, running draw, ran) the lamp is frozen at its top step (Mosaic §4 Heat). */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["filled", "drawing", "drawn"]);

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

/**
 * The per-break collision rule (Mosaic §5). Holders in claim order (first claim in this break, ties by id); when one
 * shares a flight with an earlier holder, or a shape within a watched pair (yellow and lime, petrol and plum), they show
 * the next shape after their own in standard → pear → kite → slim that neither their colour nor its pair already shows.
 * With all four taken, the flight shows unchanged. Nothing is stored: a release recomputes, and every member viewer
 * gets the same answer. "Next" is read cyclically from the holder's own shape; claim order is by first claim (recorded ruling 14).
 */
export function shownFlights(holders: readonly { id: string; firstClaimAt: Date; flight: Flight }[]): Map<string, Flight> {
  const ordered = [...holders].sort((a, b) => a.firstClaimAt.getTime() - b.firstClaimAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shown = new Map<FlightColour, Set<FlightShape>>();
  const out = new Map<string, Flight>();
  for (const h of ordered) {
    const { colour } = h.flight;
    const pair = WATCHED_PAIR[colour];
    const taken = (s: FlightShape) => (shown.get(colour)?.has(s) ?? false) || (pair ? (shown.get(pair)?.has(s) ?? false) : false);
    let shape = h.flight.shape;
    if (taken(shape)) {
      const start = COLLISION_ORDER.indexOf(shape);
      shape = [1, 2, 3].map((k) => COLLISION_ORDER[(start + k) % COLLISION_ORDER.length]).find((s) => !taken(s)) ?? h.flight.shape;
    }
    if (!shown.has(colour)) shown.set(colour, new Set());
    shown.get(colour)!.add(shape);
    out.set(h.id, { colour, shape });
  }
  return out;
}

/** Each holder's stored flight and first claim in this break, through the collision rule. */
function holderFlights(ls: BreakPage["lines"]): Map<string, Flight> {
  const first = new Map<string, { firstClaimAt: Date; flight: Flight }>();
  for (const l of ls) {
    if (!l.ownerId || !l.ownerFlightColour || !l.ownerFlightShape) continue;
    const at = l.claimedAt ?? new Date(0);
    const cur = first.get(l.ownerId);
    if (!cur || at < cur.firstClaimAt) first.set(l.ownerId, { firstClaimAt: at, flight: flightOf({ flightColour: l.ownerFlightColour, flightShape: l.ownerFlightShape }) });
  }
  return shownFlights([...first].map(([id, h]) => ({ id, ...h })));
}

export function shapeGrid(page: BreakPage, viewer: GridViewer | null, now: Date): GridModel {
  const b = page.break;
  const hostView = isHostView(b.hostId, viewer);
  const participant = !!viewer && page.lines.some((l) => l.ownerId === viewer.id);
  const showHolders = hostView || participant;
  const sorted = [...page.lines].sort((x, y) => x.number - y.number);
  // Flights are holder data (Mosaic §6): computed only for viewers who see holders, and set exactly where holder is.
  const flights = showHolders ? holderFlights(sorted) : new Map<string, Flight>();

  const cells: GridCell[] = sorted.map((l) => ({
    number: l.number,
    state: stateOf(l),
    mine: !!viewer && l.ownerId === viewer.id,
    overdue: hostView && isOverdue(l, b, now),
    bonus: l.isBonus,
    holder: showHolders && l.ownerId ? l.ownerHandle : null,
    flight: showHolders && l.ownerId ? (flights.get(l.ownerId) ?? null) : null,
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
  const heat = heatStep(counts.open, b.lineCount, CLOSED_STATUSES.has(b.status));
  return { cells, counts, hostView, participant, showHolders, viewer: viewerLines, allowance, kit: page.host.kit, heat };
}
```

- [ ] **Step 6: Narrow the preview's input and add kit, heat and the won places**

Replace the whole of `src/domain/breaks/og.ts` with:

```ts
import { formatMoney } from "@/lib/money";
import type { HeatStep, Kit } from "@/domain/flights";
import { canViewBreak, shapeGrid } from "./grid";
import type { BreakPage } from "./queries";

export type OgTone = "open" | "taken" | "paid" | "reserved" | "won";
export type OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 };
export type OgModel = { title: string; caption: string; cells: OgCell[]; columns: number; kit: Kit; heat: HeatStep };

/** A line as the preview may read it: state only. No handle or flight field exists, so none can be passed in. */
export type OgLine = Omit<BreakPage["lines"][number], "ownerHandle" | "ownerFlightColour" | "ownerFlightShape">;
export type OgPage = {
  break: BreakPage["break"];
  host: Pick<BreakPage["host"], "kit">;
  lines: readonly OgLine[];
  /** The active draw's places on a ran break (the OG route passes them from Task 14 on); ignored otherwise. */
  places?: readonly { number: number; place: 1 | 2 | 3 }[];
};

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
 * The link preview, anonymous by construction (Mosaic §6): link crawlers have no session, so the grid is shaped for no
 * viewer, and the page is rebuilt field by field first, so even a full BreakPage passed in brings no handle or flight.
 * Only each cell's number, tone and (won cells) place leave this function, with the break's kit and heat. Taken and
 * sent share one tone; bonus lines are left out (the image shows lines 1..N). Null when an anonymous viewer may not
 * see the break (a draft).
 */
export function ogModel(page: OgPage, now: Date): OgModel | null {
  const b = page.break;
  if (!canViewBreak(b.status, false)) return null;
  const shaped: BreakPage = {
    break: b,
    host: { id: b.hostId, handle: null, displayName: null, paymentHandles: {}, kit: page.host.kit },
    items: [],
    prizes: [],
    lines: page.lines.map((l) => ({
      number: l.number, ownerId: l.ownerId, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null,
      claimedAt: l.claimedAt, sentAt: l.sentAt, paidAt: l.paidAt, priceCents: l.priceCents, reservedForMiniId: l.reservedForMiniId, isBonus: l.isBonus,
    })),
  };
  const grid = shapeGrid(shaped, null, now);
  const placeOf = new Map(b.status === "drawn" ? (page.places ?? []).map((p) => [p.number, p.place]) : []);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c): OgCell => {
      const place = placeOf.get(c.number);
      return place ? { number: c.number, tone: "won", place } : { number: c.number, tone: c.state === "sent" ? "taken" : c.state };
    });
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.lineCount, b.linePriceCents),
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
    kit: grid.kit,
    heat: grid.heat,
  };
}
```

In `src/app/b/[id]/og/route.tsx`, replace

```tsx
  reserved: { bg: CARD, fg: INK_2, chip: false },
};
```

with

```tsx
  reserved: { bg: CARD, fg: INK_2, chip: false },
  // Interim until Task 14 draws the bull: the route passes no places yet, so no cell is won.
  won: { bg: INK, fg: CARD, chip: false },
};
```

The route keeps calling `ogModel(page, new Date())` with `getBreakPage`'s result: a `BreakPage` is assignable to `OgPage`, and `ogModel` drops its handles and flights. Task 14 makes the route pass `places` from the active draw (`placesOf`, Task 6).

- [ ] **Step 7: Carry the kit and heat on feed cards**

In `src/domain/breaks/feed.ts`, replace

```ts
import { breaks, draws, lines, users } from "@/db/schema";
import type { CellState } from "./grid";
```

with

```ts
import { breaks, draws, hostProfiles, lines, users } from "@/db/schema";
import { heatStep, kitFor, type HeatStep, type Kit } from "@/domain/flights";
import type { CellState } from "./grid";
```

replace

```ts
  host: FeedHost;
};
```

with

```ts
  host: FeedHost;
  /** Public (Mosaic §6): the host's kit and the lamp's step, never a flight. The feed lists open breaks, so the lamp is never closed here. */
  kit: Kit; heat: HeatStep;
};
```

replace

```ts
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, hostSince: users.createdAt, breaksRun,
  }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId)).where(and(...where)).orderBy(...order).limit(p.limit ?? 50);
```

with

```ts
    hostId: users.id, hostHandle: users.handle, hostDisplayName: users.displayName, hostSince: users.createdAt, breaksRun,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(breaks).innerJoin(users, eq(users.id, breaks.hostId)).leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(and(...where)).orderBy(...order).limit(p.limit ?? 50);
```

and replace

```ts
    host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, breaksRun: r.breaksRun, since: r.hostSince },
  }));
```

with

```ts
    host: { id: r.hostId, handle: r.hostHandle, displayName: r.hostDisplayName, breaksRun: r.breaksRun, since: r.hostSince },
    kit: kitFor(r),
    heat: heatStep(r.open, r.lineCount, false),
  }));
```

`feedThumbs` is unchanged: it selects no owner and no flight.

- [ ] **Step 8: Hand-built cells carry `flight: null`**

In `src/components/grid/render.test.ts` and in `src/components/break/selection.test.ts`, replace

```ts
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, ...o });
```

with

```ts
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
```

In `src/app/dev/components/page.tsx`, replace

```tsx
    number: i + 1, state: STATES[i % STATES.length], mine: i % 11 === 3, overdue: i % 13 === 1, bonus: false, holder: null,
  })),
  ...Array.from({ length: 5 }, (_, i): GridCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null })),
```

with

```tsx
    number: i + 1, state: STATES[i % STATES.length], mine: i % 11 === 3, overdue: i % 13 === 1, bonus: false, holder: null, flight: null,
  })),
  ...Array.from({ length: 5 }, (_, i): GridCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null, flight: null })),
```

- [ ] **Step 9: The e2e privacy assertion on cells**

In `e2e/layout.spec.ts`, replace

```ts
  expect(names[2]).toBe("Line 3, taken");
});
```

with

```ts
  expect(names[2]).toBe("Line 3, taken");
  // Mosaic §6: a kit-view cell renders no data-flight and no --fc custom property.
  expect(await page.locator("[data-flight]").count()).toBe(0);
  const styles = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
  expect(styles.filter((s) => s.includes("--fc"))).toEqual([]);
});

test("a signed-in viewer with no line here sees no flight and no handle either (Mosaic §6)", async ({ browser }) => {
  const page = await signedIn(browser, `lq${run}@e2e.test`);
  await page.goto(url);
  const names = await page.locator("button[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names.filter((n) => n.includes(buyerHandle) || n.includes("@"))).toEqual([]);
  expect(await page.locator("[data-flight]").count()).toBe(0);
  const styles = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
  expect(styles.filter((s) => s.includes("--fc"))).toEqual([]);
});
```

Both pass today (no cell draws a flight yet) and keep holding once Task 7 renders `data-flight` and `--fc` for member views.

- [ ] **Step 10: Run the tests to see them pass**

Run: `pnpm test src/domain/breaks src/components src/domain/flights.test.ts`
Expected: PASS, including "sets a flight exactly where it sets a holder (Review Focus 1)", the five matrix tests (anonymous, signed in with no line here, holder, host, admin), the five collision tests, the kit-and-heat test, `og.test.ts` "has no flight key (Review Focus 1)" and "marks the won places on a ran break, and only there", and `feed.test.ts` "carries kit and heat and no flight (Review Focus 1)".

- [ ] **Step 11: Run every gate**

Run (sandbox off, 10-minute timeout): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. `tsc` confirms that every builder of a `GridCell`, a `BreakPage` line and a `BreakPage` host carries the new fields, and that the OG route's `TONE` covers `won`. Lines and draws are unchanged, so `pnpm test:concurrency` is not required. The break page passes only `grid.cells` and named fields to the client, so flights reach the browser only where `shapeGrid` set them, as palette keys.

- [ ] **Step 12: Commit**

```bash
git add src/domain/breaks/queries.ts src/domain/breaks/grid.ts src/domain/breaks/og.ts src/domain/breaks/feed.ts "src/app/b/[id]/og/route.tsx" src/domain/breaks/grid.test.ts src/domain/breaks/og.test.ts src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts src/components/grid/render.test.ts src/components/break/selection.test.ts src/app/dev/components/page.tsx e2e/layout.spec.ts
git commit -m "feat(breaks): flights behind the holder gate, with kit and heat on the grid, feed, profile and preview"
```

---

### Task 6: Kit and heat through the feed, host profile, landing (model: Sonnet, Opus review)

Spec §6 ("Every other viewer, and every surface built without a viewer (link preview, feed, landing, host profile), sees the board in the host's kit and the fill heat") and §10 (`latestRanBreak` returns the ranking's places, the kit and the thumb cells). Task 5 already carries `kit` and `heat` on every `listFeed` card and `kit` on `hostProfile`, with the feed privacy test (recorded ruling 17). This task adds the rest and the plumbing:
- the landing hero: `latestRanBreak` gains the prize places, the kit, the heat (frozen at step 4: a ran break is past Closed) and the thumb cells;
- `placesOf(ranking, prizeRanks)`, the one function that turns a ran break's order into its won places, in `src/domain/draws/places.ts`, which Tasks 12, 14 and 15 import;
- the break page model end to end: `GridModel.kit` and `GridModel.heat` (Task 5) read through `getBreakPage` for every kind of viewer, frozen at step 4 from Closed on.

This task changes no UI: Task 15 draws the cards, hero and profile from these fields. None of these payloads ever carries a flight: `feedThumbs` stays as it is and selects no owner, and the new fields are palette keys of the host's kit, a step number and line numbers.

**Files:**
- Create: `src/domain/draws/places.ts`, `src/domain/draws/places.test.ts`
- Modify: `src/domain/breaks/feed.ts` (`LatestRan`, `latestRanBreak`)
- Modify: `src/domain/breaks/feed.test.ts`, `src/domain/breaks/queries.test.ts`

**Interfaces:**
- Consumes: `Kit`, `HeatStep`, `DEFAULT_KIT`, `kitFor(p: { kitDark: string | null; kitLight: string | null }): Kit`, `heatStep(open, total, closed): HeatStep` (Task 2, `src/domain/flights.ts`); the Drizzle columns `hostProfiles.kitDark`, `hostProfiles.kitLight` and the SQL columns `host_profiles.kit_dark`, `host_profiles.kit_light`, `users.flight_colour`, `users.flight_shape` (Task 4, migration 0004); `FeedBreak.kit`, `FeedBreak.heat`, `HostProfile.kit`, and `GridModel.kit: Kit` and `GridModel.heat: HeatStep` set by `shapeGrid` (Task 5).
- Produces:
  - `src/domain/draws/places.ts`: `type Place = 1 | 2 | 3`; `placesOf(ranking: readonly number[], prizeRanks: readonly number[]): { number: number; place: Place }[]` (recorded ruling 17).
  - `LatestRan = { breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date; kit: Kit; heat: HeatStep; places: { number: number; place: Place }[]; cells: ThumbCell[] }` (`topLine` is kept for today's landing page until Task 15 rewrites it).

- [ ] **Step 1: Write the failing tests**

Create `src/domain/draws/places.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { placesOf } from "./places";

describe("placesOf", () => {
  it("maps each prize rank up to 3 to its line in the drawn order; a place with no prize is skipped", () => {
    expect(placesOf([7, 3, 9, 1], [1, 2, 3])).toEqual([{ number: 7, place: 1 }, { number: 3, place: 2 }, { number: 9, place: 3 }]);
    expect(placesOf([7, 3, 9, 1], [1])).toEqual([{ number: 7, place: 1 }]);
    expect(placesOf([7, 3, 9, 1], [3, 1, 1])).toEqual([{ number: 7, place: 1 }, { number: 9, place: 3 }]);
    expect(placesOf([7, 3, 9, 1], [1, 2, 3, 4])).toHaveLength(3);
    expect(placesOf([7], [1, 2])).toEqual([{ number: 7, place: 1 }]);
    expect(placesOf([], [1])).toEqual([]);
  });
});
```

In `src/domain/breaks/feed.test.ts`, append to the end of the file:

```ts
const setKit = (tx: Tx, hostId: string, dark: string, light: string) =>
  tx.execute(sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${hostId}::uuid, ${dark}, ${light})
    on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`);
const setFlight = (tx: Tx, userId: string, colour: string, shape: string) =>
  tx.execute(sql`update users set flight_colour = ${colour}, flight_shape = ${shape} where id = ${userId}::uuid`);
/** Nothing a flight could be read from: the key itself, and the colour and shape words these tests give the members. */
const NO_FLIGHT = /flight|pink|slim|orange|pear/i;

describe("the landing hero in the host's kit (Mosaic §6, §8, §10; Review Focus 1)", () => {
  it("latestRanBreak carries the kit, heat 4, the prize places and the thumb cells, and no flight", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await setKit(tx, host.id, "petrol", "sky");
      await setFlight(tx, buyer.id, "pink", "slim");
      await setFlight(tx, host.id, "orange", "pear");
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 4 });
      const hero = (await latestRanBreak(tx))!;
      expect(hero).toMatchObject({ breakId: d.id, topLine: d.ranking[0], kit: { dark: "petrol", light: "sky" }, heat: 4 });
      // The fixture's break has one prize, the top spot, so it has one place.
      expect(hero.places).toEqual([{ number: d.ranking[0], place: 1 }]);
      expect(hero.cells).toEqual([1, 2, 3, 4].map((number) => ({ number, state: "paid", bonus: false })));
      expect(JSON.stringify(hero)).not.toMatch(NO_FLIGHT);
      expect(JSON.stringify(hero)).not.toContain(buyer.id);
    });
  });
});
```

In `src/domain/breaks/queries.test.ts`, replace

```ts
import { draftForEdit, hostProfile, hostTrust, isGeneratedInstructions, lastBreakDefaults, listHostBreaks } from "./queries";
```

with

```ts
import { draftForEdit, getBreakPage, hostProfile, hostTrust, isGeneratedInstructions, lastBreakDefaults, listHostBreaks } from "./queries";
import { shapeGrid } from "./grid";
import { DEFAULT_KIT } from "@/domain/flights";
import type { Tx } from "@/db/client";
```

and append to the end of the file:

```ts
const setKit = (tx: Tx, hostId: string, dark: string, light: string) =>
  tx.execute(sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${hostId}::uuid, ${dark}, ${light})
    on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`);

describe("the break page model carries the kit and the heat (Task 5 contract, Mosaic §4 Heat, §6)", () => {
  it("is the same public kit and step for every viewer, and step 4 from Closed on", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx); const stranger = await makeUser(tx);
      await setKit(tx, host.id, "plum", "lime");
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, asCaller(buyer), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      const now = new Date();
      const page = (await getBreakPage(tx, b.id))!;
      const viewers = [
        null,
        { id: stranger.id, role: "member" as const, globalUnpaid: 0 },
        { id: buyer.id, role: "member" as const, globalUnpaid: 2 },
        { id: host.id, role: "host" as const, globalUnpaid: 0 },
      ];
      for (const viewer of viewers) {
        const g = shapeGrid(page, viewer, now);
        expect(g.kit).toEqual({ dark: "plum", light: "lime" });
        expect(g.heat).toBe(2);
      }
      await claimLines(tx, asCaller(buyer), { breakId: b.id, numbers: [3, 4], batchId: randomUUID() });
      for (const number of [1, 2, 3, 4]) await markPaid(tx, asCaller(host, "host"), { breakId: b.id, number, expectedOwnerId: buyer.id });
      const closed = (await getBreakPage(tx, b.id))!;
      expect(closed.break.status).toBe("filled");
      expect(shapeGrid(closed, null, now).heat).toBe(4);
      // A host who never chose: the default kit.
      const other = await makeUser(tx, { role: "host" });
      const plain = await openBreakWithLines(tx, { hostId: other.id, lineCount: 4 });
      expect(shapeGrid((await getBreakPage(tx, plain.id))!, null, now)).toMatchObject({ kit: DEFAULT_KIT, heat: 0 });
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/draws/places.test.ts src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts` (sandbox off)
Expected: FAIL. `./places` does not exist; `latestRanBreak` has no `kit`, `heat`, `places` or `cells`. The `getBreakPage` + `shapeGrid` test should already PASS, because Task 5 built those fields. If it fails, that is a Task 5 defect: report it, and do not patch `shapeGrid` in this task.

- [ ] **Step 3: Write `placesOf`**

Create `src/domain/draws/places.ts`:

```ts
/** A won place on the board: the top spot, 2nd or 3rd (Mosaic §5 won cells). Places past 3rd get no bull. */
export type Place = 1 | 2 | 3;

/**
 * The prize places to draw as won cells (Mosaic §5, §8; recorded ruling 17): every prize rank of 1, 2 or 3 the break
 * has, with the line the draw put there (`ranking[rank - 1]`). A place with no prize is skipped, as in the reveal (§7).
 * The landing hero (Task 6), the result page (Tasks 12, 13), the link preview (Task 14) and the card thumbnails
 * (Task 15) all read places from here.
 */
export function placesOf(ranking: readonly number[], prizeRanks: readonly number[]): { number: number; place: Place }[] {
  const ranks = [...new Set(prizeRanks)].filter((r): r is Place => r === 1 || r === 2 || r === 3).sort((a, b) => a - b);
  return ranks.flatMap((place) => {
    const number = ranking[place - 1];
    return number === undefined ? [] : [{ number, place }];
  });
}
```

- [ ] **Step 4: Carry the kit, the heat, the places and the cells on the landing hero**

In `src/domain/breaks/feed.ts`, replace the import lines as Task 5 left them

```ts
import { sql, eq, and, asc, desc, inArray, isNull, isNotNull, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws, hostProfiles, lines, users } from "@/db/schema";
```

with

```ts
import { sql, eq, and, asc, desc, inArray, isNull, isNotNull, lte, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws, hostProfiles, lines, prizes, users } from "@/db/schema";
import { placesOf, type Place } from "@/domain/draws/places";
```

and replace

```ts
export type LatestRan = { breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date };

/** The landing hero (design §5.2): the most recent main break that ran, read from its active (not voided) draw; never a banned host's. */
export async function latestRanBreak(tx: Tx): Promise<LatestRan | null> {
  const [r] = await tx.select({ breakId: breaks.id, title: breaks.title, lineCount: breaks.lineCount, ranking: draws.ranking, ranAt: draws.createdAt })
    .from(draws).innerJoin(breaks, eq(breaks.id, draws.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .where(and(isNull(draws.voidedAt), eq(breaks.status, "drawn"), eq(breaks.kind, "main"), isNull(users.bannedAt)))
    .orderBy(desc(draws.createdAt), desc(draws.id)).limit(1);
  if (!r || r.ranking.length === 0) return null;
  return { breakId: r.breakId, title: r.title, lineCount: r.lineCount, topLine: r.ranking[0], ranAt: r.ranAt };
}
```

with

```ts
export type LatestRan = {
  breakId: string; title: string; lineCount: number; topLine: number; ranAt: Date;
  kit: Kit; heat: HeatStep;
  /** The black bull cells: each prize place (1 to 3) and the line that took it (placesOf). */
  places: { number: number; place: Place }[];
  /** Line state only, as on feed cards (feedThumbs): no owner is selected. */
  cells: ThumbCell[];
};

/** The landing hero (Mosaic §8): the most recent main break that ran, read from its active (not voided) draw; never a banned host's. */
export async function latestRanBreak(tx: Tx): Promise<LatestRan | null> {
  const [r] = await tx.select({
    breakId: breaks.id, title: breaks.title, lineCount: breaks.lineCount, ranking: draws.ranking, ranAt: draws.createdAt,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  })
    .from(draws).innerJoin(breaks, eq(breaks.id, draws.breakId)).innerJoin(users, eq(users.id, breaks.hostId))
    .leftJoin(hostProfiles, eq(hostProfiles.userId, breaks.hostId))
    .where(and(isNull(draws.voidedAt), eq(breaks.status, "drawn"), eq(breaks.kind, "main"), isNull(users.bannedAt)))
    .orderBy(desc(draws.createdAt), desc(draws.id)).limit(1);
  if (!r || r.ranking.length === 0) return null;
  const ranks = await tx.selectDistinct({ rank: prizes.rank }).from(prizes)
    .where(and(eq(prizes.breakId, r.breakId), lte(prizes.rank, 3))).orderBy(asc(prizes.rank));
  const cells = (await feedThumbs(tx, [r.breakId])).get(r.breakId) ?? [];
  return {
    breakId: r.breakId, title: r.title, lineCount: r.lineCount, topLine: r.ranking[0], ranAt: r.ranAt,
    kit: kitFor({ kitDark: r.kitDark, kitLight: r.kitLight }),
    heat: heatStep(0, r.lineCount, true), // a ran break is past Closed: the lamp is frozen at its top step
    places: placesOf(r.ranking, ranks.map((x) => x.rank)),
    cells,
  };
}
```

(`kitFor`, `heatStep`, `Kit` and `HeatStep` are already imported from `@/domain/flights` by Task 5.)

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm test src/domain/draws/places.test.ts src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts` (sandbox off)
Expected: PASS, including Task 5's "carries kit and heat and no flight (Review Focus 1)".

- [ ] **Step 6: Ask for the Opus review**

This task is Sonnet with an Opus review (task map). Hand the diff to an Opus reviewer with this focus: `latestRanBreak` and `placesOf` carry line numbers, palette keys and a step only (no owner, handle or flight); a voided draw never reaches the hero; a place with no prize is skipped. Fix the findings once; record anything left (Plan B rule).

- [ ] **Step 7: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e` (sandbox off)
Expected: all green. No page reads the new fields yet: the landing page compiles unchanged, because the fields are only added. No lines or draws change, so `pnpm test:concurrency` is not required.

- [ ] **Step 8: Commit**

```bash
git add src/domain/draws/places.ts src/domain/draws/places.test.ts src/domain/breaks/feed.ts src/domain/breaks/feed.test.ts src/domain/breaks/queries.test.ts
git commit -m "feat(feed): the landing hero in the host's kit with its places, and placesOf for every won-cell surface"
```

---

### Task 7: Cell: every state, glyphs, inks, overlay face, ring, bull (model: Opus)

Spec §5, every row of the state table, shape first. Each state gets a shape token that tests can find:

- **Faces:** cream; cream with the hatch layer (`bc-hatch`) and the number chip (`bc-chip`); the pre-rendered overlay face (`bc-face`) in the holder's colour, shown at opacity 1 when paid; `--board-cream-2` for reserved; `--board-ring` when won.
- **Glyph:** top-right, from the `FLIGHT_SHAPES` sprite (`<use href="#flight-<shape>">`, `data-glyph`). Five looks: filled with a 1.25 px ink keyline; outlined in a 2 px ink stroke for yours, not sent; filled in the number's ink on a paid face; ink standard (kit view); cream standard (kit view, paid and won). Hatched cells get a 1 px cream knockout.
- **Marks:** the two-tone yours ring (`bc-ring`, `data-ring` ink-out or cream-out); the sent mark (`bc-sent`); four corner brackets for selected (`bc-brackets`); the ink strike for sniped (`bc-strike`); the red inset edge and a 12 px "!" in the glyph's place for overdue, on the Mosaic face with no flight; the double steel rule and "m" for reserved; the kit-light band with its ink keyline (kit view, claimed).
- **Bull:** a cream disc at the cell's centre, with its ring drawn inside the disc's edge: double red for the top spot, single green for 2nd, dashed green for 3rd.

Every cell also keeps Task 3's named attributes, with Mosaic values: `data-face` (`cream`, `hatch`, `face`, `reserved`, `won`), `data-ink` on the number (`ink`, `cream`, `ink-2`), `data-mark` on each mark, and `data-bonus`, `data-overdue`, `data-selected`, `data-struck` when true (recorded ruling 19). Per-cell custom properties are `--face`, `--num` and `--fc`. The kit view never sets `--fc` or `data-flight`. The bonus "+" and the bonus ink face are retired on the board, and `render.test.ts` changes deliberately. Glyph, inset, disc and number sizes follow §5's size rules: CSS container queries for fluid board cells, the pure `cellMetrics` for cells given a fixed `px` (legend, previews, render tests).

Paper surfaces must not change (§1.1: the ledger's mini cells stay paper, ink and hatch), so today's `Cell` moves verbatim to `PaperCell`. `MiniCells` (ledger, pay sheet, `/me` until Task 18), the old legend and the old thumbnail use it until Task 8 replaces them (recorded ruling 24). Accessible names follow §5: "taken" for other people's sent lines on the board, "just taken" when sniped, "top spot", "2nd place" and "3rd place" from a new `place` on `CellData`. Names never carry a handle or a flight.

**Files:**
- Move: `src/components/grid/cell.tsx` → `src/components/grid/paper-cell.tsx` (renamed `PaperCell`, otherwise unchanged)
- Create: `src/components/grid/cell.tsx` (the board cell), `src/components/grid/cell-metrics.ts`, `src/components/grid/flight-sprite.tsx`
- Modify: `src/components/grid/cell-label.ts`, `src/components/grid/cell-label.test.ts`, `src/components/grid/render.test.ts`
- Modify: `src/components/mini-cells.tsx`, `src/components/legend.tsx`, `src/components/grid/grid-preview.tsx` (import `PaperCell`)
- Modify: `src/app/layout.tsx` (mount the sprite once), `src/app/globals.css` (the board cell block)

**Interfaces:**
- Consumes: board tokens `--board-cream`, `--board-cream-2`, `--board-ink`, `--board-ink-2`, `--board-steel`, `--board-ring`, `--red`, `--green` (Task 1); `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `TOKENS`, `Flight`, `FlightColour`, `FlightShape` (Task 2); Task 3's attribute scheme (`data-state`, `data-face`, `data-mine`, `data-bonus`, `data-overdue`, `data-selected`, `data-struck`, `data-ink`, `data-mark`; recorded ruling 19); `GridCell.flight: Flight | null` (Task 5).
- Produces:
  - `CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus"> & { flight?: Flight | null; place?: 1 | 2 | 3 | null }`.
  - `cellLabel(c: CellData, o?: { struck?: boolean; foldSent?: boolean }): string`, `cellStateWord(c: CellData, o?: { struck?: boolean; foldSent?: boolean }): string` (with no options, paper wording is unchanged).
  - `type CellSize = "md" | "xs" | "thumb"`; `type BoardView = "member" | "kit"`.
  - `Cell({ cell: CellData; view?: BoardView; size?: CellSize; px?: number; selected?; struck?; disabled?; label?; testId?; tabIndex?; onPress? })`. Root `.bc` with `data-state`, `data-size`, `data-mine="true"` (yours), `data-won="1|2|3"` (introduced here), `data-flight="<colour>-<shape>"` (member view only, display-only cells included), `data-face`, and `data-bonus`, `data-overdue`, `data-selected`, `data-struck` when true; the display-only root (`role="img"`) also carries `data-cell`, as the button does. `data-ink` on the number; `data-mark` = `band`, `reserved-rule`, `mini-label`, `bull`, `ring`, `overdue-edge`, `brackets`, `strike`, `sent`, `overdue-glyph`. Layers are `.bc-in` children with the `bc-*` classes (`bc-face`, `bc-hatch`, `bc-band`, `bc-double`, `bc-m`, `bc-bull`, `bc-ring`, `bc-overdue`, `bc-brackets`, `bc-num`, `bc-strike`, `bc-sent`, `bc-glyph`, `bc-bang`); `bc-num` and `bc-glyph` sit at z-index 1. Inline `--face`, `--num`, `--fc` (kit view: `--face: var(--kit-dark)`, `--num: var(--board-cream)`, never `--fc`).
  - `cellMetrics(px: number, o: { mine: boolean; place: 1 | 2 | 3 | null }): { glyph: number; inset: number; disc: number; num: number }`.
  - `FlightSprite()` (symbols `#flight-standard`, `#flight-kite`, `#flight-slim`, `#flight-pear`), mounted once in the root layout.
  - `PaperCell` (today's `Cell`, unchanged, props as before).

- [ ] **Step 1: Write the failing label tests**

In `src/components/grid/cell-label.test.ts`, append inside `describe("cellLabel", () => {` before its closing `});`:

```ts
  it("on the board: other people's sent lines read taken; sniped and won lines are named (Mosaic §5)", () => {
    expect(cellLabel(c({ number: 7, state: "sent" }), { foldSent: true })).toBe("Line 7, taken");
    expect(cellLabel(c({ number: 9, state: "sent", mine: true }), { foldSent: true })).toBe("Line 9, yours, sent");
    // Paper surfaces (the ledger's mini cells) keep the word: the host works from it.
    expect(cellLabel(c({ number: 7, state: "sent" }))).toBe("Line 7, sent");
    expect(cellLabel(c({ number: 7, state: "taken" }), { struck: true, foldSent: true })).toBe("Line 7, just taken");
    expect(cellLabel(c({ number: 23, state: "paid", place: 1 }), { foldSent: true })).toBe("Line 23, top spot");
    expect(cellLabel(c({ number: 9, state: "paid", place: 2 }), { foldSent: true })).toBe("Line 9, 2nd place");
    expect(cellLabel(c({ number: 31, state: "paid", place: 3 }), { foldSent: true })).toBe("Line 31, 3rd place");
    // Recorded ruling 19: your own won line keeps "yours", as its ring does.
    expect(cellLabel(c({ number: 23, state: "paid", place: 1, mine: true }), { foldSent: true })).toBe("Line 23, yours, top spot");
  });
  it("never includes a flight", () => {
    const name = cellLabel(c({ number: 5, state: "paid", flight: { colour: "plum", shape: "kite" } }), { foldSent: true });
    expect(name).toBe("Line 5, paid");
    expect(name).not.toMatch(/plum|kite/);
  });
```

- [ ] **Step 2: Write the failing render tests**

In `src/components/grid/render.test.ts`, replace

```ts
import { createElement, type ReactElement } from "react";
```

with

```ts
import { createElement, type ComponentProps, type ReactElement } from "react";
```

replace

```ts
import { Cell } from "./cell";
import { Grid } from "./grid";
```

with

```ts
import { FLIGHT_COLOURS, FLIGHT_SHAPES, TOKENS, type Flight, type FlightColour, type FlightShape } from "@/domain/flights";
import { Cell } from "./cell";
import { cellMetrics } from "./cell-metrics";
import { PaperCell } from "./paper-cell";
import { FlightSprite } from "./flight-sprite";
import { Grid } from "./grid";
```

replace the helper line (whatever Tasks 3 and 5 left after `const cell = (number: number, o: Partial<GridCell> = {}): GridCell =>`) with

```ts
type C = GridCell & { place?: 1 | 2 | 3 | null };
const cell = (number: number, o: Partial<C> = {}): C => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
```

Then replace the whole block that starts at `describe("Cell: every state has a shape and a name, not only a colour (design §4)", () => {` and ends at the `});` just before `describe("Grid: one group, one tab stop`, with:

```ts
describe("PaperCell: paper surfaces keep the first design (ledger, pay sheet; Mosaic §1.1)", () => {
  it("open: a card face, a toggle", () => {
    const h = html(createElement(PaperCell, { cell: cell(1), onPress: noop }));
    expect(h).toContain('aria-label="Line 1, open"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain("bg-card");
  });
  it("taken: the hatch; sent keeps its word and its dashed edge on paper", () => {
    expect(html(createElement(PaperCell, { cell: cell(2, { state: "taken" }), disabled: true, onPress: noop }))).toContain("bg-hatch");
    const sent = html(createElement(PaperCell, { cell: cell(3, { state: "sent" }), disabled: true, onPress: noop }));
    expect(sent).toContain('aria-label="Line 3, sent"');
    expect(sent).toContain("border-dashed");
  });
  it("paid: the ink face and a white number; no flight, no glyph", () => {
    const h = html(createElement(PaperCell, { cell: cell(4, { state: "paid", flight: { colour: "plum", shape: "kite" } }), disabled: true, onPress: noop }));
    expect(h).toContain("bg-ink");
    expect(h).toContain("text-card");
    expect(h).not.toContain("flight");
  });
});

const plum: Flight = { colour: "plum", shape: "kite" };
const yellow: Flight = { colour: "yellow", shape: "pear" };
const petrol: Flight = { colour: "petrol", shape: "standard" };
const at = (px: number, c: C, o: Partial<ComponentProps<typeof Cell>> = {}) =>
  html(createElement(Cell, { cell: c, px, onPress: noop, disabled: c.state !== "open", ...o }));
const sizeVars = (px: number, o: { mine?: boolean; place?: 1 | 2 | 3 | null } = {}) => {
  const m = cellMetrics(px, { mine: o.mine ?? false, place: o.place ?? null });
  return `--g:${m.glyph}px;--gi:${m.inset}px;--disc:${m.disc}px;--ns:${m.num}px`;
};

describe("cellMetrics: the §5 glyph and won-cell size rules", () => {
  it("sizes glyphs by cell size; yours is larger only from 48 px", () => {
    expect(cellMetrics(44, { mine: false, place: null })).toEqual({ glyph: 14, inset: 2, disc: 0, num: 18 });
    expect(cellMetrics(44.75, { mine: true, place: null })).toEqual({ glyph: 14, inset: 2, disc: 0, num: 18 });
    expect(cellMetrics(48, { mine: false, place: null })).toEqual({ glyph: 14, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(52, { mine: true, place: null })).toEqual({ glyph: 16, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(56, { mine: true, place: null })).toEqual({ glyph: 20, inset: 3, disc: 0, num: 18 });
    expect(cellMetrics(68, { mine: false, place: null })).toEqual({ glyph: 20, inset: 3, disc: 0, num: 18 });
  });
  it("won: a 26 px disc, a 10 px glyph and a 14 px top-spot number under 56 px; 30 px discs above", () => {
    expect(cellMetrics(44.75, { mine: false, place: 1 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 14 });
    expect(cellMetrics(44.75, { mine: false, place: 2 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 16 });
    expect(cellMetrics(55, { mine: true, place: 3 })).toEqual({ glyph: 10, inset: 2, disc: 26, num: 16 });
    expect(cellMetrics(56, { mine: false, place: 1 })).toEqual({ glyph: 14, inset: 3, disc: 30, num: 18 });
    expect(cellMetrics(67, { mine: false, place: 2 })).toEqual({ glyph: 14, inset: 3, disc: 30, num: 18 });
    expect(cellMetrics(68, { mine: false, place: 1 })).toEqual({ glyph: 20, inset: 3, disc: 30, num: 18 });
  });
});

describe("FlightSprite: one sprite, four silhouettes, a non-scaling stroke", () => {
  it("renders each shape's path from FLIGHT_SHAPES once", () => {
    const h = html(createElement(FlightSprite));
    expect(h).toContain('aria-hidden="true"');
    for (const s of Object.keys(FLIGHT_SHAPES) as FlightShape[]) {
      expect(h).toContain(`id="flight-${s}"`);
      expect(h).toContain(`d="${FLIGHT_SHAPES[s].path}"`);
    }
    expect(h.match(/vector-effect="non-scaling-stroke"/g)).toHaveLength(4);
  });
});

for (const px of [44, 56, 68] as const) {
  describe(`Cell at ${px} px: every §5 state, shape first`, () => {
    it("open: cream, a toggle, no glyph", () => {
      const h = at(px, cell(1));
      expect(h).toContain('aria-label="Line 1, open"');
      expect(h).toContain('aria-pressed="false"');
      expect(h).toContain('data-state="open"');
      expect(h).toContain('data-face="cream"');
      expect(h).toContain('data-ink="ink"');
      expect(h).toContain(sizeVars(px));
      expect(h).not.toContain("bc-hatch");
      expect(h).not.toContain("bc-glyph");
      expect(h).not.toContain("data-flight");
    });
    it("selected: pressed, the four corner brackets, no check glyph", () => {
      const h = at(px, cell(1), { selected: true });
      expect(h).toContain('aria-pressed="true"');
      expect(h).toContain('data-selected="true"');
      expect(h).toContain('data-mark="brackets"');
      expect(h).toContain("bc-brackets");
      expect(h.match(/<i><\/i>/g)).toHaveLength(4);
      expect(h).not.toContain("✓");
    });
    it("sniped: as claimed by others, with the ink strike; named just taken", () => {
      const h = at(px, cell(7, { state: "taken", flight: plum, holder: "mike" }), { struck: true });
      expect(h).toContain('aria-label="Line 7, just taken"');
      expect(h).toContain('data-struck="true"');
      expect(h).toContain('data-mark="strike"');
      expect(h).toContain("bc-strike");
      expect(h).toContain("bc-hatch");
      expect(h).toContain('data-glyph="filled"');
      expect(h).not.toContain("mike");
    });
    it("claimed, others (sent folds into taken): hatch, chip, the holder's flight filled with an ink keyline", () => {
      const h = at(px, cell(2, { state: "sent", flight: plum, holder: "mike" }));
      expect(h).toContain('aria-label="Line 2, taken"');
      expect(h).toContain('aria-disabled="true"');
      expect(h).not.toContain("aria-pressed");
      expect(h).toContain("bc-hatch");
      expect(h).toContain('data-face="hatch"');
      expect(h).toContain("bc-chip");
      expect(h).toContain('data-glyph="filled"');
      expect(h).toContain('href="#flight-kite"');
      expect(h).toContain('data-flight="plum-kite"');
      expect(h).toContain(`--fc:${FLIGHT_COLOURS.plum.face}`);
      expect(h).not.toContain("bc-ring");
      expect(h).not.toContain("bc-sent");
      expect(h).not.toContain("mike");
    });
    it("yours, not sent: your flight outlined, the yours ring ink outside", () => {
      const h = at(px, cell(3, { state: "taken", mine: true, flight: yellow }));
      expect(h).toContain('aria-label="Line 3, yours, taken"');
      expect(h).toContain('data-mine="true"');
      expect(h).toContain('data-glyph="outline"');
      expect(h).toContain('data-ring="ink-out"');
      expect(h).toContain('data-mark="ring"');
      expect(h).toContain(sizeVars(px, { mine: true }));
      expect(h).not.toContain("bc-sent");
    });
    it("yours, sent: your flight filled, the ring and the sent mark", () => {
      const h = at(px, cell(3, { state: "sent", mine: true, flight: yellow }));
      expect(h).toContain('aria-label="Line 3, yours, sent"');
      expect(h).toContain('data-glyph="filled"');
      expect(h).toContain("bc-ring");
      expect(h).toContain("bc-sent");
      expect(h).toContain('data-mark="sent"');
    });
    it("overdue (host view): the red inset edge and the ! in the glyph's place, no flight drawn", () => {
      const h = at(px, cell(5, { state: "taken", overdue: true, flight: plum }));
      expect(h).toContain('aria-label="Line 5, taken, overdue"');
      expect(h).toContain("bc-overdue");
      expect(h).toContain('data-overdue="true"');
      expect(h).toContain('data-mark="overdue-edge"');
      expect(h).toContain('data-mark="overdue-glyph"');
      expect(h).toContain(">!<");
      expect(h).toContain("bc-chip");
      expect(h).not.toContain("bc-glyph");
    });
    it("paid: the holder's colour on the overlay, and the number ink switches per tier (Review Focus 3)", () => {
      for (const colour of Object.keys(FLIGHT_COLOURS) as FlightColour[]) {
        const f = FLIGHT_COLOURS[colour];
        const h = at(px, cell(4, { state: "paid", flight: { colour, shape: "slim" } }));
        expect(h).toContain('aria-label="Line 4, paid"');
        expect(h).toContain(`--face:${f.face};--num:${f.ink};--fc:${f.face}`);
        expect(f.ink).toBe(f.tier === "dark" ? TOKENS.boardCream : TOKENS.boardInk);
        expect(h).toContain('data-face="face"');
        expect(h).toContain(`data-ink="${f.tier === "dark" ? "cream" : "ink"}"`);
        expect(h).toContain('data-glyph="on-face"');
        expect(h).toContain("bc-face");
        expect(h).not.toContain("bc-hatch");
      }
    });
    it("yours, paid: the ring turns cream outside on a dark face, ink outside on a light one", () => {
      const dark = at(px, cell(4, { state: "paid", mine: true, flight: petrol }));
      expect(dark).toContain('aria-label="Line 4, yours, paid"');
      expect(dark).toContain('data-ring="cream-out"');
      expect(at(px, cell(4, { state: "paid", mine: true, flight: yellow }))).toContain('data-ring="ink-out"');
    });
    it("reserved for a mini: the double steel rule and the m, no hatch, no glyph", () => {
      const h = at(px, cell(6, { state: "reserved" }));
      expect(h).toContain('aria-label="Line 6, reserved for a mini"');
      expect(h).toContain("bc-double");
      expect(h).toContain('data-face="reserved"');
      expect(h).toContain('data-ink="ink-2"');
      expect(h).toContain('data-mark="reserved-rule"');
      expect(h).toContain('data-mark="mini-label"');
      expect(h).toContain(">m<");
      expect(h).not.toContain("bc-hatch");
      expect(h).not.toContain("bc-glyph");
    });
    it("bonus: drawn as its state; the + is retired; a display-only cell is an image", () => {
      const h = html(createElement(Cell, { cell: cell(51, { state: "paid", bonus: true, flight: yellow }), px }));
      expect(h).toContain('role="img"');
      expect(h).toContain('data-cell="51"');
      expect(h).toContain('data-bonus="true"');
      expect(h).toContain('aria-label="Line 51, bonus, paid"');
      expect(h).not.toContain(">+<");
    });
    for (const [place, name] of [[1, "top spot"], [2, "2nd place"], [3, "3rd place"]] as const) {
      it(`won, ${name}: the black face, the cream bull with its ring, the holder's flight clear of it`, () => {
        const h = at(px, cell(23, { state: "paid", flight: plum, place }));
        expect(h).toContain(`aria-label="Line 23, ${name}"`);
        expect(h).toContain(`data-won="${place}"`);
        expect(h).toContain(`class="bc-bull" data-place="${place}"`);
        expect(h).toContain('data-face="won"');
        expect(h).toContain('data-mark="bull"');
        expect(h).toContain('data-glyph="won"');
        expect(h).toContain(`--fc:${FLIGHT_COLOURS.plum.face}`);
        expect(h).toContain(sizeVars(px, { place }));
        expect(h).not.toContain("bc-hatch");
        expect(h).not.toMatch(/top spot<|place</); // no place word in the cell, only in its name
      });
    }
    it("kit view: an ink standard flight and the kit-light band; no data-flight and no --fc, whatever the data says", () => {
      const claimed = at(px, cell(2, { state: "taken", flight: plum }), { view: "kit" });
      expect(claimed).toContain('aria-label="Line 2, taken"');
      expect(claimed).toContain('data-glyph="kit"');
      expect(claimed).toContain('href="#flight-standard"');
      expect(claimed).toContain("bc-band");
      expect(claimed).toContain('data-mark="band"');
      expect(claimed).toContain("bc-hatch");
      const paid = at(px, cell(4, { state: "paid", flight: plum }), { view: "kit" });
      expect(paid).toContain("--face:var(--kit-dark);--num:var(--board-cream)");
      expect(paid).toContain('data-glyph="kit-paid"');
      const won = at(px, cell(23, { state: "paid", flight: plum, place: 1 }), { view: "kit" });
      expect(won).toContain('data-glyph="won-kit"');
      expect(won).toContain("bc-bull");
      for (const h of [claimed, paid, won]) {
        expect(h).not.toContain("data-flight");
        expect(h).not.toContain("--fc");
      }
    });
  });
}

describe("Cell sizing without px", () => {
  it("leaves the §5 sizes to the container queries: no inline size vars on a fluid board cell", () => {
    expect(html(createElement(Cell, { cell: cell(1), onPress: noop }))).not.toContain("--g:");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/components/grid` (sandbox off)
Expected: FAIL. `./cell-metrics`, `./paper-cell` and `./flight-sprite` do not exist; `cellLabel` takes no options and has no `place`.

- [ ] **Step 4: Move today's cell to `PaperCell`**

Run: `git mv src/components/grid/cell.tsx src/components/grid/paper-cell.tsx`

In `src/components/grid/paper-cell.tsx`, replace

```tsx
export type CellSize = "md" | "sm" | "xs";
```

with

```tsx
export type PaperCellSize = "md" | "sm" | "xs";
```

replace `  size?: CellSize;` with `  size?: PaperCellSize;`, replace

```tsx
const NUMBER_SIZE: Record<CellSize, string> = { md: "text-grid", sm: "text-[13px] leading-none", xs: "hidden" };
```

with

```tsx
const NUMBER_SIZE: Record<PaperCellSize, string> = { md: "text-grid", sm: "text-[13px] leading-none", xs: "hidden" };
```

and replace

```tsx
/** One board segment. Shape carries state (design §4): hatch, dashed edge, ink face, corner flag, glyphs. */
export function Cell({
```

with

```tsx
/**
 * A cell on paper (ledger rows, the pay sheet, /me until Plan C Task 18): the first design's §4, unchanged on purpose
 * (Mosaic §1.1: "paper, ink and hatch mini cells, no flight, no kit, no glyph"). The board uses ./cell.
 */
export function PaperCell({
```

In `src/components/mini-cells.tsx` replace `import { Cell } from "./grid/cell";` with `import { PaperCell } from "./grid/paper-cell";` and `<Cell cell={c} size="sm" boxed` with `<PaperCell cell={c} size="sm" boxed`.

In `src/components/legend.tsx` replace `import { Cell } from "./grid/cell";` with `import { PaperCell } from "./grid/paper-cell";` and `<Cell cell={i.cell} size="xs" boxed />` with `<PaperCell cell={i.cell} size="xs" boxed />` (Task 8 replaces this file).

In `src/components/grid/grid-preview.tsx` replace `import { Cell } from "./cell";` with `import { PaperCell } from "./paper-cell";` and `<Cell key={c.number} cell={c} size="xs" />` with `<PaperCell key={c.number} cell={c} size="xs" />` (Task 8 rewrites this file).

- [ ] **Step 5: Labels: the place, the sniped name, other people's sent as taken**

Replace the whole of `src/components/grid/cell-label.ts` with:

```ts
import type { GridCell } from "@/domain/breaks/grid";
import type { Flight } from "@/domain/flights";

export type CellData = Pick<GridCell, "number" | "state" | "mine" | "overdue" | "bonus"> & {
  /** Member view only: shapeGrid sets it exactly where it sets holder (Mosaic §6). Palette keys, never hex. */
  flight?: Flight | null;
  /** Result page only: the place is public there (Mosaic §5 accessibility). */
  place?: 1 | 2 | 3 | null;
};

const STATE_WORD: Record<CellData["state"], string> = {
  open: "open", taken: "taken", sent: "sent", paid: "paid", reserved: "reserved for a mini",
};
const PLACE_WORD: Record<1 | 2 | 3, string> = { 1: "top spot", 2: "2nd place", 3: "3rd place" };

/**
 * "yours, paid", "taken, overdue": the words a cell's shape already says. `foldSent` is the board's rule (Mosaic §5):
 * other people's sent lines read "taken", because the board does not tell them apart. Paper keeps "sent".
 */
export function cellStateWord(c: CellData, o: { struck?: boolean; foldSent?: boolean } = {}): string {
  if (o.struck) return "just taken";
  const parts: string[] = [];
  if (c.mine) parts.push("yours");
  if (c.bonus) parts.push("bonus");
  if (c.place) parts.push(PLACE_WORD[c.place]);
  else parts.push(o.foldSent && c.state === "sent" && !c.mine ? "taken" : STATE_WORD[c.state]);
  if (c.overdue) parts.push("overdue");
  return parts.join(", ");
}

/** Accessible name. Never a handle and never a flight, for any viewer (Mosaic §5). */
export function cellLabel(c: CellData, o: { struck?: boolean; foldSent?: boolean } = {}): string {
  return `Line ${c.number}, ${cellStateWord(c, o)}`;
}
```

- [ ] **Step 6: The size rules as a pure function**

Create `src/components/grid/cell-metrics.ts`:

```ts
export type CellMetrics = { glyph: number; inset: number; disc: number; num: number };

/**
 * Mosaic §5, for a cell of `px` pixels: the glyph box and its inset from the top-right corner and, on won cells, the
 * bull disc and the number size. Fluid board cells get the same values from container queries in globals.css; this
 * function is for cells drawn at a fixed size (the legend, /account previews, render tests).
 */
export function cellMetrics(px: number, o: { mine: boolean; place: 1 | 2 | 3 | null }): CellMetrics {
  if (o.place !== null) {
    if (px < 56) return { glyph: 10, inset: 2, disc: 26, num: o.place === 1 ? 14 : 16 };
    if (px < 68) return { glyph: 14, inset: 3, disc: 30, num: 18 };
    return { glyph: 20, inset: 3, disc: 30, num: 18 };
  }
  // Under 48 px (every phone) the yours ring, not the glyph size, says yours.
  if (px < 48) return { glyph: 14, inset: 2, disc: 0, num: 18 };
  if (px < 56) return { glyph: o.mine ? 16 : 14, inset: 3, disc: 0, num: 18 };
  return { glyph: 20, inset: 3, disc: 0, num: 18 };
}
```

- [ ] **Step 7: One sprite for the four silhouettes, mounted once**

Create `src/components/grid/flight-sprite.tsx`:

```tsx
import { FLIGHT_SHAPES, type FlightShape } from "@/domain/flights";

const SHAPES = Object.keys(FLIGHT_SHAPES) as FlightShape[];

/**
 * The flight glyphs as one sprite (Mosaic §4): every cell draws `<use href="#flight-<shape>">`. The stroke does not
 * scale, so a 1.25 px keyline stays 1.25 px at 10, 14, 16 and 20 px. Rendered once, in the root layout.
 */
export function FlightSprite() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      {SHAPES.map((s) => (
        <symbol key={s} id={`flight-${s}`} viewBox="0 0 16 16">
          <path d={FLIGHT_SHAPES[s].path} vectorEffect="non-scaling-stroke" />
        </symbol>
      ))}
    </svg>
  );
}
```

In `src/app/layout.tsx`, add below `import { HydrationMark } from "@/components/hydration-mark";`:

```tsx
import { FlightSprite } from "@/components/grid/flight-sprite";
```

and replace

```tsx
        <TzCookie />
```

with

```tsx
        <FlightSprite />
        <TzCookie />
```

- [ ] **Step 8: Write the board cell**

Create `src/components/grid/cell.tsx`:

```tsx
import type { CSSProperties } from "react";
import { FLIGHT_COLOURS, type FlightShape } from "@/domain/flights";
import { cellLabel, type CellData } from "./cell-label";
import { cellMetrics } from "./cell-metrics";

/** md: the board. xs: legend mini cells (16 px). thumb: feed and hero thumbnails (no number, no glyph). */
export type CellSize = "md" | "xs" | "thumb";
/** member: holders' flights, which shapeGrid set; kit: the host's kit only, for anyone who holds no line here (Mosaic §6). */
export type BoardView = "member" | "kit";

type Props = {
  cell: CellData;
  view?: BoardView;
  size?: CellSize;
  /** A fixed pixel size (legend, previews, render tests). Without it the cell fills its track and container queries size it. */
  px?: number;
  selected?: boolean;
  /** Sniped: a selected line someone else just took (client-only, until the next tap). */
  struck?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  tabIndex?: number;
  onPress?: (n: number) => void;
};

type CSSVars = CSSProperties & Record<`--${string}`, string>;
type GlyphKind = "filled" | "outline" | "on-face" | "kit" | "kit-paid" | "won" | "won-kit";

/** Which glyph the §5 table puts top-right, if any. Overdue: the "!" takes its place. Kit view: always the standard shape. */
function glyphOf(c: CellData, view: BoardView): { kind: GlyphKind; shape: FlightShape } | null {
  if (c.overdue) return null;
  if (c.place) return view === "member" && c.flight ? { kind: "won", shape: c.flight.shape } : { kind: "won-kit", shape: "standard" };
  if (c.state === "open" || c.state === "reserved") return null;
  if (view === "kit") return { kind: c.state === "paid" ? "kit-paid" : "kit", shape: "standard" };
  if (!c.flight) return null;
  if (c.state === "paid") return { kind: "on-face", shape: c.flight.shape };
  return { kind: c.mine && c.state === "taken" ? "outline" : "filled", shape: c.flight.shape };
}

/**
 * --face, --num and --fc (Mosaic §7): the pre-rendered overlay's colour, the number's ink on it, the glyph's fill.
 * Set on every claimed cell so the paid overlay can fade in. The kit view never sets --fc (no flight leaves shapeGrid for it).
 */
function faceVars(c: CellData, view: BoardView): CSSVars {
  if (c.state === "open" || c.state === "reserved") return {};
  if (view === "kit") return { "--face": "var(--kit-dark)", "--num": "var(--board-cream)" };
  if (!c.flight) return {};
  const f = FLIGHT_COLOURS[c.flight.colour];
  return { "--face": f.face, "--num": f.ink, "--fc": f.face };
}

function sizeVars(size: CellSize, px: number | undefined, c: CellData): CSSVars | undefined {
  if (size === "xs") return { "--g": "8px", "--gi": "1px" }; // legend minis, recorded ruling 20
  if (size === "thumb") return { "--disc": "48%" }; // thumbnails, recorded ruling 20
  if (px === undefined) return undefined;
  const m = cellMetrics(px, { mine: c.mine, place: c.place ?? null });
  return { "--g": `${m.glyph}px`, "--gi": `${m.inset}px`, "--disc": `${m.disc}px`, "--ns": `${m.num}px` };
}

/** One board cell (Mosaic §5). Shape carries state; the face only adds hue. Styles: the board cell block in globals.css. */
export function Cell({ cell, view = "member", size = "md", px, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const won = !!cell.place;
  const claimed = !won && (cell.state === "taken" || cell.state === "sent");
  const marks = size !== "thumb";
  const glyph = marks ? glyphOf(cell, view) : null;
  const flight = view === "member" ? cell.flight ?? null : null;
  const darkFace = won || (cell.state === "paid" && !!flight && FLIGHT_COLOURS[flight.colour].tier === "dark");
  const numClass = ["bc-num font-condensed font-semibold tabular", claimed && "bc-chip"].filter(Boolean).join(" ");
  // Task 3's named face and ink, with Mosaic values, so tests never key on a class name (recorded ruling 19).
  const face = won ? "won" : cell.state === "reserved" ? "reserved" : claimed ? "hatch" : cell.state === "paid" ? "face" : "cream";
  const numInk = won ? "ink" : cell.state === "reserved" ? "ink-2" : cell.state === "paid" ? (view === "kit" || darkFace ? "cream" : "ink") : "ink";

  const body = (
    <span aria-hidden className="bc-in" style={sizeVars(size, px, cell)}>
      <span className="bc-face" />
      {claimed && marks && <span className="bc-hatch" />}
      {claimed && view === "kit" && <span className="bc-band" data-mark="band" />}
      {cell.state === "reserved" && marks && <span className="bc-double" data-mark="reserved-rule" />}
      {cell.state === "reserved" && size === "md" && <span className="bc-m text-micro" data-mark="mini-label">m</span>}
      {won && <span className="bc-bull" data-place={cell.place} data-mark="bull"><span className="bc-bull-ring" /></span>}
      {cell.mine && marks && <span className="bc-ring" data-ring={darkFace ? "cream-out" : "ink-out"} data-mark="ring" />}
      {cell.overdue && marks && <span className="bc-overdue" data-mark="overdue-edge" />}
      {selected && <span className="bc-brackets" data-mark="brackets"><i /><i /><i /><i /></span>}
      {/* Weight 600 in every state, selected included: 700 is not loaded. */}
      {size === "md" && (
        <span className={numClass} data-ink={numInk}>
          {cell.number}
          {struck && <span className="bc-strike" data-mark="strike" />}
        </span>
      )}
      {cell.mine && cell.state === "sent" && marks && <span className="bc-sent" data-mark="sent" />}
      {glyph && (
        <svg className="bc-glyph" data-glyph={glyph.kind} viewBox="0 0 16 16">
          <use className="bc-knock" href={`#flight-${glyph.shape}`} />
          <use className="bc-mark" href={`#flight-${glyph.shape}`} />
        </svg>
      )}
      {cell.overdue && size === "md" && <span className="bc-bang text-micro font-semibold" data-mark="overdue-glyph">!</span>}
    </span>
  );

  const style: CSSVars = { ...faceVars(cell, view), ...(px !== undefined ? { width: px, height: px } : {}) };
  const data = {
    "data-state": cell.state,
    "data-size": size,
    "data-mine": cell.mine ? "true" : undefined,
    "data-won": cell.place ?? undefined,
    "data-flight": flight ? `${flight.colour}-${flight.shape}` : undefined,
    "data-face": face,
    "data-bonus": cell.bonus ? "true" : undefined,
    "data-overdue": cell.overdue ? "true" : undefined,
    "data-selected": selected ? "true" : undefined,
    "data-struck": struck ? "true" : undefined,
  };
  const name = label ?? cellLabel(cell, { struck, foldSent: true });
  const base = "bc relative block aspect-square w-full select-none";
  if (!onPress) {
    // data-cell on display roots too, so the reveal can find its target cells (Task 12).
    return <div role="img" data-cell={cell.number} {...data} aria-label={name} style={style} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell={cell.number}
      data-testid={testId}
      {...data}
      aria-label={name}
      aria-pressed={cell.state === "open" ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={() => onPress(cell.number)}
      style={style}
      className={`${base} touch-manipulation ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {body}
    </button>
  );
}
```

- [ ] **Step 9: The board cell styles**

Append to `src/app/globals.css`:

```css
/* ---------- Board cells (Mosaic §5). Shape first: every state is a layer or a mark; the face only adds hue. ---------- */
@layer components {
  .bc {
    container-type: inline-size;
    contain: paint;
    background-color: var(--board-cream);
    color: var(--board-ink);
  }
  .bc-in {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    --g: 14px; --gi: 2px; --disc: 26px; --ns: 18px;
  }
  /* §5 sizes for fluid cells. cellMetrics (cell-metrics.ts) is the same table for fixed-size cells. */
  .bc[data-won] .bc-in { --g: 10px; --ns: 16px; }
  .bc[data-won="1"] .bc-in { --ns: 14px; }
  @container (min-width: 48px) {
    .bc:not([data-won]) .bc-in { --gi: 3px; }
    .bc[data-mine="true"]:not([data-won]) .bc-in { --g: 16px; }
  }
  @container (min-width: 56px) {
    .bc:not([data-won]) .bc-in, .bc[data-mine="true"]:not([data-won]) .bc-in { --g: 20px; --gi: 3px; }
    .bc[data-won] .bc-in, .bc[data-won="1"] .bc-in { --g: 14px; --gi: 3px; --disc: 30px; --ns: 18px; }
  }
  @container (min-width: 68px) {
    .bc[data-won] .bc-in, .bc[data-won="1"] .bc-in { --g: 20px; }
  }

  /* The pre-rendered overlay: the holder's colour (kit view: the kit's dark colour). Never transition background-color. */
  .bc-face { position: absolute; inset: 0; background: var(--face, transparent); opacity: 0; }
  .bc[data-state="paid"] .bc-face { opacity: 1; }
  .bc[data-won] .bc-face { opacity: 1; background: var(--board-ring); }
  .bc[data-state="reserved"] { background-color: var(--board-cream-2); }
  /* Hatch: 45°, --board-ink-2 at 35 %, 1 px every 4 px. */
  .bc-hatch {
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(45deg, color-mix(in srgb, var(--board-ink-2) 35%, transparent) 0 1px, transparent 1px 4px);
  }
  /* Kit view, claimed: a 5 px kit-light band along the bottom edge, its top 1 px an ink keyline (y 39–44 at 44 px). */
  .bc-band { position: absolute; inset-inline: 0; bottom: 0; height: 5px; box-sizing: border-box; border-top: 1px solid var(--board-ink); background: var(--kit-light); }

  /* The number and the glyph sit at z-index 1: the house-lights dim (Task 12) sits at 2, your own glyphs at 3 (recorded ruling 19). */
  .bc-num { position: relative; z-index: 1; font-size: var(--ns); line-height: 1; color: var(--board-ink); }
  .bc-chip { background: var(--board-cream); padding-inline: 2px; }
  .bc[data-state="paid"]:not([data-won]) .bc-num { color: var(--num); }
  .bc[data-state="reserved"] .bc-num { color: var(--board-ink-2); }
  .bc-strike { position: absolute; left: -1px; right: -1px; top: 50%; height: 2px; margin-top: -1px; background: var(--board-ink); }

  .bc-glyph { position: absolute; z-index: 1; top: var(--gi); right: var(--gi); width: var(--g); height: var(--g); overflow: visible; }
  .bc-glyph use { stroke-linejoin: round; }
  /* The 1 px cream knockout, so the hatch never crosses a glyph (hatched cells only, recorded ruling 19). */
  .bc-knock { display: none; }
  .bc[data-state="taken"] .bc-knock, .bc[data-state="sent"] .bc-knock { display: inline; fill: var(--board-cream); stroke: var(--board-cream); stroke-width: 3.25px; }
  .bc-glyph[data-glyph="outline"] .bc-knock { stroke-width: 4px; }
  .bc-mark { fill: var(--fc, var(--board-ink)); stroke: var(--board-ink); stroke-width: 1.25px; }
  .bc-glyph[data-glyph="outline"] .bc-mark { fill: none; stroke-width: 2px; }
  .bc-glyph[data-glyph="on-face"] .bc-mark { fill: var(--num); stroke: none; }
  .bc-glyph[data-glyph="kit"] .bc-mark { fill: var(--board-ink); }
  .bc-glyph[data-glyph="kit-paid"] .bc-mark { fill: var(--board-cream); stroke: none; }
  .bc-glyph[data-glyph="won"] .bc-mark { fill: var(--fc); stroke: var(--board-cream); }
  .bc-glyph[data-glyph="won-kit"] .bc-mark { fill: var(--board-cream); stroke: var(--board-cream); }

  /* Yours: a 4 px two-tone ring inset 2 px. Ink outside on cream and light faces; cream outside on dark faces. */
  .bc-ring { position: absolute; inset: 2px; box-shadow: inset 0 0 0 2px var(--board-ink), inset 0 0 0 4px var(--board-cream); }
  .bc-ring[data-ring="cream-out"] { box-shadow: inset 0 0 0 2px var(--board-cream), inset 0 0 0 4px var(--board-ink); }
  /* The sent mark: 2 px ink, 10 px long, under the number's chip, on a 1 px cream knockout (recorded ruling 19). */
  .bc-sent { position: absolute; z-index: 1; left: 50%; top: calc(50% + 11px); width: 10px; height: 2px; margin-left: -5px; background: var(--board-ink); box-shadow: 0 0 0 1px var(--board-cream); }
  /* Selected: four 8 px corner ticks, 2 px ink, inset 3 px. */
  .bc-brackets i { position: absolute; width: 8px; height: 8px; border: 0 solid var(--board-ink); }
  .bc-brackets i:nth-child(1) { top: 3px; left: 3px; border-top-width: 2px; border-left-width: 2px; }
  .bc-brackets i:nth-child(2) { top: 3px; right: 3px; border-top-width: 2px; border-right-width: 2px; }
  .bc-brackets i:nth-child(3) { bottom: 3px; left: 3px; border-bottom-width: 2px; border-left-width: 2px; }
  .bc-brackets i:nth-child(4) { bottom: 3px; right: 3px; border-bottom-width: 2px; border-right-width: 2px; }
  /* Overdue (host and admin): a 2 px red inset edge; a 12 px / 600 red "!" in the glyph's place. */
  .bc-overdue { position: absolute; inset: 0; box-shadow: inset 0 0 0 2px var(--red); }
  .bc-bang { position: absolute; z-index: 1; top: var(--gi); right: calc(var(--gi) + 3px); color: var(--red); }
  /* Reserved for a mini: a 3 px double steel rule inset 2 px and the "m" top-left. */
  .bc-double { position: absolute; inset: 2px; border: 3px double var(--board-steel); }
  .bc-m { position: absolute; top: 2px; left: 4px; color: var(--board-ink-2); }

  /* Won: the cream bull, centred; its ring is drawn inside the disc's edge. Place is the ring's shape, never a word. */
  .bc-bull { position: absolute; left: 50%; top: 50%; width: var(--disc); height: var(--disc); transform: translate(-50%, -50%); border-radius: 50%; background: var(--board-cream); }
  .bc-bull-ring { position: absolute; inset: 0; border-radius: 50%; }
  .bc-bull[data-place="1"] .bc-bull-ring { box-shadow: inset 0 0 0 2px var(--red), inset 0 0 0 3px var(--board-cream), inset 0 0 0 5px var(--red); }
  .bc-bull[data-place="2"] .bc-bull-ring { box-shadow: inset 0 0 0 3px var(--green); }
  /* 3rd: a 3 px green ring dashed in four segments (60° arcs, 30° gaps, recorded ruling 19). */
  .bc-bull[data-place="3"] .bc-bull-ring {
    background: conic-gradient(var(--green) 0 60deg, transparent 60deg 90deg, var(--green) 90deg 150deg, transparent 150deg 180deg,
      var(--green) 180deg 240deg, transparent 240deg 270deg, var(--green) 270deg 330deg, transparent 330deg 360deg);
    -webkit-mask: radial-gradient(closest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
    mask: radial-gradient(closest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
  }
  .bc[data-won] .bc-num { color: var(--board-ink); }

  /* Legend minis and thumbnails (recorded ruling 20). */
  .bc[data-size="xs"] .bc-ring { inset: 1px; box-shadow: inset 0 0 0 1px var(--board-ink), inset 0 0 0 2px var(--board-cream); }
  .bc[data-size="xs"] .bc-ring[data-ring="cream-out"] { box-shadow: inset 0 0 0 1px var(--board-cream), inset 0 0 0 2px var(--board-ink); }
  .bc[data-size="xs"] .bc-sent { top: auto; bottom: 2px; width: 6px; height: 1px; margin-left: -3px; }
  .bc[data-size="thumb"] .bc-band { height: 30%; border-top: 0; }
  .bc[data-size="thumb"] .bc-bull-ring { display: none; }

  /* Focus on the board: a 2 px ink outline over a 4 px cream ring, so one band always contrasts (Mosaic §5). */
  .bc:focus-visible { outline: 2px solid var(--board-ink); outline-offset: 0; box-shadow: 0 0 0 4px var(--board-cream); z-index: 10; }
}
```

(`#000` in the mask is the mask's opaque value, not a colour on screen.)

- [ ] **Step 10: Run them to see them pass**

Run: `pnpm test src/components/grid` (sandbox off)
Expected: PASS. If an assertion fails, read the component and §5 once (fix-loop rule, recorded ruling 8):
- If the component contradicts the spec, fix the component.
- If the test's expectation contradicts both the markup and the spec, fix the test and say so in the commit body.
- If the fix needs a design decision, mark the test `it.skip` with the reason, record it in the report, and finish as DONE_WITH_CONCERNS.

- [ ] **Step 11: Optional: check by hand**

If you have a browser tool, open `/dev/components` in `pnpm dev` at 390 wide. Check the 50-line grid's cells: hatch, glyphs top-right, yours rings and paid faces. The frame and wires arrive in Task 8. Then open a break you hold lines in, open the pay sheet in Safari (or WebKit), and check that its mini cells look as before (deferred finding: "Safari, pay sheet mini cells"). Stop the server afterwards (port rule). If you cannot do this, report the check as not performed.

- [ ] **Step 12: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e` (sandbox off)
Expected: all green.
- `e2e/layout.spec.ts`'s "Line 3, taken" still holds: the buyer's lines are unsent.
- The legend list is still named "What the cells mean".
- The journeys click cells by `cell-<n>`, which is unchanged.

- [ ] **Step 13: Commit**

```bash
git add src/components/grid src/components/mini-cells.tsx src/components/legend.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat(grid): mosaic cell states, flight glyphs, the yours ring and the bull" -m "render.test.ts changes on purpose: the bonus + and ink face are retired on the board (black now means won); the first design's cell moves verbatim to PaperCell for the ledger and the pay sheet."
```

---

### Task 8: Grid frame, surround, lamp, legends, density tests (model: Sonnet)

Spec §4 (the kit is the board's surround; Heat) and §5 (the grid, the legend), with the 390 × 664 budget from §8.

- **Frame:** one `box-shadow` stack on the numbered rows, 12 px in all, spread into the 16 px gutter, never a border or padding, so the grid keeps its 358 px at 390 and `columnsFor` keeps eight columns: `0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring), 0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light)`.
- **Wire and empty slots:** the wire is `--board-steel`, drawn as each cell's own 1 px shadow over a 1 px gap, so empty slots in the last row show `--board-wall-2` and not wire.
- **Lamp:** one layer behind the board. Its colour is fixed (from `LAMP`) and the step sets its opacity (`LAMP[heat]`'s alpha), so a step change is a `--dur-lamp` opacity transition. That only happens on change, never on mount, because the server renders the final value.
- **Kit:** `--kit-dark` and `--kit-light` are set on the board from the kit's palette keys.
- **Legends:** member (open, taken, sent, paid, yours) and kit (open, taken, paid), drawn as mini cells beside words separated by spaces.
- **Thumbnail:** `GridPreview` becomes the kit-view thumbnail with its 6 px frame and the lamp.

The break page wires the view, kit and heat from `GridModel`. Render tests pin the frame value, the wire, the lamp and the kit. `boardGeometry` pins eight columns of 44.75 px at 390 and seven of 46.9 px at 360. `/dev/components` gains the density entry Task 20 checks by eye and in e2e. The "You have …" line stays where it is; Task 10 moves and restyles it.

**Files:**
- Modify: `src/components/grid/grid.tsx` (whole file), `src/components/grid/grid-preview.tsx` (whole file), `src/components/grid/layout.ts` (`boardGeometry`), `src/components/grid/layout.test.ts`
- Create: `src/components/grid/lamp.ts`, `src/components/board-legend.tsx`
- Delete: `src/components/legend.tsx`
- Modify: `src/components/grid/render.test.ts`, `src/app/globals.css` (board block)
- Modify: `src/components/break/break-interactive.tsx` (`boardView`, `kit`, `heat`; the small line's ink), `src/app/b/[id]/page.tsx` (wire them, the legend, `data-wall`)
- Modify: `src/app/dev/components/page.tsx` (whole file: the density entry)

**Interfaces:**
- Consumes: `Cell`, `BoardView`, `CellData` (Task 7); `DEFAULT_KIT`, `FLIGHT_COLOURS`, `LAMP`, `Kit`, `HeatStep`, `Flight`, `FlightColour` (Task 2); `GridModel.kit`, `GridModel.heat`, `GridModel.showHolders` (Task 5); `--board-steel`, `--board-ring`, `--board-wall`, `--board-wall-2`, `--board-text-2`, `--dur-lamp` (Task 1).
- Produces:
  - `type BoardCell = GridCell & { place?: 1 | 2 | 3 | null }`.
  - `kitVars(kit: Kit): CSSProperties` (in `grid.tsx`).
  - `Grid` gains `view?: BoardView` (default `"member"`), `kit?: Kit` (default `DEFAULT_KIT`), `heat?: HeatStep | null` (no lamp when null); `cells: BoardCell[]`. Test ids `board-frame` (the numbered rows, which keep `data-grid-rows`) and `lamp`; `data-view` on the group.
  - `lampLayer(step: HeatStep): { backgroundImage: string; opacity: number }` and `LAMP_POSITION = "-32px -16px"` (the lamp's inset, which `.board-lamp` writes in `globals.css`; recorded ruling 18) (`src/components/grid/lamp.ts`).
  - The break page's `<main>` carries `data-wall` (recorded ruling 12): the page is on the wall from this task on.
  - `boardGeometry(viewport: number, count: number): { box: number; cols: number; pitch: number; rows: number; height: number }` (`layout.ts`).
  - `BoardLegend({ view: BoardView; flight: Flight | null; kit: Kit })`: `ul[aria-label="What the cells mean"][data-testid=legend]`.
  - `type PreviewCell = Pick<CellData, "number" | "state" | "bonus"> & { place?: 1 | 2 | 3 | null }`; `GridPreview({ count, cells?: PreviewCell[], size?, kit?: Kit, heat?: HeatStep | null })`, always the kit view.
  - `BreakInteractiveProps` gains `boardView: BoardView; kit: Kit; heat: HeatStep`.
  - Test id `density` on `/dev/components` (Task 20).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/grid/layout.test.ts`, inside `describe("grid columns (design §4)", () => {` before its closing `});` (and add `boardGeometry` to the import from `./layout`):

```ts
  it("the board at 390 and 360 (Mosaic §5, Review Focus 5): 8 × 44.75 px, then 7 × 46.9 px; the 12 px frame fits the gutter", () => {
    expect(boardGeometry(390, 50)).toEqual({ box: 358, cols: 8, pitch: 44.75, rows: 7, height: 313.25 });
    const at360 = boardGeometry(360, 50);
    expect(at360).toMatchObject({ box: 328, cols: 7, rows: 8 });
    expect(at360.pitch).toBeCloseTo(46.9, 1);
    for (const w of [390, 360]) expect((w - boardGeometry(w, 50).box) / 2 - 12).toBe(4); // 4 px left to the screen edge
    expect(boardGeometry(1024, 55)).toMatchObject({ box: 552, cols: 10 });
  });
```

In `src/components/grid/render.test.ts`, replace (Task 7's import)

```ts
import { FLIGHT_COLOURS, FLIGHT_SHAPES, TOKENS, type Flight, type FlightColour, type FlightShape } from "@/domain/flights";
```

with

```ts
import { DEFAULT_KIT, FLIGHT_COLOURS, FLIGHT_SHAPES, TOKENS, type Flight, type FlightColour, type FlightShape, type Kit } from "@/domain/flights";
```

add below `import { FlightSprite } from "./flight-sprite";`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BoardLegend } from "@/components/board-legend";
import { GridPreview } from "./grid-preview";
import { LAMP_POSITION, lampLayer } from "./lamp";
import { boardGeometry, columnsFor, GRID_COLS } from "./layout";
```

and append to the end of the file:

```ts
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start) + 1);
};
const fifty = Array.from({ length: 50 }, (_, i) => cell(i + 1, i % 5 === 1 ? { state: "taken", flight: plum } : {}));
const plumLime: Kit = { dark: "plum", light: "lime" };

describe("Board (Mosaic §4, §5): the frame, the wire, the lamp, the kit", () => {
  it("draws the frame as one box-shadow stack into the gutter, never a border or padding", () => {
    expect(rule(".board-frame")).toContain(
      "box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring), 0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light);");
    expect(rule(".board-frame")).not.toMatch(/border|padding/);
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "Lines, 40 to go", onPress: noop }));
    expect(h).toContain('data-testid="board-frame"');
    // No ancestor within 12 px of the grid may clip overflow, and the frame takes no layout space.
    const tags = [h.match(/<div role="group"[^>]*>/)![0], h.match(/<div data-grid-rows[^>]*>/)![0]];
    for (const t of tags) expect(t).not.toMatch(/overflow|\bp[xytblr]?-|border/);
  });
  it("wires cells in steel and leaves empty last-row slots in --board-wall-2", () => {
    expect(rule(".board-frame, .board-wire")).toContain("gap: 1px; background: var(--board-wall-2);");
    expect(rule(".board-frame > .bc:not(:focus-visible), .board-wire > .bc:not(:focus-visible)")).toContain("box-shadow: 0 0 0 1px var(--board-steel);");
  });
  it("sets the kit on the board from palette keys", () => {
    const def = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L" }));
    expect(def).toContain(`--kit-dark:${FLIGHT_COLOURS[DEFAULT_KIT.dark].face};--kit-light:${FLIGHT_COLOURS[DEFAULT_KIT.light].face}`);
    const kit = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", kit: plumLime }));
    expect(kit).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face};--kit-light:${FLIGHT_COLOURS.lime.face}`);
  });
  it("lamp: one gradient for every step, LAMP's alpha as the layer's opacity, an opacity-only transition, none without heat", () => {
    expect(([0, 1, 2, 3, 4] as const).map((s) => lampLayer(s).opacity)).toEqual([0.06, 0.095, 0.13, 0.165, 0.2]);
    const images = new Set(([0, 1, 2, 3, 4] as const).map((s) => lampLayer(s).backgroundImage));
    expect([...images]).toEqual(["radial-gradient(ellipse at center, rgba(255,232,200,1), transparent 70%)"]);
    expect(rule(".board-lamp")).toContain("transition: opacity var(--dur-lamp)");
    expect(rule(".board-lamp")).toContain(`inset: ${LAMP_POSITION};`); // 32 px above and below, 16 px each side
    const lit = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", heat: 3 }));
    expect(lit).toMatch(/<span aria-hidden="true" data-testid="lamp" class="board-lamp" style="[^"]*opacity:0.165/);
    expect(html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L" }))).not.toContain('data-testid="lamp"');
  });
  it("at 390 and 360: the 50-line board's classes give eight and seven columns (Review Focus 5)", () => {
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", onPress: noop }));
    expect(h).toContain(GRID_COLS.l);
    expect(h.match(/<button/g)).toHaveLength(50);
    expect(columnsFor(50, boardGeometry(390, 50).box)).toBe(8);
    expect(columnsFor(50, boardGeometry(360, 50).box)).toBe(7);
  });
  it("kit view: no cell carries data-flight or --fc, even if a flight reached the data", () => {
    const h = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", view: "kit", onPress: noop }));
    expect(h).toContain('data-view="kit"');
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    const member = html(createElement(Grid, { cells: fifty, lineCount: 50, label: "L", view: "member", onPress: noop }));
    expect(member.match(/data-flight="plum-kite"/g)).toHaveLength(10);
  });
  it("keeps the bonus row clear of the frame, wired but unframed", () => {
    const h = html(createElement(Grid, { cells: [cell(1), cell(2), cell(3, { state: "paid", bonus: true, flight: yellow })], lineCount: 2, label: "L" }));
    expect(h).toContain('class="mt-6 text-micro font-medium text-[var(--board-text-2)]">Bonus<');
    expect(h).toMatch(/class="board-wire relative mt-1 grid/);
  });
});

describe("BoardLegend: mini cells beside words, spaces between", () => {
  it("member: open, taken, sent, paid, yours; sent drawn as yours, sent; paid in the viewer's colour", () => {
    const h = html(createElement(BoardLegend, { view: "member", flight: yellow, kit: DEFAULT_KIT }));
    expect(h).toContain('aria-label="What the cells mean"');
    expect(h).toContain('data-testid="legend"');
    expect([...h.matchAll(/<\/span>([a-z]+)<\/li>/g)].map((m) => m[1])).toEqual(["open", "taken", "sent", "paid", "yours"]);
    expect(h).toContain(`--face:${FLIGHT_COLOURS.yellow.face}`);
    expect(h).toMatch(/data-state="sent" data-size="xs" data-mine="true"/);
    expect(h).toContain("bc-sent");
    expect(h.match(/width:16px;height:16px/g)).toHaveLength(5);
    expect(h).not.toContain("·");
  });
  it("member without a line of one's own (host, admin): a standard flight in the kit's dark colour", () => {
    const h = html(createElement(BoardLegend, { view: "member", flight: null, kit: plumLime }));
    expect(h).toContain('data-flight="plum-standard"');
  });
  it("kit: open, taken, paid; no flight anywhere", () => {
    const h = html(createElement(BoardLegend, { view: "kit", flight: yellow, kit: DEFAULT_KIT }));
    expect([...h.matchAll(/<\/span>([a-z]+)<\/li>/g)].map((m) => m[1])).toEqual(["open", "taken", "paid"]);
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
  });
});

describe("GridPreview: the kit-view thumbnail", () => {
  it("frames the board in the kit, draws line state only, and never a flight", () => {
    const h = html(createElement(GridPreview, { count: 50, cells: fifty, kit: plumLime, heat: 2 }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("thumb-frame");
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face}`);
    expect(h).toContain("opacity:0.13");
    expect(h).toContain('data-size="thumb"');
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    expect(h.match(/class="bc /g)).toHaveLength(50);
    expect(rule(".thumb-frame")).toContain("box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 5px var(--kit-dark), 0 0 0 6px var(--kit-light);");
  });
  it("leaves bonus lines out and needs no cells for an empty board", () => {
    expect(html(createElement(GridPreview, { count: 3, cells: [cell(1), cell(2), cell(3, { bonus: true, state: "paid" })] })).match(/class="bc /g)).toHaveLength(2);
    expect(html(createElement(GridPreview, { count: 12 })).match(/class="bc /g)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/grid` (sandbox off)
Expected: FAIL. `boardGeometry`, `./lamp` and `@/components/board-legend` do not exist; `Grid` has no frame, kit or lamp; `GridPreview` is still the paper thumbnail.

- [ ] **Step 3: Board geometry and the lamp layer**

Append to `src/components/grid/layout.ts`:

```ts
/**
 * The board at a viewport width (Mosaic §5): the grid box is the page column minus 16 px gutters below 640 and 552
 * above. The 12 px frame is a box-shadow drawn into the gutter, so it takes none of the box. `pitch` is a cell plus its
 * 1 px wire: 44.75 at 390, 46.9 at 360.
 */
export function boardGeometry(viewport: number, count: number): { box: number; cols: number; pitch: number; rows: number; height: number } {
  const box = viewport >= 640 ? 552 : viewport - 32;
  const cols = columnsFor(count, box);
  const pitch = box / cols;
  const rows = Math.ceil(count / cols);
  return { box, cols, pitch, rows, height: rows * pitch };
}
```

Create `src/components/grid/lamp.ts`:

```ts
import { LAMP, type HeatStep } from "@/domain/flights";

const RGBA = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/;

/**
 * How far the lamp reaches past the board (recorded ruling 18): 32 px above and below, 16 px to each side, which is the
 * screen edge at 390 and 360, so nothing scrolls sideways. globals.css .board-lamp writes it as its inset; a render test
 * keeps the two in step. Thumbnails reach 12 px (.thumb-lamp).
 */
export const LAMP_POSITION = "-32px -16px";

/**
 * The lamp (Mosaic §4 Heat): one warm white whose hue never changes. The gradient takes LAMP's colour at full alpha and
 * the step becomes the layer's opacity, so a step change is an opacity transition on one layer (--dur-lamp) and never
 * a background change. The server renders the final opacity, so nothing transitions on mount.
 */
export function lampLayer(step: HeatStep): { backgroundImage: string; opacity: number } {
  const m = RGBA.exec(LAMP[step].replace(/\s+/g, ""));
  if (!m) throw new Error(`LAMP[${step}] is not an rgba() string`);
  return { backgroundImage: `radial-gradient(ellipse at center, rgba(${m[1]},${m[2]},${m[3]},1), transparent 70%)`, opacity: Number(m[4]) };
}
```

- [ ] **Step 4: The framed board**

Replace the whole of `src/components/grid/grid.tsx` with:

```tsx
import type { CSSProperties } from "react";
import type { GridCell } from "@/domain/breaks/grid";
import { DEFAULT_KIT, FLIGHT_COLOURS, type HeatStep, type Kit } from "@/domain/flights";
import { Cell, type BoardView } from "./cell";
import { lampLayer } from "./lamp";
import { GRID_COLS, GRID_MAX_W, gridTier } from "./layout";

/** A board cell: the server's GridCell plus, on the result page only, its place (public there, Mosaic §5). */
export type BoardCell = GridCell & { place?: 1 | 2 | 3 | null };

/** --kit-dark and --kit-light from the kit's palette keys: the frame and the kit view's faces read them. */
export function kitVars(kit: Kit): CSSProperties {
  return { "--kit-dark": FLIGHT_COLOURS[kit.dark].face, "--kit-light": FLIGHT_COLOURS[kit.light].face } as CSSProperties;
}

type Props = {
  cells: BoardCell[];
  lineCount: number;
  /** e.g. "Lines, 12 to go" */
  label: string;
  /** member when the viewer sees holders (shapeGrid's showHolders), else kit (Mosaic §6). */
  view?: BoardView;
  /** The host's surround; the default kit (Blue with Yellow) until the host picks one. */
  kit?: Kit;
  /** The lamp's step; null draws no lamp. */
  heat?: HeatStep | null;
  selected?: ReadonlySet<number>;
  struck?: ReadonlySet<number>;
  /** Selection reached the viewer's allowance: unselected open cells become aria-disabled. */
  disabledOpen?: boolean;
  /** Straight fill or not open: open cells cannot be selected. */
  readOnly?: boolean;
  onPress?: (n: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** The roving tab stop, owned by the caller (arrow keys). Falls back to the first selected, then the first open cell. */
  focusNumber?: number | null;
};

/**
 * The board (Mosaic §4, §5): cells wired in steel inside the host's surround, the lamp behind. The frame is a
 * box-shadow spread into the page gutter (globals.css .board-frame), so the grid keeps its full width. Bonus lines sit
 * on their own wired row below the frame (recorded ruling 18).
 */
export function Grid({ cells, lineCount, label, view = "member", kit = DEFAULT_KIT, heat = null, selected, struck, disabledOpen = false, readOnly = false, onPress, onKeyDown, focusNumber: rovingNumber = null }: Props) {
  const tier = gridTier(lineCount);
  const numbered = cells.filter((c) => !c.bonus);
  const bonus = cells.filter((c) => c.bonus);
  const focusNumber = !onPress
    ? undefined
    : rovingNumber !== null && cells.some((c) => c.number === rovingNumber)
      ? rovingNumber
      : (numbered.find((c) => selected?.has(c.number)) ?? numbered.find((c) => c.state === "open") ?? numbered[0])?.number;

  const renderCell = (c: BoardCell) => {
    const isSelected = selected?.has(c.number) ?? false;
    const disabled = c.state !== "open" || readOnly || (disabledOpen && !isSelected);
    return (
      <Cell
        key={c.number}
        cell={c}
        view={view}
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
    <div role="group" aria-label={label} onKeyDown={onKeyDown} data-view={view} style={kitVars(kit)} className={`@container relative w-full ${GRID_MAX_W[tier]} touch-manipulation`}>
      {heat !== null && <span aria-hidden data-testid="lamp" className="board-lamp" style={lampLayer(heat)} />}
      <div data-grid-rows data-testid="board-frame" className={`board-frame relative grid ${GRID_COLS[tier]}`}>{numbered.map(renderCell)}</div>
      {bonus.length > 0 && (
        <>
          <p className="mt-6 text-micro font-medium text-[var(--board-text-2)]">Bonus</p>
          <div className={`board-wire relative mt-1 grid ${GRID_COLS[tier]}`}>{bonus.map(renderCell)}</div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: The kit-view thumbnail**

Replace the whole of `src/components/grid/grid-preview.tsx` with:

```tsx
import { DEFAULT_KIT, type HeatStep, type Kit } from "@/domain/flights";
import type { CellData } from "./cell-label";
import { Cell } from "./cell";
import { kitVars } from "./grid";
import { lampLayer } from "./lamp";
import { thumbColumns } from "./layout";

/** What a thumbnail needs: line state only (feedThumbs selects no owner), plus the place on a ran break. */
export type PreviewCell = Pick<CellData, "number" | "state" | "bonus"> & { place?: 1 | 2 | 3 | null };

/**
 * The board in the host's kit, small (Mosaic §8): a 6 px frame (1 px steel, 4 px kit dark, 1 px kit light) drawn inside
 * `size`, and the lamp at the break's step behind it when given. Always the kit view: whatever the caller passes, only
 * number, state and place reach the cells. Decorative; the card's text says the count.
 */
export function GridPreview({ count, cells, size = 88, kit = DEFAULT_KIT, heat = null }: { count: number; cells?: PreviewCell[]; size?: number; kit?: Kit; heat?: HeatStep | null }) {
  const list: CellData[] = (cells ?? Array.from({ length: count }, (_, i): PreviewCell => ({ number: i + 1, state: "open", bonus: false })))
    .filter((c) => !c.bonus)
    .map((c) => ({ number: c.number, state: c.state, bonus: false, mine: false, overdue: false, flight: null, place: c.place ?? null }));
  const cols = thumbColumns(list.length);
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size, ...kitVars(kit) }}>
      {heat !== null && <span className="board-lamp thumb-lamp" style={lampLayer(heat)} />}
      <div className="thumb-frame relative m-1.5 grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {list.map((c) => <Cell key={c.number} cell={c} view="kit" size="thumb" />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: The two legends**

Create `src/components/board-legend.tsx`:

```tsx
import type { Flight, Kit } from "@/domain/flights";
import type { CellData } from "./grid/cell-label";
import { Cell, type BoardView } from "./grid/cell";

const mini = (o: Partial<CellData>): CellData => ({ number: 0, state: "open", mine: false, overdue: false, bonus: false, flight: null, place: null, ...o });

/**
 * The legend as mini cells beside words, spaces between, no middle dots (Mosaic §5). Member view: open, taken, sent,
 * paid, yours, in the viewer's own flight. Paid has no single colour, and other people's sent lines read as taken, so
 * "sent" is drawn as yours, sent. Kit view: open, taken, paid, in the kit. `flight` is the viewer's own; a host or admin
 * with no line here gets a standard flight in the kit's dark colour (recorded ruling 20).
 */
export function BoardLegend({ view, flight, kit }: { view: BoardView; flight: Flight | null; kit: Kit }) {
  const f: Flight = flight ?? { colour: kit.dark, shape: "standard" };
  const items: { word: string; cell: CellData }[] = view === "member"
    ? [
        { word: "open", cell: mini({}) },
        { word: "taken", cell: mini({ state: "taken", flight: f }) },
        { word: "sent", cell: mini({ state: "sent", mine: true, flight: f }) },
        { word: "paid", cell: mini({ state: "paid", flight: f }) },
        { word: "yours", cell: mini({ state: "taken", mine: true, flight: f }) },
      ]
    : [
        { word: "open", cell: mini({}) },
        { word: "taken", cell: mini({ state: "taken" }) },
        { word: "paid", cell: mini({ state: "paid" }) },
      ];
  return (
    <ul aria-label="What the cells mean" data-testid="legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro font-medium text-[var(--board-text-2)]">
      {items.map((i) => (
        <li key={i.word} className="flex items-center gap-1.5">
          <span aria-hidden className="block size-4"><Cell cell={i.cell} view={view} size="xs" px={16} /></span>
          {i.word}
        </li>
      ))}
    </ul>
  );
}
```

Run: `git rm src/components/legend.tsx`

- [ ] **Step 7: The board styles**

Append to `src/app/globals.css`:

```css
/* ---------- The board (Mosaic §4, §5). ---------- */
@layer components {
  /* Wire: each cell's own 1 px steel shadow over a 1 px gap, so empty last-row slots show --board-wall-2, not wire. */
  .board-frame, .board-wire { gap: 1px; background: var(--board-wall-2); }
  .board-frame > .bc:not(:focus-visible), .board-wire > .bc:not(:focus-visible) { box-shadow: 0 0 0 1px var(--board-steel); }
  /* The kit is the surround: 1 px steel, the 6 px numbers ring, 4 px kit dark, a 1 px kit-light pinstripe. Spread into the
     page gutter, never border or padding: a 12 px border would leave 334 px and columnsFor would drop to 7 columns. */
  .board-frame {
    box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring), 0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light);
  }
  /* The lamp: behind the board, to the screen edge at 390 and 360 (LAMP_POSITION, recorded ruling 18). Opacity only, and only on a step change. */
  .board-lamp { position: absolute; inset: -32px -16px; pointer-events: none; transition: opacity var(--dur-lamp) var(--ease-inout, ease-in-out); }
  /* Thumbnails (feed, hero, profile): a 6 px frame, 1 px steel, 4 px kit dark, 1 px kit light. */
  .thumb-frame {
    gap: 1px; background: var(--board-wall-2);
    box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 5px var(--kit-dark), 0 0 0 6px var(--kit-light);
  }
  .thumb-frame > .bc { box-shadow: 0 0 0 1px var(--board-steel); }
  .board-lamp.thumb-lamp { inset: -12px; }
}
```

(The render tests read rules by their exact selector text: `.board-frame {`, `.board-frame, .board-wire {`, `.board-lamp {`, `.thumb-frame {`. Keep each selector written once, as above.)

- [ ] **Step 8: Wire the view, the kit and the heat on the break page**

In `src/components/break/break-interactive.tsx`, add below `import type { ClaimMode } from "@/domain/breaks/rules";`:

```tsx
import type { HeatStep, Kit } from "@/domain/flights";
import type { BoardView } from "@/components/grid/cell";
```

replace

```tsx
  cells: GridCell[];
  counts: GridCounts;
```

with

```tsx
  cells: GridCell[];
  /** member when the viewer sees holders (GridModel.showHolders), else kit (Mosaic §6). */
  boardView: BoardView;
  kit: Kit;
  heat: HeatStep;
  counts: GridCounts;
```

and replace

```tsx
            cells={cells}
            lineCount={p.lineCount}
```

with

```tsx
            cells={cells}
            view={p.boardView}
            kit={p.kit}
            heat={p.heat}
            lineCount={p.lineCount}
```

In `src/app/b/[id]/page.tsx`, replace

```tsx
import { Legend } from "@/components/legend";
```

with

```tsx
import { BoardLegend } from "@/components/board-legend";
import type { BoardView } from "@/components/grid/cell";
```

add, directly below the line that starts `  const grid = shapeGrid(page,`:

```tsx
  const boardView: BoardView = grid.showHolders ? "member" : "kit";
  // The legend draws "yours" and "paid" in the viewer's own flight: the first line they hold here (recorded ruling 20).
  const legendFlight = grid.cells.find((c) => c.mine && c.flight)?.flight ?? null;
```

replace

```tsx
        cells={grid.cells}
        counts={grid.counts}
```

with

```tsx
        cells={grid.cells}
        boardView={boardView}
        kit={grid.kit}
        heat={grid.heat}
        counts={grid.counts}
```

and replace

```tsx
        <div className="mt-3"><Legend /></div>
```

with

```tsx
        {/* 12 px of frame, then the legend's 8 px gap (Mosaic §8 budget). */}
        <div className="mt-5"><BoardLegend view={boardView} flight={legendFlight} kit={grid.kit} /></div>
```

- [ ] **Step 9: Put the break page on the wall**

The board now sits on the wall, so the break page opts in (recorded ruling 12) and the text it draws straight on the page takes the wall inks (spec §4: 16.8:1, 11.5:1 and 8.1:1). Paper surfaces (the claim bar, the sheets, the details fold, the ledger) keep their own card faces and inks. Task 10 restyles the head in full.

In `src/app/b/[id]/page.tsx`, replace

```tsx
    <main className="mx-auto max-w-[600px] px-4 pb-6 sm:px-6">
```

with

```tsx
    <main data-wall className="mx-auto max-w-[600px] px-4 pb-6 sm:px-6">
```

replace

```tsx
          <h1 className="line-clamp-2 font-condensed text-title font-semibold">{b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" data-testid="left-count">{leftText(grid.counts.open, b.lineCount)}</span>
            <span className="text-small text-ink-2">{formatMoney(b.linePriceCents)} a line</span>
```

with

```tsx
          <h1 className="line-clamp-2 font-condensed text-title font-semibold text-[var(--board-text)]">{b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular text-[var(--board-text)]" data-testid="left-count">{leftText(grid.counts.open, b.lineCount)}</span>
            <span className="text-small text-[var(--board-text-2)]">{formatMoney(b.linePriceCents)} a line</span>
```

replace

```tsx
        {youHave && <p className="mt-2 text-small" data-testid="you-have">{youHave}</p>}
```

with

```tsx
        {youHave && <p className="mt-2 text-small text-[var(--board-text-2)]" data-testid="you-have">{youHave}</p>}
```

and replace

```tsx
          <p className="mt-1 text-small text-ink-2">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
```

with

```tsx
          <p className="mt-1 text-small text-[var(--board-text-2)]">Draw locked before opening. <Link href="/legal/draw" className="underline underline-offset-4">How it works</Link></p>
```

In `src/components/break/break-interactive.tsx`, replace

```tsx
        <p className="min-w-0 flex-1 text-small text-ink-2">
```

with

```tsx
        <p className="min-w-0 flex-1 text-small text-[var(--board-text-2)]">
```

If the axe test in `e2e/layout.spec.ts` (Step 13's gates) still reports a contrast failure on an element drawn straight on the wall, give that element `text-[var(--board-text-2)]` (one round, recorded ruling 8); an element inside a paper card keeps its ink.

- [ ] **Step 10: The density entry on `/dev/components`**

Replace the whole of `src/app/dev/components/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { FLIGHT_COLOURS, type Flight, type FlightColour, type FlightShape, type Kit } from "@/domain/flights";
import type { GridCell } from "@/domain/breaks/grid";
import { Grid, type BoardCell } from "@/components/grid/grid";
import { Cell } from "@/components/grid/cell";
import { GridPreview } from "@/components/grid/grid-preview";
import { MiniCells } from "@/components/mini-cells";
import { BoardLegend } from "@/components/board-legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };

const SHAPES: FlightShape[] = ["standard", "pear", "kite", "slim"];
const FLIGHTS: Flight[] = (Object.keys(FLIGHT_COLOURS) as FlightColour[]).map((colour, i) => ({ colour, shape: SHAPES[i % SHAPES.length] }));
const KIT: Kit = { dark: "petrol", light: "orange" };
const STATES: GridCell["state"][] = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"];
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 9: 2, 31: 3 }; // the top spot on a two-digit line (Mosaic §5)

const board = (won: boolean): BoardCell[] => [
  ...Array.from({ length: 50 }, (_, i): BoardCell => {
    const number = i + 1;
    const place = won ? PLACES[number] ?? null : null;
    const state = place ? "paid" : STATES[i % STATES.length];
    const held = state !== "open" && state !== "reserved";
    return {
      number, state, place, bonus: false, holder: null,
      mine: held && i % 11 === 3, overdue: !place && state === "taken" && i % 13 === 1,
      flight: held ? FLIGHTS[i % FLIGHTS.length] : null,
    };
  }),
  ...Array.from({ length: 3 }, (_, i): BoardCell => ({ number: 51 + i, state: "paid", mine: i === 0, overdue: false, bonus: true, holder: null, flight: FLIGHTS[i] })),
];

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      {/* The 390 × 664 density check (Review Focus 5, Task 20): the board at phone width on the wall, every §5 state. */}
      <section data-testid="density" className="-mx-4 w-[390px] max-w-[100vw] space-y-5 bg-[var(--board-wall)] px-4 py-6 sm:mx-0">
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Member view, 50 + 3 bonus</h2>
        <Grid cells={board(false)} lineCount={50} label="Lines, 7 to go" view="member" kit={KIT} heat={2} />
        <BoardLegend view="member" flight={FLIGHTS[1]} kit={KIT} />
        <p className="text-small text-[var(--board-text-2)]">You have 4, 11 and 27.</p>
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Kit view</h2>
        <Grid cells={board(false)} lineCount={50} label="Lines, 7 to go" view="kit" kit={KIT} heat={1} />
        <BoardLegend view="kit" flight={null} kit={KIT} />
        <h2 className="text-headline font-semibold text-[var(--board-text)]">Ran, with the three bulls</h2>
        <Grid cells={board(true)} lineCount={50} label="Lines" view="member" kit={KIT} heat={4} />
        <div className="flex items-end gap-3">
          {[44, 56, 68].map((px) => <Cell key={px} cell={{ number: 23, state: "paid", mine: false, overdue: false, bonus: false, flight: FLIGHTS[2], place: 1 }} px={px} />)}
        </div>
        <div className="flex items-center gap-4">
          <GridPreview count={50} cells={board(false)} kit={KIT} heat={2} />
          <GridPreview count={12} size={64} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-headline font-semibold">Grid at 6</h2>
        <div className="bg-[var(--board-wall)] p-4"><Grid cells={board(false).slice(0, 6)} lineCount={6} label="Lines, 2 to go" heat={0} /></div>
      </section>
      <section className="flex items-center gap-3">
        <MiniCells cells={board(false).slice(0, 5)} />
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

- [ ] **Step 11: Run them to see them pass**

Run: `pnpm test src/components/grid` (sandbox off)
Expected: PASS.

- [ ] **Step 12: Optional: check by hand**

If you have a browser tool, open `/dev/components` in `pnpm dev` at 390 × 664 and check four things:
- The `density` section shows eight columns inside the frame, with the frame's 4 px of gutter left at the screen edge and no horizontal scroll.
- The empty last-row slots are darker than the wire.
- The top spot on line 23 has the double ring and a 14 px number, with the 10 px glyph clear of the disc.
- The legend's mini cells read at 16 px.

Then open an open break anonymously (kit view: bands, ink standard flights) and as a holder (member view). Stop the server afterwards (port rule). If you cannot do this, report the check as not performed.

- [ ] **Step 13: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e` (sandbox off)
Expected: all green.
- `e2e/layout.spec.ts` still finds the legend by its name "What the cells mean", and its axe pass now covers the break page on the wall.
- It still counts columns on the first `[data-grid-rows]` (8, 7, 6, 10).
- The 390 × 664 budget still holds: the frame takes no layout height, and the legend's `mt-5` replaces `mt-3` plus the frame.

- [ ] **Step 14: Commit**

```bash
git add src/components/grid src/components/board-legend.tsx src/app/globals.css src/components/break/break-interactive.tsx "src/app/b/[id]/page.tsx" src/app/dev/components/page.tsx
git commit -m "feat(grid): framed board in the host's kit with the lamp, mini-cell legends and kit thumbnails"
```

---

### Task 9: `cellMoments` diff (model: Opus)

Spec §3 ("Animate on change, never on mount") and §7, the moment table. `cellMoments(prev, next, o)` is a pure diff over the same viewer's previous and next cells. It decides which cells play a moment; Task 11 maps each moment to its CSS classes and does nothing else.

- **What sets still:** first paint (no previous cells), a change in the line count (a bonus line added), and any transition §7 does not list.
- **A view change:** sets still for every cell except the viewer's own claim landing (kit → member, the numbers in `o.mine`) and the viewer's own release (member → kit). That is §6 together with Review Focus 2 (recorded ruling 21).
- **Caps:** at most 5 drop, 5 sent, 8 others-in, 8 paid, 8 paid-undo, 8 release and 8 sniped per diff, and at most 8 cells in all. The viewer's own moments go first, then everyone else's, each group in line order; a cell past a cap sets still (recorded ruling 21).
- **A refresh mid-animation:** Task 11 diffs against the last rendered cells, so a repeat diff is all still and the cell snaps to its new state.

**Files:**
- Create: `src/components/grid/cell-moments.ts`, `src/components/grid/cell-moments.test.ts`

**Interfaces:**
- Consumes: `CellState`, `GridCell` (with `flight`, Task 5); `Flight` (Task 2).
- Produces (the frame's contract, plus the `CellView` it names):
  - `type CellMoment = "drop" | "others-in" | "sent" | "paid" | "paid-undo" | "release" | "sniped" | "still"`.
  - `type CellView = { number: number; state: CellState; mine: boolean; bonus: boolean; overdue: boolean; flight: Flight | null; place: 1 | 2 | 3 | null; selected: boolean; struck: boolean }`.
  - `cellViews(cells: readonly (GridCell & { place?: 1 | 2 | 3 | null })[], selected: ReadonlySet<number>, struck: ReadonlySet<number>): CellView[]`.
  - `cellMoments(prev: readonly CellView[], next: readonly CellView[], o: { view: "member" | "kit"; prevView: "member" | "kit"; mine: readonly number[] }): Map<number, CellMoment>`. It holds one entry per `next` cell. `o.mine` is the numbers the viewer's claim just committed, passed for exactly one diff.
  - `MOMENT_CAPS: Record<Exclude<CellMoment, "still">, number>`, `MAX_MOVING = 8`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/grid/cell-moments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Flight } from "@/domain/flights";
import { cellMoments, cellViews, MAX_MOVING, MOMENT_CAPS, type CellMoment, type CellView } from "./cell-moments";

const LIME: Flight = { colour: "lime", shape: "kite" };
const BLUE: Flight = { colour: "blue", shape: "standard" };
const v = (number: number, o: Partial<CellView> = {}): CellView =>
  ({ number, state: "open", mine: false, bonus: false, overdue: false, flight: null, place: null, selected: false, struck: false, ...o });
const board = (f: (n: number) => Partial<CellView> = () => ({}), count = 50) => Array.from({ length: count }, (_, i) => v(i + 1, f(i + 1)));
const moving = (m: Map<number, CellMoment>) => [...m].filter(([, x]) => x !== "still").sort(([a], [b]) => a - b);
const MEMBER = { view: "member", prevView: "member", mine: [] } as const;
const KIT = { view: "kit", prevView: "kit", mine: [] } as const;
// Twelve lines other people hold on a part-filled board.
const OTHERS = new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]);
const othersKit = (n: number): Partial<CellView> => (OTHERS.has(n) ? { state: "taken" } : {});
const othersMember = (n: number): Partial<CellView> => (OTHERS.has(n) ? { state: "taken", flight: LIME } : {});

describe("cellMoments: nothing animates on mount or on a view switch (Review Focus 2)", () => {
  it("the first claim as a stranger: a drop for exactly the two claimed cells, still for every other, the twelve new flight faces included", () => {
    const prev = board(othersKit); // kit view: no flights
    const next = board((n) => (n === 3 || n === 40 ? { state: "taken", mine: true, flight: BLUE } : othersMember(n)));
    const m = cellMoments(prev, next, { view: "member", prevView: "kit", mine: [3, 40] });
    expect(m.size).toBe(50);
    expect(moving(m)).toEqual([[3, "drop"], [40, "drop"]]);
    for (const n of OTHERS) expect(m.get(n)).toBe("still");
  });

  it("a refresh with four new third-party claims: four others-in and nothing else, in both views", () => {
    const fresh = [41, 42, 45, 50];
    const prev = board(othersMember);
    const next = board((n) => (fresh.includes(n) ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual(fresh.map((n) => [n, "others-in"]));
    const prevKit = board(othersKit);
    const nextKit = board((n) => (fresh.includes(n) ? { state: "taken" } : othersKit(n)));
    expect(moving(cellMoments(prevKit, nextKit, KIT))).toEqual(fresh.map((n) => [n, "others-in"]));
  });

  it("a refresh with nine: eight others-in and one still (the cap), in line order", () => {
    const fresh = [40, 41, 42, 43, 44, 45, 46, 47, 48];
    const prev = board(othersMember);
    const next = board((n) => (fresh.includes(n) ? { state: "taken", flight: LIME } : othersMember(n)));
    const m = cellMoments(prev, next, MEMBER);
    expect(moving(m)).toEqual(fresh.slice(0, 8).map((n) => [n, "others-in"]));
    expect(m.get(48)).toBe("still");
  });

  it("first paint: no previous cells, everything still", () => {
    const m = cellMoments([], board(othersMember), MEMBER);
    expect(m.size).toBe(50);
    expect(moving(m)).toEqual([]);
  });

  it("a view switch without a claim of one's own: everything still, new claims included", () => {
    const prev = board(othersKit);
    const next = board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(prev, next, { view: "member", prevView: "kit", mine: [] }))).toEqual([]);
  });

  it("the viewer's last line released: their release plays, then the kit view is still", () => {
    const prev = board((n) => (n === 3 ? { state: "taken", mine: true, flight: BLUE } : othersMember(n)));
    const next = board((n) => (n === 44 ? { state: "taken" } : othersKit(n)));
    expect(moving(cellMoments(prev, next, { view: "kit", prevView: "member", mine: [] }))).toEqual([[3, "release"]]);
  });

  it("a line-count change (a bonus line added) sets everything still", () => {
    const prev = board(othersMember);
    const next = [...board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n))), v(51, { state: "paid", bonus: true, mine: true, flight: BLUE })];
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([]);
  });

  it("a refresh that lands mid-animation diffs against the last render: a repeat is all still, so the cell snaps", () => {
    const next = board((n) => (n === 44 ? { state: "taken", flight: LIME } : othersMember(n)));
    expect(moving(cellMoments(next, next, MEMBER))).toEqual([]);
  });
});

describe("cellMoments: the §7 transitions", () => {
  it("drop: the viewer's own claim, from open or from the optimistic mark, never twice over the same server cells", () => {
    const prev = board((n) => (n === 4 ? { state: "taken", mine: true } : {})); // 4: the optimistic mark (no flight yet); 7: still open
    const next = board((n) => (n === 4 || n === 7 ? { state: "taken", mine: true, flight: BLUE } : {}));
    expect(moving(cellMoments(prev, next, { ...MEMBER, mine: [4, 7] }))).toEqual([[4, "drop"], [7, "drop"]]);
    expect(moving(cellMoments(next, next, { ...MEMBER, mine: [4, 7] }))).toEqual([]);
  });
  it("sent, paid, paid undone, release and sniped", () => {
    const prev = board((n) => ({
      1: { state: "taken", mine: true, flight: BLUE }, 2: { state: "sent", flight: LIME }, 3: { state: "paid", flight: LIME },
      4: { state: "taken", flight: LIME }, 5: { selected: true },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    const next = board((n) => ({
      1: { state: "sent", mine: true, flight: BLUE }, 2: { state: "paid", flight: LIME }, 3: { state: "sent", flight: LIME },
      4: { state: "open" }, 5: { state: "taken", flight: LIME, struck: true },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([[1, "sent"], [2, "paid"], [3, "paid-undo"], [4, "release"], [5, "sniped"]]);
  });
  it("every unlisted transition sets still", () => {
    const prev = board((n) => ({
      1: {}, 2: { state: "reserved" }, 3: { state: "taken", flight: LIME }, 4: { state: "taken", flight: LIME },
      5: { state: "taken", flight: LIME }, 6: { state: "paid", flight: LIME }, 7: { state: "sent", mine: true, flight: BLUE },
    } as Record<number, Partial<CellView>>)[n] ?? {});
    const next = board((n) => ({
      1: { state: "paid", flight: LIME }, // open → paid between refreshes
      2: { state: "open" }, // a mini's reservation lifted
      3: { state: "sent", flight: LIME }, // someone else marked sent: the board shows taken either way
      4: { state: "taken", flight: { colour: "lime", shape: "slim" } }, // the collision rule moved a shape
      5: { state: "taken", flight: LIME, overdue: true }, // the overdue flag
      6: { state: "paid", flight: LIME, place: 1 }, // the reveal owns the won state
      7: { state: "taken", mine: true, flight: BLUE }, // sent undone
    } as Record<number, Partial<CellView>>)[n] ?? {});
    expect(moving(cellMoments(prev, next, MEMBER))).toEqual([]);
  });
});

describe("cellMoments: the caps (Mosaic §7)", () => {
  it("pins the caps", () => {
    expect(MOMENT_CAPS).toEqual({ drop: 5, sent: 5, "others-in": 8, paid: 8, "paid-undo": 8, release: 8, sniped: 8 });
    expect(MAX_MOVING).toBe(8);
  });
  it("at most 5 drops; the sixth sets still", () => {
    const mine = [1, 2, 3, 4, 5, 6];
    const next = board((n) => (mine.includes(n) ? { state: "taken", mine: true, flight: BLUE } : {}));
    const m = cellMoments(board(), next, { ...MEMBER, mine });
    expect(moving(m)).toEqual(mine.slice(0, 5).map((n) => [n, "drop"]));
    expect(m.get(6)).toBe("still");
  });
  it("at most 8 paid and 5 sent per diff", () => {
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const paid = cellMoments(board((n) => (ten.includes(n) ? { state: "sent", flight: LIME } : {})), board((n) => (ten.includes(n) ? { state: "paid", flight: LIME } : {})), MEMBER);
    expect(moving(paid).map(([n]) => n)).toEqual(ten.slice(0, 8));
    const sent = cellMoments(board((n) => (ten.includes(n) ? { state: "taken", mine: true, flight: BLUE } : {})), board((n) => (ten.includes(n) ? { state: "sent", mine: true, flight: BLUE } : {})), MEMBER);
    expect(moving(sent).map(([n]) => n)).toEqual(ten.slice(0, 5));
  });
  it("at most 8 cells in all; the viewer's own moments go first (recorded ruling 21)", () => {
    const own = [40, 41, 42, 43, 44];
    const theirs = [1, 2, 3, 4, 5, 6];
    const next = board((n) => (own.includes(n) ? { state: "taken", mine: true, flight: BLUE } : theirs.includes(n) ? { state: "taken", flight: LIME } : {}));
    const m = cellMoments(board(), next, { ...MEMBER, mine: own });
    expect(moving(m)).toEqual([[1, "others-in"], [2, "others-in"], [3, "others-in"], ...own.map((n) => [n, "drop"] as [number, CellMoment])]);
    expect(moving(m)).toHaveLength(8);
  });
});

describe("cellViews", () => {
  it("adds the client's selection and strike to the server's cells", () => {
    const views = cellViews(
      [{ number: 1, state: "open", mine: false, overdue: false, bonus: false, holder: "x", flight: null }, { number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null, flight: LIME, place: null }],
      new Set([1]), new Set([2]),
    );
    expect(views).toEqual([v(1, { selected: true }), v(2, { state: "taken", flight: LIME, struck: true })]);
    expect(JSON.stringify(views)).not.toContain('"x"'); // the holder's handle is not part of a cell's view
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/grid/cell-moments.test.ts`
Expected: FAIL: `./cell-moments` does not exist.

- [ ] **Step 3: Write the diff**

Create `src/components/grid/cell-moments.ts`:

```ts
import type { CellState, GridCell } from "@/domain/breaks/grid";
import type { Flight } from "@/domain/flights";

export type CellMoment = "drop" | "others-in" | "sent" | "paid" | "paid-undo" | "release" | "sniped" | "still";
type Moving = Exclude<CellMoment, "still">;

/** One cell as the viewer saw it: the server's cell plus the client's selection and strike. No holder: moments never need one. */
export type CellView = {
  number: number; state: CellState; mine: boolean; bonus: boolean; overdue: boolean;
  flight: Flight | null; place: 1 | 2 | 3 | null;
  selected: boolean; struck: boolean;
};

export function cellViews(cells: readonly (GridCell & { place?: 1 | 2 | 3 | null })[], selected: ReadonlySet<number>, struck: ReadonlySet<number>): CellView[] {
  return cells.map((c) => ({
    number: c.number, state: c.state, mine: c.mine, bonus: c.bonus, overdue: c.overdue, flight: c.flight, place: c.place ?? null,
    selected: selected.has(c.number), struck: struck.has(c.number),
  }));
}

/** Mosaic §7, the moment table: cells past a cap set still. */
export const MOMENT_CAPS: Record<Moving, number> = { drop: 5, sent: 5, "others-in": 8, paid: 8, "paid-undo": 8, release: 8, sniped: 8 };
/** "At most 8 cells animate at once outside the reveal" (§7, Implementation). */
export const MAX_MOVING = 8;

const claimed = (s: CellState) => s === "taken" || s === "sent";

/** The §7 transitions. Anything not listed is null, and null sets still. */
function transition(p: CellView, c: CellView, justClaimed: boolean): Moving | null {
  // The reveal owns the won state; a bonus flag never changes on a line.
  if (p.place !== c.place || p.bonus !== c.bonus) return null;
  if (c.struck && !p.struck && p.selected && claimed(c.state) && !c.mine) return "sniped";
  // Claim commits: from open, or from the optimistic mark the island drew before the server answered (taken and mine,
  // but no flight yet: only the server knows it). A repeat diff over the same server cells therefore never drops twice.
  if (justClaimed && c.mine && c.state === "taken" && (p.state === "open" || (p.state === "taken" && p.mine && !p.flight && !!c.flight))) return "drop";
  if (p.state === "open" && claimed(c.state) && !c.mine) return "others-in";
  if (p.mine && c.mine && p.state === "taken" && c.state === "sent") return "sent";
  if (claimed(p.state) && c.state === "paid" && p.mine === c.mine) return "paid";
  if (p.state === "paid" && claimed(c.state) && p.mine === c.mine) return "paid-undo";
  if ((claimed(p.state) || p.state === "paid") && c.state === "open") return "release";
  return null;
}

/**
 * Which cells play a moment between two renders of the same viewer's board (Mosaic §3, §7). Pure. First paint, a
 * line-count change and every unlisted transition set still. Across a view change (§6), only the viewer's own claim
 * (kit → member) and own release (member → kit) play. Caps are per moment and MAX_MOVING in all: the viewer's own
 * cells first, then everyone else's, each in line order. `o.mine` is the numbers the viewer's claim just committed.
 */
export function cellMoments(
  prev: readonly CellView[],
  next: readonly CellView[],
  o: { view: "member" | "kit"; prevView: "member" | "kit"; mine: readonly number[] },
): Map<number, CellMoment> {
  const out = new Map<number, CellMoment>(next.map((c) => [c.number, "still"]));
  if (prev.length === 0 || prev.length !== next.length) return out;
  const before = new Map(prev.map((c) => [c.number, c]));
  const viewChanged = o.view !== o.prevView;
  const justMine = new Set(o.mine);
  const own: { n: number; m: Moving }[] = [];
  const theirs: { n: number; m: Moving }[] = [];
  for (const c of [...next].sort((a, b) => a.number - b.number)) {
    const p = before.get(c.number);
    if (!p) continue;
    const m = transition(p, c, justMine.has(c.number));
    if (!m) continue;
    if (viewChanged && !(m === "drop" || (m === "release" && p.mine))) continue;
    (p.mine || c.mine ? own : theirs).push({ n: c.number, m });
  }
  const used = new Map<Moving, number>();
  let total = 0;
  for (const w of [...own, ...theirs]) {
    const k = used.get(w.m) ?? 0;
    if (k >= MOMENT_CAPS[w.m] || total >= MAX_MOVING) continue;
    used.set(w.m, k + 1);
    total += 1;
    out.set(w.n, w.m);
  }
  return out;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/components/grid/cell-moments.test.ts`
Expected: PASS.

- [ ] **Step 5: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e` (sandbox off)
Expected: all green. Nothing calls `cellMoments` yet; Task 11 does.

- [ ] **Step 6: Commit**

```bash
git add src/components/grid/cell-moments.ts src/components/grid/cell-moments.test.ts
git commit -m "feat(grid): cellMoments diff so nothing animates on mount or on a view switch"
```

---

### Task 10: Claim bar: "12 to go", media row, "You have …" line (model: Sonnet)

Spec §8 (the break page) and §9 (the checkout count):

- **Checkout count:** "12 to go", counting open numbered lines (not claimed, not reserved). It sits in the paper claim bar beside the primary action, in Big Shoulders Display 800 at 22/24 with tabular figures. It is a text swap: never keyed, rolled or pulsed.
- **Status pill:** moves from the media row to beside the count.
- **Media row:** "50 lines, $5 a line", then "Hosted by @jim. New host." with the 20 × 10 kit swatch, on one 24 px line under the 32/32 Big Shoulders title. While there are no photos the head has no thumbnail (the board is the picture).
- **Grid label:** the grid group is named "Lines, 12 to go".
- **"You have …" line:** "You have 4 and 11." (joins "4 and 11", "4, 11 and 27") is plain text right under the legend. It and the legend sit directly below the board, inside the 390 × 664 budget, and the Grid | List toggle moves under them (recorded ruling 23).
- **"Pay within 24 hours.":** leaves the page head; the pay sheet already says "Pay by <time>" (recorded ruling 23).

"19 of 50 left" leaves the break page. `leftText` stays only for the feed card and the OG caption until Tasks 15 and 14 replace them (recorded ruling 23). Updated e2e spec: `e2e/layout.spec.ts`, two new tests. No journey or page spec keys on the strings this task changes: `e2e/pages.spec.ts`'s "4 of 4 left" is the feed card, which Task 15 changes.

**Files:**
- Modify: `src/components/break/frame-copy.ts`, `src/components/break/frame-copy.test.ts` (`toGoText`, `mediaText`)
- Modify: `src/components/break/claim-bar-state.ts`, `src/components/break/claim-bar-state.test.ts` (`barCheckout`)
- Modify: `src/components/break/claim-bar.tsx` (whole file)
- Create: `src/components/break/claim-bar.test.ts`, `src/components/kit-swatch.tsx`
- Modify: `src/components/break/break-interactive.tsx`, `src/app/b/[id]/page.tsx`
- Modify: `src/components/grid/render.test.ts` (KitSwatch)
- Modify: `e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `BoardLegend`, `boardView`, `kit`, `heat` props (Task 8); `GridModel.kit` (Task 5); `FLIGHT_COLOURS`, `Kit` (Task 2); the Big Shoulders utility `font-shoulders` and `--board-text`, `--board-text-2`, `--board-text-3` (Task 1); `youHaveText`, `hostedByText`, `trustText`, `joinAnd`, `formatMoney`, `StatusPill`.
- Produces:
  - `toGoText(open: number): string` ("12 to go"); `mediaText(lineCount: number, priceCents: number): string` ("50 lines, $5 a line").
  - `barCheckout(i: Pick<BarInput, "status" | "openCount">): string | null` (the count while open, else null; recorded ruling 23).
  - `ClaimBar` gains `status: string` and `toGo: string | null`. Test ids `bar-meta` (count and pill) and `to-go`.
  - `KitSwatch({ kit: Kit })`, `span[data-testid=kit-swatch]`.
  - `BreakInteractiveProps` loses `smallLine` and `hostHref` and gains `underBoard?: React.ReactNode`. Test id `media-row`; `host-line` moves to the page head.

- [ ] **Step 1: Write the failing unit and render tests**

In `src/components/break/frame-copy.test.ts`, replace

```ts
import { closesText, hostedByText, hostLabel, leftText, orList, pastText, payWithinText, perPersonText, pickingText, prizeLines, profileTrustText, smallLineText, trustText, youHaveText } from "./frame-copy";
```

with

```ts
import { closesText, hostedByText, hostLabel, leftText, mediaText, orList, pastText, payWithinText, perPersonText, pickingText, prizeLines, profileTrustText, smallLineText, toGoText, trustText, youHaveText } from "./frame-copy";
```

and replace

```ts
  it("names the viewer's lines", () => {
    expect(youHaveText([])).toBeNull();
    expect(youHaveText([4])).toBe("You have line 4.");
    expect(youHaveText([4, 11, 27])).toBe("You have 4, 11 and 27.");
  });
```

with

```ts
  it("names the viewer's lines as a sentence: \"4 and 11\", \"4, 11 and 27\", no serial comma, no dots", () => {
    expect(youHaveText([])).toBeNull();
    expect(youHaveText([4])).toBe("You have line 4.");
    expect(youHaveText([4, 11])).toBe("You have 4 and 11.");
    expect(youHaveText([4, 11, 27])).toBe("You have 4, 11 and 27.");
  });
  it("counts down as \"N to go\" and names the break by size and price (Mosaic §8, §9)", () => {
    expect(toGoText(12)).toBe("12 to go");
    expect(toGoText(1)).toBe("1 to go");
    expect(toGoText(0)).toBe("0 to go");
    expect(mediaText(50, 500)).toBe("50 lines, $5 a line");
    expect(mediaText(12, 1250)).toBe("12 lines, $12.50 a line");
  });
```

(If `formatMoney(1250)` renders differently from `$12.50`, take the format from `src/lib/money.test.ts` and use it in the second `mediaText` expectation: the media row uses `formatMoney` unchanged.)

In `src/components/break/claim-bar-state.test.ts`, replace

```ts
import { barShown, claimBar, failureNote, lastLabel, limitText, stepLabel, type BarInput } from "./claim-bar-state";
```

with

```ts
import { barCheckout, barShown, claimBar, failureNote, lastLabel, limitText, stepLabel, type BarInput } from "./claim-bar-state";
```

and append to the end of the file:

```ts
describe("barCheckout (Mosaic §8)", () => {
  it("is \"N to go\" while the break is open, every bar kind included, and nothing after", () => {
    expect(barCheckout({ ...base, openCount: 12 })).toBe("12 to go");
    expect(barCheckout({ ...base, openCount: 0 })).toBe("0 to go");
    for (const status of ["draft", "filled", "drawing", "drawn", "cancelled"] as const) {
      expect(barCheckout({ ...base, status })).toBeNull();
    }
  });
});
```

Create `src/components/break/claim-bar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ClaimBar } from "./claim-bar";
import type { Bar } from "./claim-bar-state";

const noop = () => {};
const router = { refresh: noop, push: noop, replace: noop, back: noop, forward: noop, prefetch: noop };
const render = (bar: Bar, status: string, toGo: string | null) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(ClaimBar, { bar, status, toGo, pending: false, count: 1, onCount: noop, onClaim: noop, signInHref: "/login", onStep: noop, onLast: noop, onSent: noop, resultHref: "/b/x/result" })));

describe("ClaimBar: the checkout count and the status pill beside the action (Mosaic §8)", () => {
  it("selection: summary, then \"12 to go\" with the pill, then Claim", () => {
    const h = render({ kind: "selection", summary: "Lines 7, 12, $10", action: "claim", label: "Claim 2 lines", disabled: false, hint: null }, "open", "12 to go");
    expect(h).toContain('data-testid="to-go"');
    expect(h).toMatch(/data-testid="to-go"[^>]*>12 to go</);
    expect(h).toContain(">Open<");
    expect(h).toContain("font-shoulders");
    expect(h.indexOf('data-testid="bar-summary"')).toBeLessThan(h.indexOf('data-testid="bar-meta"'));
    expect(h.indexOf('data-testid="bar-meta"')).toBeLessThan(h.indexOf('data-testid="claim-submit"'));
    expect(h).not.toContain("You hold");
  });
  it("owe and idle carry the count too", () => {
    expect(render({ kind: "owe", summary: "You owe $10 to @jim" }, "open", "12 to go")).toMatch(/data-testid="to-go"[^>]*>12 to go</);
    expect(render({ kind: "idle", note: null, stepper: { max: 5, action: "random" }, lastN: null, hint: null, signIn: false }, "open", "3 to go")).toMatch(/>3 to go</);
  });
  it("once closed: no count, the pill alone beside the message", () => {
    const h = render({ kind: "message", text: "Closed. Every line is paid. Waiting for Jim to run the draw." }, "filled", null);
    expect(h).not.toContain('data-testid="to-go"');
    expect(h).toContain(">Closed<");
  });
});
```

In `src/components/grid/render.test.ts`, add below `import { LAMP_POSITION, lampLayer } from "./lamp";` (Task 8):

```ts
import { KitSwatch } from "@/components/kit-swatch";
```

and append to the end of the file:

```ts
describe("KitSwatch: 20 × 10, dark | light, decorative", () => {
  it("splits the kit's two faces and says nothing to a screen reader", () => {
    const h = html(createElement(KitSwatch, { kit: { dark: "plum", light: "lime" } }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("h-[10px] w-5");
    expect(h).toContain(`linear-gradient(90deg, ${FLIGHT_COLOURS.plum.face} 50%, ${FLIGHT_COLOURS.lime.face} 50%)`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/break src/components/grid/render.test.ts` (sandbox off)
Expected: FAIL. `toGoText`, `mediaText` and `barCheckout` are not exported; `ClaimBar` has no `status` or `toGo`; `@/components/kit-swatch` does not exist.

- [ ] **Step 3: The copy and the checkout count**

In `src/components/break/frame-copy.ts`, add below `import { formatMonthYear } from "@/lib/time";`:

```ts
import { formatMoney } from "@/lib/money";
```

and replace

```ts
export const leftText = (open: number, total: number) => `${open} of ${total} left`;
```

with

```ts
/** Retired on the break page (Mosaic §9); the feed card and the link-preview caption drop it in Plan C Tasks 15 and 14. */
export const leftText = (open: number, total: number) => `${open} of ${total} left`;
/** The checkout count (Mosaic §9): open numbered lines, "12 to go". A text swap, never rolled. */
export const toGoText = (open: number) => `${open} to go`;
/** The media row (Mosaic §8): "50 lines, $5 a line". */
export const mediaText = (lineCount: number, priceCents: number) => `${lineCount} lines, ${formatMoney(priceCents)} a line`;
```

In `src/components/break/claim-bar-state.ts`, add below `import { selectionSummary } from "./selection";`:

```ts
import { toGoText } from "./frame-copy";
```

and append to the end of the file:

```ts
/** The checkout count beside the bar's action: "12 to go" while the break is open, else nothing (recorded ruling 23). */
export function barCheckout(i: Pick<BarInput, "status" | "openCount">): string | null {
  return i.status === "open" ? toGoText(i.openCount) : null;
}
```

- [ ] **Step 4: The bar**

Replace the whole of `src/components/break/claim-bar.tsx` with:

```tsx
"use client";
import { Button, ButtonLink } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { StickyBar } from "@/components/sticky-bar";
import { barShown, lastLabel, stepLabel, type Bar } from "./claim-bar-state";

type Props = {
  bar: Bar;
  /** The break's status: its pill sits beside the checkout count (Mosaic §8). */
  status: string;
  /** "12 to go" while open (barCheckout), else null. Plain text: never keyed, so a change is a text swap. */
  toGo: string | null;
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

/** The checkout count over the status pill: Big Shoulders 800, 22/24, tabular. 24 + 2 + 24 px fits the 64 px bar. */
function Checkout({ status, toGo }: { status: string; toGo: string | null }) {
  return (
    <div data-testid="bar-meta" className="flex shrink-0 flex-col items-end gap-0.5">
      {toGo && <span data-testid="to-go" className="font-shoulders text-checkout font-extrabold tabular">{toGo}</span>}
      <StatusPill status={status} />
    </div>
  );
}

export function ClaimBar({ bar, status, toGo, pending, count, onCount, onClaim, signInHref, onStep, onLast, onSent, onOweTap, resultHref }: Props) {
  if (!barShown(bar)) return null;
  const meta = <Checkout status={status} toGo={toGo} />;
  return (
    <StickyBar id="claim-bar">
      {bar.kind === "message" && (
        <>
          <p className="flex-1 py-2 text-small" data-testid="bar-message">{bar.text}</p>
          {meta}
        </>
      )}
      {bar.kind === "result" && (
        <>
          <ButtonLink href={resultHref} full data-testid="bar-result">See the result</ButtonLink>
          {meta}
        </>
      )}
      {bar.kind === "selection" && (
        <>
          <div className="min-w-0 flex-1 py-1">
            <p className="truncate font-condensed text-[18px] leading-6 font-semibold tabular" data-testid="bar-summary">{bar.summary}</p>
            {/* Over the allowance (a refresh lowered it): the claim is disabled and the bar says which cap. */}
            {bar.hint && <p className="text-micro font-medium text-red" data-testid="bar-hint">{bar.hint}</p>}
          </div>
          {meta}
          {bar.action === "claim"
            ? <Button onClick={onClaim} disabled={pending || bar.disabled} data-testid="claim-submit">{bar.label}</Button>
            : <ButtonLink href={signInHref} data-testid="claim-signin">{bar.label}</ButtonLink>}
        </>
      )}
      {bar.kind === "owe" && (
        <>
          {onOweTap
            ? <button type="button" onClick={onOweTap} data-testid="owed" className="min-h-11 min-w-0 flex-1 text-left text-small font-semibold underline underline-offset-4">{bar.summary}</button>
            : <p data-testid="owed" className="min-w-0 flex-1 text-small font-semibold">{bar.summary}</p>}
          {meta}
          <Button onClick={onSent} disabled={pending} data-testid="bar-sent">I&apos;ve sent it</Button>
        </>
      )}
      {bar.kind === "idle" && (
        <div className="flex w-full items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
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
          {meta}
        </div>
      )}
    </StickyBar>
  );
}
```

- [ ] **Step 5: The kit swatch**

Create `src/components/kit-swatch.tsx`:

```tsx
import { FLIGHT_COLOURS, type Kit } from "@/domain/flights";

/** The host's kit beside "Hosted by @jim" (Mosaic §4): 20 × 10 px, split dark | light. Decorative: copy never names a kit. */
export function KitSwatch({ kit }: { kit: Kit }) {
  return (
    <span aria-hidden data-testid="kit-swatch" className="inline-block h-[10px] w-5 shrink-0"
      style={{ background: `linear-gradient(90deg, ${FLIGHT_COLOURS[kit.dark].face} 50%, ${FLIGHT_COLOURS[kit.light].face} 50%)` }} />
  );
}
```

- [ ] **Step 6: The island: the count, the label, the legend under the board, the toggle under it**

In `src/components/break/break-interactive.tsx`:

replace

```tsx
"use client";
import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
```

with

```tsx
"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
```

replace

```tsx
import { barShown, claimBar, failureNote, limitText, sentNote } from "./claim-bar-state";
```

with

```tsx
import { barCheckout, barShown, claimBar, failureNote, limitText, sentNote } from "./claim-bar-state";
import { toGoText } from "./frame-copy";
```

replace

```tsx
  /** smallLineText: "Pay within 24 hours. Hosted by @jim. New host." (the pay window only while open). It shares one row with the Grid | List toggle (pixel budget). */
  smallLine: string;
  /** The host's profile (/h/handle): the whole small line links there (design §5.4). Null when the host has no handle. */
  hostHref: string | null;
```

with

```tsx
  /** The legend and the "You have …" line: directly under the board, inside the 390 × 664 budget (Mosaic §8). */
  underBoard?: React.ReactNode;
```

replace

```tsx
      {/* One row for the small line and the Grid | List toggle: a separate row would push the grid under the bar. */}
      <div className="mt-2 flex min-h-11 items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-[var(--board-text-2)]">
          {p.hostHref ? <Link href={p.hostHref} className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4" data-testid="host-line">{p.smallLine}</Link> : p.smallLine}
        </p>
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
```

with nothing (delete those lines); replace

```tsx
      <div ref={gridWrap} className="relative mt-3">
```

with

```tsx
      {/* 12 px gap, then the 12 px frame drawn into it (Mosaic §8 budget). */}
      <div ref={gridWrap} className="relative mt-6">
```

replace

```tsx
            label={`Lines, ${p.counts.open} of ${p.lineCount} open`}
```

with

```tsx
            label={`Lines, ${toGoText(p.counts.open)}`}
```

replace

```tsx
      {note && <p className="mt-2 text-small text-red" data-testid="bar-note">{note}</p>}
```

with

```tsx
      {p.underBoard}
      {/* Grid | List stands (first design §5.4); the budget has no row for it above the board, so it sits here (recorded ruling 23). */}
      <div className="mt-3 flex min-h-11 items-center justify-end">
        <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      </div>
      {note && <p className="mt-2 text-small text-red" data-testid="bar-note">{note}</p>}
```

and replace

```tsx
      <ClaimBar
        bar={bar}
        pending={pending}
```

with

```tsx
      <ClaimBar
        bar={bar}
        status={p.status}
        toGo={barCheckout({ status: p.status, openCount: p.counts.open })}
        pending={pending}
```

- [ ] **Step 7: The page head and the line under the legend**

In `src/app/b/[id]/page.tsx`:

delete the lines

```tsx
import { GridPreview } from "@/components/grid/grid-preview";
```

and

```tsx
import { StatusPill } from "@/components/status-pill";
```

replace

```tsx
import { closesText, hostLabel, leftText, perPersonText, pickingText, prizeLines, smallLineText, trustText, youHaveText } from "@/components/break/frame-copy";
```

with

```tsx
import { closesText, hostedByText, hostLabel, mediaText, perPersonText, pickingText, prizeLines, trustText, youHaveText } from "@/components/break/frame-copy";
import { KitSwatch } from "@/components/kit-swatch";
```

replace

```tsx
      <section className="mt-3 flex gap-3">
        <GridPreview count={b.lineCount} cells={grid.cells} />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 font-condensed text-title font-semibold text-[var(--board-text)]">{b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular text-[var(--board-text)]" data-testid="left-count">{leftText(grid.counts.open, b.lineCount)}</span>
            <span className="text-small text-[var(--board-text-2)]">{formatMoney(b.linePriceCents)} a line</span>
            <StatusPill status={b.status} />
          </div>
        </div>
      </section>
```

with

```tsx
      {/* Mosaic §8: the title in Big Shoulders, two lines at most; one 24 px media row; no thumbnail while there are no photos. */}
      <section className="mt-3">
        <h1 className="line-clamp-2 font-shoulders text-wall-title font-extrabold text-[var(--board-text)]">{b.title}</h1>
        <p className="mt-1 flex min-h-6 flex-wrap items-center gap-x-3 text-small">
          <span className="text-[var(--board-text-2)]" data-testid="media-row">{mediaText(b.lineCount, b.linePriceCents)}</span>
          {page.host.handle ? (
            <Link href={`/h/${page.host.handle}`} data-testid="host-line" className="inline-flex items-center gap-1.5 text-[var(--board-text-3)] hover:underline hover:underline-offset-4">
              {hostedByText(hostRef, trustText(trust))}<KitSwatch kit={grid.kit} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[var(--board-text-3)]">{hostedByText(hostRef, trustText(trust))}<KitSwatch kit={grid.kit} /></span>
          )}
        </p>
      </section>
```

replace

```tsx
        smallLine={smallLineText(status, b.paymentWindowHours, hostRef, trustText(trust))}
        hostHref={page.host.handle ? `/h/${page.host.handle}` : null}
```

with nothing (delete both lines); replace

```tsx
        initialPick={initialPick}
      >
```

with

```tsx
        initialPick={initialPick}
        underBoard={
          <>
            {/* 12 px of frame, then the legend's 8 px gap (Mosaic §8 budget). */}
            <div className="mt-5"><BoardLegend view={boardView} flight={legendFlight} kit={grid.kit} /></div>
            {/* Plain text in this plan; it becomes the Show mine toggle in the game-structure plan (recorded ruling 1). */}
            {youHave && <p className="mt-1 text-small text-[var(--board-text-2)]" data-testid="you-have">{youHave}</p>}
          </>
        }
      >
```

and delete the two children lines (Task 8 left them):

```tsx
        {/* 12 px of frame, then the legend's 8 px gap (Mosaic §8 budget). */}
        <div className="mt-5"><BoardLegend view={boardView} flight={legendFlight} kit={grid.kit} /></div>
        {youHave && <p className="mt-2 text-small text-[var(--board-text-2)]" data-testid="you-have">{youHave}</p>}
```

If `formatMoney` is now unused in the page (it was used only by the head), remove it from `import { formatMoney } from "@/lib/money";` as lint reports; `generateMetadata` still uses it, so expect it to stay.

- [ ] **Step 8: Run them to see them pass**

Run: `pnpm test src/components/break src/components/grid/render.test.ts` (sandbox off)
Expected: PASS.

- [ ] **Step 9: Pin the count, the media row and the line in the layout spec (updates `e2e/layout.spec.ts`)**

In `e2e/layout.spec.ts`, add directly after the test `"at 360 × 640 the legend sits at the fold (D§5.4)"`:

```ts
test("the bar counts open lines as 'N to go' beside the action, and the media row reads '50 lines, $5 a line' (Mosaic §8)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  await expect(page.getByTestId("media-row")).toHaveText("50 lines, $5 a line");
  const toGo = page.getByTestId("to-go");
  await expect(toGo).toHaveText(/^\d+ to go$/);
  const n = Number((await toGo.textContent())!.split(" ")[0]);
  await expect(page.getByRole("group", { name: `Lines, ${n} to go` })).toBeVisible();
  await expect(page.getByTestId("bar-meta")).toContainText("Open");
  await expect(page.getByText(/of 50 left/)).toHaveCount(0);
  await expect(page.getByText("You hold", { exact: false })).toHaveCount(0);
});

test("a holder's 'You have …' line sits under the legend and above the bar at 390 × 664 (Mosaic §8)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true })).newPage();
  await loginAs(page, `${buyerHandle}@e2e.test`);
  await page.goto(url);
  const line = page.getByTestId("you-have");
  await expect(line).toHaveText("You have 3 and 9.");
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  const box = await line.boundingBox();
  const bar = await page.locator("[data-sticky-bar]").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(legend!.y + legend!.height);
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
});
```

(The buyer from `beforeAll` holds lines 3 and 9, unsent; no earlier test in this serial file changes them.)

- [ ] **Step 10: Optional: check by hand**

If you have a browser tool, open a 50-line open break in `pnpm dev` at 390 × 664, anonymously and as a holder, and check:
- The title, the media row with the swatch, the framed board, the legend and the "You have …" line all sit above the bar.
- "N to go" over the pill sits beside the action.
- Claiming a line changes the count's digits with no motion.

Stop the server afterwards (port rule). If you cannot do this, report the check as not performed.

- [ ] **Step 11: Run every gate**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm test:e2e` (sandbox off)
Expected: all green.
- `e2e/pages.spec.ts` still clicks `host-line`, which now lives in the page head.
- It still finds "4 of 4 left" on the feed card, which this task does not change.
- The journeys key on `bar-summary`, `claim-step`, `owed` and `pay-outcome`, all unchanged.
- The 390 × 664 budget test still finds the legend above the bar.

- [ ] **Step 12: Commit**

```bash
git add src/components/break/frame-copy.ts src/components/break/frame-copy.test.ts src/components/break/claim-bar-state.ts src/components/break/claim-bar-state.test.ts src/components/break/claim-bar.tsx src/components/break/claim-bar.test.ts src/components/kit-swatch.tsx src/components/break/break-interactive.tsx "src/app/b/[id]/page.tsx" src/components/grid/render.test.ts e2e/layout.spec.ts
git commit -m "feat(break): \"12 to go\" in the claim bar, the media row and the \"You have\" line under the legend" -m "e2e/layout.spec.ts: new checks for the count, the media row and the You have line in the 390 x 664 budget. No journey or page spec keyed on the replaced break-page strings."
```

---

### Task 11: Claim moments on `cellMoments` (model: Opus)

Spec §7, the rows from Select to Board fills; §3 "Animate on change, never on mount" and "Nothing travels across the cells"; Review Focus 2.

Every per-cell moment is a CSS animation on `transform` or `opacity`, switched on by a `data-moment` attribute that only `cellMoments` (Task 9) sets. A first paint, a refresh with no change and a view switch therefore play nothing.

This task adds what `cellMoments` cannot see:
- a strike on a selected line someone else took (selection is client-only);
- the drain of the viewer's own lines when their last line goes and the board switches to the kit view.

The cell as it was is drawn as an `aria-hidden` "ghost" layer (`bc-ghost`) while a moment needs it. The release drains it. Paid holds the old ink on its chip above the incoming overlay. Paid undone fades the old overlay out under the number. Sent cross-fades the outline into the filled glyph. When the viewer's own last line goes, the released cells drain over `--dur-release` first, with the rest of the board held in the member view, and only then does the board re-render in the kit view, still (spec §7 Release, recorded ruling 21).

Further changes:
- **Pay sheet and count.** The pay sheet opens at the last landing or at 400 ms. The bar's checkout count drops by one per landing, as a text swap.
- **Lamp.** Task 8's `Grid` already owns it (`heat`, `lampLayer`, test id `lamp`): one fixed gradient whose step is its opacity, so a step change is a `--dur-lamp` crossfade that never plays on mount. This task adds nothing to it (recorded ruling 18).
- **Board fills.** "Board's full. Game on." drops in once per viewer per break.
- **Announcements.** Paid, paid undone, released, given back and open again are said politely. A claim says "Pay Jim $10".
- **Reduced motion.** Everything is instant: the global rule already cuts durations, and this task cuts delays and hides the glint and the ghosts.

Cell internals are Task 7's: the layers are children of `.bc-in` with the `bc-*` classes, `bc-num` and `bc-glyph` at z-index 1; this task adds `data-moment` on the root and two root-level layers, `bc-glint` and `bc-ghost` (recorded ruling 19).

**Files:**
- Create: `src/lib/motion.ts`, `src/lib/motion.test.ts`
- Create: `src/components/grid/moment-attrs.ts`, `src/components/grid/board-moments.ts`, `src/components/grid/board-moments.test.ts`, `src/components/grid/use-board-moments.ts`
- Create: `src/components/flight-glyph.tsx`, `src/components/break/caller-banner.tsx`, `src/components/break/caller-copy.ts`, `src/components/break/caller-copy.test.ts`
- Create: `src/components/grid/moments-render.test.ts`, `src/components/grid/motion-css.test.ts`
- Modify: `src/components/grid/cell.tsx`, `src/components/grid/grid.tsx`
- Modify: `src/app/globals.css` (the moments block)
- Modify: `src/components/break/selection.ts`, `src/components/break/selection.test.ts`
- Modify: `src/components/break/pay-sheet.tsx` (`onGaveBack` passes the numbers)
- Modify: `src/components/break/break-interactive.tsx`

**Interfaces:**
- Consumes:
  - From Task 9: `cellMoments`, `CellMoment` (`src/components/grid/cell-moments.ts`).
  - From Task 5: `GridCell.flight`, `GridModel.showHolders`, `GridModel.heat`.
  - From Task 2: `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `Flight`.
  - From Task 7: `Cell`, `BoardView`, `CellData` and the Cell internals (`.bc-in` layers with the `bc-*` classes).
  - From Task 8: `Grid` (its frame and its lamp) and `BreakInteractiveProps.boardView`.
  - From Task 10: the bar's checkout count (`barCheckout`, the `toGo` prop).
  - From Task 1: the motion tokens and `--font-big-shoulders`.
- Produces:
  - `src/lib/motion.ts`: `MOTION` (ms numbers keyed `press … staggerOthers`), `EASE`, `MOTION_VAR`, `EASE_VAR`, `type DurationTokens`, `prefersReducedMotion(): boolean`.
  - `src/components/grid/moment-attrs.ts`: `GHOSTED_MOMENTS`, `momentAttrs(moment?, order?): { moment; style; glint; ghost }`.
  - `src/components/grid/board-moments.ts`:
    - `BoardView` (re-exported from `./cell`, Task 7) and `type BoardSnap = { cells; view; struck }`;
    - `boardMoments(prev, next, claimed): Map<number, CellMoment>`, `ghostsFrom(prev, moments)`, `drainCells(prev, moments)`, `momentOrder(moments)`, `countMoment(moments, kind)`;
    - `landingTimes(n)`, `paySheetDelay(n, reduced)`, `MOMENT_CLEAR_MS`, `longestMoment()`;
    - `momentAnnouncements(prev, next, hostName, gaveBack): string`.
  - `src/components/grid/use-board-moments.ts`: `useBoardMoments(next: BoardSnap, claimed)` returning `{ moments, from, held }` (`held`: the member-view board shown while the viewer's own last lines drain, else null).
  - `src/components/flight-glyph.tsx`: `FlightGlyph({ flight, size?, keyline?, strokeWidth? })`.
  - `src/components/break/caller-banner.tsx`: `CallerBanner({ text, rule, flight?, play? })` (`data-testid="caller"`, `aria-hidden`).
  - `src/components/break/caller-copy.ts`: `BOARD_FULL_CALL`, `boardFullAnnouncement(host)`, `fullBoardKey(id)`.
  - `selection.ts`: `claimAnnouncement(got, taken, hostName, owedCents)`.
  - `Cell` props `moment?: CellMoment; order?: number; from?: CellData; ghost?: boolean`, and `data-moment="<CellMoment>"` on a cell's root while it plays; `Grid` props `moments?: ReadonlyMap<number, CellMoment>; from?: ReadonlyMap<number, CellData>`.
  - `PaySheet`'s `onGaveBack: (numbers: number[]) => void`.

- [ ] **Step 1: Write the failing test for the motion tokens**

Create `src/lib/motion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EASE, EASE_VAR, MOTION, MOTION_VAR } from "./motion";

// Whitespace and leading zeros do not matter: "cubic-bezier(0.55, 0, 1, 0.45)" is "cubic-bezier(.55,0,1,.45)".
const norm = (s: string) => s.replace(/\s+/g, "").replace(/(^|[(,:])0\./g, "$1.");
const css = norm(readFileSync(fileURLToPath(new URL("../app/tokens.css", import.meta.url)), "utf8"));

describe("motion tokens (Mosaic §4, the complete set)", () => {
  it("are the spec's values", () => {
    expect(MOTION).toEqual({
      press: 70, unpress: 120, drop: 160, squash: 80, settle: 120, glint: 220, others: 120, sent: 180, set: 140, seat: 100,
      release: 200, strike: 200, banner: 180, lights: 300, beat: 300, beatTop: 800, throw: 260, throwSettle: 140,
      shake: 120, gap: 550, lamp: 600, reduced: 150, staggerOwn: 50, staggerOthers: 30,
    });
    expect(EASE).toEqual({ in: "cubic-bezier(.55,0,1,.45)", out: "cubic-bezier(.2,.7,.3,1)", over: "cubic-bezier(.3,1.5,.5,1)", inout: "ease-in-out" });
  });
  it("match tokens.css one for one, so CSS and JS never drift", () => {
    for (const k of Object.keys(MOTION) as (keyof typeof MOTION)[]) expect(css, MOTION_VAR[k]).toContain(`${MOTION_VAR[k]}:${MOTION[k]}ms;`);
    for (const k of Object.keys(EASE) as (keyof typeof EASE)[]) expect(css, EASE_VAR[k]).toContain(norm(`${EASE_VAR[k]}:${EASE[k]};`));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/lib/motion.test.ts`
Expected: FAIL: `./motion` does not exist.

- [ ] **Step 3: Write the constants**

Create `src/lib/motion.ts`:

```ts
/**
 * The Mosaic motion tokens (spec §4 "Space, shape, motion") as numbers, for the few places JS times something: the
 * pay sheet's open delay, the per-landing count and reveal-plan.ts. CSS reads the same values from tokens.css;
 * motion.test.ts keeps the two in step. Every value is the spec's; never retype one elsewhere.
 */
export const MOTION = {
  press: 70, unpress: 120, drop: 160, squash: 80, settle: 120, glint: 220, others: 120, sent: 180, set: 140, seat: 100,
  release: 200, strike: 200, banner: 180, lights: 300, beat: 300, beatTop: 800, throw: 260, throwSettle: 140,
  shake: 120, gap: 550, lamp: 600, reduced: 150, staggerOwn: 50, staggerOthers: 30,
} as const;

/** reveal-plan.ts takes the tokens as a parameter so tests can pin totals against them. */
export type DurationTokens = { readonly [K in keyof typeof MOTION]: number };

export const EASE = { in: "cubic-bezier(.55,0,1,.45)", out: "cubic-bezier(.2,.7,.3,1)", over: "cubic-bezier(.3,1.5,.5,1)", inout: "ease-in-out" } as const;

/** The custom property each token lives under in tokens.css. */
export const MOTION_VAR: Record<keyof typeof MOTION, string> = {
  press: "--dur-press", unpress: "--dur-unpress", drop: "--dur-drop", squash: "--dur-squash", settle: "--dur-settle",
  glint: "--dur-glint", others: "--dur-others", sent: "--dur-sent", set: "--dur-set", seat: "--dur-seat",
  release: "--dur-release", strike: "--dur-strike", banner: "--dur-banner", lights: "--dur-lights", beat: "--dur-beat",
  beatTop: "--dur-beat-top", throw: "--dur-throw", throwSettle: "--dur-throw-settle", shake: "--dur-shake",
  gap: "--dur-gap", lamp: "--dur-lamp", reduced: "--dur-reduced", staggerOwn: "--stagger-own", staggerOthers: "--stagger-others",
};
export const EASE_VAR: Record<keyof typeof EASE, string> = { in: "--ease-in", out: "--ease-out", over: "--ease-over", inout: "--ease-inout" };

/** Where JS times something it checks reduced motion itself; CSS honours it on its own (globals.css). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

The CSS tokens are Task 1's (`tokens.css`, the spec §4 table); this task adds none, and `motion.test.ts` keeps `MOTION` and `tokens.css` in step.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test src/lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the pure board moments and the claim announcement**

Create `src/components/grid/board-moments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import { MOTION } from "@/lib/motion";
import {
  boardMoments, countMoment, drainCells, ghostsFrom, landingTimes, longestMoment, MOMENT_CLEAR_MS, momentAnnouncements, momentOrder, paySheetDelay,
  type BoardSnap,
} from "./board-moments";
import type { CellMoment } from "./cell-moments";
import { momentAttrs } from "./moment-attrs";

const BLUE_KITE = { colour: "blue", shape: "kite" } as const;
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
const board = (n: number, f: (c: GridCell) => Partial<GridCell> = () => ({})) => Array.from({ length: n }, (_, i) => { const c = cell(i + 1); return { ...c, ...f(c) }; });
const snap = (cells: readonly GridCell[], o: Partial<BoardSnap> = {}): BoardSnap => ({ cells, view: "member", struck: [], ...o });

describe("boardMoments: what cellMoments cannot see", () => {
  it("strikes a newly sniped line, at most 8 at once, and never a line struck before", () => {
    const cells = board(20);
    const m = boardMoments(snap(cells, { struck: [3] }), snap(cells, { struck: [3, 5] }), []);
    expect(m.get(5)).toBe("sniped");
    expect(m.get(3)).not.toBe("sniped");
    const many = boardMoments(snap(cells), snap(cells, { struck: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }), []);
    expect(countMoment(many, "sniped")).toBe(8);
  });
  it("drains the viewer's own lines when their last line goes and the board turns to the kit view (§6)", () => {
    const before = board(8, (c) => (c.number <= 2 ? { state: "taken", mine: true, holder: "me", flight: BLUE_KITE } : c.number === 5 ? { state: "paid", holder: "liz", flight: { colour: "yellow", shape: "pear" } } : {}));
    const after = board(8, (c) => (c.number === 5 ? { state: "paid" } : {}));
    const m = boardMoments(snap(before), snap(after, { view: "kit" }), []);
    expect(m.get(1)).toBe("release");
    expect(m.get(2)).toBe("release");
    expect(m.get(5) ?? "still").toBe("still"); // a flight face turning into a kit face is a view change: still
  });
  it("holds the member view while those lines drain: the released cells open, every other cell as it was (§7 Release)", () => {
    const before = board(4, (c) => (c.number <= 2 ? { state: "taken", mine: true, holder: "me", flight: BLUE_KITE } : c.number === 3 ? { state: "paid", holder: "liz", flight: { colour: "yellow", shape: "pear" } } : {}));
    const moments = new Map<number, CellMoment>([[1, "release"], [2, "release"], [3, "still"], [4, "still"]]);
    expect(drainCells(before, moments).map((c) => [c.number, c.state, c.mine, c.flight])).toEqual([
      [1, "open", false, null], [2, "open", false, null], [3, "paid", false, { colour: "yellow", shape: "pear" }], [4, "open", false, null],
    ]);
  });
  it("plays no release across a line-count change (a bonus line added)", () => {
    const before = board(8, (c) => (c.number === 1 ? { state: "taken", mine: true, flight: BLUE_KITE } : {}));
    const after = [...board(8), cell(9, { bonus: true })];
    expect(countMoment(boardMoments(snap(before), snap(after, { view: "kit" }), []), "release")).toBe(0);
  });
  it("keeps the old cell only for the moments that draw it", () => {
    const prev = board(4, () => ({ state: "taken", holder: "liz" }));
    const moments = new Map<number, CellMoment>([[1, "paid"], [2, "others-in"], [3, "release"], [4, "still"]]);
    expect([...ghostsFrom(prev, moments).keys()]).toEqual([1, 3]);
    expect(momentAttrs("drop", 2)).toEqual({ moment: "drop", style: { "--i": 2 }, glint: true, ghost: false });
    expect(momentAttrs("still")).toEqual({ moment: undefined, style: {}, glint: false, ghost: false });
    expect(momentAttrs(undefined).moment).toBeUndefined();
  });
  it("staggers each kind in line order, from 0", () => {
    const order = momentOrder(new Map<number, CellMoment>([[9, "others-in"], [2, "others-in"], [4, "drop"], [7, "still"], [5, "others-in"]]));
    expect(Object.fromEntries(order)).toEqual({ 2: 0, 4: 0, 5: 1, 9: 2 });
    expect(momentOrder(undefined).size).toBe(0);
  });
});

describe("the claim's timing (§7 Claim commits)", () => {
  it("lands the flights 50 ms apart, at most 5, each at the end of its drop", () => {
    expect(landingTimes(3)).toEqual([160, 210, 260]);
    expect(landingTimes(9)).toEqual([160, 210, 260, 310, 360]);
    expect(landingTimes(0)).toEqual([]);
  });
  it("opens the pay sheet at the last landing or at 400 ms, whichever comes first; at once under reduced motion", () => {
    expect(paySheetDelay(1, false)).toBe(160);
    expect(paySheetDelay(5, false)).toBe(360);
    expect(paySheetDelay(12, false)).toBe(360);
    expect(paySheetDelay(0, false)).toBe(0);
    expect(paySheetDelay(4, true)).toBe(0);
    for (let n = 0; n < 60; n++) expect(paySheetDelay(n, false)).toBeLessThanOrEqual(400);
  });
  it("clears data-moment only after the longest moment has finished", () => {
    expect(longestMoment()).toBe(4 * MOTION.staggerOwn + MOTION.drop + MOTION.glint); // 580: the fifth glint
    expect(MOMENT_CLEAR_MS).toBeGreaterThanOrEqual(longestMoment());
  });
});

describe("momentAnnouncements (§7, Announced)", () => {
  it("tells the buyer about their own lines only, and everyone about lines open again", () => {
    const prev = [
      cell(4, { state: "sent", mine: true }), cell(11, { state: "sent", mine: true }), cell(12, { state: "paid", mine: true }),
      cell(20, { state: "taken", mine: true }), cell(30, { state: "taken" }), cell(31, { state: "paid" }), cell(40, { state: "taken" }),
    ];
    const next = [
      cell(4, { state: "paid", mine: true }), cell(11, { state: "paid", mine: true }), cell(12, { state: "sent", mine: true }),
      cell(20), cell(30), cell(31), cell(40, { state: "paid" }),
    ];
    expect(momentAnnouncements(prev, next, "Jim", [])).toBe(
      "Jim ticked you paid: lines 4 and 11. Jim marked line 12 not paid yet. Jim released line 20. Lines 30 and 31 are open again.",
    );
  });
  it("says a give-back as the buyer's own act, and says nothing when nothing moved", () => {
    const prev = [cell(4, { state: "taken", mine: true }), cell(11, { state: "taken", mine: true })];
    expect(momentAnnouncements(prev, [cell(4), cell(11)], "Jim", [4, 11])).toBe("You gave back lines 4 and 11.");
    expect(momentAnnouncements(prev, [cell(4), cell(11, { state: "taken", mine: true })], "Jim", [4])).toBe("You gave back line 4.");
    expect(momentAnnouncements(prev, prev, "Jim", [])).toBe("");
    expect(momentAnnouncements([cell(7, { state: "taken" })], [cell(7)], "Jim", [])).toBe("Line 7 is open again.");
  });
});
```

Create `src/components/break/caller-copy.test.ts`:

```ts
import { it, expect } from "vitest";
import { BOARD_FULL_CALL, boardFullAnnouncement, fullBoardKey } from "./caller-copy";

it("says the board-fills lines of the caller copy, once per viewer per break", () => {
  expect(BOARD_FULL_CALL).toBe("Board's full. Game on.");
  expect(boardFullAnnouncement("Jim")).toBe("Board's full. Every line is paid. Waiting for Jim to run the draw.");
  expect(fullBoardKey("b1")).toBe("breaks.full.b1");
});
```

In `src/components/break/selection.test.ts`, add `claimAnnouncement,` to the import list from `./selection`, and append at the end of the file:

```ts
describe("claimAnnouncement (§7 Claim commits)", () => {
  it("says what the buyer has and what to pay, partial claims included", () => {
    expect(claimAnnouncement([4, 11], [], "Jim", 1000)).toBe("You have lines 4 and 11. Pay Jim $10.");
    expect(claimAnnouncement([4], [7], "Jim", 500)).toBe("You have line 4. Line 7 was just taken. Pay Jim $5.");
    expect(claimAnnouncement([], [7], "Jim", 0)).toBe("Line 7 was just taken.");
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test src/components/grid/board-moments.test.ts src/components/break/caller-copy.test.ts src/components/break/selection.test.ts`
Expected: FAIL. `./board-moments`, `./moment-attrs` and `./caller-copy` do not exist, and `claimAnnouncement` is not exported.

- [ ] **Step 7: Write the pure parts**

Create `src/components/grid/moment-attrs.ts`:

```ts
import type { CSSProperties } from "react";
import type { CellMoment } from "./cell-moments";

/** Moments that draw the cell as it was (the ghost): sent cross-fades it, paid holds its ink, undo and release fade it out. */
export const GHOSTED_MOMENTS: ReadonlySet<CellMoment> = new Set<CellMoment>(["sent", "paid", "paid-undo", "release"]);

export type MomentAttrs = { moment: Exclude<CellMoment, "still"> | undefined; style: CSSProperties; glint: boolean; ghost: boolean };

/** What a cell renders for its moment: `data-moment`, its stagger index `--i`, the drop's glint, the ghost layer. Still sets nothing. */
export function momentAttrs(moment: CellMoment | undefined, order = 0): MomentAttrs {
  if (!moment || moment === "still") return { moment: undefined, style: {}, glint: false, ghost: false };
  return { moment, style: { "--i": order } as CSSProperties, glint: moment === "drop", ghost: GHOSTED_MOMENTS.has(moment) };
}
```

Create `src/components/grid/board-moments.ts`:

```ts
import type { GridCell } from "@/domain/breaks/grid";
import { MOTION } from "@/lib/motion";
import { joinAnd } from "@/lib/list";
import { cellMoments, type CellMoment } from "./cell-moments";
import { GHOSTED_MOMENTS } from "./moment-attrs";

import type { BoardView } from "./cell";

/** Member view: the viewer sees holders and flights. Kit view: everyone else (spec §6). Task 7 defines it on Cell. */
export type { BoardView };
/** What one render of the board showed; moments are the diff between two of these. */
export type BoardSnap = { cells: readonly GridCell[]; view: BoardView; struck: readonly number[] };

export const DROP_CAP = 5;
export const SNIPED_CAP = 8;
export const OWN_RELEASE_CAP = 8;
/** The pay sheet never waits longer than this for the flights to land (§7 Claim commits). */
export const PAY_SHEET_MAX_MS = 400;
/** data-moment, will-change and the ghosts go once every moment has finished (longestMoment, pinned by a test). */
export const MOMENT_CLEAR_MS = 1000;

/**
 * cellMoments (Task 9) plus the two moments it cannot see. A strike on a selected line someone else took: the
 * selection is client-only. The viewer's own lines draining when their last line goes: the board switches to the
 * kit view, which cellMoments sets still, but spec §6 plays "the viewer's own release moment" first.
 * `claimed` is the lines this viewer just claimed: their flights drop even across the kit → member switch.
 */
export function boardMoments(prev: BoardSnap, next: BoardSnap, claimed: readonly number[]): Map<number, CellMoment> {
  const out = new Map<number, CellMoment>(cellMoments(prev.cells, next.cells, { view: next.view, prevView: prev.view, mine: claimed }));
  if (prev.view === "member" && next.view === "kit" && prev.cells.length === next.cells.length) {
    const now = new Map(next.cells.map((c) => [c.number, c]));
    let n = 0;
    for (const c of prev.cells) {
      if (!c.mine || now.get(c.number)?.state !== "open") continue;
      if (n++ >= OWN_RELEASE_CAP) break;
      out.set(c.number, "release");
    }
  }
  const before = new Set(prev.struck);
  let s = 0;
  for (const x of [...next.struck].sort((a, b) => a - b)) {
    if (before.has(x)) continue;
    if (s++ >= SNIPED_CAP) break; // past the cap the strike shows at once (Cell draws `struck` itself)
    out.set(x, "sniped");
  }
  return out;
}

/** The cells as they were, for the moments that draw them (GHOSTED_MOMENTS). */
export function ghostsFrom(prev: readonly GridCell[], moments: ReadonlyMap<number, CellMoment>): Map<number, GridCell> {
  const out = new Map<number, GridCell>();
  for (const c of prev) {
    const m = moments.get(c.number);
    if (m && GHOSTED_MOMENTS.has(m)) out.set(c.number, c);
  }
  return out;
}

/**
 * The board shown while the viewer's own last lines drain (spec §7 Release, recorded ruling 21): the previous member-view
 * cells, with each released cell already open (its ghost drains over it). Only after --dur-release does the board
 * re-render in the kit view, still.
 */
export function drainCells(prev: readonly GridCell[], moments: ReadonlyMap<number, CellMoment>): GridCell[] {
  return prev.map((c): GridCell => (moments.get(c.number) === "release" ? { ...c, state: "open", mine: false, holder: null, flight: null } : c));
}

/** Each cell's place in its moment's stagger, in line order, counted per kind ("--stagger-others in line order"). */
export function momentOrder(moments: ReadonlyMap<number, CellMoment> | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!moments) return out;
  const seen = new Map<CellMoment, number>();
  for (const n of [...moments.keys()].sort((a, b) => a - b)) {
    const m = moments.get(n)!;
    if (m === "still") continue;
    const i = seen.get(m) ?? 0;
    out.set(n, i);
    seen.set(m, i + 1);
  }
  return out;
}

export const countMoment = (moments: ReadonlyMap<number, CellMoment>, kind: CellMoment): number =>
  [...moments.values()].filter((m) => m === kind).length;

/** When each dropping flight lands: the end of its drop, 50 ms apart, at most 5 (cells past the cap set still). */
export function landingTimes(dropping: number): number[] {
  return Array.from({ length: Math.min(Math.max(0, dropping), DROP_CAP) }, (_, i) => i * MOTION.staggerOwn + MOTION.drop);
}

/** The pay sheet opens at the last landing or at 400 ms, whichever comes first; at once with nothing to land or reduced motion. */
export function paySheetDelay(dropping: number, reduced: boolean): number {
  const t = landingTimes(dropping);
  return reduced || t.length === 0 ? 0 : Math.min(PAY_SHEET_MAX_MS, t[t.length - 1]);
}

/** The longest any claim moment runs, stagger included (the fifth drop's glint). */
export function longestMoment(): number {
  const own = (DROP_CAP - 1) * MOTION.staggerOwn;
  const others = 7 * MOTION.staggerOthers;
  return Math.max(
    own + MOTION.drop + MOTION.glint, own + MOTION.drop + MOTION.squash + MOTION.settle, own + MOTION.sent,
    others + MOTION.set + MOTION.seat, others + MOTION.others, MOTION.release, MOTION.strike,
  );
}

const lines = (ns: readonly number[]) => (ns.length === 1 ? `line ${ns[0]}` : `lines ${joinAnd(ns)}`);

/**
 * The polite announcements of a refresh (§7): paid, paid undone and released for the buyer's own lines; a give-back
 * in the buyer's own words; "open again" to everyone. Claims by others are never announced. "" when nothing moved.
 */
export function momentAnnouncements(prev: readonly GridCell[], next: readonly GridCell[], hostName: string, gaveBack: readonly number[]): string {
  const was = new Map(prev.map((c) => [c.number, c]));
  const paid: number[] = [], unpaid: number[] = [], released: number[] = [], gave: number[] = [], reopened: number[] = [];
  for (const c of [...next].sort((a, b) => a.number - b.number)) {
    const p = was.get(c.number);
    if (!p) continue;
    if (p.mine && c.mine) {
      if (p.state !== "paid" && c.state === "paid") paid.push(c.number);
      else if (p.state === "paid" && c.state !== "paid") unpaid.push(c.number);
    } else if (p.mine && c.state === "open") {
      (gaveBack.includes(c.number) ? gave : released).push(c.number);
    } else if (!p.mine && (p.state === "taken" || p.state === "sent" || p.state === "paid") && c.state === "open") {
      reopened.push(c.number);
    }
  }
  const said: string[] = [];
  if (paid.length) said.push(`${hostName} ticked you paid: ${lines(paid)}.`);
  if (unpaid.length) said.push(`${hostName} marked ${lines(unpaid)} not paid yet.`);
  if (released.length) said.push(`${hostName} released ${lines(released)}.`);
  if (gave.length) said.push(`You gave back ${lines(gave)}.`);
  if (reopened.length) said.push(reopened.length === 1 ? `Line ${reopened[0]} is open again.` : `Lines ${joinAnd(reopened)} are open again.`);
  return said.join(" ");
}
```

Create `src/components/break/caller-copy.ts`:

```ts
/** The caller's lines on the break page (Mosaic §7 caller copy): the same for every viewer, never "You", never the prize. */
export const BOARD_FULL_CALL = "Board's full. Game on.";
export const boardFullAnnouncement = (hostName: string) => `Board's full. Every line is paid. Waiting for ${hostName} to run the draw.`;
/** Board fills plays once per viewer per break, stored like the reveal's once-per-viewer flag. */
export const fullBoardKey = (breakId: string) => `breaks.full.${breakId}`;
```

Append to `src/components/break/selection.ts`:

```ts
/** Claim commits (Mosaic §7): "You have lines 4 and 11. Pay Jim $10." The amount is what the pay sheet shows. */
export function claimAnnouncement(got: readonly number[], taken: readonly number[], hostName: string, owedCents: number): string {
  const said = outcomeText(got, taken);
  return got.length > 0 ? `${said} Pay ${hostName} ${formatMoney(owedCents)}.` : said;
}
```

- [ ] **Step 8: Run them to see them pass**

Run: `pnpm test src/components/grid/board-moments.test.ts src/components/break/caller-copy.test.ts src/components/break/selection.test.ts`
Expected: PASS. If the "drains the viewer's own lines" test fails because Task 9's `cellMoments` returns something other than "still" for cell 5 across the view change, stop: that breaks Review Focus 2, so it is reported as a Task 9 bug, not patched here.

- [ ] **Step 9: Write the failing render and CSS tests**

Create `src/components/grid/moments-render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridCell } from "@/domain/breaks/grid";
import { DEFAULT_KIT } from "@/domain/flights";
import { CallerBanner } from "@/components/break/caller-banner";
import type { CellMoment } from "./cell-moments";
import { Cell } from "./cell";
import { Grid } from "./grid";

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el);
const BLUE_KITE = { colour: "blue", shape: "kite" } as const;
const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
/** The markup of one cell button: the board renders cells in line order. */
const buttonOf = (h: string, n: number) => h.split("<button").find((b) => b.includes(`data-cell="${n}"`)) ?? "";

describe("a cell plays only the moment it is given (§3: animate on change, never on mount)", () => {
  it("renders no moment, glint or ghost by default, nor for still", () => {
    for (const moment of [undefined, "still"] as const) {
      const h = html(createElement(Cell, { cell: cell(1, { state: "taken", holder: "liz", flight: BLUE_KITE }), onPress: noop, moment }));
      expect(h).not.toContain("data-moment");
      expect(h).not.toContain("bc-glint");
      expect(h).not.toContain("bc-ghost");
    }
  });
  it("drop: the moment, its stagger index and one glint, no ghost", () => {
    const h = html(createElement(Cell, { cell: cell(4, { state: "taken", mine: true, flight: BLUE_KITE }), onPress: noop, moment: "drop", order: 2 }));
    expect(h).toContain('data-moment="drop"');
    expect(h).toContain("--i:2");
    expect(h.match(/class="bc-glint"/g)).toHaveLength(1);
    expect(h).not.toContain("bc-ghost");
  });
  it("others-in and sniped: the moment only (no squash or glint is ever given to the crowd)", () => {
    for (const moment of ["others-in", "sniped"] as const) {
      const h = html(createElement(Cell, { cell: cell(7, { state: "taken" }), onPress: noop, moment, struck: moment === "sniped" }));
      expect(h).toContain(`data-moment="${moment}"`);
      expect(h).not.toContain("bc-glint");
      expect(h).not.toContain("bc-ghost");
    }
  });
  it("sent, paid, paid undone and release draw the cell as it was, hidden from assistive tech; the name is the new state's", () => {
    const was = cell(9, { state: "taken", mine: true, flight: BLUE_KITE });
    const cases: [CellMoment, GridCell][] = [
      ["sent", cell(9, { state: "sent", mine: true, flight: BLUE_KITE })],
      ["paid", cell(9, { state: "paid", mine: true, flight: BLUE_KITE })],
      ["paid-undo", cell(9, { state: "taken", mine: true, flight: BLUE_KITE })],
      ["release", cell(9)],
    ];
    for (const [moment, now] of cases) {
      const h = html(createElement(Cell, { cell: now, onPress: noop, moment, from: was }));
      expect(h).toContain(`data-moment="${moment}"`);
      expect(h).toContain('<span aria-hidden="true" class="bc-ghost">');
      // The ghost is a nameless, attribute-free copy: no role, no name, no data-cell, no data-flight.
      const ghost = h.slice(h.indexOf('class="bc-ghost"'));
      expect(ghost).not.toMatch(/role="img"|aria-label=|data-cell=|data-flight=/);
      expect(buttonOf(h, 9).indexOf("aria-label=")).toBeGreaterThan(-1);
    }
    expect(html(createElement(Cell, { cell: cell(9), onPress: noop, moment: "release", from: was }))).toContain('aria-label="Line 9, open"');
  });
});

describe("Grid hands each cell its moment and its place in the stagger", () => {
  it("staggers the cells of one kind in line order and leaves the rest still", () => {
    const cells = [cell(1), cell(2, { state: "taken" }), cell(3), cell(4, { state: "taken" })];
    const moments = new Map<number, CellMoment>([[2, "others-in"], [4, "others-in"], [3, "still"]]);
    const h = html(createElement(Grid, { cells, lineCount: 4, label: "Lines, 2 to go", kit: DEFAULT_KIT, onPress: noop, moments }));
    expect(buttonOf(h, 2)).toContain("--i:0");
    expect(buttonOf(h, 4)).toContain("--i:1");
    expect(buttonOf(h, 1)).not.toContain("data-moment");
    expect(buttonOf(h, 3)).not.toContain("data-moment");
  });
});

describe("the caller banner", () => {
  // The lamp's opacity step is Task 8's (lampLayer in Grid, pinned in render.test.ts).
  it("is decorative text with a rule, a glyph only when given a flight, and plays only when told", () => {
    const still = html(createElement(CallerBanner, { text: "Board's full. Game on.", rule: "var(--kit-dark)" }));
    expect(still).toContain('data-testid="caller"');
    expect(still).toContain('aria-hidden="true"');
    expect(still).toContain("Board&#x27;s full. Game on.");
    expect(still).not.toContain("<svg");
    expect(still).not.toContain("data-play");
    const call = html(createElement(CallerBanner, { text: "Line 23. @mike takes the top spot.", rule: "#2340C4", flight: BLUE_KITE, play: true }));
    expect(call).toContain("<svg");
    expect(call).toContain("data-play");
    expect(call).not.toContain("data-flight");
  });
});
```

Create `src/components/grid/motion-css.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

/** Every @keyframes block: name → its body (nested braces matched). */
function keyframes(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1, i = re.lastIndex;
    while (depth > 0 && i < src.length) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    out.set(m[1], src.slice(re.lastIndex, i - 1));
  }
  return out;
}

describe("per-cell motion is CSS on transform and opacity only (Mosaic §7, Global Constraints: Motion)", () => {
  it("animates no other property in any of the board's keyframes", () => {
    const frames = keyframes(css);
    for (const name of ["land", "squash", "glint", "fadein", "set", "seat", "pull", "strike"]) expect(frames.has(name), name).toBe(true);
    for (const [name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "translate", "scale", "opacity", "animation-timing-function"], `${name}: ${p}`).toContain(p);
    }
  });
  it("never transitions a background or a colour", () => {
    expect(css).not.toMatch(/transition(-property)?\s*:[^;]*(background|color)/);
  });
  it("makes every moment instant under reduced motion (no delay, no glint, no ghost)", () => {
    const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
    expect(blocks.some((b) => b.includes("[data-moment], [data-moment] *") && b.includes(".bc-glint, .bc-ghost { display: none; }"))).toBe(true);
  });
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `pnpm test src/components/grid/moments-render.test.ts src/components/grid/motion-css.test.ts`
Expected: FAIL. `@/components/break/caller-banner` does not exist, `Cell` ignores `moment`, and `globals.css` has none of the keyframes `land`, `squash`, `glint`, `fadein`, `set`, `seat`, `pull` or `strike`.

- [ ] **Step 11: Write the moment layers in Cell and Grid**

In `src/components/grid/cell.tsx`:

1. Add the imports:

```tsx
import type { CellMoment } from "./cell-moments";
import { momentAttrs } from "./moment-attrs";
```

2. Add to the `Props` type:

```tsx
  /** The moment this render plays (Task 11): only cellMoments sets it, so nothing animates on mount. */
  moment?: CellMoment;
  /** This cell's place in its moment's stagger (`--i`). */
  order?: number;
  /** The cell as it was: drawn under (paid undone, release) or over (sent, paid) the new state while the moment plays. */
  from?: CellData;
  /** Drawn as a moment's ghost (inside another cell): no role, no name, no data-cell and no data-flight. */
  ghost?: boolean;
```

3. Add `moment, order, from, ghost = false` to the destructured props of `Cell`.

4. Directly before `const style: CSSVars = { ...faceVars(cell, view), … };`, add:

```tsx
  const motion = momentAttrs(moment, order);
  // The drop's one glint on the wire, and the ghost: the old cell, aria-hidden, under or over the new one.
  const momentLayers = (
    <>
      {motion.glint && <span aria-hidden className="bc-glint" />}
      {motion.ghost && from && <span aria-hidden className="bc-ghost"><Cell cell={from} view={view} size={size} px={px} ghost /></span>}
    </>
  );
```

5. In the `style` object Task 7 builds (the one carrying `--face`, `--num` and `--fc`), spread `...motion.style` last. Directly before `if (!onPress) {`, add the ghost's root:

```tsx
  if (ghost) {
    // Only what the CSS reads: the state, the size, mine and won. The ghost never names a flight or a line.
    return <div data-state={data["data-state"]} data-size={data["data-size"]} data-mine={data["data-mine"]} data-won={data["data-won"]} style={style} className={base}>{body}</div>;
  }
```

6. On both other roots (the `role="img"` element and the `<button>`): add `data-moment={motion.moment}`, and render `{momentLayers}` as the last child, after `{body}` (so `.bc-glint` and `.bc-ghost` are root children beside `.bc-in`).

In `src/components/grid/grid.tsx`:

1. Add the imports:

```tsx
import type { CellData } from "./cell-label";
import type { CellMoment } from "./cell-moments";
import { momentOrder } from "./board-moments";
```

2. Add to `Props`:

```tsx
  /** This render's moments (useBoardMoments); absent everywhere but the live break page. */
  moments?: ReadonlyMap<number, CellMoment>;
  /** The cells as they were, for the moments that draw them. */
  from?: ReadonlyMap<number, CellData>;
```

3. Add `moments, from` to the destructured props, and before `const renderCell` add `const order = momentOrder(moments);`.

4. In `renderCell`'s `<Cell … />`, add the three props after `struck={…}`:

```tsx
        moment={moments?.get(c.number)}
        order={order.get(c.number)}
        from={from?.get(c.number)}
```

- [ ] **Step 12: Write the glyph and the caller banner**

(The lamp is Task 8's: `Grid` draws it from `heat` with `lampLayer`, so this task writes no lamp component.)

Create `src/components/flight-glyph.tsx`:

```tsx
import { FLIGHT_COLOURS, FLIGHT_SHAPES, type Flight } from "@/domain/flights";

/** A flight drawn outside a cell (the caller banner, "This is your flight", the /account picker): filled, with a keyline. */
export function FlightGlyph({ flight, size = 20, keyline = "var(--board-ink)", strokeWidth = 1.25 }: { flight: Flight; size?: number; keyline?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} className="shrink-0">
      <path d={FLIGHT_SHAPES[flight.shape].path} fill={FLIGHT_COLOURS[flight.colour].face} stroke={keyline} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
```

Create `src/components/break/caller-banner.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { Flight } from "@/domain/flights";
import { FlightGlyph } from "@/components/flight-glyph";

type Props = {
  /** One line of the caller copy set (§7), never anything else. */
  text: string;
  /** The 4 px left rule: the winner's flight colour (member view), --red / --green (kit view), else --kit-dark. */
  rule: string;
  /** Member view's call only: the winner's glyph at 24 px with a 1.5 px cream keyline (§6, the one exception). */
  flight?: Flight | null;
  /** Drop in (180 ms, a 2 px overshoot). False shows it still. */
  play?: boolean;
};

/** The caller's banner. Decorative: the page announces the same words in its own polite live region. */
export function CallerBanner({ text, rule, flight = null, play = false }: Props) {
  return (
    <div aria-hidden data-testid="caller" data-play={play || undefined} className="caller-banner" style={{ "--call": rule } as CSSProperties}>
      {flight && <FlightGlyph flight={flight} size={24} keyline="var(--board-cream)" strokeWidth={1.5} />}
      <p>{text}</p>
    </div>
  );
}
```

- [ ] **Step 13: Write the moment CSS**

Append to `src/app/globals.css`:

```css
/* ---- Mosaic claim moments (spec §7). Per-cell motion is CSS on transform and opacity only, switched on by
   data-moment, which only cellMoments sets: nothing plays on mount or on a view switch. --i is the cell's place in
   its stagger. The layers are Task 7's (.bc-in > .bc-*); .bc-glint and .bc-ghost (the cell as it was) are root
   children beside .bc-in. Child combinators keep a rule off the ghost's own copy of the layers. ---- */
[data-moment] { will-change: transform, opacity; }

/* Select: the cell dips under the thumb. */
button[data-cell] { transition: transform var(--dur-unpress) var(--ease-over); }
button[data-cell][data-state="open"]:not([aria-disabled="true"]):active { transform: scale(0.94); transition: transform var(--dur-press) var(--ease-out); }

/* Claim commits: the outlined flight drops 6 px in, the cell squashes and settles, the wire glints once in cream, the ring lands. */
[data-moment="drop"] { contain: none; z-index: 1; animation: squash calc(var(--dur-squash) + var(--dur-settle)) linear calc(var(--i, 0) * var(--stagger-own) + var(--dur-drop)) both; }
[data-moment="drop"] > .bc-in > .bc-glyph { --drop: 6px; animation: land var(--dur-drop) var(--ease-in) calc(var(--i, 0) * var(--stagger-own)) both; }
[data-moment="drop"] > .bc-in > .bc-ring { animation: fadein var(--dur-drop) step-end calc(var(--i, 0) * var(--stagger-own)) both; }
.bc-glint { position: absolute; inset: -1px; border: 1px solid color-mix(in srgb, var(--board-cream) 70%, transparent); pointer-events: none; opacity: 0; animation: glint var(--dur-glint) var(--ease-out) calc(var(--i, 0) * var(--stagger-own) + var(--dur-drop)) forwards; }

/* Others claim: their flight (or the kit band) fades in. No squash, no glint. */
[data-moment="others-in"] > .bc-in > .bc-glyph,
[data-moment="others-in"] > .bc-in > .bc-band { animation: fadein var(--dur-others) var(--ease-out) calc(var(--i, 0) * var(--stagger-others)) both; }

/* I've sent it: the outline cross-fades into the filled glyph; the sent mark fades in. */
[data-moment="sent"] > .bc-in > .bc-glyph,
[data-moment="sent"] > .bc-in > .bc-sent { animation: fadein var(--dur-sent) var(--ease-inout) calc(var(--i, 0) * var(--stagger-own)) both; }
[data-moment="sent"] > .bc-ghost { z-index: 2; animation: fadein var(--dur-sent) var(--ease-inout) calc(var(--i, 0) * var(--stagger-own)) reverse both; }

/* Paid: the overlay fades in; the old number on its chip and the old glyph (the ghost, above them at z-index 2) hold
   until the fade ends, then the new ink shows and the flight seats 2 px. Never a background-color transition. */
[data-moment="paid"] > .bc-in > .bc-face { animation: set var(--dur-set) var(--ease-out) calc(var(--i, 0) * var(--stagger-others)) both; }
[data-moment="paid"] > .bc-in > .bc-num { animation: fadein var(--dur-set) step-end calc(var(--i, 0) * var(--stagger-others)) both; }
[data-moment="paid"] > .bc-in > .bc-glyph { animation: fadein var(--dur-set) step-end calc(var(--i, 0) * var(--stagger-others)) both, seat var(--dur-seat) var(--ease-over) calc(var(--i, 0) * var(--stagger-others) + var(--dur-set)) both; }
[data-moment="paid"] > .bc-ghost { z-index: 2; animation: fadein var(--dur-set) step-start calc(var(--i, 0) * var(--stagger-others)) reverse both; }

/* Paid undone: the ink is back at once; the old overlay (the ghost, under the number) fades out. */
[data-moment="paid-undo"] > .bc-ghost { z-index: 0; animation: fadein var(--dur-set) var(--ease-inout) calc(var(--i, 0) * var(--stagger-others)) reverse both; }

/* Release or give back: the old colour drains, its flight lifts 8 px and fades, the hatch fades. No stagger. */
[data-moment="release"] > .bc-ghost { z-index: 0; animation: fadein var(--dur-release) var(--ease-inout) reverse both; }
[data-moment="release"] > .bc-ghost .bc-glyph { animation: pull var(--dur-release) var(--ease-inout) both; }

/* Line sniped: a 2 px ink strike draws across the number, left to right. */
[data-moment="sniped"] > .bc-in > .bc-num > .bc-strike { transform-origin: left center; animation: strike var(--dur-strike) var(--ease-out) both; }

/* The ghost: the old cell without its own face, showing only the layers its moment names. */
.bc-ghost { position: absolute; inset: 0; pointer-events: none; }
.bc-ghost > .bc { background: transparent; box-shadow: none; }
[data-moment="sent"] > .bc-ghost .bc-in > :not(.bc-glyph),
[data-moment="paid"] > .bc-ghost .bc-in > :not(.bc-num, .bc-glyph),
[data-moment="paid-undo"] > .bc-ghost .bc-in > :not(.bc-face),
[data-moment="release"] > .bc-ghost .bc-num { visibility: hidden; }

/* The caller (§7): Big Shoulders 800 26/28 on the wall, a 4 px left rule; drops in with a 2 px overshoot. */
.caller-banner { display: flex; align-items: center; gap: 10px; border-left: 4px solid var(--call, var(--kit-dark)); padding: 4px 0 4px 12px; color: var(--board-text); font-family: var(--font-big-shoulders), Impact, sans-serif; font-weight: 800; font-size: 26px; line-height: 28px; }
.caller-banner[data-play] { --drop: 24px; animation: land var(--dur-banner) var(--ease-over) both, fadein var(--dur-banner) var(--ease-out) both; }

@keyframes land { from { transform: translateY(calc(-1 * var(--drop, 6px))); opacity: 0; } to { transform: none; opacity: 1; } }
/* 40 % = --dur-squash / (--dur-squash + --dur-settle): linear into the squash, --ease-over out of it. */
@keyframes squash { 0% { transform: scale(1); animation-timing-function: linear; } 40% { transform: scale(0.96); animation-timing-function: cubic-bezier(.3, 1.5, .5, 1); } 100% { transform: scale(1); } }
@keyframes glint { from { opacity: 1; } to { opacity: 0; } }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes set { from { opacity: 0; } to { opacity: 1; } }
@keyframes seat { from { transform: translateY(-2px); } to { transform: none; } }
@keyframes pull { to { transform: translateY(-8px); opacity: 0; } }
@keyframes strike { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* Reduced motion: every moment is its final state at once (the global rule shortens durations, not delays). */
@media (prefers-reduced-motion: reduce) {
  [data-moment], [data-moment] *, .caller-banner[data-play] { animation: none !important; }
  .bc-glint, .bc-ghost { display: none; }
  button[data-cell]:active { transform: none !important; }
}
```

- [ ] **Step 14: Run the render and CSS tests to see them pass**

Run: `pnpm test src/components/grid`
Expected: PASS, `render.test.ts` included: no moment prop means no change to any existing assertion.

- [ ] **Step 15: Write the hook**

Create `src/components/grid/use-board-moments.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import type { GridCell } from "@/domain/breaks/grid";
import type { CellMoment } from "./cell-moments";
import { MOTION } from "@/lib/motion";
import { boardMoments, countMoment, drainCells, ghostsFrom, MOMENT_CLEAR_MS, type BoardSnap } from "./board-moments";

const NONE: ReadonlyMap<number, CellMoment> = new Map();
const NO_GHOSTS: ReadonlyMap<number, GridCell> = new Map();
type State = { snap: BoardSnap; moments: ReadonlyMap<number, CellMoment>; from: ReadonlyMap<number, GridCell>; held: BoardSnap | null };
type Shown = { moments: ReadonlyMap<number, CellMoment>; from: ReadonlyMap<number, GridCell>; held: BoardSnap | null };

/**
 * The moments of the latest change to the board, against what this viewer saw last (Mosaic §3). The first render has
 * no earlier board, so it plays nothing. A change that lands mid-moment replaces the map: those cells snap to their
 * new final state. The map clears after MOMENT_CLEAR_MS, so data-moment, will-change and the ghosts never outstay the motion.
 * When the viewer's own last lines go (member to kit), `held` is the member-view board with those cells draining
 * (drainCells): the island draws it for --dur-release, then the kit view, still (spec §7 Release, recorded ruling 21).
 */
export function useBoardMoments(next: BoardSnap, claimed: readonly number[]): Shown {
  const [state, setState] = useState<State>(() => ({ snap: next, moments: NONE, from: NO_GHOSTS, held: null }));
  let current = state;
  if (state.snap.cells !== next.cells || state.snap.view !== next.view || state.snap.struck !== next.struck) {
    const moments = boardMoments(state.snap, next, claimed);
    const draining = state.snap.view === "member" && next.view === "kit" && countMoment(moments, "release") > 0;
    const held = draining ? { cells: drainCells(state.snap.cells, moments), view: "member" as const, struck: next.struck } : null;
    current = { snap: next, moments, from: ghostsFrom(state.snap.cells, moments), held };
    setState(current); // adjusting state while rendering: React re-renders before it commits, so no stale frame
  }
  const shown = current.moments;
  const held = current.held;
  useEffect(() => {
    if (shown.size === 0) return;
    const id = window.setTimeout(() => setState((s) => (s.moments === shown ? { ...s, moments: NONE, from: NO_GHOSTS, held: null } : s)), MOMENT_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [shown]);
  // The drain plays on the held member-view board; then the kit view takes over with nothing moving.
  useEffect(() => {
    if (!held) return;
    const id = window.setTimeout(() => setState((s) => (s.held === held ? { ...s, held: null, moments: NONE, from: NO_GHOSTS } : s)), MOTION.release);
    return () => window.clearTimeout(id);
  }, [held]);
  return { moments: current.moments, from: current.from, held: current.held };
}
```

- [ ] **Step 16: Wire the moments into the break island**

In `src/components/break/pay-sheet.tsx`, replace `  onGaveBack: () => void;` with

```tsx
  /** The lines just given back: the next refresh announces "You gave back …" for them. */
  onGaveBack: (numbers: number[]) => void;
```

and replace `if (r.ok) { setConfirming(false); p.onGaveBack(); p.onClose(); return; }` with `if (r.ok) { setConfirming(false); p.onGaveBack(numbers); p.onClose(); return; }`.

In `src/components/break/break-interactive.tsx`:

1. Add `useLayoutEffect` to the `react` import. Add the imports:

```tsx
import { countMoment, landingTimes, momentAnnouncements, paySheetDelay } from "@/components/grid/board-moments";
import { useBoardMoments } from "@/components/grid/use-board-moments";
import { prefersReducedMotion } from "@/lib/motion";
import { CallerBanner } from "./caller-banner";
import { BOARD_FULL_CALL, boardFullAnnouncement, fullBoardKey } from "./caller-copy";
```

In the `./selection` import, replace `outcomeText` with `claimAnnouncement`.

2. `BreakInteractiveProps.boardView` (Task 8) already says the view; moments compare cells within one view only.

3. After `const [struck, setStruck] = useState<number[]>([]);` add:

```tsx
  // The lines this viewer just claimed (their flights drop when the refreshed props land) and just gave back.
  const [claimed, setClaimed] = useState<number[]>([]);
  const gaveBack = useRef<number[]>([]);
  const board = useBoardMoments({ cells: p.cells, view: p.boardView, struck }, claimed);
  // Drops not yet landed: the checkout count drops by one per landing (a text swap, never rolled).
  const [landing, setLanding] = useState(0);
  // Board fills: null until the once-per-viewer flag is read (the banner renders after hydration only).
  const [fullPlay, setFullPlay] = useState<boolean | null>(null);
  const sheetTimer = useRef<number | null>(null);
```

4. In `finish`, in the `if (r.ok)` branch, replace

```tsx
      say(outcomeText(r.data.got, taken));
      // Built on what is already shown (a retry adds to the first claim's provisional amount); none got, none provisional.
      pay.setPendingOwe((prev) => nextPendingOwe(p.owe ?? prev, r.data.got, p.priceCents));
      pay.show(); // the claim is committed; now the pay step
      return;
```

with

```tsx
      const owedBefore = (p.owe ?? pay.pendingOwe)?.cents ?? 0;
      say(claimAnnouncement(r.data.got, taken, p.hostName, owedBefore + r.data.got.length * p.priceCents));
      setClaimed(r.data.got); // the refreshed props drop these flights in (cellMoments' `mine`)
      // Built on what is already shown (a retry adds to the first claim's provisional amount); none got, none provisional.
      pay.setPendingOwe((prev) => nextPendingOwe(p.owe ?? prev, r.data.got, p.priceCents));
      // The claim is committed; the pay step opens at the last landing or at 400 ms, whichever comes first.
      if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
      const wait = paySheetDelay(r.data.got.length, prefersReducedMotion());
      if (wait === 0) pay.show();
      else sheetTimer.current = window.setTimeout(() => { sheetTimer.current = null; pay.show(); }, wait);
      return;
```

5. In `onPress`, after `setOutcome(null);` add `setClaimed([]);`.

6. In the reconcile effect, replace

```tsx
  const { cells: freshCells, allowance } = p;
  useEffect(() => {
    if (lastCells.current === freshCells) return;
    lastCells.current = freshCells;
```

with

```tsx
  const { cells: freshCells, allowance, hostName } = p;
  useEffect(() => {
    if (lastCells.current === freshCells) return;
    const before = lastCells.current;
    lastCells.current = freshCells;
```

then, directly before `const text = said.join(" ");` in the same effect, add:

```tsx
    // Paid, paid undone, released, given back, open again (Mosaic §7): own lines only where the row says so.
    const moved = momentAnnouncements(before, freshCells, hostName, gaveBack.current);
    if (moved) said.push(moved);
    gaveBack.current = [];
```

and change that effect's dependency list from `[freshCells, allowance]` to `[freshCells, allowance, hostName]`.

7. After the reconcile effect, add:

```tsx
  // The checkout count drops by one per landing. Before paint, so the count never shows the lower number first.
  useLayoutEffect(() => {
    const drops = countMoment(board.moments, "drop");
    if (drops === 0 || prefersReducedMotion()) { setLanding(0); return; }
    const times = landingTimes(drops);
    setLanding(times.length);
    const ids = times.map((t) => window.setTimeout(() => setLanding((n) => Math.max(0, n - 1)), t));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [board.moments]);

  // Board fills (Mosaic §7): "Board's full. Game on." drops in once per viewer per break, then shows still.
  useLayoutEffect(() => {
    if (p.status !== "filled") { setFullPlay(null); return; }
    let seen = true;
    try {
      seen = window.localStorage.getItem(fullBoardKey(p.breakId)) === "1";
      window.localStorage.setItem(fullBoardKey(p.breakId), "1");
    } catch {
      seen = true; // storage blocked: never force the moment
    }
    setFullPlay(!seen && !prefersReducedMotion());
    if (!seen) setAnnounce((a) => ({ text: boardFullAnnouncement(p.hostName), n: a.n + 1 }));
  }, [p.status, p.breakId, p.hostName]);

  useEffect(() => () => { if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current); }, []);
```

8. After `const pending = claimer.pending || pay.pending;` add:

```tsx
  // What the checkout count shows: the server's open count, plus the claimed lines whose flights have not landed yet.
  const shownOpen = p.counts.open + landing;
```

Then, in the `<ClaimBar … />` element, replace Task 10's `toGo={barCheckout({ status: p.status, openCount: p.counts.open })}` with `toGo={barCheckout({ status: p.status, openCount: shownOpen })}`. Leave `openCount: p.counts.open` in the `claimBar({ … })` input (it drives Take the last N) and in the grid's label.

9. In the `<Grid … />` element, replace Task 8's

```tsx
            cells={cells}
            view={p.boardView}
```

with

```tsx
            // While the viewer's own last lines drain, the member-view board is held (spec §7 Release).
            cells={board.held ? [...board.held.cells] : cells}
            view={board.held ? board.held.view : p.boardView}
```

and after `struck={struckSet}` add:

```tsx
            moments={board.moments}
            from={board.from}
```

10. Directly after the closing `</div>` of the `gridWrap` element (before `{p.underBoard}`, so the banner sits between the board and the legend; recorded ruling 22) add:

```tsx
      {p.status === "filled" && fullPlay !== null && (
        <div className="mt-3"><CallerBanner text={BOARD_FULL_CALL} rule="var(--kit-dark)" play={fullPlay} /></div>
      )}
```

11. In the `<PaySheet … />` element, replace `onGaveBack={() => pay.setPendingOwe(null)}` with `onGaveBack={(numbers) => { gaveBack.current = numbers; pay.setPendingOwe(null); }}`.

(`src/app/b/[id]/page.tsx` already passes `boardView`, and `Grid` already draws the lamp from `heat`: Task 8.)

- [ ] **Step 17: Run every gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all green.

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green (sandbox off, `breaks_e2e`). The pay sheet now opens up to 360 ms after the claim resolves; every spec reaches it through Playwright's auto-waiting assertions (`pay-sheet`, `pay-outcome`, `pay-amount`, `pay-sent`), so none needs a change. The journeys never assert the bar's count mid-landing. Task 20 adds "the first claim as a stranger animates only the claimed cells".

- [ ] **Step 18: Optional: check by hand**

If you have a browser tool: `pnpm dev` and open a break at 390 × 664. Claim two lines: each flight drops in, its cell squashes, the wire around it glints once in cream, and the count drops one per landing. Then mark one paid from the host's ledger in a second window and refresh the buyer: the colour fades in and the number switches ink at the end. With the OS reduce-motion setting on, every change shows at once. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 19: Commit**

```bash
git add src/lib/motion.ts src/lib/motion.test.ts src/app/globals.css src/components/grid src/components/flight-glyph.tsx src/components/break
git commit -m "feat(board): claim moments on cellMoments: drop and glint, fade-ins, paid overlay, drain, strike, board full"
```

---

### Task 12: The reveal rewrite + `reveal-plan.ts` (model: Opus)

Spec §7, from Draw starts to Replay, the totals, the caller copy and the never list; §6 "Result page and reveal for strangers"; Review Focus 4.

The deal of the first design (cards dealt on paper, the top spot lifting green) goes. The new sequence:
1. **House lights.** At 0 ms Skip appears, and one board class dims every cell under `--board-wall` at 55 %. Each viewer's own glyphs stay above the dim. The banner says "Jim's break. 50 lines. Game on."
2. **Read-out.** At 300 ms the audited order reads out as chips under the board, `min(30 ms, 1500 ms / lines)` apart. The chips appear once each and never change.
3. **Throws.** For each prize place, 3rd, then 2nd, then the top spot, the banner calls the place, a beat passes, and one neutral dart (steel barrel, cream flight) flies in a straight line from the oche (bottom centre of the frame) to the cell. The dart's angle is fixed at launch. It is the one JS tween (`requestAnimationFrame`, ease-in `cubic-bezier(.55,0,1,.45)`).
4. **Impact.** The dim lifts off that cell at once and the cell takes its won state: black face, bull disc, ring, and the holder's flight in the member view. It squashes, settles and shakes ±2 px (±4 px for the top spot). The banner calls "Line 9. @liz takes 3rd place."
5. **Lift.** One fade lifts the dim off the board, and focus moves to Replay.

Skip ends it within one frame with every bull in the DOM. The reveal plays once per viewer, and Replay plays it again. Reduced motion shows the final state. The deal layer (chips, dart) is `aria-hidden`; the calls are announced politely.

`reveal-plan.ts` holds the timeline as pure functions; tests pin the totals and the order.

The result page now loads the break's board in the viewer's view, with the won places set (`withPlaces`), so the reveal has cells to throw at. Task 13 restyles the page around it.

The break page gets the Draw starts banner, "Jim is stepping up to the oche.", which drops in only when the draw starts while the page is open.

**Files:**
- Create: `src/app/b/[id]/result/board-cells.ts`, `src/app/b/[id]/result/board-cells.test.ts`
- Create: `src/app/b/[id]/result/dart.ts`, `src/app/b/[id]/result/dart.test.ts`
- Rewrite: `src/app/b/[id]/result/reveal-plan.ts`, `src/app/b/[id]/result/reveal-plan.test.ts`, `src/app/b/[id]/result/reveal.tsx`
- Modify: `src/app/b/[id]/result/page.tsx` (load the board, the new `Reveal` props)
- Modify: `src/components/grid/cell.tsx` (the `bc-dim` layer on display roots), `src/components/grid/motion-css.test.ts`
- Modify: `src/app/globals.css` (the reveal block; the first design's `deal` and `lift` keyframes go)
- Modify: `src/components/break/caller-copy.ts`, `src/components/break/caller-copy.test.ts`, `src/components/break/break-interactive.tsx` (Draw starts)
- Modify: `e2e/journey-2.spec.ts` (Skip lands every bull; Replay starts from house lights down)

**Interfaces:**
- Consumes:
  - From Task 11: `MOTION`, `DurationTokens`, `prefersReducedMotion`, `CallerBanner`.
  - From Task 6: `placesOf`, `Place` (`src/domain/draws/places.ts`).
  - From Task 5: `shapeGrid` (`flight`, `kit`, `heat`, `showHolders`).
  - From Task 7: Cell's won state from `place`, `data-won`/`data-mine`, and `data-cell` on display roots.
  - From Task 8: `Grid`'s `view`, `kit` and `heat` props (the lamp) and `data-testid="board-frame"`.
  - `getDrawResult`, `getBreakPage`, `getCaller`, `hostLabel`.
- Produces:
  - `src/app/b/[id]/result/board-cells.ts`: `type ResultCell = GridCell & { place: Place | null }`, `withPlaces(cells, placed: readonly { number: number; place: Place }[]): ResultCell[]` (the places from `placesOf`, Task 6).
  - `src/app/b/[id]/result/reveal-plan.ts`:
    - the frame's `type RevealStep` and `revealPlan(order, places, tokens = MOTION): RevealPlan`;
    - `type RevealPlan = { steps: RevealStep[]; total: number }`, `type Banner`, `type RevealState`;
    - `chipGap(lines)`, `setupMs(lines, tokens?)`, `throwOrder(order, places)`, `revealStateAt(plan, t)`;
    - `setupCall(host, lines)`, `beatCall(place)`, `placeCall(place, line, handle)`, `bannerText(banner, copy)`;
    - kept: `seenKey`, `topSpotText`, `placeLabel`, `dealGateScript`.
  - `src/app/b/[id]/result/dart.ts`: `type Point`, `cubicBezier(x1, y1, x2, y2)`, `easeIn`, `dartAngle(from, to)`, `dartAt(from, to, e)`, `DART_TIP`.
  - `Reveal` props: `{ breakId; lineCount; cells: ResultCell[]; kit; heat; order; places; handleOf; hostName; view: "member" | "kit"; headline: ReactNode; after: ReactNode }`.
  - `caller-copy.ts`: `drawStartCall(host)`, `drawStartAnnouncement(host)`.
  - The Cell's `bc-dim` layer on display roots.
  - Test ids `deal`, `caller`, `reveal-skip` and `reveal-replay`.

- [ ] **Step 1: Write the failing tests for the plan, the dart and the places**

Replace the whole of `src/app/b/[id]/result/reveal-plan.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { MOTION } from "@/lib/motion";
import {
  bannerText, beatCall, chipGap, dealGateScript, placeCall, placeLabel, revealPlan, revealStateAt, seenKey, setupCall, setupMs, throwOrder, topSpotText,
} from "./reveal-plan";

const order50 = [23, 14, 9, ...Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => ![23, 14, 9].includes(n))];
const after = (lines: number, places: 1 | 2 | 3) => revealPlan(order50.slice(0, lines), places).total - setupMs(lines);
const at = (plan: ReturnType<typeof revealPlan>, kind: string) => plan.steps.filter((s) => s.kind === kind);

describe("revealPlan: the totals (Review Focus 4)", () => {
  it("keeps the set-up (house lights plus the read-out) at 1.8 s or less, for every board size", () => {
    for (let lines = 2; lines <= 55; lines++) expect(setupMs(lines)).toBeLessThanOrEqual(1800 + 1e-6);
    expect(setupMs(50)).toBe(MOTION.lights + 1500);
    expect(chipGap(50)).toBe(30);
    expect(chipGap(10)).toBe(30);
    expect(chipGap(60)).toBe(25);
  });
  it("takes about 1.6 s for one prize and about 4.2 s for three after the read-out; 3.4 s and 6 s at most in all", () => {
    expect(after(50, 1)).toBe(1580); // 800 + 260 + 80 + 140, then the 300 ms lift
    expect(after(50, 2)).toBe(2910);
    expect(after(50, 3)).toBe(4240); // 780 + 550 + 780 + 550 + 1280 + 300
    expect(revealPlan(order50, 1).total).toBeLessThanOrEqual(3400);
    expect(revealPlan(order50, 3).total).toBeLessThanOrEqual(6100);
  });
  it("throws 3rd, then 2nd, then the top spot, with beats of 300, 300 and 800 ms", () => {
    const plan = revealPlan(order50, 3);
    expect(at(plan, "throw").map((s) => [s.place, s.number])).toEqual([[3, 9], [2, 14], [1, 23]]);
    const beats = at(plan, "beat");
    expect(at(plan, "throw").map((s, i) => s.at - beats[i].at)).toEqual([300, 300, 800]);
    expect(at(plan, "land").map((s, i) => s.at - at(plan, "throw")[i].at)).toEqual([260, 260, 260]);
    expect(at(plan, "call").map((s) => s.at)).toEqual(at(plan, "land").map((s) => s.at));
    // --dur-gap from one throw's settle to the next beat
    expect(beats[1].at - (at(plan, "land")[0].at + MOTION.squash + MOTION.throwSettle)).toBe(MOTION.gap);
  });
  it("skips places with no prize, and places with no line", () => {
    expect(throwOrder([7, 2, 5], 2)).toEqual([{ place: 2, number: 2 }, { place: 1, number: 7 }]);
    expect(throwOrder([7, 2], 3)).toEqual([{ place: 2, number: 2 }, { place: 1, number: 7 }]);
    expect(throwOrder([7], 3)).toEqual([{ place: 1, number: 7 }]);
  });
});

describe("revealStateAt: what the board shows at a time", () => {
  const plan = revealPlan(order50, 3);
  it("dims at once, reads the order out, lands each bull at its throw, lifts at the end", () => {
    expect(revealStateAt(plan, 0)).toEqual({ lights: true, chips: 0, landed: [], banner: { kind: "setup" }, done: false });
    expect(revealStateAt(plan, MOTION.lights).chips).toBe(1);
    const firstLand = at(plan, "land")[0].at;
    expect(revealStateAt(plan, firstLand - 1).landed).toEqual([]);
    expect(revealStateAt(plan, firstLand)).toMatchObject({ lights: true, landed: [9], banner: { kind: "call", place: 3, number: 9 } });
    expect(revealStateAt(plan, at(plan, "lights-up")[0].at).lights).toBe(false);
  });
  it("Skip is the final state, reached in one step: every bull in the DOM, the lights up, the top-spot call", () => {
    const final = revealStateAt(plan, Number.POSITIVE_INFINITY);
    expect(final).toEqual({ lights: false, chips: 50, landed: [9, 14, 23], banner: { kind: "call", place: 1, number: 23 }, done: true });
    expect(revealStateAt(plan, plan.total)).toEqual(final);
  });
  it("never cycles a number: the chips are the order, once each, and only ever grow; each bull lands once", () => {
    expect(at(plan, "chip").map((s) => s.number)).toEqual(order50);
    let chips = 0, landed = 0;
    for (let t = 0; t <= plan.total; t += 5) {
      const s = revealStateAt(plan, t);
      expect(s.chips).toBeGreaterThanOrEqual(chips);
      expect(s.landed.length).toBeGreaterThanOrEqual(landed);
      expect(new Set(s.landed).size).toBe(s.landed.length);
      chips = s.chips; landed = s.landed.length;
    }
  });
});

describe("the caller copy (complete, the same for every viewer)", () => {
  it("speaks only the lines of the set", () => {
    expect(setupCall("Jim", 50)).toBe("Jim's break. 50 lines. Game on.");
    expect([3, 2, 1].map((p) => beatCall(p as 1 | 2 | 3))).toEqual(["For 3rd place…", "For 2nd place…", "For the top spot…"]);
    expect(placeCall(3, 9, "liz")).toBe("Line 9. @liz takes 3rd place.");
    expect(placeCall(2, 14, "dave")).toBe("Line 14. @dave takes 2nd place.");
    expect(placeCall(1, 23, "mike")).toBe("Line 23. @mike takes the top spot.");
    expect(placeCall(1, 23, null)).toBe("Line 23 takes the top spot.");
    const copy = { hostName: "Jim", lines: 50, handleOf: { 23: "mike" } };
    expect(bannerText({ kind: "setup" }, copy)).toBe("Jim's break. 50 lines. Game on.");
    expect(bannerText({ kind: "beat", place: 1 }, copy)).toBe("For the top spot…");
    expect(bannerText({ kind: "call", place: 1, number: 23 }, copy)).toBe("Line 23. @mike takes the top spot.");
  });
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

it("marks <html data-deal> only for a first-time viewer without reduced motion, lifts it after 4 s, and never throws", () => {
  const runGate = (o: { seen: string | null; reduced: boolean; storageThrows?: boolean }) => {
    const dataset: Record<string, string> = {};
    const timers: (() => void)[] = [];
    const localStorage = { getItem: () => { if (o.storageThrows) throw new Error("blocked"); return o.seen; } };
    const matchMedia = () => ({ matches: o.reduced });
    const document = { documentElement: { dataset } };
    const setTimeout = (fn: () => void) => { timers.push(fn); return 0; };
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

Create `src/app/b/[id]/result/dart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cubicBezier, dartAngle, dartAt, easeIn } from "./dart";

describe("the neutral dart (§7 Draw: each throw)", () => {
  it("accelerates into the board on --ease-in, from 0 to 1, never backwards", () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeIn(0.5)).toBeLessThan(0.5);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) { const e = easeIn(t); expect(e).toBeGreaterThanOrEqual(last - 1e-9); last = e; }
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 3);
  });
  it("flies one straight line, point first, at one angle fixed at launch", () => {
    const from = { x: 195, y: 360 }, to = { x: 60, y: 40 };
    for (const e of [0, 0.25, 0.5, 0.9, 1]) {
      const p = dartAt(from, to, e);
      // collinear with from and to: the cross product is zero
      expect((p.x - from.x) * (to.y - from.y) - (p.y - from.y) * (to.x - from.x)).toBeCloseTo(0, 6);
    }
    expect(dartAt(from, to, 1)).toEqual(to);
    expect(dartAngle(from, to)).toBeCloseTo((Math.atan2(-320, -135) * 180) / Math.PI, 9);
    expect(dartAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });
});
```

Create `src/app/b/[id]/result/board-cells.test.ts`:

```ts
import { it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import { withPlaces } from "./board-cells";

const cell = (number: number): GridCell => ({ number, state: "paid", mine: false, overdue: false, bonus: false, holder: null, flight: null });

it("puts each place from placesOf on its line, and null everywhere else", () => {
  // placesOf([3, 1, 4, 2], [1, 2]) (Task 6): the top spot on line 3, 2nd on line 1.
  const cells = withPlaces([cell(1), cell(2), cell(3), cell(4)], [{ number: 3, place: 1 }, { number: 1, place: 2 }]);
  expect(cells.map((c) => [c.number, c.place])).toEqual([[1, 2], [2, null], [3, 1], [4, null]]);
});
```

In `src/components/break/caller-copy.test.ts`, change the import to `import { BOARD_FULL_CALL, boardFullAnnouncement, drawStartAnnouncement, drawStartCall, fullBoardKey } from "./caller-copy";` and append:

```ts
it("says the draw-starts lines", () => {
  expect(drawStartCall("Jim")).toBe("Jim is stepping up to the oche.");
  expect(drawStartAnnouncement("Jim")).toBe("Jim started the draw. The result is in about a minute.");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test "src/app/b/[id]/result" src/components/break/caller-copy.test.ts`
Expected: FAIL. `revealPlan`, `revealStateAt`, `setupMs`, `chipGap`, `throwOrder` and the call helpers are not exported; `./dart`, `./board-cells`, `drawStartCall` and `drawStartAnnouncement` do not exist.

- [ ] **Step 3: Write the plan, the dart, the board cells and the copy**

Create `src/app/b/[id]/result/board-cells.ts`:

```ts
import type { GridCell } from "@/domain/breaks/grid";
import type { Place } from "@/domain/draws/places";

/** A result-page cell: the viewer's view of the line plus its public place (§5 accessibility: "result page only"). */
export type ResultCell = GridCell & { place: Place | null };

/** Each place from placesOf (Task 6) goes on its line; every other line gets null. */
export function withPlaces(cells: readonly GridCell[], placed: readonly { number: number; place: Place }[]): ResultCell[] {
  const at = new Map(placed.map((p) => [p.number, p.place]));
  return cells.map((c) => ({ ...c, place: at.get(c.number) ?? null }));
}
```

Create `src/app/b/[id]/result/dart.ts`:

```ts
export type Point = { x: number; y: number };

/** CSS's cubic-bezier as a function of time: bisect for the curve parameter at x = t, return its y. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < t) lo = mid; else hi = mid; }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/** --ease-in, the throw's easing (§4): the dart accelerates into the board. */
export const easeIn = cubicBezier(0.55, 0, 1, 0.45);

/** The dart's angle, in degrees: set once at launch and never turned (§7 never list: no spinning, no turning). */
export const dartAngle = (from: Point, to: Point): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Where the point is at eased progress `e`: on the one straight line from the oche to the cell. */
export const dartAt = (from: Point, to: Point, e: number): Point => (e >= 1 ? to : { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });

/** The tip of the dart in its own 56 × 14 SVG box: the point that travels the line, and the rotation's origin. */
export const DART_TIP: Point = { x: 56, y: 7 };
```

Replace the whole of `src/app/b/[id]/result/reveal-plan.ts` with:

```ts
import { ordinal } from "@/lib/list";
import { MOTION, type DurationTokens } from "@/lib/motion";
import type { Place } from "@/domain/draws/places";

export type { Place } from "@/domain/draws/places";
export type RevealStep = { at: number; kind: "lights-down" | "chip" | "beat" | "throw" | "land" | "call" | "lights-up"; number?: number; place?: Place };
export type RevealPlan = { steps: RevealStep[]; total: number };
export type Banner = { kind: "setup" } | { kind: "beat"; place: Place } | { kind: "call"; place: Place; number: number };
export type RevealState = { lights: boolean; chips: number; landed: number[]; banner: Banner | null; done: boolean };

/** The read-out's spacing (§4: computed, not a token): min(30 ms, 1500 ms / lines), so it never takes more than 1.5 s. */
export const chipGap = (lines: number): number => Math.min(30, 1500 / Math.max(1, lines));
/** Set-up: the house lights, then the read-out. At most 1.8 s (pinned by a test). */
export const setupMs = (lines: number, tokens: DurationTokens = MOTION): number => tokens.lights + lines * chipGap(lines);

/** The throws in order: 3rd, 2nd, the top spot. A place with no prize, or with no line in the draw, is skipped. */
export function throwOrder(order: readonly number[], places: Place): { place: Place; number: number }[] {
  return ([3, 2, 1] as const).filter((pl) => pl <= places && order[pl - 1] !== undefined).map((pl) => ({ place: pl, number: order[pl - 1] }));
}

/**
 * The reveal's timeline (§7). 0: house lights down. From --dur-lights: one chip per line of the audited order, an
 * even tempo. Then per prize: a beat (--dur-beat-top before the top spot), the throw, the landing and the call at the
 * same moment, then squash and settle (the shake runs inside the following gap); --dur-gap to the next beat.
 * Last: the lights come up over --dur-lights. Pure, so the totals are pinned by tests.
 */
export function revealPlan(order: readonly number[], places: Place, tokens: DurationTokens = MOTION): RevealPlan {
  const steps: RevealStep[] = [{ at: 0, kind: "lights-down" }];
  const gap = chipGap(order.length);
  order.forEach((n, i) => steps.push({ at: tokens.lights + i * gap, kind: "chip", number: n }));
  let t = setupMs(order.length, tokens);
  throwOrder(order, places).forEach(({ place, number }, i) => {
    if (i > 0) t += tokens.gap;
    steps.push({ at: t, kind: "beat", place });
    const thrown = t + (place === 1 ? tokens.beatTop : tokens.beat);
    steps.push({ at: thrown, kind: "throw", place, number });
    const land = thrown + tokens.throw;
    steps.push({ at: land, kind: "land", place, number }, { at: land, kind: "call", place, number });
    t = land + tokens.squash + tokens.throwSettle;
  });
  steps.push({ at: t, kind: "lights-up" });
  return { steps, total: t + tokens.lights };
}

/** The board at time `t` (ms since lights down). Infinity, and anything from `total` on, is the final state: Skip. */
export function revealStateAt(plan: RevealPlan, t: number): RevealState {
  const past = plan.steps.filter((s) => s.at <= t);
  let banner: Banner | null = null;
  for (const s of past) {
    if (s.kind === "lights-down") banner = { kind: "setup" };
    else if (s.kind === "beat") banner = { kind: "beat", place: s.place! };
    else if (s.kind === "call") banner = { kind: "call", place: s.place!, number: s.number! };
  }
  return {
    lights: past.some((s) => s.kind === "lights-down") && !past.some((s) => s.kind === "lights-up"),
    chips: past.filter((s) => s.kind === "chip").length,
    landed: past.filter((s) => s.kind === "land").map((s) => s.number!),
    banner,
    done: t >= plan.total,
  };
}

const WORDS: Record<Place, { beat: string; takes: string }> = {
  3: { beat: "For 3rd place…", takes: "takes 3rd place." },
  2: { beat: "For 2nd place…", takes: "takes 2nd place." },
  1: { beat: "For the top spot…", takes: "takes the top spot." },
};
/** The caller copy (§7, complete). Never "You", never the prize or its value; the same for every viewer. */
export const setupCall = (hostName: string, lines: number) => `${hostName}'s break. ${lines} lines. Game on.`;
export const beatCall = (place: Place) => WORDS[place].beat;
export const placeCall = (place: Place, line: number, handle: string | null) =>
  handle ? `Line ${line}. @${handle} ${WORDS[place].takes}` : `Line ${line} ${WORDS[place].takes}`;

export function bannerText(b: Banner, c: { hostName: string; lines: number; handleOf: Record<number, string> }): string {
  if (b.kind === "setup") return setupCall(c.hostName, c.lines);
  if (b.kind === "beat") return beatCall(b.place);
  return placeCall(b.place, b.number, c.handleOf[b.number] || null);
}

export const seenKey = (breakId: string) => `breaks.reveal.${breakId}`;
export const topSpotText = (line: number) => `Top spot: line ${line}`;
export const placeLabel = (rank: number) => (rank === 1 ? "Top spot" : ordinal(rank));

/**
 * Inline, pre-paint: mark <html data-deal> when this viewer will see the reveal, so CSS hides the final state
 * until Reveal has set the board to house lights down (no spoiler flash). Removed by Reveal, or after 4 s whatever happens.
 */
export function dealGateScript(breakId: string): string {
  return `try{if(!localStorage.getItem(${JSON.stringify(seenKey(breakId))})&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.deal="1";setTimeout(function(){delete document.documentElement.dataset.deal},4000)}}catch(e){}`;
}
```

Append to `src/components/break/caller-copy.ts`:

```ts
/** Draw starts (§7): the caller's line while the draw runs, and what the page announces when it starts. */
export const drawStartCall = (hostName: string) => `${hostName} is stepping up to the oche.`;
export const drawStartAnnouncement = (hostName: string) => `${hostName} started the draw. The result is in about a minute.`;
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test "src/app/b/[id]/result" src/components/break/caller-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Give display cells a target and a dim layer; write the reveal CSS**

In `src/components/grid/cell.tsx`, on the display-only root (the `role="img"` element, which carries `data-cell` since Task 7), render `<span aria-hidden className="bc-dim" />` as its last child, after `{momentLayers}`. The dim is the house-lights overlay: the board's `data-lights` class fades it in on every cell at once, and a cell's `data-won` lifts it at impact. Only display boards (the result page) have it; the live break page and a moment's ghost never dim.

In `src/app/globals.css`, delete the first design's deal and lift, which §4 retires: the `--animate-deal` and `--animate-lift` lines and both `@keyframes` (`deal` and `lift`) inside the `@theme { … }` block, and then the `@theme { … }` block itself, which is left empty. Keep the `[data-deal] [data-reveal-final]` rule.

Then append to `src/app/globals.css`:

```css
/* ---- The reveal (spec §7). House lights are one class on the board; the dim lifts off a cell the moment it is
   hit; only the targeted cell changes during a throw. Each viewer's own glyphs stay above the dim. ---- */
/* The dim sits at z-index 2, over the number and the glyph (z-index 1, Task 7); your own glyphs rise to 3 above it. */
.bc-dim { position: absolute; inset: 0; z-index: 2; background: var(--board-wall); opacity: 0; pointer-events: none; transition: opacity var(--dur-lights) var(--ease-out); }
[data-lights="down"] .bc-dim { opacity: 0.55; }
[data-lights="down"] [data-won] > .bc-dim { opacity: 0; transition: none; }
[data-lights="down"] [data-mine] > .bc-in > .bc-glyph { z-index: 3; }
/* Impact: the cell (not the board) squashes, settles, then shakes one cycle on x. */
[data-impact] { contain: none; z-index: 1; animation: squash-throw calc(var(--dur-squash) + var(--dur-throw-settle)) linear both, shake var(--dur-shake) linear calc(var(--dur-squash) + var(--dur-throw-settle)) both; }
[data-impact="1"] { --squash-to: 0.9; --shake: 4px; }
[data-impact="2"], [data-impact="3"] { --squash-to: 0.92; --shake: 2px; }
/* While the reveal plays, the result's text waits (it stays in the DOM and in the accessibility tree). */
[data-playing] [data-reveal-text] { opacity: 0; }
/* 36.36 % = --dur-squash / (--dur-squash + --dur-throw-settle). */
@keyframes squash-throw { 0% { transform: scale(1); animation-timing-function: linear; } 36.36% { transform: scale(var(--squash-to, 0.92)); animation-timing-function: cubic-bezier(.3, 1.5, .5, 1); } 100% { transform: scale(1); } }
@keyframes shake { 25% { translate: var(--shake, 2px) 0; } 75% { translate: calc(-1 * var(--shake, 2px)) 0; } 100% { translate: 0 0; } }
@media (prefers-reduced-motion: reduce) {
  [data-impact] { animation: none !important; }
}
```

In `src/components/grid/motion-css.test.ts`, in the first test's list of names, add `"squash-throw", "shake"` after `"strike"`, and add the test:

```ts
  it("has retired the first design's deal and lift (§4)", () => {
    expect(css).not.toContain("--animate-deal");
    expect(css).not.toContain("--animate-lift");
  });
```

- [ ] **Step 6: Write the reveal**

Replace the whole of `src/app/b/[id]/result/reveal.tsx` with:

```tsx
"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FLIGHT_COLOURS, type HeatStep, type Kit } from "@/domain/flights";
import type { Place } from "@/domain/draws/places";
import { Grid } from "@/components/grid/grid";
import { CallerBanner } from "@/components/break/caller-banner";
import { Button } from "@/components/button";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import type { ResultCell } from "./board-cells";
import { DART_TIP, dartAngle, dartAt, easeIn } from "./dart";
import { bannerText, placeCall, revealPlan, revealStateAt, seenKey } from "./reveal-plan";

type Props = {
  breakId: string;
  lineCount: number;
  /** The viewer's view of the board (member or kit, §6), won places set: the final state, server-rendered. */
  cells: ResultCell[];
  kit: Kit;
  heat: HeatStep;
  /** The audited order, top spot first. */
  order: number[];
  places: Place;
  handleOf: Record<number, string>;
  hostName: string;
  view: "member" | "kit";
  /** "Top spot: line 7" and the winner's handle: in the DOM from the start, out of sight while the reveal plays. */
  headline: ReactNode;
  /** The full order and anything else that would spoil the throws. */
  after: ReactNode;
};

const FINAL = Number.POSITIVE_INFINITY;

/**
 * The result page's reveal (Mosaic §7). The final state is server-rendered and readable without JavaScript. The
 * reveal plays once per viewer (Replay afterwards); reduced motion never plays it. Per-cell motion is CSS; the dart's
 * path is the one JS tween. The deal layer (chips, dart, banner) is aria-hidden; each call is announced politely.
 */
export function Reveal(p: Props) {
  const plan = useMemo(() => revealPlan(p.order, p.places), [p.order, p.places]);
  const [t, setT] = useState(FINAL);
  const [canReplay, setCanReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const [said, setSaid] = useState({ text: "", n: 0 });
  const timers = useRef<number[]>([]);
  const raf = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dart = useRef<SVGSVGElement>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const focusReplay = useRef(false);
  const playing = Number.isFinite(t);
  const s = revealStateAt(plan, t);

  const cellEl = (n: number) => stage.current?.querySelector<HTMLElement>(`[data-cell="${n}"]`) ?? null;

  const stop = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.length = 0;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (dart.current) dart.current.style.opacity = "0";
    stage.current?.querySelectorAll<HTMLElement>("[data-impact]").forEach((el) => { delete el.dataset.impact; });
  };

  /** One neutral dart from the oche (bottom centre of the frame) to the cell: a straight line, one fixed angle, ease-in. */
  const throwDart = (n: number) => {
    const st = stage.current, el = dart.current, target = cellEl(n);
    if (!st || !el || !target) return;
    const frame = st.querySelector<HTMLElement>('[data-testid="board-frame"]') ?? st;
    const s0 = st.getBoundingClientRect(), f = frame.getBoundingClientRect(), c = target.getBoundingClientRect();
    const from = { x: f.left + f.width / 2 - s0.left, y: f.bottom - s0.top };
    const to = { x: c.left + c.width / 2 - s0.left, y: c.top + c.height / 2 - s0.top };
    const angle = dartAngle(from, to); // fixed once, here
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / MOTION.throw);
      const at = dartAt(from, to, easeIn(k));
      el.style.transform = `translate(${at.x - DART_TIP.x}px, ${at.y - DART_TIP.y}px) rotate(${angle}deg)`;
      el.style.opacity = k < 1 ? "1" : "0";
      raf.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };

  /** Impact: the cell takes its won state (React, from `landed`); here it squashes, settles and shakes once. */
  const impact = (n: number, place: Place) => {
    const target = cellEl(n);
    if (dart.current) dart.current.style.opacity = "0";
    if (!target) return;
    target.dataset.impact = String(place);
    timers.current.push(window.setTimeout(() => { delete target.dataset.impact; }, MOTION.squash + MOTION.throwSettle + MOTION.shake));
  };

  const play = () => {
    stop();
    setT(0);
    for (const at of [...new Set(plan.steps.map((x) => x.at))].filter((x) => x > 0)) {
      timers.current.push(window.setTimeout(() => {
        setT(at);
        for (const x of plan.steps) {
          if (x.at !== at) continue;
          if (x.kind === "throw") throwDart(x.number!);
          if (x.kind === "land") impact(x.number!, x.place!);
          if (x.kind === "call") setSaid((v) => ({ text: placeCall(x.place!, x.number!, p.handleOf[x.number!] || null), n: v.n + 1 }));
        }
      }, at));
    }
    timers.current.push(window.setTimeout(() => { focusReplay.current = true; setT(FINAL); }, plan.total));
  };
  /** Skip: the final state in the same frame, every bull in the DOM; focus goes to Replay. */
  const skip = () => { focusReplay.current = true; stop(); setT(FINAL); };

  const playRef = useRef(play);
  playRef.current = play;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Before paint, so neither a hard load (the gate script) nor a client navigation shows the result before the lights go down.
  useLayoutEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(seenKey(p.breakId)) === "1";
      window.localStorage.setItem(seenKey(p.breakId), "1");
    } catch {
      seen = true; // storage blocked: never force the reveal
    }
    setCanReplay(true);
    if (!seen && !prefersReducedMotion()) playRef.current();
    setReady(true);
  }, [p.breakId]);
  useLayoutEffect(() => { if (ready) delete document.documentElement.dataset.deal; }, [ready]);
  useEffect(() => () => stopRef.current(), []);
  useEffect(() => {
    if (playing || !focusReplay.current) return;
    focusReplay.current = false;
    replayRef.current?.querySelector("button")?.focus();
  }, [playing]);

  // The board as the throws have left it: a won cell keeps its pre-draw look until its dart lands.
  const landedKey = s.landed.join(",");
  const shown = useMemo(() => {
    const landed = new Set(landedKey ? landedKey.split(",").map(Number) : []);
    return p.cells.map((c) => (c.place !== null && !landed.has(c.number) ? { ...c, place: null } : c));
  }, [p.cells, landedKey]);

  const b = s.banner;
  const called = b?.kind === "call" ? shown.find((c) => c.number === b.number) ?? null : null;
  // Member view: the winner's flight beside the handle (§6, the one exception). Kit view: text, the place's colour.
  const flight = p.view === "member" && called ? called.flight : null;
  const rule = b?.kind !== "call" ? "var(--kit-dark)" : flight ? FLIGHT_COLOURS[flight.colour].face : b.place === 1 ? "var(--red)" : "var(--green)";
  const text = b ? bannerText(b, { hostName: p.hostName, lines: p.lineCount, handleOf: p.handleOf }) : null;

  return (
    <section aria-labelledby="top-spot" data-reveal-final data-playing={playing || undefined} className="relative mt-2">
      <div ref={replayRef} className="relative z-20 flex min-h-11 justify-end">
        {playing
          ? <Button variant="secondary" onClick={skip} data-testid="reveal-skip">Skip</Button>
          : canReplay && <Button variant="secondary" onClick={() => { if (!prefersReducedMotion()) play(); }} data-testid="reveal-replay">Replay the draw</Button>}
      </div>
      <div data-reveal-text>{p.headline}</div>
      <div ref={stage} className="relative mt-6">
        <div data-lights={s.lights ? "down" : undefined} className="relative">
          {/* The viewer's view (§6), the host's kit, and the lamp at the break's step (Grid draws it, Task 8). */}
          <Grid cells={shown} lineCount={p.lineCount} label="Lines" view={p.view} kit={p.kit} heat={p.heat} />
        </div>
        <svg ref={dart} aria-hidden viewBox="0 0 56 14" width={56} height={14} className="pointer-events-none absolute top-0 left-0 z-30"
          style={{ opacity: 0, transformOrigin: `${DART_TIP.x}px ${DART_TIP.y}px` }}>
          <path d="M0 7 L14 3 L14 11 Z" fill="var(--board-cream)" />
          <path d="M14 5 h20 v4 h-20 z" fill="var(--board-steel)" />
          <path d="M34 5.5 h16 v3 h-16 z" fill="var(--board-steel)" />
          <path d="M50 7 L56 7" stroke="var(--board-steel)" strokeWidth={1.2} />
        </svg>
      </div>
      <div className="mt-4 min-h-10">
        {text && <CallerBanner key={text} text={text} rule={rule} flight={flight} play={playing} />}
      </div>
      {playing && (
        <ol aria-hidden data-testid="deal" className="mt-3 flex min-h-7 flex-wrap gap-1">
          {p.order.slice(0, s.chips).map((n) => (
            <li key={n} className="rounded-input bg-[var(--board-wall-2)] px-1.5 py-0.5 font-condensed text-small font-semibold text-[color:var(--board-text-2)] tabular">{n}</li>
          ))}
        </ol>
      )}
      <p role="status" aria-live="polite" className="sr-only"><span key={said.n}>{said.text}</span></p>
      <div data-reveal-text>{p.after}</div>
    </section>
  );
}
```

- [ ] **Step 7: Load the board on the result page**

In `src/app/b/[id]/result/page.tsx`:

1. Add the imports:

```tsx
import { getCaller } from "@/auth/session";
import { getBreakPage } from "@/domain/breaks/queries";
import { shapeGrid } from "@/domain/breaks/grid";
import { placesOf, type Place } from "@/domain/draws/places";
import { hostLabel } from "@/components/break/frame-copy";
import { withPlaces } from "./board-cells";
```

2. Replace `import { dealGateScript } from "./reveal-plan";` with `import { dealGateScript, placeLabel, topSpotText } from "./reveal-plan";`.

3. In `ResultPage`, replace

```tsx
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) notFound();
```

with

```tsx
  const caller = await getCaller();
  const now = new Date();
  const data = await db.transaction(async (tx) => {
    const res = await getDrawResult(tx, id);
    if (!res) return null;
    const page = await getBreakPage(tx, id);
    return page ? { res, page } : null;
  });
  if (!data) notFound();
  const { res, page } = data;
  // The viewer's view (§6): holders see flights, everyone else the host's kit. Won places are public here.
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid: 0 } : null, now);
  // The prize places (Task 6): every prize rank of 1 to 3 with its line; the reveal throws one dart per place.
  const placed = placesOf(res.ranking, res.awards.map((a) => a.rank));
  const places = Math.max(1, placed.length) as Place;
  const cells = withPlaces(grid.cells, placed);
  const winner = res.awards.find((a) => a.rank === 1);
  const others = res.awards.filter((a) => a.rank > 1);
  const handle = (n: number) => (handleOf[n] ? `@${handleOf[n]}` : "");
```

and move the line `const handleOf: Record<number, string> = …` up to directly after `const { res, page } = data;` (the `handle` helper uses it).

4. Replace `<Reveal breakId={id} ranking={res.ranking} handleOf={handleOf} awards={res.awards} />` with:

```tsx
      <Reveal
        breakId={id}
        lineCount={page.break.lineCount}
        cells={cells}
        kit={grid.kit}
        heat={grid.heat}
        order={res.ranking}
        places={places}
        handleOf={handleOf}
        hostName={hostLabel(page.host)}
        view={grid.showHolders ? "member" : "kit"}
        headline={
          <>
            <h1 id="top-spot" data-testid="winner" className="font-condensed text-display font-semibold">{topSpotText(top)}</h1>
            <p className="text-headline font-semibold">{handle(top)}</p>
            {winner?.itemName && <p>Wins {winner.itemName}.</p>}
            {winner && !winner.itemName && <p>Picks one of the prize choices.</p>}
            {others.length > 0 && (
              <ul className="mt-2 space-y-1">
                {others.map((a) => <li key={a.rank}>{placeLabel(a.rank)} place: {a.winnerHandle ? `@${a.winnerHandle}` : "unknown"}{a.itemName ? `, ${a.itemName}` : ""}.</li>)}
              </ul>
            )}
          </>
        }
        after={
          <>
            <h2 className="mt-6 text-headline font-semibold">Full order</h2>
            <ol className="mt-2 divide-y divide-wire-2 rounded-card border border-wire bg-card">
              {res.ranking.map((n, i) => (
                <li key={n} className="flex min-h-11 items-center gap-3 px-4 text-small">
                  <span className="w-20 text-ink-2">{placeLabel(i + 1)}</span>
                  <span className="w-16 font-condensed text-grid font-semibold tabular">Line {n}</span>
                  <span className="min-w-0 truncate">{handle(n)}</span>
                </li>
              ))}
            </ol>
          </>
        }
      />
```

(Task 13 puts this page on the wall and restyles it; this step only gives the reveal its board.)

- [ ] **Step 8: The Draw starts banner on the break page**

In `src/components/break/break-interactive.tsx`:

1. Extend the `./caller-copy` import to `import { BOARD_FULL_CALL, boardFullAnnouncement, drawStartAnnouncement, drawStartCall, fullBoardKey } from "./caller-copy";`.

2. After the board-fills `useLayoutEffect` (Task 11), add:

```tsx
  // Draw starts (Mosaic §7): "Jim is stepping up to the oche." It drops in only when the draw starts while this page
  // is open (animate on change, never on mount); a later visit shows it still. No pulse, no ambient motion.
  const [drawPlay, setDrawPlay] = useState(false);
  const lastStatus = useRef(p.status);
  useEffect(() => {
    if (lastStatus.current === p.status) return;
    const was = lastStatus.current;
    lastStatus.current = p.status;
    if (p.status !== "drawing" || was === "drawing") return;
    setDrawPlay(!prefersReducedMotion());
    setAnnounce((a) => ({ text: drawStartAnnouncement(p.hostName), n: a.n + 1 }));
  }, [p.status, p.hostName]);
```

3. Directly after the board-fills banner block (Task 11, step 16.10) add:

```tsx
      {p.status === "drawing" && (
        <div className="mt-3"><CallerBanner text={drawStartCall(p.hostName)} rule="var(--kit-dark)" play={drawPlay} /></div>
      )}
```

- [ ] **Step 9: Pin Skip and Replay in journey 2 (updates `e2e/journey-2.spec.ts`)**

In `e2e/journey-2.spec.ts`, in section 8, replace

```ts
  await viewer.getByTestId("reveal-skip").click();
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
  await viewer.getByTestId("reveal-replay").click();
  await expect(viewer.getByTestId("reveal-skip")).toBeVisible();
```

with

```ts
  // The clock is paused: the reveal sits at house lights down, one board class, the read-out layer hidden from AT.
  await expect(viewer.locator("[data-lights=down]")).toHaveCount(1);
  await expect(viewer.getByTestId("deal")).toHaveAttribute("aria-hidden", "true");
  await expect(viewer.locator("[data-won]")).toHaveCount(0);
  // Skip ends it in one step: every bull in the DOM (two prizes, two places), the lights up, the top-spot call.
  await viewer.getByTestId("reveal-skip").click();
  await expect(viewer.locator("[data-won]")).toHaveCount(2);
  await expect(viewer.locator("[data-lights=down]")).toHaveCount(0);
  await expect(viewer.getByTestId("caller")).toContainText("takes the top spot.");
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
  // Replay plays it again from house lights down.
  await viewer.getByTestId("reveal-replay").click();
  await expect(viewer.getByTestId("reveal-skip")).toBeVisible();
  await expect(viewer.locator("[data-won]")).toHaveCount(0);
  await viewer.getByTestId("reveal-skip").click();
```

- [ ] **Step 10: Run every gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all green. `motion-css.test.ts` passes with the two new keyframes and with `deal`/`lift` gone.

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green (sandbox off, `breaks_e2e`).
- Journey 1's host lands on the result as a first-time viewer, so the reveal plays. `winner` is server-rendered, and `toContainText` reads it while it is out of sight.
- Journey 2 section 6 reads `[data-reveal-final]`, which still holds the award lines in the headline.
- Section 8 now checks Skip and Replay against the bulls.

- [ ] **Step 11: Optional: check by hand**

If you have a browser tool: `pnpm dev`, run a break to the draw, and open its result in a fresh profile at 390 × 664. Check the sequence:
- The lights go down at once and the order reads out under the board.
- For each place the banner calls it, a single straight dart flies from the bottom centre of the frame to the cell without turning, and only that cell lifts out of the dim, turns black and shakes.
- Skip lands everything at once, and Replay starts again.

Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 12: Commit**

```bash
git add "src/app/b/[id]/result" src/components/grid/cell.tsx src/components/grid/motion-css.test.ts src/app/globals.css src/components/break e2e/journey-2.spec.ts
git commit -m "feat(result): the reveal on the real board: house lights, the read-out, one straight dart per place, the caller"
```

---

### Task 13: Result page and copy (model: Sonnet)

Spec §1.1 (the §5.7 row), §8 "Result `/b/{id}/result`", §4 type table, §6 "Result page and reveal for strangers".

The result page is a wall route; Task 1 set its `theme-color`, and this task switches the wall on with `data-wall` on its `<main>` (recorded ruling 12). It puts the content on the wall in this order:
1. "Top spot: line 7" in Big Shoulders Display 800 at 40/40, above the winner's handle, with the prize lines under it.
2. The board in the viewer's view with the black bulls (Task 12's `Reveal`), then the caller's banner.
3. The full order.
4. Replay, Share and Skip in paper style.
5. Technical details (unchanged) and the entries list.

The entries list shows handles as text with no glyph, because no surface puts a flight beside a handle. Paper cards stay paper (the full order, Verify, Technical details, Entries); text on the wall uses the board text tokens. Big Shoulders is used twice on the page: the headline and the caller. The page copy itself does not change. What changes is its order, its type and its surface, and the green top-spot square is gone (the bull on the board replaces it).

**Files:**
- Modify: `src/app/b/[id]/result/page.tsx` (whole file)
- Modify: `e2e/journey-2.spec.ts` (the result's board, bulls and caller; the stranger's view)

**Interfaces:**
- Consumes:
  - From Task 12: `Reveal` and its props, `withPlaces`, `topSpotText`, `placeLabel` and `dealGateScript`.
  - From Task 6: `placesOf`, `Place`.
  - From Task 1: the board text tokens, the `font-shoulders` and `text-wall-display` utilities, and the `data-wall` rule.
  - From Task 5: `shapeGrid`.
- Produces:
  - Test ids `full-order` (the paper list) and `entries` (the entries fold).
  - Unchanged: `winner`, `technical-details`, `verify-*`, `share`, `fake-beacon`, `reveal-skip`, `reveal-replay`.

- [ ] **Step 1: Write the failing e2e assertions (updates `e2e/journey-2.spec.ts`)**

In `e2e/journey-2.spec.ts`, section 6, after

```ts
  await expect(final).toContainText("Flight pack");
```

add:

```ts
  // The board in the host's view with its two black bulls (two prizes), the caller's final call, the full order,
  // and an entry list of handles as text: no flight glyph beside any handle.
  await expect(host.getByTestId("board-frame")).toBeVisible();
  await expect(host.locator("[data-won]")).toHaveCount(2, { timeout: 15_000 });
  await expect(host.getByTestId("caller")).toContainText("takes the top spot.");
  await expect(host.getByTestId("full-order").locator("li")).toHaveCount(4);
  await expect(host.getByTestId("entries").locator("svg, [data-flight]")).toHaveCount(0);
  await expect(host.getByTestId("entries")).toContainText("Line 1: @");
  // A stranger sees the same bulls in the host's kit: no flight on any cell, a text-only call.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`${url}/result`);
  await stranger.getByTestId("reveal-skip").click();
  await expect(stranger.locator("[data-won]")).toHaveCount(2);
  await expect(stranger.locator("[data-flight]")).toHaveCount(0);
  await expect(stranger.getByTestId("caller").locator("svg")).toHaveCount(0);
  await expect(stranger.getByTestId("caller")).toContainText(/^Line \d+\. @\S+ takes the top spot\.$/);
  await stranger.context().close();
```

- [ ] **Step 2: Run the journey to see it fail**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/journey-2.spec.ts`
Expected: FAIL at `getByTestId("full-order")`: no element has that id yet. The board, the bulls and the caller already pass after Task 12.

- [ ] **Step 3: Rewrite the page on the wall**

Replace the whole of `src/app/b/[id]/result/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { getDrawResult } from "@/domain/draws/queries";
import { placesOf, type Place } from "@/domain/draws/places";
import { getBreakPage } from "@/domain/breaks/queries";
import { shapeGrid } from "@/domain/breaks/grid";
import { QUICKNET } from "@/crypto/beacon";
import type { PublicInputs } from "@/crypto/verify";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { formatDateTime } from "@/lib/time";
import { viewerZone } from "@/lib/zone";
import { shareText } from "@/lib/share-text";
import { LocalTime } from "@/components/local-time";
import { CopyField } from "@/components/copy-field";
import { hostLabel } from "@/components/break/frame-copy";
import { withPlaces } from "./board-cells";
import { dealGateScript, placeLabel, topSpotText } from "./reveal-plan";
import { ShareButton } from "./share-button";
import { Reveal } from "./reveal";
import { Verify } from "./verify";

type Props = { params: Promise<{ id: string }> };

// The wall's text (Mosaic §4): titles 16.8:1, captions 11.5:1, meta 8.1:1. Big Shoulders 800 for the result headline (40/40).
const TEXT = "text-[color:var(--board-text)]";
const CAPTION = "text-[color:var(--board-text-2)]";
const DISPLAY = "font-shoulders text-wall-display font-extrabold";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  return res ? { title: `${res.breakTitle}: result`, description: `Top spot: line ${res.ranking[0]}. Check the draw yourself.` } : {};
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const caller = await getCaller();
  const now = new Date();
  const data = await db.transaction(async (tx) => {
    const res = await getDrawResult(tx, id);
    if (!res) return null;
    const page = await getBreakPage(tx, id);
    return page ? { res, page } : null;
  });
  if (!data) notFound();
  const { res, page } = data;
  const handleOf: Record<number, string> = Object.fromEntries(res.entries.map((e) => [e.number, e.handleAtDraw]));
  const handle = (n: number) => (handleOf[n] ? `@${handleOf[n]}` : "");
  // The viewer's view (§6): holders see every flight, everyone else the host's kit. Won places are public here.
  const grid = shapeGrid(page, caller ? { id: caller.id, role: caller.role, globalUnpaid: 0 } : null, now);
  // The prize places (Task 6): every prize rank of 1 to 3 with its line; the reveal throws one dart per place.
  const placed = placesOf(res.ranking, res.awards.map((a) => a.rank));
  const places = Math.max(1, placed.length) as Place;
  const cells = withPlaces(grid.cells, placed);
  const winner = res.awards.find((a) => a.rank === 1);
  const others = res.awards.filter((a) => a.rank > 1);
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
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12).
    <main data-wall className="mx-auto max-w-[600px] px-4 pb-8 sm:px-6">
      {/* Before first paint: hide the final state while the reveal is about to play (no spoiler flash). */}
      <script dangerouslySetInnerHTML={{ __html: dealGateScript(id) }} />
      {res.draw.beaconSignature === "fake" && (
        <div role="alert" data-testid="fake-beacon" className="mt-4 rounded-card border border-red bg-card px-4 py-3 text-small text-red">
          Test draw. This used stand-in randomness, so it proves nothing. Real draws never show this box.
        </div>
      )}
      <p className="mt-4 text-small"><Link href={`/b/${id}`} className={`${CAPTION} underline underline-offset-4`}>{res.breakTitle}</Link></p>
      <Reveal
        breakId={id}
        lineCount={page.break.lineCount}
        cells={cells}
        kit={grid.kit}
        heat={grid.heat}
        order={res.ranking}
        places={places}
        handleOf={handleOf}
        hostName={hostLabel(page.host)}
        view={grid.showHolders ? "member" : "kit"}
        headline={
          <>
            {/* "Top spot: line 7" above the winner's handle (§1.1); the ring on the board carries the place, this carries the words. */}
            <h1 id="top-spot" data-testid="winner" className={`${DISPLAY} ${TEXT}`}>{topSpotText(top)}</h1>
            <p className={`mt-2 text-headline font-semibold ${TEXT}`}>{handle(top)}</p>
            {winner?.itemName && <p className={CAPTION}>Wins {winner.itemName}.</p>}
            {winner && !winner.itemName && <p className={CAPTION}>Picks one of the prize choices.</p>}
            {others.length > 0 && (
              <ul className={`mt-2 space-y-1 ${CAPTION}`}>
                {others.map((a) => <li key={a.rank}>{placeLabel(a.rank)} place: {a.winnerHandle ? `@${a.winnerHandle}` : "unknown"}{a.itemName ? `, ${a.itemName}` : ""}.</li>)}
              </ul>
            )}
          </>
        }
        after={
          <>
            <h2 className={`mt-6 text-headline font-semibold ${TEXT}`}>Full order</h2>
            <ol data-testid="full-order" className="mt-2 divide-y divide-wire-2 rounded-card border border-wire bg-card text-ink">
              {res.ranking.map((n, i) => (
                <li key={n} className="flex min-h-11 items-center gap-3 px-4 text-small">
                  <span className="w-20 text-ink-2">{placeLabel(i + 1)}</span>
                  <span className="w-16 font-condensed text-grid font-semibold tabular">Line {n}</span>
                  <span className="min-w-0 truncate">{handle(n)}</span>
                </li>
              ))}
            </ol>
          </>
        }
      />
      <p className={`mt-4 max-w-[65ch] text-small ${CAPTION}`}>
        Ran {when(res.draw.createdAt)}. Requested by {res.hostHandle ? `@${res.hostHandle}` : "the host"}
        {res.request.onBehalfNote ? `, run by an admin: ${res.request.onBehalfNote}` : ""}.
      </p>
      <ShareButton value={share} />
      <Verify inputs={publicInputs} seed={res.draw.seed} relayUrl={relayUrl} />
      <details className="mt-3 rounded-card border border-wire bg-card text-ink" data-testid="technical-details">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Technical details</summary>
        <div className="space-y-3 px-4 pb-4">
          <CopyField label="Result hash" value={res.draw.resultHash} />
          <p className="text-small text-ink-2">Algorithm version {res.draw.algorithmVersion}.</p>
        </div>
      </details>
      {/* Handles as text, never a glyph: no surface puts a flight beside a handle (§6). */}
      <details className="mt-3 rounded-card border border-wire bg-card text-ink" data-testid="entries">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Entries</summary>
        <ol className="space-y-1 px-4 pb-4 text-small">
          {res.entries.map((e) => <li key={e.number}>Line {e.number}: {e.handleAtDraw ? `@${e.handleAtDraw}` : "unknown"}{e.isBonus ? ", bonus" : ""}</li>)}
        </ol>
      </details>
      {res.voided.length > 0 && (
        <section className={`mt-4 text-small ${TEXT}`}>
          <h2 className="font-semibold">Earlier draws, voided by an admin</h2>
          <ul className={`mt-1 space-y-1 ${CAPTION}`}>
            {res.voided.map((v, i) => <li key={i}>{when(v.createdAt)}: {v.voidReason ?? "no reason recorded"}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
```

The `Entries` assertion `toContainText("Line 1: @")` reads the collapsed `<details>`: Playwright's `toContainText` reads `textContent`, which includes closed `<details>` content. If `verify.tsx` or `share-button.tsx` render ink text straight on the page background (not inside a `bg-card` box), give that text `text-[color:var(--board-text-2)]` too, so axe (Task 20) finds no contrast failure on the wall.

- [ ] **Step 4: Run every gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all green.

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green (sandbox off, `breaks_e2e`). Journey 2's new assertions pass:
- the host's board shows two bulls;
- `full-order` lists four lines;
- `entries` has no glyph;
- the stranger's board has no `data-flight` and the caller is text only.

Journey 1 (`winner` contains "Top spot: line") is unchanged.

- [ ] **Step 5: Optional: check by hand**

If you have a browser tool: open a ran break's result at 390 × 664, signed in as a holder and in a private window. Check each:
- the headline is Big Shoulders in cream on the wall, with the handle under it;
- the board is in the member view and in the host's kit respectively, with black bulls ringed double red, single green and dashed green;
- Replay and Share are paper buttons;
- the entries are text only.

Report the check as not performed if you cannot do it.

- [ ] **Step 6: Commit**

```bash
git add "src/app/b/[id]/result/page.tsx" "src/app/b/[id]/result/verify.tsx" "src/app/b/[id]/result/share-button.tsx" e2e/journey-2.spec.ts
git commit -m "feat(result): the result on the wall: top spot above the handle, the board with its bulls, the full order"
```

---

### Task 14: OG route in the kit view with heat (model: Opus)

Spec §6, the three link-preview paragraphs; §9 ("12 to go" everywhere); Plan B deferred findings, "OG image". The preview becomes the board as a stranger sees it, drawn in solid colours (Satori draws no patterns, so a band replaces the hatch).

The board and the wall:
- The wall, with one lamp at the break's heat step.
- Cream open cells. Claimed cells carry a 7 px kit-light band with a 1 px ink keyline on its top edge. Paid cells are kit dark with cream numbers.
- Reserved cells sit on `--board-cream-2` with a 2 px steel inner border, so they no longer differ from open cells by number colour only.
- Won cells are black, with a cream disc at 0.48 × the cell, the place's ring and an ink number.
- Empty last-row slots are `--board-wall-2`, which fixes the grey filler.
- The frame is the host's surround at ×2, one box shadow (2 px steel, 12 px ring, 8 px kit dark, 2 px kit light).

The text:
- The title, in Big Shoulders 800.
- The caption: "12 to go, $5 a line", "Closed. Every line is paid.", "Running draw", "Ran Oct 14. Anyone can check the draw." or "Cancelled".
- "Hosted by @jim" with a 40 × 20 kit swatch.
- The wordmark.

The fonts are three static TTFs read from disk at module load and never shipped to browsers. `ogModel` gains `hostedBy` and the new caption; the route now passes the ran break's `places` (`placesOf`, Task 6) into Task 5's `places` input, which makes the "won" tone, and the draw's time as `OgDraw`. Its output still has no holder, handle of a buyer or flight, and `og.test.ts` keeps "has no flight key".

No PNG byte snapshots: the renderer's bytes differ across platforms (recorded ruling 25). The tests pin `ogModel`'s JSON per status (open 0 %, 50 %, closed, running, ran) and kit, render every status in two kits to a 1200 × 630 PNG (the IHDR), and call the route for an open, a closed and a ran break (200, a 1200 × 630 PNG) and a draft (404). One PNG per status is written to `.superpowers/og-preview/` for a by-eye check and is never committed.

**Files:**
- Create: `assets/og/BigShouldersDisplay-800.ttf`, `assets/og/BarlowCondensed-600.ttf`, `assets/og/Barlow-500.ttf` (downloaded, not hand-made)
- Create: `src/app/b/[id]/og/fonts.ts`, `src/app/b/[id]/og/image.tsx`, `src/app/b/[id]/og/image.test.ts`, `src/app/b/[id]/og/route.test.ts`
- Write, never commit: `.superpowers/og-preview/*.png` (one per status, for the by-eye check)
- Modify: `src/app/b/[id]/og/route.tsx` (whole file), `src/domain/breaks/og.ts`, `src/domain/breaks/og.test.ts`
- Modify: `next.config.ts` (`outputFileTracingIncludes`)

**Interfaces:**
- Consumes:
  - From Task 5: `ogModel`'s line-state-only first parameter, and `GridModel.kit`/`heat` through `shapeGrid(page, null, now)`.
  - From Task 2: `FLIGHT_COLOURS`, `LAMP`, `TOKENS`, `DEFAULT_KIT`, `Kit`, `HeatStep`.
  - From Task 6: `placesOf`.
  - `getDrawResult`, `formatMoney`, `DEFAULT_TZ`.
- Produces:
  - `src/domain/breaks/og.ts`:
    - `type OgTone = "open" | "taken" | "paid" | "reserved" | "won"`;
    - `type OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 }`;
    - `type OgDraw = { ranAt: Date }` (the won places come in on Task 5's `OgPage.places`);
    - `OgPage.host` gains `handle` and `displayName` (public on every break page; never the payment handles);
    - `type OgModel = { title; caption; hostedBy; kit; heat; cells; columns }`;
    - `ogModel(page, now, draw?: OgDraw | null)`;
    - `ogCaption(status, open, priceCents, ranAt?: Date | null)`;
    - `ogHostedBy(host)`.
  - `src/app/b/[id]/og/image.tsx`: `OG_SIZE`, `GRID_PX`, `fillerCount(cells, columns)`, `ogImage(m: OgModel)`.
  - `src/app/b/[id]/og/fonts.ts`: `OG_FONTS`.
  - `GET /b/{id}/og` unchanged in contract: 1200 × 630 PNG, `public, max-age=300, s-maxage=300`, 404 for a bad id, a missing break or a draft, and it never reads the session.

- [ ] **Step 1: Fetch the three TTFs**

Run (sandbox off; it needs `fonts.googleapis.com` and `fonts.gstatic.com`):

```bash
mkdir -p assets/og
fetch_ttf() { # $1 css2 family spec, $2 output file
  url=$(curl -fsS "https://fonts.googleapis.com/css2?family=$1" | grep -o 'https://fonts.gstatic.com/[^)]*\.ttf' | head -1)
  test -n "$url" && curl -fsS -o "assets/og/$2" "$url"
}
fetch_ttf "Big+Shoulders+Display:wght@800" BigShouldersDisplay-800.ttf
fetch_ttf "Barlow+Condensed:wght@600" BarlowCondensed-600.ttf
fetch_ttf "Barlow:wght@500" Barlow-500.ttf
file assets/og/*.ttf
```

Expected: three lines reading `TrueType Font data`. Google serves TTF to a client that sends no browser user agent, as `curl` does. If the Big Shoulders request returns no URL, use the family name Task 1 confirmed for `next/font/google` (spec §4: "Google has reorganised the family"), with `+` for spaces. If the network is refused, stop and report **BLOCKED: fonts** (Global Constraints). Do not draw, convert or substitute a font.

- [ ] **Step 2: Write the failing model tests**

In `src/domain/breaks/og.test.ts`:

1. Change the import line to `import { ogCaption, ogHostedBy, ogModel } from "./og";`.

2. In the test "draws the grid as an anonymous viewer sees it", in the expected object, change `caption: "3 of 6 left, $5 a line",` to `caption: "3 to go, $5 a line",` and add `hostedBy: "Hosted by @jim",` after it. In Task 5's test "has no flight key (Review Focus 1)", replace `["caption", "cells", "columns", "heat", "kit", "title"]` with `["caption", "cells", "columns", "heat", "hostedBy", "kit", "title"]`.

3. If that test asserts each cell's keys with `Object.keys(c).sort().join() === "number,tone"`, keep it: no cell before the draw has a place.

4. Replace the whole `describe("ogCaption", …)` block with:

```ts
describe("ogCaption (§6: the count everywhere is N to go)", () => {
  it("speaks the community's state words", () => {
    expect(ogCaption("open", 12, 500)).toBe("12 to go, $5 a line");
    expect(ogCaption("open", 3, 550)).toBe("3 to go, $5.50 a line");
    expect(ogCaption("filled", 0, 500)).toBe("Closed. Every line is paid.");
    expect(ogCaption("drawing", 0, 500)).toBe("Running draw");
    expect(ogCaption("drawn", 0, 500, new Date("2026-10-14T16:00:00Z"))).toBe("Ran Oct 14. Anyone can check the draw.");
    expect(ogCaption("drawn", 0, 500, null)).toBe("Ran. Anyone can check the draw.");
    expect(ogCaption("cancelled", 0, 500)).toBe("Cancelled");
  });
  it("names the host by handle, else by name", () => {
    expect(ogHostedBy({ handle: "jim", displayName: "Jim" })).toBe("Hosted by @jim");
    expect(ogHostedBy({ handle: null, displayName: "Jim" })).toBe("Hosted by Jim");
    expect(ogHostedBy({ handle: null, displayName: null })).toBe("Hosted by the host");
  });
});

describe("the preview after the draw (§6: the bulls on the kit board)", () => {
  const ran = () => page(lines, { status: "drawn" });
  const ranAt = new Date("2026-10-14T16:00:00Z");
  it("marks the won places on their cells, as many as there are prizes, and says when it ran", () => {
    // placesOf([4, 2, 3, 1, 5, 6], [1, 2]) (Task 6): the top spot on line 4, 2nd on line 2.
    const m = ogModel({ ...ran(), places: [{ number: 4, place: 1 }, { number: 2, place: 2 }] }, now, { ranAt })!;
    expect(m.cells.filter((c) => c.tone === "won")).toEqual([{ number: 2, tone: "won", place: 2 }, { number: 4, tone: "won", place: 1 }]);
    expect(m.caption).toBe("Ran Oct 14. Anyone can check the draw.");
  });
  it("leaves a won bonus line out with the rest of the bonus row", () => {
    const m = ogModel({ ...ran(), places: [{ number: 7, place: 1 }, { number: 2, place: 2 }, { number: 3, place: 3 }] }, now, { ranAt })!;
    expect(m.cells.map((c) => c.number)).not.toContain(7);
    expect(m.cells.filter((c) => c.tone === "won").map((c) => [c.number, c.place])).toEqual([[2, 2], [3, 3]]);
  });
  it("carries only what a stranger may see: the keys of the model and of every cell", () => {
    const m = ogModel({ ...ran(), places: [{ number: 4, place: 1 }, { number: 2, place: 2 }, { number: 3, place: 3 }] }, now, { ranAt })!;
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "hostedBy", "kit", "title"]);
    for (const c of m.cells) expect(Object.keys(c).every((k) => ["number", "tone", "place"].includes(k))).toBe(true);
    const text = JSON.stringify(m);
    expect(text).not.toContain("alice");
    expect(text).not.toContain(ALICE);
    expect(ogModel(page(lines), now)!.cells.every((c) => c.place === undefined)).toBe(true);
  });
});

describe("the model per status and kit (recorded ruling 25: the JSON, not PNG bytes)", () => {
  const six = (f: (n: number) => L) => [1, 2, 3, 4, 5, 6].map(f);
  for (const kit of [{ dark: "blue", light: "yellow" }, { dark: "plum", light: "lime" }] as Kit[]) {
    it(`open at 0 % and 50 %, closed, running and ran, in the ${kit.dark} with ${kit.light} kit`, () => {
      const empty = ogModel(page(six(open), {}, kit), now)!;
      expect(empty).toMatchObject({ caption: "6 to go, $5 a line", hostedBy: "Hosted by @jim", kit, heat: 0 });
      expect(empty.cells.every((c) => c.tone === "open")).toBe(true);
      const half = ogModel(page(six((n) => (n <= 3 ? alice(n) : open(n))), {}, kit), now)!;
      expect(half).toMatchObject({ caption: "3 to go, $5 a line", kit, heat: 2 });
      expect(half.cells.map((c) => c.tone)).toEqual(["taken", "taken", "taken", "open", "open", "open"]);
      const paid = six((n) => alice(n, { paidAt: hoursAgo(3) }));
      expect(ogModel(page(paid, { status: "filled" }, kit), now)).toMatchObject({ caption: "Closed. Every line is paid.", kit, heat: 4 });
      expect(ogModel(page(paid, { status: "drawing" }, kit), now)).toMatchObject({ caption: "Running draw", kit, heat: 4 });
      const ran = ogModel({ ...page(paid, { status: "drawn" }, kit), places: [{ number: 5, place: 1 }] }, now, { ranAt: new Date("2026-10-14T16:00:00Z") })!;
      expect(ran).toMatchObject({ caption: "Ran Oct 14. Anyone can check the draw.", kit, heat: 4 });
      expect(ran.cells.filter((c) => c.tone === "won")).toEqual([{ number: 5, tone: "won", place: 1 }]);
      for (const m of [empty, half, ran]) expect(JSON.stringify(m)).not.toMatch(/alice|pink|slim|flight/);
    });
  }
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: FAIL. The caption still reads "3 of 6 left, $5 a line", `ogHostedBy` is not exported, `ogCaption` still takes `total`, and the model has no `hostedBy`.

- [ ] **Step 4: Write the model**

In `src/domain/breaks/og.ts`:

1. Add the imports:

```ts
import { DEFAULT_TZ } from "@/lib/time";
import type { HeatStep, Kit } from "@/domain/flights";
```

(Keep any `Kit`/`HeatStep` import Task 5 already added; do not import them twice.)

2. Replace the `OgTone`, `OgCell` and `OgModel` type lines with:

```ts
export type OgTone = "open" | "taken" | "paid" | "reserved" | "won";
export type OgCell = { number: number; tone: OgTone; place?: 1 | 2 | 3 };
/** The draw as the preview may see it: when it ran. The won places come in on OgPage.places (Task 5). Never an entry or a holder. */
export type OgDraw = { ranAt: Date };
/** Everything the image draws. No holder, no buyer's handle, no flight (pinned by og.test.ts); the host's name is public. */
export type OgModel = { title: string; caption: string; hostedBy: string; kit: Kit; heat: HeatStep; cells: OgCell[]; columns: number };
```

3. Replace the whole `ogCaption` function with:

```ts
const RAN_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: DEFAULT_TZ });

/** The caption (§6): "12 to go, $5 a line" while open, the community's state word after. A crawler has no zone: New York. */
export function ogCaption(status: string, open: number, priceCents: number, ranAt: Date | null = null): string {
  switch (status) {
    case "open": return `${open} to go, ${formatMoney(priceCents)} a line`;
    case "filled": return "Closed. Every line is paid.";
    case "drawing": return "Running draw";
    case "drawn": return ranAt ? `Ran ${RAN_DAY.format(ranAt)}. Anyone can check the draw.` : "Ran. Anyone can check the draw.";
    case "cancelled": return "Cancelled";
    default: return "";
  }
}

/** "Hosted by @jim": the host is public on every break page; a buyer never is. */
export const ogHostedBy = (h: { handle: string | null; displayName: string | null }) =>
  `Hosted by ${h.handle ? `@${h.handle}` : h.displayName ?? "the host"}`;
```

4. In `OgPage` (Task 5), replace `host: Pick<BreakPage["host"], "kit">;` with `host: Pick<BreakPage["host"], "kit" | "handle" | "displayName">;`. These fields are public; never add the payment handles. In `ogModel`'s signature, keep the first parameter as `page: OgPage` and add a third parameter: `draw: OgDraw | null = null`. Then replace the body of `ogModel` from `const grid = shapeGrid(shaped, null, now);` to the closing `}` of the function with:

```ts
  const grid = shapeGrid(shaped, null, now);
  // Won places only for a ran break, from the places the route passed (Task 5); a bonus line that won is left out with its row.
  const placeOf = new Map(b.status === "drawn" ? (page.places ?? []).map((p) => [p.number, p.place]) : []);
  const cells: OgCell[] = grid.cells
    .filter((c) => !c.bonus && c.number <= b.lineCount)
    .map((c) => {
      const place = placeOf.get(c.number);
      return place ? { number: c.number, tone: "won" as const, place } : { number: c.number, tone: c.state === "sent" ? "taken" : c.state };
    });
  const title = b.title.length > MAX_TITLE ? `${b.title.slice(0, MAX_TITLE - 1)}…` : b.title;
  return {
    title,
    caption: ogCaption(b.status, grid.counts.open, b.linePriceCents, draw?.ranAt ?? null),
    hostedBy: ogHostedBy(page.host),
    kit: grid.kit,
    heat: grid.heat,
    cells,
    columns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cells.length)))),
  };
}
```

(This keeps `const b = page.break;`, the draft check and Task 5's field-by-field `shaped` page at the top of the function as they are.)

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: PASS, Task 5's "has no flight key" included.

- [ ] **Step 6: Write the failing image and route tests**

Create `src/app/b/[id]/og/image.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import type { OgCell, OgModel } from "@/domain/breaks/og";
import { DEFAULT_KIT, type Kit } from "@/domain/flights";
import { OG_FONTS } from "./fonts";
import { fillerCount, OG_SIZE, ogImage } from "./image";

// No PNG byte snapshots: the renderer's bytes differ across platforms (recorded ruling 25). Every status renders in two
// kits to a 1200 × 630 PNG. With OG_PREVIEW=1, one PNG per status (default kit) goes to .superpowers/og-preview/ for a
// by-eye check; that folder is never committed.
const PREVIEW_DIR = ".superpowers/og-preview";
const KITS: [string, Kit][] = [["default", DEFAULT_KIT], ["plum-lime", { dark: "plum", light: "lime" }]];
const fifty = (f: (n: number) => Omit<OgCell, "number">): OgCell[] => Array.from({ length: 50 }, (_, i) => ({ number: i + 1, ...f(i + 1) }));
const model = (o: Partial<OgModel>): OgModel => ({
  title: "Target Nexus 90% 22g, full set", caption: "50 to go, $5 a line", hostedBy: "Hosted by @jim",
  kit: DEFAULT_KIT, heat: 0, columns: 8, cells: fifty(() => ({ tone: "open" })), ...o,
});
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 14: 2, 9: 3 };
const STATUSES: Record<string, Partial<OgModel>> = {
  "open-0": {},
  // 25 of 50 claimed (heat step 2): taken and paid alternate, one reserved for a mini.
  "open-50": { caption: "25 to go, $5 a line", heat: 2, cells: fifty((n) => ({ tone: n > 25 ? "open" : n === 25 ? "reserved" : n % 2 ? "taken" : "paid" })) },
  closed: { caption: "Closed. Every line is paid.", heat: 4, cells: fifty(() => ({ tone: "paid" })) },
  ran: { caption: "Ran Oct 14. Anyone can check the draw.", heat: 4, cells: fifty((n) => (PLACES[n] ? { tone: "won", place: PLACES[n] } : { tone: "paid" })) },
};

describe("the link-preview image (Mosaic §6)", () => {
  it("fills the last row's empty slots, and short boards, with wall-2 slots", () => {
    expect(fillerCount(50, 8)).toBe(6);
    expect(fillerCount(48, 8)).toBe(0);
    expect(fillerCount(2, 4)).toBe(2);
  });
  for (const [status, o] of Object.entries(STATUSES)) {
    for (const [kitName, kit] of KITS) {
      it(`${status} in the ${kitName} kit renders a 1200 × 630 PNG`, async () => {
        const png = Buffer.from(await new ImageResponse(ogImage(model({ ...o, kit })), { ...OG_SIZE, fonts: OG_FONTS }).arrayBuffer());
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        // The IHDR chunk: width, then height, as big-endian 32-bit integers at bytes 16 and 20.
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
        if (process.env.OG_PREVIEW === "1" && kitName === "default") {
          mkdirSync(PREVIEW_DIR, { recursive: true });
          writeFileSync(`${PREVIEW_DIR}/${status}.png`, png);
        }
      }, 30_000);
    }
  }
});
```

Create `src/app/b/[id]/og/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { withTx } from "../../../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import { GET } from "./route";

// The route reads through db.transaction; here that runs inside the test's own transaction, which rolls back.
let current: Tx | null = null;
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  db: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => fn(current!) },
}));

const get = (id: string) => GET(new Request(`http://localhost/b/${id}/og`), { params: Promise.resolve({ id }) });
const as = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

describe("GET /b/{id}/og (recorded ruling 25)", () => {
  it("answers a 1200 × 630 PNG for an open, a closed and a ran break, and 404 for a draft", async () => {
    await withTx(async (tx) => {
      current = tx;
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const closed = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await claimLines(tx, as(buyer), { breakId: closed.id, numbers: [1, 2], batchId: randomUUID() });
      for (const number of [1, 2]) await markPaid(tx, as(host, "host"), { breakId: closed.id, number, expectedOwnerId: buyer.id });
      const ran = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      for (const id of [open.id, closed.id, ran.id]) {
        const r = await get(id);
        expect(r.status, id).toBe(200);
        expect(r.headers.get("content-type")).toBe("image/png");
        const png = Buffer.from(await r.arrayBuffer());
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
      }
      const draft = await makeBreak(tx, { hostId: host.id });
      expect((await get(draft.id)).status).toBe(404);
    });
  }, 60_000);
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm test "src/app/b/[id]/og"` (sandbox off: the route test uses `breaks_test`)
Expected: FAIL: `./fonts` and `./image` do not exist, and the route still imports neither.

- [ ] **Step 8: Write the fonts module, the image and the route**

Create `src/app/b/[id]/og/fonts.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static TTFs read once at module load (§6): the image renderer cannot use next/font, and these never reach a browser.
// next.config.ts traces assets/og into the route's bundle.
const read = (file: string) => readFileSync(join(process.cwd(), "assets", "og", file));

export const OG_FONTS = [
  { name: "Big Shoulders Display", data: read("BigShouldersDisplay-800.ttf"), weight: 800 as const, style: "normal" as const },
  { name: "Barlow Condensed", data: read("BarlowCondensed-600.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Barlow", data: read("Barlow-500.ttf"), weight: 500 as const, style: "normal" as const },
];
```

Create `src/app/b/[id]/og/image.tsx`:

```tsx
import type { OgCell, OgModel } from "@/domain/breaks/og";
import { FLIGHT_COLOURS, LAMP, TOKENS } from "@/domain/flights";

export const OG_SIZE = { width: 1200, height: 630 } as const;
/** The grid box. The ×2 frame (24 px of spread) sits in the 64 px padding, leaving 40 px (§6). */
export const GRID_PX = 500;
const PAD = 64;

/** Empty slots in the last row (and on boards under four lines): --board-wall-2, never the wire (Plan B deferred finding). */
export const fillerCount = (cells: number, columns: number): number => (columns - (cells % columns)) % columns;

/** The won cell's bull (§6): a cream disc at 0.48 × the cell; the place's ring at 0.05 × the cell; an ink number; no glyph. */
function Bull({ n, place, cell }: { n: number; place: 1 | 2 | 3; cell: number }) {
  const d = Math.round(cell * 0.48);
  const w = Math.max(2, Math.round(cell * 0.05));
  const colour = place === 1 ? TOKENS.red : TOKENS.green;
  // §5's won-cell sizes at 26 px: the number is 16 px (top spot 14 px), so the same share of the disc here.
  const fontSize = Math.round((d * (place === 1 ? 14 : 16)) / 26);
  const disc = { display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: TOKENS.boardCream, color: TOKENS.boardInk, fontSize };
  if (place !== 1) return <div style={{ ...disc, width: d, height: d, border: `${w}px ${place === 3 ? "dashed" : "solid"} ${colour}` }}>{String(n)}</div>;
  // Double for the top spot: two red bands with a cream gap.
  const gap = Math.max(1, Math.round(w / 2));
  const inner = d - 2 * w - 2 * gap;
  return (
    <div style={{ ...disc, width: d, height: d, border: `${w}px solid ${colour}` }}>
      <div style={{ ...disc, width: inner, height: inner, border: `${w}px solid ${colour}` }}>{String(n)}</div>
    </div>
  );
}

function Cell({ c, size, dark, light }: { c: OgCell; size: number; dark: string; light: string }) {
  const face = c.tone === "paid" ? dark : c.tone === "reserved" ? TOKENS.boardCream2 : c.tone === "won" ? TOKENS.boardRing : TOKENS.boardCream;
  const ink = c.tone === "paid" ? TOKENS.boardCream : c.tone === "reserved" ? TOKENS.boardInk2 : TOKENS.boardInk;
  return (
    <div style={{ display: "flex", width: size, height: size, padding: 1 }}>
      <div style={{
        display: "flex", flex: 1, position: "relative", alignItems: "center", justifyContent: "center", background: face, color: ink,
        fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: Math.round(size * 0.42),
        // Reserved: a 2 px steel inner border, so it never differs from open by number colour only.
        ...(c.tone === "reserved" ? { border: `2px solid ${TOKENS.boardSteel}` } : {}),
      }}>
        {c.tone === "won" && c.place ? <Bull n={c.number} place={c.place} cell={size} /> : String(c.number)}
        {/* Claimed: a 7 px kit-light band along the bottom with a 1 px ink keyline on its top edge (the hatch's stand-in). */}
        {c.tone === "taken" && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: light, borderTop: `1px solid ${TOKENS.boardInk}` }} />}
      </div>
    </div>
  );
}

/** The 1200 × 630 preview (§6): the board in the host's kit on the wall under the lamp, then the title, caption, host and wordmark. */
export function ogImage(m: OgModel) {
  const dark = FLIGHT_COLOURS[m.kit.dark].face;
  const light = FLIGHT_COLOURS[m.kit.light].face;
  const cell = Math.floor(GRID_PX / m.columns);
  // A long title steps down a size and stops at three lines.
  const titlePx = m.title.length <= 40 ? 60 : 44;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: TOKENS.boardWall }}>
      <div style={{ display: "flex", width: GRID_PX + 2 * PAD, height: "100%", alignItems: "center", justifyContent: "center", backgroundImage: `radial-gradient(ellipse at center, ${LAMP[m.heat]}, transparent 70%)` }}>
        {/* Wires: the steel background through a 1 px margin around each cell (the renderer sizes boxes border-box,
            so the width adds the 1 px padding on each side or the last column wraps). The frame is the surround ×2. */}
        <div style={{
          display: "flex", flexWrap: "wrap", width: cell * m.columns + 2, padding: 1, background: TOKENS.boardSteel,
          boxShadow: `0 0 0 2px ${TOKENS.boardSteel}, 0 0 0 14px ${TOKENS.boardRing}, 0 0 0 22px ${dark}, 0 0 0 24px ${light}`,
        }}>
          {m.cells.map((c) => <Cell key={c.number} c={c} size={cell} dark={dark} light={light} />)}
          {Array.from({ length: fillerCount(m.cells.length, m.columns) }, (_, i) => (
            <div key={`slot-${i}`} style={{ display: "flex", width: cell, height: cell, padding: 1 }}>
              <div style={{ display: "flex", flex: 1, background: TOKENS.boardWall2 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 28, paddingRight: PAD }}>
        <div style={{ display: "flex", fontFamily: "Big Shoulders Display", fontWeight: 800, fontSize: titlePx, lineHeight: 1.1, color: TOKENS.boardCream, overflow: "hidden", maxHeight: Math.ceil(titlePx * 1.1 * 3) }}>{m.title}</div>
        <div style={{ display: "flex", fontFamily: "Big Shoulders Display", fontWeight: 800, fontSize: 40, color: TOKENS.boardText2 }}>{m.caption}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "Barlow", fontWeight: 500, fontSize: 28, color: TOKENS.boardText3 }}>
          {m.hostedBy}
          <div style={{ display: "flex", width: 40, height: 20 }}>
            <div style={{ display: "flex", width: 20, height: 20, background: dark }} />
            <div style={{ display: "flex", width: 20, height: 20, background: light }} />
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: 32, color: TOKENS.boardCream }}>Breaks</div>
      </div>
    </div>
  );
}
```

Replace the whole of `src/app/b/[id]/og/route.tsx` with:

```tsx
import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { placesOf } from "@/domain/draws/places";
import { ogModel, type OgDraw, type OgPage } from "@/domain/breaks/og";
import { isUuid } from "@/lib/is-uuid";
import { OG_FONTS } from "./fonts";
import { OG_SIZE, ogImage } from "./image";

/**
 * GET /b/{id}/og: the link-preview PNG (Mosaic §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same kit-view image; drafts 404 for everyone. For a ran break it reads the draw's
 * places and time, and nothing else of it reaches ogModel.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let found: { page: OgPage; draw: OgDraw | null } | null;
  try {
    found = await db.transaction(async (tx) => {
      const page = await getBreakPage(tx, id);
      if (!page) return null;
      if (page.break.status !== "drawn") return { page, draw: null };
      const res = await getDrawResult(tx, id);
      if (!res) return { page, draw: null };
      // The won places (placesOf, Task 6) ride on Task 5's OgPage.places; the draw adds only when it ran.
      return { page: { ...page, places: placesOf(res.ranking, res.awards.map((a) => a.rank)) }, draw: { ranAt: res.draw.createdAt } };
    });
  } catch {
    // A crawler gets no image rather than a bare 500.
    return new Response(null, { status: 404 });
  }
  const m = found ? ogModel(found.page, new Date(), found.draw) : null;
  if (!m) return new Response("Not found", { status: 404 });
  return new ImageResponse(ogImage(m), { ...OG_SIZE, fonts: OG_FONTS, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
```

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The link-preview route reads its static TTFs from disk at module load (Mosaic §6).
  outputFileTracingIncludes: { "/b/[id]/og": ["./assets/og/*.ttf"] },
};

export default nextConfig;
```

- [ ] **Step 9: Run them, write the previews and look at them**

Run: `OG_PREVIEW=1 pnpm test "src/app/b/[id]/og"` (sandbox off)
Expected: PASS, writing four PNGs (`open-0`, `open-50`, `closed`, `ran`) to `.superpowers/og-preview/`. They are for the eye only: never `git add` them.

Open each PNG (the Read tool shows images) and check it against §6:

| What | Check |
|---|---|
| Frame | The board sits in the frame: steel, the black ring, the kit's dark band, a light pinstripe. |
| Empty slots | Six slots end the last row in dark wall-2, not grey. |
| Lamp | It brightens from open-0 to closed. |
| Claimed cells | `open-50`'s claimed cells carry the kit-light band. |
| Paid cells | Kit dark with cream numbers. |
| Line 25 | Reserved: cream-2 with a steel inner border. |
| `ran` | Lines 23, 14 and 9 are black with cream discs ringed double red, solid green and dashed green. |
| Fonts | The title and caption are Big Shoulders, the numbers Barlow Condensed. |
| Swatch | The 40 × 20 kit swatch follows "Hosted by @jim". |

If the frame is missing (Satori ignored the spread), replace the `boxShadow` with nested boxes and set `GRID_PX` to 452 (§6):
1. Wrap the grid `div` in four `display: flex` boxes. From the outside in, their backgrounds are light, dark, `TOKENS.boardRing` and `TOKENS.boardSteel`, with paddings 2, 8, 12 and 2.
2. Run the update again.

Report what you saw. If you cannot view images, report the eye check as not performed. The JSON, size and route tests still guard the preview.

Run: `pnpm test "src/app/b/[id]/og" src/domain/breaks/og.test.ts`
Expected: PASS.

- [ ] **Step 10: Run every gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all green.

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green (sandbox off, `breaks_e2e`). The webServer build also proves the route bundles its fonts. The pages spec's preview test (status 200, `image/png`, the cache header, 1200 × 630 from the IHDR chunk, a draft's 404) passes unchanged.

- [ ] **Step 11: Commit**

```bash
git add assets/og next.config.ts "src/app/b/[id]/og" src/domain/breaks/og.ts src/domain/breaks/og.test.ts
git commit -m "feat(share): link preview in the host's kit with the lamp, bulls, wall-2 slots and framed board"
```

---

### Task 15: Feed cards, sort chips, landing hero, host profile record and framing (model: Sonnet, Opus review of the host record)

Mosaic §8 and §9, §1.1 rows "§5.2 Landing hero", "§5.3 Feed sort chips", "§5.9 Host profile", "§6 Feed sort". The feed card sits on the wall: its thumbnail is the kit view of the board (line state only, no flight) inside a 6 px frame (1 px steel, 4 px kit dark, 1 px kit light) with the lamp at the break's heat step behind it, then the title, "12 to go", "$5 a line" and the host. The fill bar is dropped: the framed thumbnail is the fill. The sort chips are "Newest" and "Closest to full" (today's `almost` sort, fewest open numbered lines first); "Filling fast" and "Almost full" are retired, and an old `?sort=filling` link falls back to Newest. The landing hero is the kit board of the most recent ran break with its black bull cells (one per place, the ring carrying the place), captioned as before. The host profile shows the host record, "41 breaks run since Mar 2026. 40 draws verified." (counts only, no other state words), with the stall line "Closed 3 days ago, not drawn yet." under it while a Closed break has waited three days or more; every card there is framed in the host's kit. `hostTrust` grows the record (verified draws from active draws' `verified_at`, the oldest stalled Closed break), the profile and the ledger header both read it.

**Files:**
- Create: `src/components/kit-thumb-model.ts`, `src/components/kit-thumb.tsx`, `src/components/kit-thumb.test.ts`
- Modify: `src/components/break-card.tsx` (whole file)
- Modify: `src/app/breaks/params.ts` (whole file), `src/app/breaks/params.test.ts` (whole file), `src/app/breaks/page.tsx`
- Modify: `src/app/page.tsx`, `src/app/landing-copy.ts`, `src/app/landing-copy.test.ts`
- Modify: `src/domain/breaks/queries.ts` (`HostTrust`, `hostTrust`, `HostProfile`, `hostProfile`), `src/domain/breaks/queries.test.ts`, `src/domain/breaks/page-view.ts`
- Modify: `src/components/break/frame-copy.ts` (`hostRecordText`, `hostRecordLines`, `stallText`; `profileTrustText` removed), `src/components/break/frame-copy.test.ts`
- Modify: `src/app/h/[handle]/page.tsx`
- Modify: `src/components/ledger/ledger-sheet.tsx` (`record`), `src/app/b/[id]/page.tsx` (pass it)
- Modify: `e2e/pages.spec.ts` (the feed, profile and landing tests)

**Interfaces:**
- Consumes: `FLIGHT_COLOURS`, `LAMP`, `heatStep`, `kitFor`, `Kit`, `HeatStep` (`src/domain/flights.ts`, Task 2); `OgTone` (`src/domain/breaks/og.ts`, Task 5); `hostProfiles.kitDark`, `hostProfiles.kitLight` and the `draws.verified_at` column, set by `finaliseDraw` when the draw is recorded (Task 4); `FeedBreak.kit: Kit`, `FeedBreak.heat: HeatStep` and `HostProfile.kit` (Task 5); `LatestRan` gaining `places: { number: number; place: Place }[]` (from `placesOf`), `kit: Kit`, `heat` and `cells: ThumbCell[]` while keeping `topLine`, and `Place` (`src/domain/draws/places.ts`) (Task 6); `toGoText(open: number): string` in `frame-copy.ts` ("12 to go", Task 10); the `font-shoulders` and `text-wall-display` utilities for Big Shoulders 800 (Task 1); Task 1's `data-wall` rule, which this task switches on for `/breaks`, `/` and `/h/{handle}` (recorded ruling 12); `thumbColumns`, `formatMonthYear`, `daysSince`, `plural`, `formatMoney`.
- Produces:
  - `src/components/kit-thumb-model.ts`: `type ThumbTone = { number: number; tone: OgTone; place: 1 | 2 | 3 | null }`; `kitThumbCells(cells: readonly ThumbCell[], places?: readonly { number: number; place: Place }[]): ThumbTone[]`; `thumbFillers(n: number, cols: number): number`.
  - `KitThumb({ cells: readonly ThumbTone[]; kit: Kit; heat: HeatStep; size: number })`: server-safe, `aria-hidden`, test id `thumb`; cells carry `data-tone` and, when won, `data-place`.
  - `src/app/breaks/params.ts`: `FEED_CHIPS = ["newest", "almost"] as const`; `type FeedChip`; `FeedParams.sort: FeedChip`; `SORT_LABELS: Record<FeedChip, string>` = Newest, Closest to full; `parseFeedParams`, `feedHref` as before.
  - `src/domain/breaks/queries.ts`: `type HostTrust = { breaksRun: number; since: Date; drawsVerified: number; stalledSince: Date | null }`; `hostTrust(tx, hostId): Promise<HostTrust>`; `HostProfile` gains `drawsVerified`, `stalledSince` and `kit`.
  - `frame-copy.ts`: `hostRecordText(t: { breaksRun: number; drawsVerified: number; since: Date }): string`; `stallText(days: number): string`; `hostRecordLines(t: { breaksRun: number; drawsVerified: number; since: Date; stalledSince: Date | null }, now: Date): string[]`.
  - `LedgerSheetProps.record?: readonly string[]` (and so `HostTools`).
  - Test ids: `thumb`, `host-record`, `host-stall`, `ledger-record`, `ledger-stall`; `profile-trust` is retired.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/app/breaks/params.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { FEED_CHIPS, feedHref, parseFeedParams, SORT_LABELS } from "./params";

describe("feed params", () => {
  it("reads the sort and the host, falling back to newest and no host", () => {
    expect(parseFeedParams({})).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ sort: "almost", host: "Jim_R" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: "almost", host: "@jim_r" })).toEqual({ sort: "almost", host: "jim_r" });
    expect(parseFeedParams({ sort: ["almost", "newest"], host: ["ann", "bob"] })).toEqual({ sort: "almost", host: "ann" });
    expect(parseFeedParams({ sort: "closing", host: "x" })).toEqual({ sort: "newest", host: null });
    expect(parseFeedParams({ host: "<script>" })).toEqual({ sort: "newest", host: null });
  });
  it("sends a link to the retired Filling fast sort to Newest, keeping the host", () => {
    expect(parseFeedParams({ sort: "filling", host: "jim_r" })).toEqual({ sort: "newest", host: "jim_r" });
  });
  it("offers two chips, Newest and Closest to full", () => {
    expect(FEED_CHIPS.map((s) => SORT_LABELS[s])).toEqual(["Newest", "Closest to full"]);
  });
  it("writes the shortest URL for a choice", () => {
    expect(feedHref({ sort: "newest", host: null })).toBe("/breaks");
    expect(feedHref({ sort: "almost", host: null })).toBe("/breaks?sort=almost");
    expect(feedHref({ sort: "newest", host: "jim_r" })).toBe("/breaks?host=jim_r");
    expect(feedHref({ sort: "almost", host: "jim_r" })).toBe("/breaks?sort=almost&host=jim_r");
  });
});
```

Create `src/components/kit-thumb.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FLIGHT_COLOURS, LAMP } from "@/domain/flights";
import { KitThumb } from "./kit-thumb";
import { kitThumbCells, thumbFillers } from "./kit-thumb-model";

describe("kitThumbCells", () => {
  it("keeps line state only: sent folds into taken, bonus lines drop unless placed, a placed line is won", () => {
    expect(kitThumbCells([
      { number: 1, state: "open", bonus: false },
      { number: 2, state: "sent", bonus: false },
      { number: 3, state: "paid", bonus: false },
      { number: 4, state: "reserved", bonus: false },
      { number: 5, state: "paid", bonus: true },
      { number: 6, state: "paid", bonus: true },
    ], [{ number: 3, place: 1 }, { number: 6, place: 2 }])).toEqual([
      { number: 1, tone: "open", place: null },
      { number: 2, tone: "taken", place: null },
      { number: 3, tone: "won", place: 1 },
      { number: 4, tone: "reserved", place: null },
      { number: 6, tone: "won", place: 2 },
    ]);
  });
  it("takes each place from placesOf (Task 6), and leaves every other line without one", () => {
    const cells = [1, 2, 3, 4].map((number) => ({ number, state: "paid" as const, bonus: false }));
    expect(kitThumbCells(cells, [{ number: 4, place: 1 }, { number: 3, place: 2 }, { number: 2, place: 3 }]).map((c) => c.place)).toEqual([null, 3, 2, 1]);
    // A place with no prize is skipped by placesOf, so a 3rd place with no 2nd stays 3rd.
    expect(kitThumbCells(cells, [{ number: 4, place: 1 }, { number: 2, place: 3 }]).map((c) => c.place)).toEqual([null, 3, null, 1]);
  });
  it("completes the last row with empty slots", () => {
    expect(thumbFillers(50, 8)).toBe(6);
    expect(thumbFillers(16, 4)).toBe(0);
    expect(thumbFillers(5, 3)).toBe(1);
  });
});

describe("KitThumb", () => {
  const cells = kitThumbCells([
    { number: 1, state: "open", bonus: false },
    { number: 2, state: "taken", bonus: false },
    { number: 3, state: "paid", bonus: false },
  ], [{ number: 3, place: 1 }]);
  const h = renderToStaticMarkup(createElement(KitThumb, { cells, kit: { dark: "petrol", light: "orange" }, heat: 2, size: 96 }));
  it("wears the host's kit and the lamp at the break's step, and is decorative", () => {
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.petrol.face}`);
    expect(h).toContain(`--kit-light:${FLIGHT_COLOURS.orange.face}`);
    expect(h).toContain(LAMP[2]);
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('data-testid="thumb"');
  });
  it("draws the kit view only: no flight, no holder, the place on the won cell", () => {
    expect(h).not.toContain("data-flight");
    expect(h).not.toContain("--fc");
    expect(h).toContain('data-tone="won" data-place="1"');
    expect(h.match(/data-tone="/g)).toHaveLength(3);
  });
});
```

In `src/components/break/frame-copy.test.ts`, in the import from `./frame-copy`, replace `profileTrustText` with `hostRecordLines, hostRecordText, stallText`, and replace the four lines

```ts
    expect(profileTrustText({ breaksRun: 0, since })).toBe("New host. No breaks run yet.");
    expect(profileTrustText({ breaksRun: 1, since })).toBe("New host. 1 break run.");
    expect(profileTrustText({ breaksRun: 3, since })).toBe("New host. 3 breaks run.");
    expect(profileTrustText({ breaksRun: 12, since })).toBe("12 breaks run since Oct 2026.");
```

with

```ts
    expect(hostRecordText({ breaksRun: 0, drawsVerified: 0, since })).toBe("No breaks run yet.");
    expect(hostRecordText({ breaksRun: 1, drawsVerified: 1, since })).toBe("1 break run since Oct 2026. 1 draw verified.");
    expect(hostRecordText({ breaksRun: 41, drawsVerified: 40, since })).toBe("41 breaks run since Oct 2026. 40 draws verified.");
    expect(hostRecordText({ breaksRun: 2, drawsVerified: 0, since })).toBe("2 breaks run since Oct 2026. 0 draws verified.");
    expect(stallText(3)).toBe("Closed 3 days ago, not drawn yet.");
    const now = new Date("2026-10-14T12:00:00Z");
    // The record is never only good news: a Closed break waiting 3 days or more adds the stall line under it.
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: new Date("2026-10-10T11:00:00Z") }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified.", "Closed 4 days ago, not drawn yet."]);
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: new Date("2026-10-12T12:00:00Z") }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified."]);
    expect(hostRecordLines({ breaksRun: 2, drawsVerified: 2, since, stalledSince: null }, now))
      .toEqual(["2 breaks run since Oct 2026. 2 draws verified."]);
```

In `src/domain/breaks/queries.test.ts`, inside `describe("hostProfile", …)`, test `"shows a host's public figures by handle, ignoring case, and nothing private"`, replace

```ts
      expect(p).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 1, pastCount: 2 });
```

with

```ts
      // The drawn break's draw verified when it was recorded (Task 4), so the record reads 1 run, 1 verified.
      expect(p).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 1, pastCount: 2, drawsVerified: 1, stalledSince: null, kit: { dark: "blue", light: "yellow" } });
```

and replace the `expect(Object.keys(p!).sort())…` line (as Task 5 left it) with

```ts
      expect(Object.keys(p!).sort()).toEqual(["breaksRun", "displayName", "drawsVerified", "handle", "id", "kit", "pastCount", "since", "stalledSince"]);
```

Append to `src/domain/breaks/queries.test.ts`:

```ts
describe("hostTrust record (Mosaic §9)", () => {
  it("counts verified draws from active draws only and finds the oldest Closed break still waiting for its draw", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const voided = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      // The second draw is voided (the one update draws allow): the break is Closed again and has waited four days.
      await tx.execute(sql`update draws set voided_at = now(), voided_by = ${host.id}::uuid, void_reason = 'test' where id = ${voided.drawId}::uuid`);
      await tx.execute(sql`update breaks set status = 'filled', filled_at = now() - interval '4 days' where id = ${voided.id}::uuid`);
      const t = await hostTrust(tx, host.id);
      expect(t).toMatchObject({ breaksRun: 1, drawsVerified: 1 });
      expect(t.stalledSince).toBeInstanceOf(Date);
      expect(Date.now() - t.stalledSince!.getTime()).toBeGreaterThan(3.9 * 86_400_000);
    });
  });
  it("has nothing verified and nothing stalled for a host who has run nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      expect(await hostTrust(tx, host.id)).toMatchObject({ breaksRun: 0, drawsVerified: 0, stalledSince: null });
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/app/breaks src/components/kit-thumb.test.ts src/components/break/frame-copy.test.ts src/domain/breaks/queries.test.ts`
Expected: FAIL: `FEED_CHIPS` is not exported and `?sort=filling` parses as `filling`; `./kit-thumb` and `./kit-thumb-model` do not exist; `hostRecordText`, `hostRecordLines` and `stallText` are not exported; `hostTrust` has no `drawsVerified` or `stalledSince`; `hostProfile` has no `drawsVerified` or `stalledSince` key.

- [ ] **Step 3: Write the params, the copy and the thumbnail model**

Replace the whole of `src/app/breaks/params.ts` with:

```ts
import type { FeedSort } from "@/domain/breaks/feed";

/**
 * The feed's sort chips (Mosaic §8): Newest, and Closest to full, which is the domain's "almost" sort (fewest open
 * numbered lines first). "Filling fast" is retired; an old ?sort=filling link falls back to Newest.
 */
export const FEED_CHIPS = ["newest", "almost"] as const satisfies readonly FeedSort[];
export type FeedChip = (typeof FEED_CHIPS)[number];
const isFeedChip = (v: unknown): v is FeedChip => typeof v === "string" && (FEED_CHIPS as readonly string[]).includes(v);

export type FeedParams = { sort: FeedChip; host: string | null };

export const SORT_LABELS: Record<FeedChip, string> = { newest: "Newest", almost: "Closest to full" };

const HANDLE = /^[a-z0-9_]{3,20}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?sort=&host= → what the feed shows. Unknown and retired values fall back to the defaults; nothing throws. */
export function parseFeedParams(sp: { sort?: string | string[]; host?: string | string[] }): FeedParams {
  const sort = first(sp.sort);
  const host = first(sp.host)?.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");
  return { sort: isFeedChip(sort) ? sort : "newest", host: host && HANDLE.test(host) ? host : null };
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
import { formatMonthYear } from "@/lib/time";
```

with

```ts
import { daysSince, formatMonthYear } from "@/lib/time";
```

and replace

```ts
/**
 * The profile's one-sentence trust line (design §5.9, interim). Never "0 breaks run"; the date only from 5 breaks on,
 * where the page drops its separate "On Breaks since" line so the date is never said twice.
 */
export function profileTrustText(t: { breaksRun: number; since: Date }): string {
  if (t.breaksRun === 0) return "New host. No breaks run yet.";
  if (t.breaksRun < 5) return `New host. ${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run.`;
  return `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}.`;
}
```

with

```ts
/**
 * The host record (Mosaic §9) on the profile and in the ledger header: counts only, and no other state words.
 * "41 breaks run since Mar 2026. 40 draws verified." Never "0 breaks run" (Plan B).
 */
export function hostRecordText(t: { breaksRun: number; drawsVerified: number; since: Date }): string {
  if (t.breaksRun === 0) return "No breaks run yet.";
  return `${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run since ${formatMonthYear(t.since)}. ${t.drawsVerified} ${plural(t.drawsVerified, "draw", "draws")} verified.`;
}

/** The platform §9 stall line, written as the first design writes it: no em-dash, no "Filled". */
export const stallText = (days: number) => `Closed ${days} ${plural(days, "day", "days")} ago, not drawn yet.`;

/** The record, then the stall line while a Closed break has waited 3 days or more for its draw: never only good news. */
export function hostRecordLines(t: { breaksRun: number; drawsVerified: number; since: Date; stalledSince: Date | null }, now: Date): string[] {
  const days = t.stalledSince ? daysSince(t.stalledSince, now) : null;
  return days !== null && days >= 3 ? [hostRecordText(t), stallText(days)] : [hostRecordText(t)];
}
```

Create `src/components/kit-thumb-model.ts`:

```ts
import type { OgTone } from "@/domain/breaks/og";
import type { ThumbCell } from "@/domain/breaks/feed";
import type { Place } from "@/domain/draws/places";

/** One thumbnail cell in the kit view (Mosaic §6, §8). */
export type ThumbTone = { number: number; tone: OgTone; place: 1 | 2 | 3 | null };

/**
 * A thumbnail's cells: numbered lines, plus a bonus line only when it placed; sent folds into taken; a placed line is
 * won. Built from line state alone (a ThumbCell has no owner), so nothing about a holder can reach a card.
 */
export function kitThumbCells(cells: readonly ThumbCell[], places: readonly { number: number; place: Place }[] = []): ThumbTone[] {
  const placeOf = (n: number): Place | null => places.find((p) => p.number === n)?.place ?? null;
  return cells.filter((c) => !c.bonus || placeOf(c.number) !== null).map((c) => {
    const place = placeOf(c.number);
    const tone: OgTone = place !== null ? "won" : c.state === "sent" ? "taken" : c.state;
    return { number: c.number, tone, place };
  });
}

/** Empty slots that complete the last row, drawn in --board-wall-2 and never as wire (Mosaic §5). */
export const thumbFillers = (n: number, cols: number) => (n % cols === 0 ? 0 : cols - (n % cols));
```

Create `src/components/kit-thumb.tsx`:

```tsx
import type { CSSProperties } from "react";
import { FLIGHT_COLOURS, LAMP, type HeatStep, type Kit } from "@/domain/flights";
import { thumbColumns } from "@/components/grid/layout";
import { thumbFillers, type ThumbTone } from "./kit-thumb-model";

const FACE: Record<ThumbTone["tone"], string> = {
  open: "var(--board-cream)",
  taken: "var(--board-cream)",
  paid: "var(--kit-dark)",
  reserved: "var(--board-cream-2)",
  won: "var(--board-ring)",
};
/** The place is the ring shape (Mosaic §5): double red for the top spot, single green for 2nd, dashed green for 3rd. */
const RING: Record<1 | 2 | 3, string> = { 1: "2px double var(--red)", 2: "1.5px solid var(--green)", 3: "1.5px dashed var(--green)" };
/** 1 px steel, 4 px kit dark, 1 px kit light: the 6 px thumbnail frame (Mosaic §8), spread, never border or padding. */
const FRAME = "0 0 0 1px var(--board-steel), 0 0 0 5px var(--kit-dark), 0 0 0 6px var(--kit-light)";

/**
 * The board in the host's kit at thumbnail size, under the lamp at the break's step (Mosaic §8): the feed card, the
 * landing hero and the host profile. Decorative: the caption beside it carries the words. Solid faces as the link
 * preview draws them (no hatch, no glyph, no number), and never a flight.
 */
export function KitThumb({ cells, kit, heat, size }: { cells: readonly ThumbTone[]; kit: Kit; heat: HeatStep; size: number }) {
  const cols = thumbColumns(cells.length);
  const vars = { "--kit-dark": FLIGHT_COLOURS[kit.dark].face, "--kit-light": FLIGHT_COLOURS[kit.light].face } as CSSProperties;
  return (
    <span aria-hidden data-testid="thumb" className="relative block shrink-0 p-1.5" style={{ ...vars, width: size + 12 }}>
      <span className="pointer-events-none absolute -inset-3" style={{ background: `radial-gradient(ellipse at center, ${LAMP[heat]}, transparent 70%)` }} />
      <span className="relative grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, background: "var(--board-steel)", boxShadow: FRAME }}>
        {cells.map((c) => (
          <span key={c.number} data-tone={c.tone} data-place={c.place ?? undefined} className="relative flex aspect-square items-center justify-center overflow-hidden" style={{ background: FACE[c.tone] }}>
            {c.tone === "taken" && <span className="absolute inset-x-0 bottom-0 h-[18%] border-t border-[var(--board-ink)]" style={{ background: "var(--kit-light)" }} />}
            {c.tone === "reserved" && <span className="absolute inset-0 border border-[var(--board-steel)]" />}
            {c.place !== null && <span className="block aspect-square w-[48%] rounded-full" style={{ background: "var(--board-cream)", border: RING[c.place] }} />}
          </span>
        ))}
        {Array.from({ length: thumbFillers(cells.length, cols) }, (_, i) => (
          <span key={`slot-${i}`} className="aspect-square" style={{ background: "var(--board-wall-2)" }} />
        ))}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Grow `hostTrust` into the host record, and give the profile its record and kit**

In `src/domain/breaks/queries.ts`, replace

```ts
/** Interim trust figures (the reputation plan replaces them): drawn breaks and member-since. */
export async function hostTrust(tx: Tx, hostId: string): Promise<{ breaksRun: number; since: Date }> {
  const [r] = await tx.select({
    since: users.createdAt,
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${hostId}::uuid and b.status = 'drawn')`,
  }).from(users).where(eq(users.id, hostId));
  return { breaksRun: r?.breaksRun ?? 0, since: r?.since ?? new Date(0) };
}
```

with

```ts
export type HostTrust = { breaksRun: number; since: Date; drawsVerified: number; stalledSince: Date | null };

/**
 * The host record (Mosaic §9) and the interim trust figures. breaksRun: drawn breaks (each has an active draw, as
 * before). drawsVerified: active draws whose `verified_at` was set when the draw was recorded (verifyInputs passed).
 * stalledSince: the oldest Closed break still waiting for its draw. Counts only: never prize totals, money or a
 * ranking against other hosts. The id is bound as a parameter (see hostProfile on bare column names).
 */
export async function hostTrust(tx: Tx, hostId: string): Promise<HostTrust> {
  const [r] = await tx.select({
    since: users.createdAt,
    breaksRun: sql<number>`(select count(*)::int from breaks b where b.host_id = ${hostId}::uuid and b.status = 'drawn')`,
    drawsVerified: sql<number>`(select count(*)::int from draws d join breaks b on b.id = d.break_id where b.host_id = ${hostId}::uuid and b.status = 'drawn' and d.voided_at is null and d.verified_at is not null)`,
    stalledSince: sql<Date | null>`(select min(b.filled_at) from breaks b where b.host_id = ${hostId}::uuid and b.status = 'filled')`.mapWith(breaks.filledAt),
  }).from(users).where(eq(users.id, hostId));
  return { breaksRun: r?.breaksRun ?? 0, since: r?.since ?? new Date(0), drawsVerified: r?.drawsVerified ?? 0, stalledSince: r?.stalledSince ?? null };
}
```

The file already imports `kitFor` and `type Kit` from `@/domain/flights` (Task 5); keep that one import. Then replace the `HostProfile` type and the whole `hostProfile` function (as Task 5 left them) with:

```ts
export type HostProfile = {
  id: string; handle: string; displayName: string | null; since: Date; breaksRun: number; pastCount: number;
  /** The host record (Mosaic §9), from hostTrust. */
  drawsVerified: number; stalledSince: Date | null;
  /** The host's kit, or the default (Blue with Yellow) while they have not picked one. */
  kit: Kit;
};

/**
 * /h/{handle} (design §5.9, Mosaic §8): public figures only. Never email, payment name or payment handles. Null for an
 * unknown handle, for the SYSTEM user, and for anyone who is not a host and never listed a break (a buyer's or an
 * admin's handle is not a host profile).
 */
export async function hostProfile(tx: Tx, handle: string): Promise<HostProfile | null> {
  const [u] = await tx.select({
    id: users.id, handle: users.handle, displayName: users.displayName, since: users.createdAt, role: users.role,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(sql`lower(${users.handle}) = lower(${handle})`);
  if (!u || !u.handle || u.id === SYSTEM.id) return null;
  // The id is bound as a parameter, as hostTrust does. Drizzle writes a single-table select's columns unqualified,
  // so `${users.id}` inside `from breaks b` would render as a bare "id" and Postgres would read it as b.id.
  const [c] = await tx.select({
    pastCount: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.kind = 'main' and b.status in ('drawn','cancelled'))`,
    listed: sql<number>`(select count(*)::int from breaks b where b.host_id = ${u.id}::uuid and b.status <> 'draft')`,
  }).from(users).where(eq(users.id, u.id));
  if (c.listed === 0 && u.role !== "host") return null;
  const t = await hostTrust(tx, u.id);
  return {
    id: u.id, handle: u.handle, displayName: u.displayName, since: u.since, breaksRun: t.breaksRun, pastCount: c.pastCount,
    drawsVerified: t.drawsVerified, stalledSince: t.stalledSince, kit: kitFor(u),
  };
}
```

In `src/domain/breaks/page-view.ts`, replace

```ts
import { getBreakPage, hostTrust, type BreakPage } from "./queries";
```

with

```ts
import { getBreakPage, hostTrust, type BreakPage, type HostTrust } from "./queries";
```

and replace

```ts
  trust: { breaksRun: number; since: Date };
```

with

```ts
  /** The host's trust figures and record (Mosaic §9): the small line and the ledger header both read it. */
  trust: HostTrust;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm test src/app/breaks src/components/kit-thumb.test.ts src/components/break/frame-copy.test.ts src/domain/breaks/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Put the feed card on the wall**

Replace the whole of `src/components/break-card.tsx` with:

```tsx
import Link from "next/link";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import { formatMoney } from "@/lib/money";
import { hostedByText, toGoText, trustText } from "@/components/break/frame-copy";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";

/**
 * A feed card on the wall (Mosaic §8): the kit-framed thumbnail under the break's lamp, then the title, "12 to go",
 * "$5 a line" and the host. No fill bar: the framed thumbnail is the fill. The feed, the landing page and the host
 * profile all use it, so every card is framed in its own host's kit.
 */
export function BreakCard({ b, cells }: { b: FeedBreak; cells: ThumbCell[] }) {
  const hostRef = b.host.handle ? `@${b.host.handle}` : b.host.displayName ?? "the host";
  return (
    <li data-testid="break-card">
      <Link href={`/b/${b.id}`} className="flex items-center gap-3 py-2">
        <KitThumb cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={96} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-semibold" style={{ color: "var(--board-text)" }}>{b.title}</span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" style={{ color: "var(--board-text)" }}>{toGoText(b.open)}</span>
            <span className="text-small" style={{ color: "var(--board-text-2)" }}>{formatMoney(b.linePriceCents)} a line</span>
          </span>
          <span className="text-small" style={{ color: "var(--board-text-3)" }}>{hostedByText(hostRef, trustText(b.host))}</span>
        </span>
      </Link>
    </li>
  );
}
```

In `src/app/breaks/page.tsx`, replace

```tsx
import { FEED_SORTS, feedHosts, feedThumbs, listFeed } from "@/domain/breaks/feed";
```

with

```tsx
import { feedHosts, feedThumbs, listFeed } from "@/domain/breaks/feed";
```

replace

```tsx
import { feedHref, parseFeedParams, SORT_LABELS } from "./params";
```

with

```tsx
import { FEED_CHIPS, feedHref, parseFeedParams, SORT_LABELS } from "./params";
```

replace

```tsx
  const sorts = FEED_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s], href: feedHref({ ...params, sort: s }) }));
```

with

```tsx
  const sorts = FEED_CHIPS.map((s) => ({ value: s, label: SORT_LABELS[s], href: feedHref({ ...params, sort: s }) }));
```

replace

```tsx
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Browse breaks</h1>
```

with

```tsx
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12), so its text takes the wall inks.
    <main data-wall className="mx-auto max-w-[600px] space-y-4 px-4 py-6 sm:px-6" style={{ color: "var(--board-text)" }}>
      <h1 className="font-condensed text-title font-semibold">Browse breaks</h1>
```

and replace

```tsx
        <p className="text-ink-2" data-testid="feed-empty">
```

with

```tsx
        <p style={{ color: "var(--board-text-2)" }} data-testid="feed-empty">
```

- [ ] **Step 7: The landing hero is the kit board of the most recent ran break**

In `src/app/page.tsx`, replace

```tsx
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
```

with

```tsx
import { heatStep } from "@/domain/flights";
import { BreakCard } from "@/components/break-card";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";
import { ranText } from "./landing-copy";
```

replace

```tsx
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
```

with

```tsx
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12), so its text takes the wall inks.
    <main data-wall className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6" style={{ color: "var(--board-text)" }}>
      {hero && (
        <Link href={`/b/${hero.breakId}/result`} data-testid="hero" className="flex items-center gap-4 py-2">
          {/* The kit board of the most recent ran break with its black bulls (Mosaic §8); a ran break is closed, so the lamp is up. */}
          <KitThumb cells={kitThumbCells(hero.cells, hero.places)} kit={hero.kit} heat={heatStep(0, hero.lineCount, true)} size={112} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold">{hero.title}</span>
            <span className="block text-small">Top spot: line {hero.topLine}.</span>
            <span className="block text-small" style={{ color: "var(--board-text-2)" }}>{ranText(hero.ranAt, now, zone.tz)} Anyone can check the draw.</span>
          </span>
        </Link>
      )}
      <section className="space-y-4">
        <h1 className="font-shoulders text-wall-display font-extrabold">Group buys for darts gear.</h1>
```

and replace

```tsx
      <p className="text-small text-ink-2">Hosting on Facebook now? Breaks is invite-only for hosts.</p>
```

with

```tsx
      <p className="text-small" style={{ color: "var(--board-text-3)" }}>Hosting on Facebook now? Breaks is invite-only for hosts.</p>
```

In `src/app/landing-copy.ts`, delete

```ts

/** The hero grid's numbers: every numbered line, plus the winning line when it is a bonus line above N. */
export function heroNumbers(lineCount: number, topLine: number): number[] {
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1);
  return topLine > lineCount ? [...numbers, topLine] : numbers;
}
```

(`kitThumbCells` keeps a placed bonus line, which is what `heroNumbers` did). In `src/app/landing-copy.test.ts`, replace `import { heroNumbers, ranText } from "./landing-copy";` with `import { ranText } from "./landing-copy";` and delete

```ts

describe("heroNumbers", () => {
  it("is every numbered line, plus the winner when it is a bonus line", () => {
    expect(heroNumbers(4, 2)).toEqual([1, 2, 3, 4]);
    expect(heroNumbers(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 8: The host profile shows the record under a board in the host's kit**

In `src/app/h/[handle]/page.tsx`, replace

```tsx
import { pastText, profileTrustText } from "@/components/break/frame-copy";
```

with

```tsx
import { hostRecordLines, hostRecordText, pastText } from "@/components/break/frame-copy";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";
```

below `type Props = { params: Promise<{ handle: string }> };` add

```tsx
/** The decorative board beside the record: sixteen open cells in the host's kit (recorded ruling 20: no break is named for it). */
const KIT_BOARD = kitThumbCells(Array.from({ length: 16 }, (_, i) => ({ number: i + 1, state: "open" as const, bonus: false })));
```

replace

```tsx
    const open = await listFeed(tx, { sort: "newest", hostHandle: profile.handle, now: new Date() });
    return { profile, open, thumbs: await feedThumbs(tx, open.map((b) => b.id)) };
```

with

```tsx
    const now = new Date();
    const open = await listFeed(tx, { sort: "newest", hostHandle: profile.handle, now });
    return { profile, open, now, thumbs: await feedThumbs(tx, open.map((b) => b.id)) };
```

replace

```tsx
  return d ? { title: `@${d.profile.handle}`, description: profileTrustText(d.profile) } : {};
```

with

```tsx
  return d ? { title: `@${d.profile.handle}`, description: hostRecordText(d.profile) } : {};
```

replace

```tsx
  const { profile, open, thumbs } = d;
  return (
    <main className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
```

with

```tsx
  const { profile, open, thumbs, now } = d;
  const [record, stall] = hostRecordLines(profile, now);
  return (
    // A wall route (Mosaic §8): data-wall switches on Task 1's wall background (recorded ruling 12), so its text takes the wall inks.
    <main data-wall className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6" style={{ color: "var(--board-text)" }}>
```

replace

```tsx
          {profile.displayName && profile.displayName !== profile.handle && <p className="text-ink-2">{profile.displayName}</p>}
```

with

```tsx
          {profile.displayName && profile.displayName !== profile.handle && <p style={{ color: "var(--board-text-2)" }}>{profile.displayName}</p>}
```

replace

```tsx
      <div className="space-y-1">
        <p data-testid="profile-trust">{profileTrustText(profile)}</p>
        {/* From 5 breaks on the trust sentence carries the date itself (profileTrustText). */}
        {profile.breaksRun < 5 && <p className="text-small text-ink-2" data-testid="profile-since">On Breaks since {formatMonthYear(profile.since)}.</p>}
      </div>
```

with

```tsx
      <section aria-label="Record" className="flex items-center gap-4">
        <KitThumb cells={KIT_BOARD} kit={profile.kit} heat={0} size={64} />
        <div className="min-w-0 space-y-1">
          {/* Counts only (Mosaic §9): no other state words, no money, no ranking against other hosts. */}
          <p data-testid="host-record">{record}</p>
          {stall && <p className="text-small" style={{ color: "var(--board-text-2)" }} data-testid="host-stall">{stall}</p>}
          {/* Once a break has run, the record carries the date itself, so it is never said twice. */}
          {profile.breaksRun === 0 && <p className="text-small" style={{ color: "var(--board-text-3)" }} data-testid="profile-since">On Breaks since {formatMonthYear(profile.since)}.</p>}
        </div>
      </section>
```

replace

```tsx
          <p className="text-ink-2">No open breaks right now.</p>
```

with

```tsx
          <p style={{ color: "var(--board-text-2)" }}>No open breaks right now.</p>
```

and replace

```tsx
      <p className="text-small text-ink-2" data-testid="profile-past">{pastText(profile.pastCount)}</p>
```

with

```tsx
      <p className="text-small" style={{ color: "var(--board-text-3)" }} data-testid="profile-past">{pastText(profile.pastCount)}</p>
```

- [ ] **Step 9: The ledger header gains the host record**

In `src/components/ledger/ledger-sheet.tsx`, in `LedgerSheetProps` replace

```ts
  /** The viewer is the host (an admin is not): "You started the draw." */
  selfIsHost?: boolean;
};
```

with

```ts
  /** The viewer is the host (an admin is not): "You started the draw." */
  selfIsHost?: boolean;
  /** The host record, then any stall line, under the paid count (Mosaic §9): counts only. */
  record?: readonly string[];
};
```

and replace

```tsx
          <FillBar total={p.counts.total} paid={p.counts.paid} taken={p.counts.taken} />
```

with

```tsx
          <FillBar total={p.counts.total} paid={p.counts.paid} taken={p.counts.taken} />
          {p.record?.map((line, i) => (
            <p key={line} className="text-small text-ink-2" data-testid={i === 0 ? "ledger-record" : "ledger-stall"}>{line}</p>
          ))}
```

In `src/app/b/[id]/page.tsx`, add `hostRecordLines` to the import from `@/components/break/frame-copy`, and replace

```tsx
              selfIsHost={!!caller && caller.id === b.hostId}
            />
```

with

```tsx
              selfIsHost={!!caller && caller.id === b.hostId}
              record={hostRecordLines(trust, now)}
            />
```

- [ ] **Step 10: Pin the cards, the chips, the hero and the record in the page spec (updates `e2e/pages.spec.ts`)**

In the test `"the feed lists an open break and never a draft; the host filter and sorts live in the URL"`, replace

```ts
  await expect(card).toContainText("4 of 4 left");
```

with

```ts
  await expect(card).toContainText("4 to go");
  // The kit view only: a framed thumbnail with no flight on any cell.
  await expect(card.getByTestId("thumb")).toBeVisible();
  await expect(card.locator("[data-flight]")).toHaveCount(0);
```

and replace

```ts
  await visitor.getByRole("radio", { name: "Almost full" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/breaks\\?sort=almost&host=${handle}$`));
  await expect(visitor.getByRole("radio", { name: "Almost full" })).toHaveAttribute("aria-checked", "true");
```

with

```ts
  await expect(visitor.getByRole("radio", { name: "Filling fast" })).toHaveCount(0);
  await visitor.getByRole("radio", { name: "Closest to full" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/breaks\\?sort=almost&host=${handle}$`));
  await expect(visitor.getByRole("radio", { name: "Closest to full" })).toHaveAttribute("aria-checked", "true");
  // A link from before Mosaic still opens: the retired sort falls back to Newest.
  await visitor.goto(`/breaks?sort=filling&host=${handle}`);
  await expect(visitor.getByRole("radio", { name: "Newest" })).toHaveAttribute("aria-checked", "true");
```

In the test `"a host profile shows public figures, the open breaks and a past count, and nothing private"`, replace

```ts
  await expect(visitor.getByTestId("profile-trust")).toHaveText("New host. No breaks run yet.");
```

with

```ts
  await expect(visitor.getByTestId("host-record")).toHaveText("No breaks run yet.");
  await expect(visitor.getByTestId("host-stall")).toHaveCount(0);
```

In the test `"the landing page leads with the newest ran break and links to the feed"`, replace

```ts
  await visitor.getByTestId("browse-breaks").click();
  await expect(visitor).toHaveURL(/\/breaks$/);
});
```

with

```ts
  // The kit board with its bull: one won cell, ringed as the top spot, and no flight anywhere.
  await expect(hero.locator('[data-tone="won"][data-place="1"]')).toHaveCount(1);
  await expect(hero.locator("[data-flight]")).toHaveCount(0);
  await visitor.getByTestId("browse-breaks").click();
  await expect(visitor).toHaveURL(/\/breaks$/);
  // The host record counts the run and its verified draw.
  await visitor.goto(`/h/nh${run}`);
  await expect(visitor.getByTestId("host-record")).toHaveText(/^1 break run since [A-Z][a-z]{2} \d{4}\. 1 draw verified\.$/);
});
```

- [ ] **Step 11: Opus review of the host record**

Request the Opus review of `hostTrust`, `hostProfile`, `hostRecordText`, `hostRecordLines` and the profile and ledger markup before the gates. The reviewer checks: the record is counts only (no prize totals, money raised, win counts, rankings, "New host" or any other state word in the sentence); `drawsVerified` counts active draws of drawn breaks only, so it can never exceed `breaksRun`; a voided draw counts neither as run nor as verified; the stall line shows from 3 days and is never hidden by a good record; every subquery binds the host id as a parameter (no bare `id`); `HostProfile`'s keys are exactly the nine the test lists (nothing private: no email, payment name, payment handles); the thumbnails select no owner. Fix what it finds in this task; record anything that needs a ruling.

- [ ] **Step 12: Optional: check by hand**

If you have a browser tool: in `pnpm dev`, open `/breaks`, `/` and a host profile at 390 wide and at 1024; check the kit frame sits clear of the next card, the lamp reads behind the thumbnail, and the hero's bulls show their rings. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 13: Run every gate**

Run (sandbox off): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. `pnpm test:concurrency` is not needed: no command changes lines or draws. Journey 2 keys on `break-card` by title, which still holds.

- [ ] **Step 14: Commit**

```bash
git add src/components/kit-thumb-model.ts src/components/kit-thumb.tsx src/components/kit-thumb.test.ts src/components/break-card.tsx src/app/breaks src/app/page.tsx src/app/landing-copy.ts src/app/landing-copy.test.ts src/domain/breaks/queries.ts src/domain/breaks/queries.test.ts src/domain/breaks/page-view.ts src/components/break/frame-copy.ts src/components/break/frame-copy.test.ts "src/app/h/[handle]/page.tsx" src/components/ledger/ledger-sheet.tsx "src/app/b/[id]/page.tsx" e2e/pages.spec.ts
git commit -m "feat(feed): kit-framed cards, Closest to full, the kit hero and the host record"
```

---

### Task 16: `/account` flight and kit pickers, `/host/new` nudge, "This is your flight" (model: Sonnet, Opus review)

Spec §8 "`/account`" and the break-page paragraph on "This is your flight"; §4 "Default flight" and "The host kit"; §3 "Flights and kits are a fixed free set"; §13 "Hosts may share a kit". `/account` stays paper.

**"Your flight":**
- The picker is one radio grid of the 32 flights: eight columns (the dark tier's three colours, then the light tier's five) by four rows of shapes, each 44.75 px at 390, the current one ringed.
- Above it sit one 88 px preview cell and a row of seven 44 px cells (open, taken, yours, yours sent, paid, yours paid, won), all drawn in the picked flight.
- Saving calls `updateFlight` (Task 4), which sets `flight_chosen_at`.

**"Your kit"** (hosts and admins only):
- Two radio groups (dark three, light five) and a framed four-cell board preview in the picked kit.
- Saving calls `updateHostKit` (Task 4).

**The `/host/new` nudge:** it shows while the host is on the default kit (both kit columns null). No copy ties a kit to results or uses a betting word.

**"This is your flight. Change it in your account."** It sits with the flight's glyph in the claim's outcome sheet. It shows only when both hold:
- **(a)** `users.flight_chosen_at` is null, read from the server; and
- **(b)** this is the viewer's first claim in this break, meaning the viewer held no line in it when the claim was made, read from the props at claim time.

Condition (b) needs no stored flag: a second claim in the same break always finds a held line. The line shows the stored flight, never the per-break substituted shape (§5). Flights are holder data, and the line goes only to the viewer, about their own flight.

**Files:**
- Modify: `src/domain/users/queries.ts` (`Account`, `accountOf`, `viewerFlightOf`), `src/domain/users/queries.test.ts`
- Modify: `src/domain/breaks/queries.ts` (`hostKit`), `src/domain/breaks/queries.test.ts`
- Modify: `src/domain/breaks/page-view.ts` (`viewerFlight`), `src/domain/breaks/page-view.test.ts`
- Create: `src/app/account/preview-cells.ts`, `src/app/account/preview-cells.test.ts`, `src/app/account/flight-picker.tsx`, `src/app/account/kit-picker.tsx`
- Modify: `src/app/account/actions.ts`, `src/app/account/page.tsx`
- Modify: `src/app/host/new/page.tsx` (the nudge)
- Modify: `src/components/break/pay-sheet.tsx` (`flightLine`), `src/components/break/break-interactive.tsx` (`myFlight`, `flightChosen`), `src/app/b/[id]/page.tsx`
- Modify: `e2e/pages.spec.ts` (both pickers and the line)

**Interfaces:**
- Consumes:
  - From Task 4: `updateFlight` (`@/domain/users/commands`) and `updateHostKit` (`@/domain/breaks/commands`); `parseFlight`/`parseKit` (`src/app/account/parse.ts`); the columns `users.flightColour`, `users.flightShape`, `users.flightChosenAt`, `hostProfiles.kitDark` and `hostProfiles.kitLight`.
  - From Task 2: `flightOf`, `kitFor`, `DEFAULT_KIT`, `DARK_COLOURS`, `LIGHT_COLOURS`, `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `Flight`, `Kit`.
  - From Task 7: `Cell` with `flight` and `place`.
  - From Task 11: `FlightGlyph`.
  - From Task 12: `ResultCell`.
- Produces:
  - `src/domain/users/queries.ts`: `Account` gains `flight: Flight; flightChosen: boolean; kit: Kit; kitChosen: boolean`; `viewerFlightOf(tx, userId): Promise<{ flight: Flight; chosen: boolean } | null>`.
  - `src/domain/breaks/queries.ts`: `hostKit(tx, hostId): Promise<{ kit: Kit; chosen: boolean }>`.
  - `BreakView.viewerFlight: { flight: Flight; chosen: boolean } | null`.
  - `src/app/account/preview-cells.ts`: `flightGrid(): Flight[][]` (rows of shapes, columns of colours), `previewCells(f): { big; row }`, `KIT_PREVIEW`.
  - `src/app/account/actions.ts`: `type PickerState`, `saveFlight`, `saveKit`.
  - `BreakInteractiveProps.myFlight: Flight | null` and `flightChosen: boolean`; `PaySheet`'s `flightLine?: Flight | null`.
  - Test ids: `flight-picker`, `flight-<colour>-<shape>` (the radios), `flight-save`, `kit-picker`, `kit-<dark>-<light>` (the framed preview of the picked pair), `kit-save`, `kit-nudge`, `flight-line`.

- [ ] **Step 1: Write the failing query and preview tests**

In `src/domain/users/queries.test.ts`:

1. Add the imports:

```ts
import { DEFAULT_KIT, isFlightColour, isFlightShape } from "@/domain/flights";
import { updateFlight } from "./commands";
import { updateHostKit } from "@/domain/breaks/commands";
```

2. Change `import { accountOf } from "./queries";` to `import { accountOf, viewerFlightOf } from "./queries";`.

3. Append:

```ts
describe("the flight and the kit on /account", () => {
  it("reads the stored random flight, not chosen yet, and the default kit until a host picks one", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { role: "host" });
      const a = (await accountOf(tx, u.id))!;
      expect(isFlightColour(a.flight.colour) && isFlightShape(a.flight.shape)).toBe(true);
      expect(a).toMatchObject({ flightChosen: false, kit: DEFAULT_KIT, kitChosen: false });
      const caller = { id: u.id, role: "host" as const, onboarded: true, banned: false };
      await updateFlight(tx, caller, { colour: "plum", shape: "kite" });
      await updateHostKit(tx, caller, { dark: "petrol", light: "lime" });
      expect(await accountOf(tx, u.id)).toMatchObject({ flight: { colour: "plum", shape: "kite" }, flightChosen: true, kit: { dark: "petrol", light: "lime" }, kitChosen: true });
      expect(await viewerFlightOf(tx, u.id)).toEqual({ flight: { colour: "plum", shape: "kite" }, chosen: true });
      expect(await viewerFlightOf(tx, randomUUID())).toBeNull();
    });
  });
});
```

In `src/domain/breaks/queries.test.ts`:

1. Add `hostKit` to the import from `./queries`.

2. Add `import { DEFAULT_KIT } from "@/domain/flights";` and `import { updateHostKit } from "./commands";`.

3. Append:

```ts
describe("hostKit", () => {
  it("is the default kit, not chosen, for a host without a profile or a pick; then the host's pick", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      expect(await hostKit(tx, host.id)).toEqual({ kit: DEFAULT_KIT, chosen: false });
      await updateHostKit(tx, { id: host.id, role: "host", onboarded: true, banned: false }, { dark: "plum", light: "sky" });
      expect(await hostKit(tx, host.id)).toEqual({ kit: { dark: "plum", light: "sky" }, chosen: true });
    });
  });
});
```

(Use the file's existing `withTx` and `makeUser` imports; add them if it has none, from `../../../tests/helpers/db` and `../../../tests/helpers/fixtures`.)

In `src/domain/breaks/page-view.test.ts`, in the test "gives the ledger to the host only, and the viewer's unpaid count across breaks", after `expect(asBuyer).toMatchObject({ globalUnpaid: 3, ledger: [] });` add:

```ts
      expect(anon!.viewerFlight).toBeNull();
      expect(asBuyer!.viewerFlight).toMatchObject({ chosen: false });
      expect(asBuyer!.viewerFlight!.flight.colour).toMatch(/^(petrol|blue|plum|yellow|orange|lime|sky|pink)$/);
```

Create `src/app/account/preview-cells.test.ts`:

```ts
import { it, expect } from "vitest";
import { DARK_COLOURS, LIGHT_COLOURS } from "@/domain/flights";
import { flightGrid, KIT_PREVIEW, previewCells } from "./preview-cells";

const PLUM_KITE = { colour: "plum", shape: "kite" } as const;

it("lays the 32 flights out as four rows of shapes by eight columns, the dark tier's three colours first", () => {
  const grid = flightGrid();
  expect(grid).toHaveLength(4);
  for (const row of grid) {
    expect(row.map((f) => f.colour)).toEqual([...DARK_COLOURS, ...LIGHT_COLOURS]);
    expect(new Set(row.map((f) => f.shape)).size).toBe(1);
  }
  expect(new Set(grid.flat().map((f) => `${f.colour}-${f.shape}`)).size).toBe(32);
});

it("previews the picked flight in every state a member sees it in", () => {
  const { big, row } = previewCells(PLUM_KITE);
  expect(big).toMatchObject({ state: "paid", mine: false, flight: PLUM_KITE, place: null });
  expect(row.map((c) => [c.state, c.mine, c.place])).toEqual([
    ["open", false, null], ["taken", false, null], ["taken", true, null], ["sent", true, null],
    ["paid", false, null], ["paid", true, null], ["paid", false, 1],
  ]);
  expect(row[0].flight).toBeNull();
  expect(row.slice(1).every((c) => c.flight === PLUM_KITE)).toBe(true);
});

it("previews a kit in the kit view: no flight on any cell", () => {
  expect(KIT_PREVIEW.map((c) => [c.state, c.place])).toEqual([["open", null], ["taken", null], ["paid", null], ["paid", 1]]);
  expect(KIT_PREVIEW.every((c) => c.flight === null && c.holder === null)).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/users/queries.test.ts src/domain/breaks/queries.test.ts src/domain/breaks/page-view.test.ts src/app/account/preview-cells.test.ts`
Expected: FAIL. `accountOf` has no `flight` or `kit`; `viewerFlightOf`, `hostKit` and `./preview-cells` do not exist; `viewerFlight` is undefined. (Sandbox off: the query tests use `breaks_test`.)

- [ ] **Step 3: Write the queries**

In `src/domain/users/queries.ts`:

1. Change the drizzle-orm import to `import { eq, sql } from "drizzle-orm";` (unchanged if it already is), and the schema import to `import { hostProfiles, users } from "@/db/schema";`.

2. Add `import { flightOf, kitFor, type Flight, type Kit } from "@/domain/flights";`.

3. Replace `Account` and `accountOf` with:

```ts
export type Account = {
  handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date;
  /** The stored flight (never the per-break substituted shape); chosen once the member has picked one. */
  flight: Flight; flightChosen: boolean;
  /** The host kit: the default (Blue with Yellow) until the host picks one. */
  kit: Kit; kitChosen: boolean;
};

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({
    handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt,
    flightColour: users.flightColour, flightShape: users.flightShape, flightChosenAt: users.flightChosenAt,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, userId));
  if (!r) return null;
  return {
    handle: r.handle, displayName: r.displayName, paymentName: r.paymentName, createdAt: r.createdAt,
    flight: flightOf(r), flightChosen: r.flightChosenAt !== null,
    kit: kitFor({ kitDark: r.kitDark ?? null, kitLight: r.kitLight ?? null }), kitChosen: r.kitDark != null,
  };
}

/** The break page's "This is your flight" (§8): the viewer's stored flight, and whether they ever picked one. */
export async function viewerFlightOf(tx: Tx, userId: string): Promise<{ flight: Flight; chosen: boolean } | null> {
  const [r] = await tx.select({ flightColour: users.flightColour, flightShape: users.flightShape, flightChosenAt: users.flightChosenAt })
    .from(users).where(eq(users.id, userId));
  return r ? { flight: flightOf(r), chosen: r.flightChosenAt !== null } : null;
}
```

In `src/domain/breaks/queries.ts` (which imports `kitFor` and `type Kit` since Task 5), after `hostPaymentHandles`, add:

```ts
/** The host's kit for /host/new's nudge: the default (Blue with Yellow) and not chosen until the host picks one. */
export async function hostKit(tx: Tx, hostId: string): Promise<{ kit: Kit; chosen: boolean }> {
  const [r] = await tx.select({ kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight }).from(hostProfiles).where(eq(hostProfiles.userId, hostId));
  return { kit: kitFor({ kitDark: r?.kitDark ?? null, kitLight: r?.kitLight ?? null }), chosen: r?.kitDark != null };
}
```

In `src/domain/breaks/page-view.ts`:

1. Add `import { viewerFlightOf } from "@/domain/users/queries";` and `import type { Flight } from "@/domain/flights";`.

2. In `BreakView`, after `ledger: LedgerBuyer[];` add `viewerFlight: { flight: Flight; chosen: boolean } | null;`.

3. In `readBreakView`, after `const globalUnpaid = …;` add `const viewerFlight = viewer ? await viewerFlightOf(tx, viewer.id) : null;`.

4. Change the return to `return { page, trust, globalUnpaid, top, ledger, viewerFlight };`.

- [ ] **Step 4: Write the preview cells**

Create `src/app/account/preview-cells.ts`:

```ts
import { DARK_COLOURS, FLIGHT_SHAPES, LIGHT_COLOURS, type Flight, type FlightShape } from "@/domain/flights";
import type { ResultCell } from "@/app/b/[id]/result/board-cells";

/** The picker's grid (§8): one row per shape, eight columns, the dark tier's three colours then the light tier's five. */
export function flightGrid(): Flight[][] {
  const shapes = Object.keys(FLIGHT_SHAPES) as FlightShape[];
  return shapes.map((shape) => [...DARK_COLOURS, ...LIGHT_COLOURS].map((colour) => ({ colour, shape })));
}

const cell = (number: number, o: Partial<ResultCell>): ResultCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, place: null, ...o });

/** One 88 px cell (paid: the flight's colour) and the seven states a member sees their flight in. Decorative. */
export function previewCells(f: Flight): { big: ResultCell; row: ResultCell[] } {
  return {
    big: cell(7, { state: "paid", flight: f }),
    row: [
      cell(1, {}),                                          // open
      cell(2, { state: "taken", flight: f }),               // taken
      cell(3, { state: "taken", mine: true, flight: f }),   // yours
      cell(4, { state: "sent", mine: true, flight: f }),    // yours, sent
      cell(5, { state: "paid", flight: f }),                // paid
      cell(6, { state: "paid", mine: true, flight: f }),    // yours, paid
      cell(7, { state: "paid", flight: f, place: 1 }),      // won
    ],
  };
}

/** The kit preview's four-cell board, in the kit view (no flight): open, taken, paid, the top spot. */
export const KIT_PREVIEW: ResultCell[] = [cell(1, {}), cell(2, { state: "taken" }), cell(3, { state: "paid" }), cell(4, { state: "paid", place: 1 })];
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm test src/domain/users/queries.test.ts src/domain/breaks/queries.test.ts src/domain/breaks/page-view.test.ts src/app/account/preview-cells.test.ts`
Expected: PASS (sandbox off).

- [ ] **Step 6: Write the actions and the two pickers**

In `src/app/account/actions.ts`:

1. Add the imports:

```ts
import { updateFlight } from "@/domain/users/commands";
import { updateHostKit } from "@/domain/breaks/commands";
```

2. Extend the `./parse` import to `import { parseAccount, parseFlight, parseKit, type AccountInput } from "./parse";`.

3. Append:

```ts
export type PickerState = { error?: string; saved?: boolean } | null;

/** "Your flight": a change applies everywhere at once (a flight is identity, not per break). */
export async function saveFlight(_: PickerState, form: FormData): Promise<PickerState> {
  const p = parseFlight(form);
  if (!p.ok) return { error: p.error };
  const r = await action((tx, caller) => updateFlight(tx, caller, p.input));
  if (!r.ok) return { error: r.message };
  revalidatePath("/account");
  return { saved: true };
}

/** "Your kit" (hosts): the surround every one of the host's boards wears. */
export async function saveKit(_: PickerState, form: FormData): Promise<PickerState> {
  const p = parseKit(form);
  if (!p.ok) return { error: p.error };
  const r = await action((tx, caller) => updateHostKit(tx, caller, p.input));
  if (!r.ok) return { error: r.message };
  revalidatePath("/account");
  revalidatePath("/host/new");
  return { saved: true };
}
```

Create `src/app/account/flight-picker.tsx`:

```tsx
"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { Cell } from "@/components/grid/cell";
import { FlightGlyph } from "@/components/flight-glyph";
import { FLIGHT_COLOURS, FLIGHT_SHAPES, type Flight } from "@/domain/flights";
import { saveFlight, type PickerState } from "./actions";
import { flightGrid, previewCells } from "./preview-cells";

const GRID = flightGrid();

/** "Your flight" (§8): 32 flights as one radio grid, the current one ringed; the preview follows the pick. Paper. */
export function FlightPicker({ current }: { current: Flight }) {
  const [state, submit, pending] = useActionState<PickerState, FormData>(saveFlight, null);
  const [pick, setPick] = useState<Flight>(current);
  const preview = previewCells(pick);
  return (
    <form action={submit} className="space-y-4">
      <fieldset data-testid="flight-picker" className="space-y-3">
        <legend className="text-headline font-semibold">Your flight</legend>
        {/* The preview is decorative: the radios carry the choice. Paper, so the wire is --board-steel. */}
        <div aria-hidden className="space-y-2">
          <div className="w-[88px] border border-[var(--board-steel)]"><Cell cell={preview.big} /></div>
          <div className="flex border-t border-l border-[var(--board-steel)]" style={{ width: 7 * 44 + 1 }}>
            {preview.row.map((c) => <div key={c.number} className="w-11 border-r border-b border-[var(--board-steel)]"><Cell cell={c} /></div>)}
          </div>
        </div>
        <div className="grid grid-cols-8 border-t border-l border-[var(--board-steel)]">
          {GRID.flat().map((f) => {
            const checked = pick.colour === f.colour && pick.shape === f.shape;
            return (
              <label key={`${f.colour}-${f.shape}`}
                className={`relative flex aspect-square cursor-pointer items-center justify-center border-r border-b border-[var(--board-steel)] bg-[var(--board-cream)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${checked ? "shadow-[inset_0_0_0_2px_var(--board-cream),inset_0_0_0_4px_var(--board-ink),inset_0_0_0_6px_var(--board-cream)]" : ""}`}>
                <input type="radio" name="flight" value={`${f.colour}-${f.shape}`} checked={checked} onChange={() => setPick(f)}
                  data-testid={`flight-${f.colour}-${f.shape}`} className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0" />
                <FlightGlyph flight={f} size={20} />
                {/* The name lives in the content, never in an aria-label (the e2e privacy rule). */}
                <span className="sr-only">{FLIGHT_COLOURS[f.colour].label} {FLIGHT_SHAPES[f.shape].label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="flight-save">Save flight</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
```

Create `src/app/account/kit-picker.tsx`:

```tsx
"use client";
import { useActionState, useState, type CSSProperties } from "react";
import { Button } from "@/components/button";
import { Cell } from "@/components/grid/cell";
import { DARK_COLOURS, FLIGHT_COLOURS, LIGHT_COLOURS, type FlightColour, type Kit } from "@/domain/flights";
import { saveKit, type PickerState } from "./actions";
import { KIT_PREVIEW } from "./preview-cells";

/** The surround (§4): 1 px steel, the 6 px numbers ring, 4 px kit dark, a 1 px light pinstripe; spread, never a border. */
const SURROUND = "0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring), 0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light)";

/** The form fields parseKit reads (Task 4): "kitDark" and "kitLight" (recorded ruling 9). */
function ColourGroup({ legend, name, options, value, onChange }: { legend: string; name: "kitDark" | "kitLight"; options: readonly FlightColour[]; value: FlightColour; onChange: (c: FlightColour) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-small font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((c) => (
          <label key={c} className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-input border border-wire-strong bg-card px-3 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green">
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0" />
            <span aria-hidden className="block size-5 border border-[var(--board-steel)]" style={{ background: FLIGHT_COLOURS[c].face }} />
            <span className="text-small">{FLIGHT_COLOURS[c].label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Your kit" (§8, hosts): one dark and one light colour, 15 kits, all free; a framed four-cell board shows the pick. */
export function KitPicker({ current }: { current: Kit }) {
  const [state, submit, pending] = useActionState<PickerState, FormData>(saveKit, null);
  const [kit, setKit] = useState<Kit>(current);
  const vars = { "--kit-dark": FLIGHT_COLOURS[kit.dark].face, "--kit-light": FLIGHT_COLOURS[kit.light].face } as CSSProperties;
  return (
    <form action={submit} id="kit" className="space-y-4">
      <fieldset data-testid="kit-picker" className="space-y-4">
        <legend className="text-headline font-semibold">Your kit</legend>
        <p className="text-small text-ink-2">The surround on every board you host.</p>
        <div aria-hidden data-testid={`kit-${kit.dark}-${kit.light}`} className="p-3" style={vars}>
          <div className="grid w-[180px] grid-cols-4 gap-px bg-[var(--board-steel)]" style={{ boxShadow: SURROUND }}>
            {KIT_PREVIEW.map((c) => <Cell key={c.number} cell={c} />)}
          </div>
        </div>
        <ColourGroup legend="Dark colour" name="kitDark" options={DARK_COLOURS} value={kit.dark} onChange={(dark) => setKit((k) => ({ ...k, dark }))} />
        <ColourGroup legend="Light colour" name="kitLight" options={LIGHT_COLOURS} value={kit.light} onChange={(light) => setKit((k) => ({ ...k, light }))} />
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="kit-save">Save kit</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
```

Replace the whole of `src/app/account/page.tsx` with:

```tsx
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { accountOf } from "@/domain/users/queries";
import { nameLocked } from "@/domain/users/commands";
import { Button } from "@/components/button";
import { AccountForm } from "./form";
import { FlightPicker } from "./flight-picker";
import { KitPicker } from "./kit-picker";
import { signOutAction } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  // A half-set-up account goes to onboarding first (requireCaller), which can now finish it.
  const caller = await requireCaller("/account");
  const account = await db.transaction((tx) => accountOf(tx, caller.id));
  const hosts = caller.role === "host" || caller.role === "admin";
  return (
    <main className="mx-auto max-w-[400px] space-y-8 px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Your account</h1>
      <AccountForm
        handle={account?.handle ?? ""}
        displayName={account?.displayName ?? ""}
        paymentName={account?.paymentName ?? ""}
        locked={account ? nameLocked(account.createdAt, new Date()) : false}
      />
      {account && <FlightPicker current={account.flight} />}
      {account && hosts && <KitPicker current={account.kit} />}
      <form action={signOutAction}>
        <Button type="submit" variant="secondary" data-testid="sign-out">Sign out</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Nudge hosts on the default kit from `/host/new`**

In `src/app/host/new/page.tsx`:

1. Add `import Link from "next/link";`.

2. Change the queries import to `import { hostKit, hostPaymentHandles, lastBreakDefaults } from "@/domain/breaks/queries";`.

3. Replace the transaction and the return with:

```tsx
  const { handles, defaults, kit } = await db.transaction(async (tx) => ({
    handles: await hostPaymentHandles(tx, caller.id),
    defaults: await lastBreakDefaults(tx, caller.id),
    kit: await hostKit(tx, caller.id),
  }));
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">New break</h1>
      {/* A host who has not picked a kit shares the default until they do (§13); the kit is never tied to results. */}
      {!kit.chosen && (
        <p className="mt-2 text-small" data-testid="kit-nudge">
          Your boards wear the default kit, Blue with Yellow. <Link href="/account#kit" className="underline underline-offset-4">Choose a kit in your account.</Link>
        </p>
      )}
      <ComposerForm initial={newComposerInitial(defaults, handles)} maxLines={MAX_LINES} />
    </main>
  );
```

- [ ] **Step 8: "This is your flight" in the claim's outcome sheet**

In `src/components/break/pay-sheet.tsx`:

1. Add the imports:

```tsx
import type { Flight } from "@/domain/flights";
import { FlightGlyph } from "@/components/flight-glyph";
```

2. Add to `Props`:

```tsx
  /** The viewer's stored flight, on their first claim in this break while they have never picked one (§8). */
  flightLine?: Flight | null;
```

3. Directly after the `<p className="font-semibold" data-testid="pay-outcome">…</p>` line add:

```tsx
            {p.flightLine && (
              <p className="flex items-center gap-2 text-small" data-testid="flight-line">
                <FlightGlyph flight={p.flightLine} size={20} />
                <span>This is your flight. <Link href="/account" className="underline underline-offset-4">Change it in your account.</Link></span>
              </p>
            )}
```

In `src/components/break/break-interactive.tsx`:

1. Add `import type { Flight } from "@/domain/flights";`.

2. In `BreakInteractiveProps`, after `boardView: BoardView;` add:

```tsx
  /** The viewer's stored flight (not the per-break shape) and whether they ever picked one; null when signed out. */
  myFlight: Flight | null;
  flightChosen: boolean;
```

3. After `const [justSent, setJustSent] = useState(false);` add `const [flightLine, setFlightLine] = useState<Flight | null>(null);`.

4. In the `usePaySheet({ … })` options, replace `onClosed: () => { restoreFocus.current = true; },` with `onClosed: () => { restoreFocus.current = true; setFlightLine(null); },`.

5. In `finish`, in the `if (r.ok)` branch, after `setOutcome({ got: r.data.got, taken });` add:

```tsx
      // At most once per break: `p.cells` are the props of the render that sent this claim, so a held line means a later claim.
      setFlightLine(!p.flightChosen && p.myFlight && r.data.got.length > 0 && !p.cells.some((c) => c.mine) ? p.myFlight : null);
```

6. In the `<PaySheet … />` element add `flightLine={flightLine}`.

In `src/app/b/[id]/page.tsx`:

1. Change the destructuring to `const { page, trust, globalUnpaid, top, ledger, viewerFlight } = view;`.

2. After `boardView={boardView}` (Task 8) add:

```tsx
        myFlight={viewerFlight?.flight ?? null}
        flightChosen={viewerFlight?.chosen ?? true}
```

- [ ] **Step 9: Write the e2e tests (updates `e2e/pages.spec.ts`)**

In `e2e/pages.spec.ts`, change the helpers import to `import { composeBreak, gotoReady, loginAs } from "./helpers";`, and append:

```ts
test("a member picks a flight in /account; until then the first claim in a break says 'This is your flight', once per break", async ({ browser }) => {
  const host = await as(browser, `fph${run}@e2e.test`, "host");
  const first = await composeBreak(host, { title: `Flight A ${run}`, lineCount: 6 });
  const second = await composeBreak(host, { title: `Flight B ${run}`, lineCount: 6 });
  const buyer = await as(browser, `fpb${run}@e2e.test`);
  await gotoReady(buyer, first);
  await buyer.getByTestId("cell-1").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("flight-line")).toHaveText("This is your flight. Change it in your account.");
  await buyer.getByRole("button", { name: "I'll pay later" }).click();
  await buyer.getByTestId("cell-2").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("pay-outcome")).toHaveText("You have line 2.");
  await expect(buyer.getByTestId("flight-line")).toHaveCount(0); // a second claim in the same break
  await buyer.getByRole("button", { name: "I'll pay later" }).click();

  await buyer.goto("/account");
  const picker = buyer.getByTestId("flight-picker");
  await expect(picker.locator("input[type=radio]")).toHaveCount(32);
  await expect(picker.locator("input[type=radio]:checked")).toHaveCount(1); // the stored random flight, ringed
  await expect(buyer.getByTestId("kit-picker")).toHaveCount(0); // members have no kit
  await buyer.getByTestId("flight-plum-kite").check();
  await buyer.getByTestId("flight-save").click();
  await expect(buyer.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByTestId("flight-plum-kite")).toBeChecked();

  await gotoReady(buyer, second);
  await buyer.getByTestId("cell-3").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("pay-outcome")).toHaveText("You have line 3.");
  await expect(buyer.getByTestId("flight-line")).toHaveCount(0); // picked now
  await expect(buyer.getByTestId("cell-3")).toHaveAttribute("data-flight", "plum-kite"); // applies everywhere at once
  await buyer.context().close();
  await host.context().close();
});

test("a host on the default kit is nudged from /host/new and picks a kit in /account", async ({ browser }) => {
  const host = await as(browser, `kh${run}@e2e.test`, "host");
  await host.goto("/host/new");
  await expect(host.getByTestId("kit-nudge")).toContainText("Your boards wear the default kit, Blue with Yellow.");
  await host.getByTestId("kit-nudge").getByRole("link").click();
  await expect(host).toHaveURL(/\/account#kit$/);
  const picker = host.getByTestId("kit-picker");
  await expect(picker.getByTestId("kit-blue-yellow")).toBeVisible();
  await picker.getByRole("radio", { name: "Plum", exact: true }).check();
  await picker.getByRole("radio", { name: "Lime", exact: true }).check();
  await expect(picker.getByTestId("kit-plum-lime")).toBeVisible();
  await host.getByTestId("kit-save").click();
  await expect(host.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await host.reload();
  await expect(host.getByTestId("kit-picker").getByRole("radio", { name: "Plum", exact: true })).toBeChecked();
  await expect(host.getByTestId("kit-picker").getByRole("radio", { name: "Lime", exact: true })).toBeChecked();
  await host.goto("/host/new");
  await expect(host.getByTestId("kit-nudge")).toHaveCount(0);
  await host.context().close();
});
```

- [ ] **Step 10: Run every gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all green (sandbox off).

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green (sandbox off, `breaks_e2e`). The two new tests pass. The existing `/account` test still edits the names, because the profile form is unchanged and its status line stays empty until it saves. The layout spec's axe pass over `/account` covers the pickers: each radio is named by its content, and the checked state is native.

- [ ] **Step 11: Ask for the Opus review**

This task is Sonnet with an Opus review (task map). Hand the diff to an Opus reviewer with this focus:
- **(a)** No `aria-label` carries a flight name, and the line shows only the viewer's own stored flight.
- **(b)** The line's condition matches spec §8: `flight_chosen_at` is null and this is the first claim in this break, with nothing stored.
- **(c)** No copy near a kit uses a betting word ("back", "favourite", "pick your side") or ties a kit to results.
- **(d)** `/account` stays paper.
- **(e)** `saveKit` reaches `updateHostKit`, which enforces the host role.

Fix the findings once; record anything left (Plan B rule).

- [ ] **Step 12: Commit**

```bash
git add src/domain/users src/domain/breaks src/app/account src/app/host/new/page.tsx src/components/break "src/app/b/[id]/page.tsx" e2e/pages.spec.ts
git commit -m "feat(account): flight and kit pickers, the default-kit nudge, and 'This is your flight' on the first claim"
```

---

### Task 17: Copy audit pass (model: Sonnet, Opus review)

Mosaic §3 and §12 task 17, the Plan C Global Constraints copy line, and the Plan B deferred finding "Copy-audit rule catches a state word only directly after `>`; widen if a miss slips through". The audit learns to read copy rather than code: the text of string literals and of JSX between tags, with comments removed and `${…}` blanked, so identifiers such as `heatStep`, `HeatStep` and the domain's `filling` sort key never match. On that copy it bans the heat words (hot, heat, warm, fire, cold, on fire, filling fast), streaks and levels, winnings, win rates and "You won", "lucky colour", caps chips and caps words, betting words near a kit ("back", "favourite", "pick your side"), the retired counts and sorts ("19 of 50 left", "of N open", "Almost full", "You hold"), "his", and state words anywhere in JSX text. A small allowlist, each entry with its reason, keeps the two known exceptions. Then one sweep fixes what the rules find; anything that needs a design decision is recorded, not argued (recorded ruling 8).

**Files:**
- Modify: `src/lib/copy-audit.test.ts`
- Modify: whatever the sweep in Step 3 names (UI copy only)
- Modify or create: `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (the sweep's record)

**Interfaces:**
- Consumes: the copy written by Tasks 10, 13, 15 and 16; `toGoText` (Task 10) and `statusWord` for the sweep's replacements.
- Produces (test-local): `type Seg = { path; kind: "literal" | "jsx"; text }`, `segments`, `uiSegments`, `shown`, `ALLOW`, `copyHits(re, list?)`, which reports `path: snippet` so a failure says what to fix.

- [ ] **Step 1: Write the new rules**

In `src/lib/copy-audit.test.ts`, replace

```ts
const hits = (re: RegExp, list = sources) => list.filter((s) => re.test(s.text)).map((s) => s.path);
```

with

```ts
const hits = (re: RegExp, list = sources) => list.filter((s) => re.test(s.text)).map((s) => s.path);

// Copy, not code (Mosaic §3): the text of string literals and of JSX between tags. Comments go first (a URL's "//" is
// kept), so prose in a comment never matches, and `${…}` inside a template literal is blanked, so only its words are
// read. Identifiers (`heatStep`, the domain's `filling` sort key) are never copy. JSX text is read in .tsx files only.
type Seg = { path: string; kind: "literal" | "jsx"; text: string };
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const SEG = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)</g;
const segmentsOf = (s: { path: string; text: string }): Seg[] =>
  [...stripComments(s.text).matchAll(SEG)]
    .filter((m) => m[4] === undefined || s.path.endsWith(".tsx"))
    .map((m) => ({
      path: s.path,
      kind: m[4] !== undefined ? "jsx" : "literal",
      text: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/\$\{[^}]*\}/g, " "),
    }));
const segments = sources.flatMap(segmentsOf);
const uiSegments = segments.filter((g) => /^src\/(components|app)\//.test(g.path));
// What a viewer reads: .tsx copy, plus the modules that build sentences for it.
const COPY_MODULE = /(-copy|share-text|claim-bar-state)\.ts$/;
const shown = segments.filter((g) => g.path.endsWith(".tsx") || COPY_MODULE.test(g.path));

/**
 * Copy the rules allow on purpose, each with its reason. A new entry needs one too: a rule that keeps catching real
 * copy is worth more than an allowlist that grows.
 */
const ALLOW: { path: RegExp; text: RegExp; why: string }[] = [
  { path: /^src\/lib\/share-text\.ts$/, text: /CLOSED n RAN/, why: "the community idiom quoted in share text, the one caps exception (Plan B Global Constraints)" },
  { path: /^src\/components\/handle-field\.tsx$/, text: /^NFKC$/, why: "a Unicode normalisation form passed to String.normalize, not copy" },
];
const allowed = (g: Seg) => ALLOW.some((a) => a.path.test(g.path) && a.text.test(g.text));
const copyHits = (re: RegExp, list: Seg[] = segments) =>
  [...new Set(list.filter((g) => re.test(g.text) && !allowed(g)).map((g) => `${g.path}: ${g.text.trim().slice(0, 60)}`))];
```

Append at the end of the file:

```ts
describe("copy audit, Mosaic (spec §3, Plan C Global Constraints)", () => {
  it("never names heat: hot, heat, warm, fire, cold, on fire, filling fast", () => {
    expect(copyHits(/\b(hot|heat|warm|fire|cold|filling fast)\b/i)).toEqual([]);
  });
  it("has no streaks or levels", () => expect(copyHits(/\b(streaks?|levels?)\b/i)).toEqual([]));
  it("never says winnings, win rate or You won", () => expect(copyHits(/\b(winnings|win rates?|you won)\b/i)).toEqual([]));
  it("never calls a flight a lucky colour (the flight copy is 'This is your flight')", () => {
    expect(copyHits(/\blucky\s+colou?rs?\b/i)).toEqual([]);
  });
  it("has no caps chips or caps words in shown copy", () => {
    const words = shown.filter((g) => !/^#[0-9A-Fa-f]{3,8}$/.test(g.text.trim()));
    expect(copyHits(/\b[A-Z]{2,}\b/, words)).toEqual([]);
  });
  it("puts no betting word near a kit: back, favourite, pick your side", () => {
    const BET = /\b(back|backing|favou?rites?|pick your side)\b/i;
    const bad: string[] = [];
    const byFile = new Map<string, Seg[]>();
    for (const g of uiSegments) byFile.set(g.path, [...(byFile.get(g.path) ?? []), g]);
    for (const list of byFile.values()) {
      list.forEach((g, i) => {
        if (!/\bkits?\b/i.test(g.text)) return;
        for (const near of list.slice(Math.max(0, i - 2), i + 3)) {
          if (BET.test(near.text) && !allowed(near)) bad.push(`${near.path}: ${near.text.trim().slice(0, 60)}`);
        }
      });
    }
    expect([...new Set(bad)]).toEqual([]);
  });
  it("says N to go, never the retired counts and sorts", () => {
    expect(copyHits(/\bof\s+(\d+\s+)?(left|open)\b|\balmost full\b|\byou hold\b/i, uiSegments)).toEqual([]);
  });
  it("says the host's, never his", () => expect(copyHits(/\bhis\b/i)).toEqual([]));
  it("keeps state words out of JSX text, anywhere between the tags (widened from 'directly after >')", () => {
    expect(copyHits(/\b(filled|drawing|drawn)\b/i, uiSegments.filter((g) => g.kind === "jsx"))).toEqual([]);
  });
  it("keeps Filled, Drawing and Drawn out of UI string literals, wherever they sit in the string", () => {
    expect(copyHits(/\b(Filled|Drawing|Drawn)\b/, uiSegments.filter((g) => g.kind === "literal"))).toEqual([]);
  });
  it("reads copy, not code: the audit itself sees literals and JSX text", () => {
    // A guard against a parser that silently returns nothing: these strings exist in the app today.
    expect(segments.some((g) => g.text === "Browse breaks")).toBe(true);
    expect(segments.some((g) => g.kind === "jsx" && /Hosting on Facebook now\?/.test(g.text))).toBe(true);
    expect(segments.some((g) => /heatStep/.test(g.text))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the audit**

Run: `pnpm test src/lib/copy-audit.test.ts`
Expected: the existing rules and the guard test pass; each new rule passes or fails with a list of `path: snippet` entries, which is Step 3's sweep list. Likely entries at the time of writing: `src/app/dev/components/page.tsx` (`Lines, 7 of 50 open` and `Lines, 2 of 6 open`, unless Task 8 relabelled them), and `leftText` in `src/components/break/frame-copy.ts` if Task 10 kept it. If the guard test fails, the parser is wrong: fix `SEG` or `stripComments` before sweeping.

- [ ] **Step 3: Sweep what the rules found (one round)**

Fix each entry in the UI copy it names, with the replacement the rules and the spec give:

| Rule | Replace with |
|---|---|
| Retired count ("19 of 50 left", `${open} of ${total} left`, "of N open") | `toGoText(open)` ("12 to go"); a grid group label is "Lines, 12 to go" (Mosaic §5). An unused `leftText` is deleted with its test line. |
| "Almost full", "Filling fast" | "Closest to full" (a sort); otherwise delete the phrase. |
| "You hold …" | "You have …" (`youHaveText`). |
| "his" | "the host's", or the host's name. |
| Heat words | Say what happened in line terms ("12 to go", "Board's full. Game on." from the caller copy); never a temperature. |
| Streak, level, winnings, win rate, "You won" | The state word ("Won …", "Paid.", Mosaic §9), or delete. |
| Caps word or chip | Sentence case. If it is a code value that is not copy, move it out of the copy module, or add an `ALLOW` entry with its reason. |
| Betting word near a kit | "Your kit" or the colour names; never "back", "favourite" or "pick your side". |
| State word in JSX text or a UI literal | `statusWord(status)` (Open, Closed, Running draw, Ran, Cancelled). |

Re-run `pnpm test src/lib/copy-audit.test.ts` once. If an entry would need a design decision (a word the spec does not cover, or a rule that would have to bend for real copy), leave it failing in this round only long enough to record it: add it to `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` under `## Fix-loop records (one round, then record)` → `### Copy audit (Task 17)` as `- path: snippet: the rule, and the decision it needs`, then make the rule pass by an `ALLOW` entry whose `why` names that record. If the file does not exist yet, create it starting with:

```markdown
# Plan C (Mosaic): deferred findings and pre-deploy notes

## Fix-loop records (one round, then record)

### Copy audit (Task 17)
```

- [ ] **Step 4: Run the audit to see it pass**

Run: `pnpm test src/lib/copy-audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Opus review**

Request the Opus review of the new rules, the allowlist and the sweep. The reviewer checks the rules for holes (copy in `aria-label` and `alt` strings is a literal, so it is read; copy built by concatenation with `+` is read piece by piece; a JSX expression `{"…"}` is a literal); that no rule reads identifiers or comments; that every `ALLOW` entry is narrow (a path and a text pattern) and carries its reason; and that the sweep changed copy only, never a test id, a status value or a URL. Fix what it finds in this task.

- [ ] **Step 6: Run every gate**

Run (sandbox off): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. If the sweep changed copy an e2e spec keys on (`e2e/journey-1.spec.ts`, `journey-2.spec.ts`, `layout.spec.ts`, `pages.spec.ts`), update that spec in this commit and say so in the report.

- [ ] **Step 7: Commit**

```bash
git add src/lib/copy-audit.test.ts src docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md e2e
git commit -m "test(copy): audit the Mosaic bans on copy, not code, and sweep what they find"
```

---

### Task 18: `/me` member view and history (model: Sonnet)

Mosaic §8 (`/me`) and §9 (the plain history), and two Plan B deferred findings: `MyBreakCard` render tests, and the drawn break that reads "Unpaid." with no amount and no action. `/me` stays paper. Each card shows your own lines only, drawn as on the board in your stored flight (the yours ring, the glyph and the flood on paid lines come from Cell, Task 7), with the board's steel wire; there is no other holder's data, no kit, no heat and no Show mine. A card whose break no longer asks for money but still lists unsent lines says who to ask, and "Earlier" becomes the plain history: one row per break with its state word and pill, no cells, no actions, no totals (recorded ruling 29). The card draws your lines with the board `Cell` (Task 7) on the steel wire: `MiniCells` keeps the paper cell for the ledger and the pay sheet (recorded ruling 24).

**Files:**
- Create: `src/components/me/my-history-row.tsx`, `src/components/me/my-break-card.test.ts`
- Create: `e2e/db.ts`
- Modify: `src/components/me/me-copy.ts` (`unpaidNote`, `MyBreakCardProps.unpaidNote`), `src/components/me/me-copy.test.ts`
- Modify: `src/app/me/card-props.ts` (whole file), `src/app/me/card-props.test.ts` (whole file), `src/app/me/page.tsx`
- Modify: `src/components/me/my-break-card.tsx`
- Modify: `src/domain/users/queries.ts` (`myFlight`), `src/domain/users/queries.test.ts`
- Modify: `e2e/pages.spec.ts` (the My lines test)
- Modify or create: `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (the render-test record)

**Interfaces:**
- Consumes: `flightOf`, `Flight` (`src/domain/flights.ts`, Task 2); `users.flightColour`, `users.flightShape` (Task 4); `CellData` gaining `flight: Flight | null` and `place: 1 | 2 | 3 | null`, and Cell (`px`) drawing a flight and setting `data-flight="<colour>-<shape>"` on every cell that carries one, display-only cells included (Task 7); the `flightOf` import in `src/domain/users/queries.ts` (Task 16); `myLines`, `MyBreak` (Plan B); `StatusPill`, `AppRouterContext`; `joinAnd`.
- Produces:
  - `src/domain/users/queries.ts`: `myFlight(tx, userId: string): Promise<Flight>`.
  - `src/components/me/me-copy.ts`: `unpaidNote(numbers: readonly number[], hostName: string): string`; `MyBreakCardProps.unpaidNote: string | null`.
  - `src/app/me/card-props.ts`: `toCardProps(g: MyBreak, now: Date, zone: Zone, flight: Flight): MyBreakCardProps`.
  - `MyHistoryRow({ breakId, title, status, stateLine })` (server-safe, `li[data-testid=me-history-row]`).
  - `e2e/db.ts`: `withDb`, `setFlight(handle: string, f: Flight): Promise<void>`.
  - Test ids: `my-unpaid`, `me-history-row`.

- [ ] **Step 1: Write the failing tests**

In `src/components/me/me-copy.test.ts`, replace `import { howToPayLabel, stateLine } from "./me-copy";` with `import { howToPayLabel, stateLine, unpaidNote } from "./me-copy";` and append at the end of the file:

```ts
describe("unpaidNote", () => {
  it("says which lines are not marked paid and who to ask", () => {
    expect(unpaidNote([5], "Jim")).toBe("Line 5 is not marked paid. Ask Jim about it.");
    expect(unpaidNote([5, 6], "Jim")).toBe("Lines 5 and 6 are not marked paid. Ask Jim about them.");
    expect(unpaidNote([4, 5, 6], "@jim")).toBe("Lines 4, 5 and 6 are not marked paid. Ask @jim about them.");
  });
});
```

Replace the whole of `src/app/me/card-props.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import type { MyBreak } from "@/domain/lines/queries";
import type { Flight } from "@/domain/flights";
import { toCardProps } from "./card-props";

const now = new Date("2026-10-14T16:00:00Z");
const g: MyBreak = {
  breakId: "b1", title: "Chronos", status: "open", openedAt: now, lineCount: 10, linePriceCents: 500, seedCommitment: "ab".repeat(32),
  paymentWindowHours: 24, paymentInstructions: "Leave the note blank.",
  host: { id: "h1", handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
  lines: [{ number: 3, state: "sent", bonus: false }, { number: 5, state: "taken", bonus: false }, { number: 11, state: "paid", bonus: true }],
  unsent: [5], sent: [3], paid: [11], owedCents: 500, payBy: new Date("2026-10-15T01:40:00Z"), late: false,
  awards: [], ranAt: null, earlier: false,
};
const zone = { tz: "America/New_York", labelled: false };
const flight: Flight = { colour: "yellow", shape: "kite" };

describe("toCardProps", () => {
  it("turns a group into what the card shows: your lines in your flight, the deadline in your zone", () => {
    expect(toCardProps(g, now, zone, flight)).toEqual({
      breakId: "b1", title: "Chronos", status: "open", hostName: "Jim", payee: "@Jim-R", handles: { venmo: "@Jim-R" },
      instructions: "Leave the note blank.", commitment: "abababababab",
      cells: [
        { number: 3, state: "sent", mine: true, overdue: false, bonus: false, flight, place: null },
        { number: 5, state: "taken", mine: true, overdue: false, bonus: false, flight, place: null },
        { number: 11, state: "paid", mine: true, overdue: false, bonus: true, flight, place: null },
      ],
      stateLine: "Unpaid.",
      unpaidNote: null,
      owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false, bonusLost: [] },
    });
  });
  it("draws only your own lines, in your flight, and carries nobody else's data (Mosaic §8)", () => {
    const { cells } = toCardProps(g, now, zone, flight);
    expect(cells.every((c) => c.mine && c.flight === flight && c.place === null)).toBe(true);
    expect(Object.keys(cells[0]).sort()).toEqual(["bonus", "flight", "mine", "number", "overdue", "place", "state"]);
  });
  it("owes nothing once every unsent line is gone", () => {
    expect(toCardProps({ ...g, unsent: [], owedCents: 0, payBy: null }, now, zone, flight).owe).toBeNull();
  });
  it("still owes on a closed break, and passes lateness through", () => {
    expect(toCardProps({ ...g, status: "filled", late: true }, now, zone, flight).owe?.late).toBe(true);
  });
  it("owes nothing on a cancelled or drawn break; a drawn break with unsent lines says who to ask", () => {
    const cancelled = toCardProps({ ...g, status: "cancelled" }, now, zone, flight);
    expect(cancelled.owe).toBeNull();
    expect(cancelled.stateLine).toBe("Cancelled.");
    expect(cancelled.unpaidNote).toBeNull();
    const ran = toCardProps({ ...g, status: "drawn" }, now, zone, flight);
    expect(ran.owe).toBeNull();
    expect(ran.stateLine).toBe("Unpaid.");
    expect(ran.unpaidNote).toBe("Line 5 is not marked paid. Ask Jim about it.");
    expect(toCardProps({ ...g, status: "drawing" }, now, zone, flight).unpaidNote).toBe("Line 5 is not marked paid. Ask Jim about it.");
    expect(toCardProps({ ...g, status: "drawn", unsent: [] }, now, zone, flight).unpaidNote).toBeNull();
  });
  it("says which bonus lines a give-back would take", () => {
    const onlyUnsent = { ...g, lines: [{ number: 5, state: "taken" as const, bonus: false }, { number: 11, state: "paid" as const, bonus: true }], sent: [], paid: [11] };
    expect(toCardProps(onlyUnsent, now, zone, flight).owe?.bonusLost).toEqual([11]);
  });
});
```

Create `src/components/me/my-break-card.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Flight } from "@/domain/flights";
import type { MyBreakCardProps } from "./me-copy";
import { MyBreakCard } from "./my-break-card";
import { MyHistoryRow } from "./my-history-row";

const noop = () => {};
const router = { refresh: noop, push: noop, replace: noop, back: noop, forward: noop, prefetch: noop };
const flight: Flight = { colour: "yellow", shape: "kite" };
const owing: MyBreakCardProps = {
  breakId: "b1", title: "Chronos", status: "open", hostName: "Jim", payee: "@Jim-R", handles: { venmo: "@Jim-R" },
  instructions: "Leave the note blank.", commitment: "abababababab",
  cells: [
    { number: 3, state: "sent", mine: true, overdue: false, bonus: false, flight, place: null },
    { number: 5, state: "taken", mine: true, overdue: false, bonus: false, flight, place: null },
  ],
  stateLine: "Unpaid.", unpaidNote: null,
  owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false, bonusLost: [] },
};
const html = (p: MyBreakCardProps) =>
  renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(MyBreakCard, p)));

describe("MyBreakCard (Plan B deferred render tests)", () => {
  it("on an open break it says what is owed and offers How to pay and Give back", () => {
    const h = html(owing);
    expect(h).toContain('data-testid="how-to-pay"');
    expect(h).toContain("How to pay Jim");
    expect(h).toContain('data-testid="give-back"');
    expect(h).toContain("You owe $5.");
    expect(h).toContain('data-testid="my-state">Unpaid.<');
    expect(h).not.toContain('data-testid="my-unpaid"');
    // The pay sheet mounts only while open, so its test ids are not on the page yet.
    expect(h).not.toContain('data-testid="pay-sheet"');
  });
  it("draws your lines in your flight, on the steel wire, with no kit, no lamp and no board frame", () => {
    const h = html(owing);
    expect(h).toContain('aria-label="Line 3, yours, sent"');
    expect(h).toContain('aria-label="Line 5, yours, taken"');
    expect(h.match(/data-flight="yellow-kite"/g)).toHaveLength(2);
    expect(h).toContain("--wire-strong:var(--board-steel)");
    expect(h).not.toContain("--kit-dark");
    expect(h).not.toContain('data-testid="lamp"');
    expect(h).not.toContain('data-testid="board-frame"');
  });
  it("on a ran break with unsent lines it says Unpaid. and who to ask, and offers nothing to do", () => {
    const h = html({ ...owing, status: "drawn", owe: null, unpaidNote: "Line 5 is not marked paid. Ask Jim about it." });
    expect(h).toContain('data-testid="my-state">Unpaid.<');
    expect(h).toContain('data-testid="my-unpaid">Line 5 is not marked paid. Ask Jim about it.<');
    expect(h).not.toContain('data-testid="how-to-pay"');
    expect(h).not.toContain('data-testid="give-back"');
    expect(h).not.toContain('data-testid="my-owed"');
  });
  it("a paid card shows its state and no actions", () => {
    const h = html({ ...owing, stateLine: "Paid.", owe: null });
    expect(h).toContain('data-testid="my-state">Paid.<');
    expect(h).not.toContain('data-testid="how-to-pay"');
    expect(h).not.toContain('data-testid="give-back"');
  });
});

describe("MyHistoryRow (Mosaic §9)", () => {
  it("is plain: the title, the state word and the pill, with no cells, money or counts", () => {
    const h = renderToStaticMarkup(createElement(MyHistoryRow, { breakId: "b1", title: "Chronos", status: "drawn", stateLine: "Won Chronos 22g." }));
    expect(h).toContain('href="/b/b1"');
    expect(h).toContain("Won Chronos 22g.");
    expect(h).toContain(">Ran<");
    expect(h).not.toContain('role="img"');
    expect(h).not.toContain("$");
  });
});
```

In `src/domain/users/queries.test.ts`, add `myFlight` to the import from `./queries` and append at the end of the file:

```ts
describe("myFlight", () => {
  it("reads the member's stored flight", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set flight_colour = 'sky', flight_shape = 'slim' where id = ${u.id}`);
      expect(await myFlight(tx, u.id)).toEqual({ colour: "sky", shape: "slim" });
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/me src/app/me src/domain/users/queries.test.ts`
Expected: FAIL: `unpaidNote`, `myFlight` and `./my-history-row` do not exist; `toCardProps` has no flight argument, its cells carry no `flight` or `place`, and its props have no `unpaidNote`; the card has no steel-wire wrapper and no `my-unpaid` note.

- [ ] **Step 3: Write the copy, the props and the query**

In `src/components/me/me-copy.ts`, replace

```ts
import { ordinal } from "@/lib/list";
```

with

```ts
import { joinAnd, ordinal } from "@/lib/list";
```

after the `howToPayLabel` line add

```ts

/**
 * A card whose break no longer asks for money (running draw, ran) but still lists unsent lines (Plan B deferred
 * finding): "Unpaid." alone leaves the buyer with no amount and nothing to do, so the card says who to ask.
 */
export function unpaidNote(numbers: readonly number[], hostName: string): string {
  return numbers.length === 1
    ? `Line ${numbers[0]} is not marked paid. Ask ${hostName} about it.`
    : `Lines ${joinAnd(numbers)} are not marked paid. Ask ${hostName} about them.`;
}
```

and replace

```ts
  cells: CellData[]; stateLine: string; owe: Owe | null;
};
```

with

```ts
  cells: CellData[]; stateLine: string; owe: Owe | null;
  /** Set on a break that no longer asks for money but still lists unsent lines; null otherwise. */
  unpaidNote: string | null;
};
```

Replace the whole of `src/app/me/card-props.ts` with:

```ts
import type { MyBreak } from "@/domain/lines/queries";
import type { Flight } from "@/domain/flights";
import { formatDeadline, type Zone } from "@/lib/time";
import { hostLabel } from "@/components/break/frame-copy";
import { bonusGoesWith, commitmentShort, payeeFor } from "@/components/break/pay-copy";
import { stateLine, unpaidNote, type MyBreakCardProps } from "@/components/me/me-copy";

/**
 * One /me group → the card's props. Your own lines only, each in your stored flight (Mosaic §8): no other holder's
 * data, no place (the state line carries a win), no kit, no heat. The deadline goes down as ISO plus a fallback in
 * the viewer's zone (LocalTime).
 */
export function toCardProps(g: MyBreak, now: Date, zone: Zone, flight: Flight): MyBreakCardProps {
  const hostName = hostLabel(g.host);
  // Only an open or closed (filled) break asks for money: a cancelled, running or ran one owes nothing here.
  const asksForMoney = g.status === "open" || g.status === "filled";
  return {
    breakId: g.breakId, title: g.title, status: g.status, hostName, payee: payeeFor(g.host.paymentHandles, hostName),
    handles: g.host.paymentHandles, instructions: g.paymentInstructions, commitment: commitmentShort(g.seedCommitment),
    cells: g.lines.map((l) => ({ number: l.number, state: l.state, mine: true, overdue: false, bonus: l.bonus, flight, place: null })),
    stateLine: stateLine(g, hostName),
    unpaidNote: !asksForMoney && g.status !== "cancelled" && g.unsent.length > 0 ? unpaidNote(g.unsent, hostName) : null,
    owe: asksForMoney && g.unsent.length > 0
      ? {
          numbers: g.unsent, cents: g.owedCents,
          payByIso: g.payBy ? g.payBy.toISOString() : null,
          payByFallback: g.payBy ? formatDeadline(g.payBy, now, zone.tz, zone.labelled) : null,
          late: g.late,
          bonusLost: bonusGoesWith(g.lines, g.unsent),
        }
      : null,
  };
}
```

In `src/domain/users/queries.ts` (which imports `flightOf` and `type Flight` from `@/domain/flights` since Task 16), append at the end of the file:

```ts
/** The member's stored flight (Mosaic §4: drawn at random when the row was created, never derived from the id). */
export async function myFlight(tx: Tx, userId: string): Promise<Flight> {
  const [r] = await tx.select({ flightColour: users.flightColour, flightShape: users.flightShape }).from(users).where(eq(users.id, userId));
  if (!r) throw new Error(`no user ${userId}`);
  return flightOf(r);
}
```

- [ ] **Step 4: Write the history row, and draw the card's lines on the steel wire**

Create `src/components/me/my-history-row.tsx`:

```tsx
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";

/**
 * One break in the plain history on /me (Mosaic §9): the title, its state word and the pill. No cells, no totals of
 * lines bought, money spent or wins, no win rate: a win shows once, on that break's result and as the state word.
 */
export function MyHistoryRow({ breakId, title, status, stateLine }: { breakId: string; title: string; status: string; stateLine: string }) {
  return (
    <li data-testid="me-history-row" className="flex min-h-11 items-center justify-between gap-3 py-1">
      <Link href={`/b/${breakId}`} className="inline-flex min-h-11 min-w-0 items-center underline-offset-4 hover:underline">{title}</Link>
      <span className="flex shrink-0 items-center gap-2 text-small">
        <span data-testid="my-state">{stateLine}</span>
        <StatusPill status={status} />
      </span>
    </li>
  );
}
```

In `src/components/me/my-break-card.tsx`, replace

```tsx
import { useContext, useEffect, useRef, useState, useTransition } from "react";
```

with

```tsx
import { useContext, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
```

replace `import { MiniCells } from "@/components/mini-cells";` with `import { Cell } from "@/components/grid/cell";`, below the imports add

```tsx
/** Your lines on paper are drawn as on the board, so their wire is the board's steel (Mosaic §8); the ledger keeps wire-strong. */
const STEEL_WIRE = { "--wire-strong": "var(--board-steel)" } as CSSProperties;
/** One of your lines: the board cell (Task 7) at 42 px inside its 1 px steel edge, so the row keeps 44 px steps. */
const MY_CELL_PX = 42;
```

and replace

```tsx
      <MiniCells label="Your lines" cells={p.cells} />
      <p className="text-small" data-testid="my-state">{p.stateLine}</p>
```

with

```tsx
      {/* The board cell, not the paper MiniCells: your lines in your flight with the yours ring (Mosaic §8, recorded ruling 24). */}
      <ul aria-label="Your lines" style={STEEL_WIRE} className="flex flex-wrap gap-1">
        {p.cells.map((c) => (
          <li key={c.number} className="w-11 border border-wire-strong"><Cell cell={c} px={MY_CELL_PX} /></li>
        ))}
      </ul>
      <p className="text-small" data-testid="my-state">{p.stateLine}</p>
      {p.unpaidNote && <p className="text-small" data-testid="my-unpaid">{p.unpaidNote}</p>}
```

- [ ] **Step 5: Read the flight on the page, and list Earlier as the plain history**

In `src/app/me/page.tsx`, replace

```tsx
import { myLines } from "@/domain/lines/queries";
```

with

```tsx
import { myLines } from "@/domain/lines/queries";
import { myFlight } from "@/domain/users/queries";
```

replace

```tsx
import { MeNotes } from "@/components/me/me-notes";
```

with

```tsx
import { MeNotes } from "@/components/me/me-notes";
import { MyHistoryRow } from "@/components/me/my-history-row";
```

replace

```tsx
  const groups = await db.transaction((tx) => myLines(tx, caller.id, now));
  const current = groups.filter((g) => !g.earlier).map((g) => toCardProps(g, now, zone));
  const earlier = groups.filter((g) => g.earlier).map((g) => toCardProps(g, now, zone));
```

with

```tsx
  const { groups, flight } = await db.transaction(async (tx) => ({ groups: await myLines(tx, caller.id, now), flight: await myFlight(tx, caller.id) }));
  const current = groups.filter((g) => !g.earlier).map((g) => toCardProps(g, now, zone, flight));
  const earlier = groups.filter((g) => g.earlier).map((g) => toCardProps(g, now, zone, flight));
```

and replace

```tsx
          <ul className="space-y-3 px-4 pb-4">{earlier.map((c) => <MyBreakCard key={c.breakId} {...c} />)}</ul>
```

with

```tsx
          <ul className="divide-y divide-wire px-4 pb-2">
            {earlier.map((c) => <MyHistoryRow key={c.breakId} breakId={c.breakId} title={c.title} status={c.status} stateLine={c.stateLine} />)}
          </ul>
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/components/me src/app/me src/domain/users/queries.test.ts`
Expected: PASS.

- [ ] **Step 7: Pin your flight on `/me` in the page spec (creates `e2e/db.ts`, updates `e2e/pages.spec.ts`)**

Create `e2e/db.ts`:

```ts
import postgres from "postgres";
import type { Flight } from "../src/domain/flights";
import { E2E_DATABASE_URL } from "./e2e-db";

/** One short connection per call to the e2e database, for state the UI cannot set quickly. Closed every time. */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, prepare: false });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Gives a signed-in user (by handle) a known flight. `flight_chosen_at` stays null: it was not picked on /account. */
export async function setFlight(handle: string, f: Flight): Promise<void> {
  await withDb(async (sql) => { await sql`update users set flight_colour = ${f.colour}, flight_shape = ${f.shape} where handle = ${handle}`; });
}
```

In `e2e/pages.spec.ts`, replace

```ts
import { composeBreak, loginAs } from "./helpers";
```

with

```ts
import { composeBreak, loginAs } from "./helpers";
import { setFlight } from "./db";
```

In the test `"My lines shows what a buyer holds, reopens the pay block, and gives lines back"`, replace

```ts
  const buyer = await as(browser, `mb${run}@e2e.test`);
  await expect(buyer.getByRole("link", { name: "My lines" })).toBeVisible(); // members get the tab bar now
```

with

```ts
  const buyer = await as(browser, `mb${run}@e2e.test`);
  await setFlight(`mb${run}`, { colour: "yellow", shape: "kite" });
  await expect(buyer.getByRole("link", { name: "My lines" })).toBeVisible(); // members get the tab bar now
```

and replace

```ts
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await expect(card.getByTestId("my-owed")).toContainText("You owe $10.");
```

with

```ts
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await expect(card.getByTestId("my-owed")).toContainText("You owe $10.");
  // Your own lines, in your flight, and nothing of the board's kit or heat (Mosaic §8).
  const mine = card.getByRole("list", { name: "Your lines" }).locator("[data-flight]");
  await expect(mine).toHaveCount(2);
  expect(await mine.evaluateAll((els) => els.map((e) => e.getAttribute("data-flight")))).toEqual(["yellow-kite", "yellow-kite"]);
  expect(await card.innerHTML()).not.toContain("--kit-dark");
  await expect(card.getByTestId("lamp")).toHaveCount(0);
```

(The plain history needs a break that ran more than 7 days ago; draws are immutable, so their time cannot be moved back in an e2e run. The render test in Step 1 pins the row instead.)

- [ ] **Step 8: Record what the render tests cannot reach**

In `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (create it as in Task 17 Step 3 if it does not exist), under `## Fix-loop records (one round, then record)`, add:

```markdown
### Render tests (Task 18)
- `MyBreakCard`'s error, offline and disabled states (Plan B test backlog) need a click and a failed server action;
  `react-dom/server` renders only the first state. They need an interaction test (jsdom and Testing Library, or a
  Playwright component test), which this plan does not add. Covered today: owing, paid, ran with unsent lines, the
  flight and the steel wire, the history row; the e2e covers the sent failure on `/me` (`layout.spec.ts`).
```

- [ ] **Step 9: Optional: check by hand**

If you have a browser tool: in `pnpm dev`, hold lines in two breaks with flights from both tiers, open `/me` at 390 wide, and check the light flight keeps its ink keyline on paper and the wire reads as steel. Stop the server afterwards (port rule). Report the check as not performed if you cannot do it.

- [ ] **Step 10: Run every gate**

Run (sandbox off): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green. `layout.spec.ts`'s `/me` test keys on `my-break`, `how-to-pay` and `me-note`, which are unchanged; journey 2 keys on `my-break` and `my-state` in the current group, also unchanged.

- [ ] **Step 11: Commit**

```bash
git add src/components/me src/app/me src/domain/users/queries.ts src/domain/users/queries.test.ts e2e/db.ts e2e/pages.spec.ts docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md
git commit -m "feat(me): your lines in your flight, a plain history, and the unpaid note"
```

---

### Task 19: Docs: constraint amendments, "superseded" notes, README (model: Sonnet)

Mosaic §1.1 "Binding text elsewhere that this design amends" and §12 task 19. Seven Plan B Global Constraints lines and the platform spec's §9 stall copy are rewritten in place (eight amendments: holders, the feed-thumbnail and link-preview line, green and red, motion, selected, fonts, host-profile data, the stall line); the first design gets a "Superseded in part by Mosaic" note at the top of §3, §4, §5, §6 and §7; the README learns the fonts, the board tokens, the flight and kit columns, `draws.verified_at` and `scripts/verify-draws.ts`; and this plan's deferred-findings file gets its skeleton. Docs only: no code changes.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-14-plan-b-new-pages.md` (Global Constraints, seven lines)
- Modify: `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md` (§9 Stalls)
- Modify: `docs/superpowers/specs/2026-10-13-ui-design.md` (§3, §4, §5, §6, §7 notes)
- Modify: `README.md`
- Modify or create: `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md`

**Interfaces:**
- Consumes: the Plan C Global Constraints (the amended wording), Mosaic §1.1, §4, §9, §10; `scripts/verify-draws.ts` (Task 4), run with `DATABASE_URL` set to the database it backfills; migration `0004_flights_kits` (Task 4).
- Produces: no code. Every amended line ends "(Amended by Plan C, Mosaic spec §1.1.)" (recorded ruling 30).

- [ ] **Step 1: Amend Plan B's Global Constraints**

In `docs/superpowers/plans/2026-10-14-plan-b-new-pages.md`, make these seven replacements.

Motion. Replace

```markdown
- No animation library. Motion is CSS only (120 ms cell fill, the result deal), and honours `prefers-reduced-motion`.
```

with

```markdown
- No animation library. Per-cell motion is CSS on `transform` and `opacity` only (Mosaic §7), driven by `cellMoments` so nothing animates on mount; the one JS tween is the reveal's dart path (`requestAnimationFrame`). Everything honours `prefers-reduced-motion` (instant, or a fade of at most 150 ms). (Amended by Plan C, Mosaic spec §1.1.)
```

Selected. Replace

```markdown
- Selected cells use the inset ring and the check, at weight 600; 700 is not loaded (D§3 wins over D§4; recorded erratum 2).
```

with

```markdown
- Selected cells show the four ink corner brackets (Mosaic §5), number at weight 600; 700 is not loaded. (Amended by Plan C, Mosaic spec §1.1.)
```

Holders. Replace

```markdown
- Holders (other buyers' handles) and the overdue flag are decided only in `shapeGrid` on the server. Client components import domain types with `import type` only and never receive data the server did not decide the viewer may see.
```

with

```markdown
- Holders (other buyers' handles), flights and the overdue flag are decided only in `shapeGrid` on the server. A cell carries a `flight` under exactly the condition that it carries a `holder` (the break's host, an admin, or a viewer who holds a line in that break). Client components import domain types with `import type` only and never receive data the server did not decide the viewer may see. (Amended by Plan C, Mosaic spec §1.1.)
```

Fonts. Replace

```markdown
- Fonts: `next/font/google` Barlow (400, 500, 600) and Barlow Condensed (600), fetched at build time from Task 6 on. If the build fails or hangs fetching fonts.googleapis.com or fonts.gstatic.com (symptom: the build sits in, or errors from, `next-font-loader`; in CI the same symptom), stop and report BLOCKED: fonts. Do not vendor fonts or change `fonts.ts`.
```

with

```markdown
- Fonts: `next/font/google` Barlow (400, 500, 600), Barlow Condensed (600) and Big Shoulders Display (800, wall routes only): five files, fetched at build time. If the build fails or hangs fetching fonts.googleapis.com or fonts.gstatic.com (symptom: the build sits in, or errors from, `next-font-loader`; in CI the same symptom), stop and report BLOCKED: fonts; the rule applies to all three families. Do not vendor fonts or change `fonts.ts` (Plan C Task 1 added Big Shoulders Display there). (Amended by Plan C, Mosaic spec §1.1.)
```

Feed thumbnails and the link preview. Replace

```markdown
- Holders never reach anonymous viewers. Thumbnails (`feedThumbs`) are built from line state only: their query does not select `owner_id` or handles. The link preview's guarantee is that `ogModel(shapeGrid(page, null))` emits only number and tone per cell and the route never reads the session (pinned by `og.test.ts`); its query may be `getBreakPage`. On the break grid `shapeGrid` stays the only gate for holders and the overdue flag.
```

with

```markdown
- Holders and flights never reach anonymous viewers. Thumbnails (`feedThumbs`) are built from line state only and carry no flight: their query does not select `owner_id` or handles. The link preview's guarantee is that `ogModel(page, now)` emits per cell only number, tone and, on won cells, place, plus the break's `kit` and `heat`; no holder, handle or flight (pinned by `og.test.ts`); the route never reads the session; its query may be `getBreakPage`. On the break grid `shapeGrid` stays the only gate for holders, flights and the overdue flag. (Amended by Plan C, Mosaic spec §1.1.)
```

Host profile data. Replace

```markdown
- The host profile shows public data only: handle, display name, member since, breaks run, open breaks, a count of past ones. Never email, payment name or payment handles (a break page's details fold keeps showing that break's payment handles, as Plan A built it).
```

with

```markdown
- The host profile shows public data only: handle, display name, member since, breaks run, open breaks, a count of past ones, the host record counts (draws verified, and the stall line while a Closed break waits for its draw; Mosaic §9) and the kit. Never email, payment name or payment handles (a break page's details fold keeps showing that break's payment handles, as Plan A built it). (Amended by Plan C, Mosaic spec §1.1.)
```

Green and red. Replace

```markdown
- Green keeps its two meanings (design §3): mine, and money the host confirmed. A free handle, a selected chip or a success note is never green.
```

with

```markdown
- Green keeps its two meanings on paper (design §3): mine, and money the host confirmed. On the board, mine is the ink-and-cream inner ring; green marks the 2nd and 3rd place rings; red marks the top-spot ring and the host-view overdue edge. Flight faces are never red or green. A free handle, a selected chip or a success note is never green. (Amended by Plan C, Mosaic spec §1.1.)
```

- [ ] **Step 2: Amend the platform spec's stall copy**

In `docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md`, §9, replace

```markdown
**Stalls.** Filled-not-drawn shows "Filled N days ago — not drawn" on
the break and host profile; host nudged at 24h, 72h, then weekly. No
```

with

```markdown
**Stalls.** A Closed break not drawn shows "Closed 3 days ago, not drawn yet." (the
day count from 3 on) on the break and host profile; host nudged at 24h, 72h, then weekly. No
```

- [ ] **Step 3: Mark the first design's superseded sections**

In `docs/superpowers/specs/2026-10-13-ui-design.md`, replace

```markdown
## 3. Tokens

### Colour
```

with

```markdown
## 3. Tokens

> **Superseded in part by Mosaic** (`2026-10-14-mosaic-ui-design.md`, §1.1 and §4). Paper tokens keep their values
> and their uses on paper surfaces. The board has new tokens with new names (`--board-*`, `--lamp-0` … `--lamp-4`,
> `--kit-dark`, `--kit-light`). On the board, mine is the inner ring, green marks only the 2nd and 3rd place rings,
> red marks the top-spot ring and the host-view overdue edge, and flight faces are never red or green. Wall routes
> add Big Shoulders Display 800 for titles, the caller banner, the checkout count and the result display. Motion
> below is replaced in full by Mosaic §7. "No caps labels" stands.

### Colour
```

replace

```markdown
## 4. The grid

### Columns and cells
```

with

```markdown
## 4. The grid

> **Superseded in part by Mosaic** (§1.1 and §5). On wall boards `--board-steel` is the wire; `columnsFor` and the
> cell sizes are unchanged. The states table is replaced row by row by Mosaic §5: paid is the holder's colour, the
> dashed sent edge is retired, the two-tone ring replaces the corner flag, brackets replace the inset and the check,
> overdue keeps the red edge and "!" on the Mosaic face, reserved keeps the double rule and "m", and the bonus ink
> face and "+" are retired (black now means won). The struck line is the sniped state, drawn in ink. The legend is
> drawn as mini cells, the group label is "Lines, 12 to go", and the board's focus ring is ink and cream.

### Columns and cells
```

replace

```markdown
## 5. Screens

Phone first; widths quoted at 390.
```

with

```markdown
## 5. Screens

> **Superseded in part by Mosaic** (§1.1 and §8). Landing hero: the kit board of the most recent ran break with its
> black bull cells. Feed: chips "Newest" and "Closest to full", cards on the wall with "12 to go" and no fill bar.
> Break page: the media row "50 lines, $5 a line", "Hosted by @jim" with the kit swatch, "Pay within 24 hours." in
> the claim sheet, the status pill beside the checkout count, the Mosaic §8 pixel budget. Ledger: unchanged, and its
> header gains the host record. Result: "Top spot: line 7" in display type, the board in the viewer's view with the
> black bulls, and the Mosaic §7 reveal. `/me`: your own lines in your flight, and a plain history. Host profile:
> the host record and the kit.

Phone first; widths quoted at 390.
```

replace

```markdown
## 6. Writing

Buttons say what happens:
```

with

```markdown
## 6. Writing

> **Superseded in part by Mosaic** (§1.1, §3 and §9). The count everywhere is "N to go" ("12 to go, $5 a line" in
> the preview caption) and the feed sort is "Closest to full"; "19 of 50 left", "Filling fast", "Almost full" and
> "You hold …" are retired. Mosaic §3 adds the banned words (the heat words, streak, level, "lucky colour",
> winnings, "You won", caps chips, betting words near a kit), pinned by `src/lib/copy-audit.test.ts`.

Buttons say what happens:
```

and replace

```markdown
## 7. Accessibility and quality floor

Tap targets 44 pt
```

with

```markdown
## 7. Accessibility and quality floor

> **Superseded in part by Mosaic** (§1.1, §5 and §11). On the board the focus ring is a 2 px `--board-ink` outline
> with a 2 px cream ring outside it; on paper the 2 px green ring stands. The 44 pt target holds (cells 44.75 px at
> 390). Axe runs over the member view, the kit view, the result page, `/account` and the host's break view with an
> overdue line; flight contrast is pinned by `flights.test.ts`.

Tap targets 44 pt
```

- [ ] **Step 4: Update the README**

In `README.md`, under "## Verify a draw", replace

```markdown
It prints `OK` or `MISMATCH`.
```

with

````markdown
It prints `OK` or `MISMATCH`.

Every draw also records whether it verified when it was recorded (`draws.verified_at`, set when `verifyInputs` passes on its inputs; the host record's "draws verified" counts it). Draws recorded before migration 0004 are backfilled by running the same check over them, once per database, after migrating:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm exec tsx scripts/verify-draws.ts
```

The test and e2e databases are emptied by their suites, so they need no backfill.
````

Under "## UI conventions", replace

```markdown
- Tokens live in `src/app/tokens.css` (raw colours on `:root`, mapped through Tailwind v4 `@theme inline`); there is no `tailwind.config`. Use `bg-paper`, `text-ink-2`, `border-wire-strong`, `font-condensed`, `text-title` and friends, never Tailwind's default palette.
```

with

```markdown
- Tokens live in `src/app/tokens.css` (raw colours on `:root`, mapped through Tailwind v4 `@theme inline`); there is no `tailwind.config`. Use `bg-paper`, `text-ink-2`, `border-wire-strong`, `font-condensed`, `text-title` and friends, never Tailwind's default palette. Paper surfaces (the ledger, sheets, forms, `/host`, `/me`, `/account`) keep the first design's tokens. Wall routes (`/b/{id}`, `/b/{id}/result`, `/breaks`, `/`, `/h/{handle}`) use the Mosaic board tokens, all new names: `--board-wall`, `--board-wall-2`, `--board-cream`, `--board-cream-2`, `--board-ink`, `--board-ink-2`, `--board-steel`, `--board-ring`, `--board-text`, `--board-text-2`, `--board-text-3`, the lamp steps `--lamp-0` … `--lamp-4`, and `--kit-dark` / `--kit-light`, set per break from the host's kit. No existing token changed value; `tokens.test.ts` pins every pair. The flight palette, the kits and the heat steps live in `src/domain/flights.ts`; its keys never reorder or rename.
- Fonts (`src/app/fonts.ts`, `next/font/google`, fetched at build time): Barlow 400, 500 and 600, Barlow Condensed 600 for cell numbers, and Big Shoulders Display 800 for titles, the caller banner, the checkout count and the result display on wall routes: five font files. The link preview reads three static TTFs from disk instead; they are not shipped to browsers. A build that cannot reach Google Fonts is BLOCKED: fonts; do not vendor the files.
```

replace

```markdown
- Grid shaping, holder visibility and the host-only overdue flag are decided in `src/domain/breaks/grid.ts` on the server; client components receive the result.
```

with

```markdown
- Grid shaping, holder and flight visibility and the host-only overdue flag are decided in `src/domain/breaks/grid.ts` (`shapeGrid`) on the server; client components receive the result. A cell carries a `flight` exactly when it carries a `holder` (the break's host, an admin, or a viewer holding a line there); everyone else, and the feed, the landing page, the host profile and the link preview, see the board in the host's kit, never a flight.
```

replace

```markdown
- Copy rules (no middle dots or bullets, gambling-neutral words, `formatMoney` for money, no default palette, no caps labels, no "Submit", the community's state words, no exclamation marks) are enforced by `src/lib/copy-audit.test.ts`.
```

with

```markdown
- Copy rules (no middle dots or bullets, gambling-neutral words, `formatMoney` for money, no default palette, no caps labels or caps chips, no "Submit", the community's state words, no exclamation marks, and the Mosaic bans: the heat words, streaks and levels, winnings and "You won", "lucky colour", betting words near a kit, the retired counts and sorts, "his") are enforced by `src/lib/copy-audit.test.ts`. The count everywhere is "N to go".
```

and replace

```markdown
- Migration `0001_claim_mode` adds the picking mode (`pick_or_random`, `pick_only`, `straight`); `allow_random_claims` is kept in step and will be dropped later.
```

with

```markdown
- Migration `0001_claim_mode` adds the picking mode (`pick_or_random`, `pick_only`, `straight`); `allow_random_claims` is kept in step and will be dropped later.
- Migration `0004_flights_kits` adds `users.flight_colour` and `users.flight_shape` (NOT NULL: a random flight drawn on the server when the row is created, existing rows backfilled the same way, each CHECKed against the palette keys; never derived from the user id), `users.flight_chosen_at` (null until the member picks on `/account`), `host_profiles.kit_dark` and `host_profiles.kit_light` (null together means the default kit, Blue with Yellow) and `draws.verified_at` (see "Verify a draw").
```

- [ ] **Step 5: Write this plan's deferred-findings skeleton**

Write `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` as below. If Tasks 17 or 18 (or any earlier task) already created it, keep every record they appended, in its section, and add the rest around them.

```markdown
# Plan C (Mosaic): deferred findings and pre-deploy notes

Plan: `2026-10-14-plan-c-mosaic.md`. Spec: `../specs/2026-10-14-mosaic-ui-design.md`, with
`../specs/2026-10-13-dart-breaks-platform-design.md`. Every task was reviewed; what follows was deliberately
deferred or recorded under the one-round fix-loop rule (recorded ruling 8).

## Notes for the deployment plan (there is no deployment yet)

1. **Migration 0004, then the backfill.** Deploy `0004_flights_kits` as Plan B's note 1 describes, then run
   `scripts/verify-draws.ts` once against the hosted database so existing draws get `draws.verified_at`.
2. **Fonts.** Five font files reach browsers; Big Shoulders is one variable file, not preloaded, fetched where its
   text first renders (the wall routes). The OG route reads three static TTFs from disk: they must ship with the
   deployment bundle.
3. **`/dev/components`** opens in a production build only when `E2E_SECRET` is set (the e2e density check);
   `assertDeployEnv` refuses `E2E_SECRET` on Vercel.

## For the next plans

### Game-structure plan
- Show mine (Mosaic §13): the "You have …" line becomes the `aria-pressed` toggle with the house-lights overlay.

### Reputation plan
- Levels, tiers, streaks, trophies and win counts stay out until it lands (Mosaic §9).

### Smaller items, any plan
- The domain's `filling` sort and `FeedBreak.paidLastDay` are unused since Task 15 (the chips are Newest and
  Closest to full): drop them with their `feed.test.ts` case.
- `GridPreview` (Task 8) has no caller once Task 15 draws card thumbnails with `KitThumb` and Task 20 rewrites
  `/dev/components`: drop it, or move the board's own thumbnail onto it.

## Fix-loop records (one round, then record)

### Render tests (Tasks 7, 8, 18)

### Axe (Task 20)

### Copy audit (Task 17)

### E2E (Task 20)

## Open bug reports (not yet reproduced)

- **Safari, pay sheet mini cells:** carried from Plans A and B; `MiniCells` keeps the first design's cell (moved
  verbatim to `PaperCell` in Task 7), so re-check when the owner next sees it.
```

- [ ] **Step 6: Check the amendments landed**

Run:

```bash
grep -c "Amended by Plan C, Mosaic spec §1.1." docs/superpowers/plans/2026-10-14-plan-b-new-pages.md
grep -c "Superseded in part by Mosaic" docs/superpowers/specs/2026-10-13-ui-design.md
grep -c "Filled N days ago" docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md
grep -c "verify-draws.ts" README.md
```

Expected: `7`, `5`, `0`, `1`.

- [ ] **Step 7: Run every gate**

Run (sandbox off): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all green (docs only: nothing here changes behaviour).

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-10-14-plan-b-new-pages.md docs/superpowers/specs/2026-10-13-dart-breaks-platform-design.md docs/superpowers/specs/2026-10-13-ui-design.md README.md docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md
git commit -m "docs: amend Plan B constraints for Mosaic, mark superseded sections, update the README"
```

---

### Task 20: E2E: participant and stranger views, `/account`, axe, journey 2, fixtures (model: Sonnet)

Mosaic §12 task 20, Review Focus 1, 2 and 5, and the Plan C Global Constraints e2e privacy assertion: no cell rendered for an anonymous or non-holder viewer carries `data-flight` or a `--fc` custom property, and no `aria-label` ever contains a handle or a flight name. A new `e2e/mosaic.spec.ts` checks the stranger, non-holder, holder and host views of one break whose buyers wear flights from both tiers (Yellow kite, Blue standard) under a host kit (Plum with Lime); the first claim as a stranger, where only the two claimed cells may carry an animation (`data-moment`) and nothing animates on load (Review Focus 2); the `/account` flight and kit pickers reaching the board; and the 50-line density check on `/dev/components` at 390 × 664 (Review Focus 5). The axe test adds the result page (kit view and member view) and the host's break view with an overdue line. Journey 2 learns the new copy and the result page. The unit fixtures can give a user a flight and a host a kit. `/dev/components` shows every Mosaic §5 state.

**Files:**
- Create: `e2e/mosaic.spec.ts`
- Modify: `e2e/db.ts` (`setKit`, `ageClaims`), `e2e/layout.spec.ts` (the axe test), `e2e/journey-2.spec.ts`
- Modify: `tests/helpers/fixtures.ts` (`makeUser` options, flight constants), `tests/helpers/fixtures.test.ts`
- Modify: `src/app/dev/components/page.tsx` (whole file)
- Modify: `README.md` (the `/dev/components` line)
- Modify: `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (axe and e2e records, if any)

**Interfaces:**
- Consumes: `FLIGHT_COLOURS`, `FLIGHT_SHAPES`, `Flight`, `Kit` (Task 2); `users.flightColour`, `users.flightShape`, `hostProfiles.kitDark`, `hostProfiles.kitLight` (Task 4); `GridCell.flight` (Task 5); `CellData.flight` and `CellData.place`, Cell sizing its marks from its own box, the accessible names of Mosaic §5 ("Line 23, top spot", "Line 3, taken, overdue") (Task 7); `Grid` taking `view`, `kit: Kit` and `heat: HeatStep`, `BoardLegend({ view, flight, kit })`, test id `board-frame` with `--kit-dark` / `--kit-light` set on it or above it (Task 8); a cell that is playing a moment carries `data-moment="<CellMoment>"` on its `[data-cell]` element (Task 11); `data-won="1|2|3"` on won cells (Task 7); test ids `caller` (Task 11), `reveal-skip`, `reveal-replay` (Task 12); the flight radios carry `flight-<colour>-<shape>` and save with `flight-save`, the kit is two radio groups named by colour with `kit-<dark>-<light>` on the framed preview and saves with `kit-save`, each confirmed by "Saved." (Task 16); `flight-line` in the claim outcome while `flight_chosen_at` is null (Task 16); `setFlight`, `withDb` (Task 18).
- Produces: `e2e/db.ts`: `setKit(handle: string, k: Kit): Promise<void>`, `ageClaims(breakId: string, numbers: number[], hours: number): Promise<void>`; `makeUser(tx, { …, flight?: Flight; kit?: Kit })`; fixtures `YELLOW_KITE`, `BLUE_STANDARD`, `PLUM_LIME`; `/dev/components` test ids `states-member`, `states-kit`, `won-sizes`, `density`.

- [ ] **Step 1: Give the unit fixtures flights from both tiers and a host kit (failing test first)**

Append to the `describe("fixtures", …)` block in `tests/helpers/fixtures.test.ts` (before its closing `});`):

```ts
  it("gives users flights from both tiers and a host a kit", async () => {
    await withTx(async (tx) => {
      const yellow = await makeUser(tx, { flight: YELLOW_KITE });
      const blue = await makeUser(tx, { flight: BLUE_STANDARD });
      const host = await makeUser(tx, { role: "host", kit: PLUM_LIME });
      const flights = await tx.execute<{ id: string; flight_colour: string; flight_shape: string }>(
        sql`select id, flight_colour, flight_shape from users where id in (${yellow.id}::uuid, ${blue.id}::uuid)`);
      expect(new Map(flights.map((r) => [r.id, `${r.flight_colour}-${r.flight_shape}`]))).toEqual(new Map([[yellow.id, "yellow-kite"], [blue.id, "blue-standard"]]));
      const [kit] = await tx.execute<{ kit_dark: string; kit_light: string }>(sql`select kit_dark, kit_light from host_profiles where user_id = ${host.id}::uuid`);
      expect(kit).toEqual({ kit_dark: "plum", kit_light: "lime" });
    });
  });
```

and change its fixtures import to

```ts
import { makeUser, openBreakWithLines, lineRows, assertInvariants, YELLOW_KITE, BLUE_STANDARD, PLUM_LIME } from "./fixtures";
```

Run: `pnpm test tests/helpers/fixtures.test.ts`
Expected: FAIL: `YELLOW_KITE`, `BLUE_STANDARD` and `PLUM_LIME` are not exported; `makeUser` takes no `flight` or `kit`.

In `tests/helpers/fixtures.ts`, replace

```ts
import { users, breaks, breakItems, breakSecrets, prizes, lines } from "@/db/schema";
```

with

```ts
import { users, breaks, breakItems, breakSecrets, prizes, lines, hostProfiles } from "@/db/schema";
import type { Flight, Kit } from "@/domain/flights";
```

and replace the whole `makeUser` function (if Task 5 already added a `flight` option, keep one option of that name) with:

```ts
/** Flights from both ink tiers and a kit other than the default, for privacy and render tests (Mosaic §4, §6). */
export const YELLOW_KITE: Flight = { colour: "yellow", shape: "kite" };
export const BLUE_STANDARD: Flight = { colour: "blue", shape: "standard" };
export const PLUM_LIME: Kit = { dark: "plum", light: "lime" };

export async function makeUser(tx: Tx, opts: { role?: "member" | "host" | "admin"; handle?: string; flight?: Flight; kit?: Kit } = {}) {
  const id = randomUUID();
  const handle = opts.handle ?? `u${uniq()}`;
  await tx.insert(users).values({
    id, email: `${handle}@example.com`, handle, displayName: handle,
    role: opts.role ?? "member", ageConfirmedAt: new Date(),
    // Without a flight the column default draws a random one, as at a real first sign-in.
    ...(opts.flight ? { flightColour: opts.flight.colour, flightShape: opts.flight.shape } : {}),
  });
  if (opts.kit) {
    await tx.insert(hostProfiles).values({ userId: id, kitDark: opts.kit.dark, kitLight: opts.kit.light })
      .onConflictDoUpdate({ target: hostProfiles.userId, set: { kitDark: opts.kit.dark, kitLight: opts.kit.light } });
  }
  return { id, handle };
}
```

Run: `pnpm test tests/helpers/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 2: Add the e2e database helpers**

Append to `e2e/db.ts`:

```ts
/** Gives a signed-in host (by handle) a kit, creating their host_profiles row if it does not exist yet. */
export async function setKit(handle: string, k: Kit): Promise<void> {
  await withDb(async (sql) => {
    await sql`insert into host_profiles (user_id, kit_dark, kit_light)
      select id, ${k.dark}, ${k.light} from users where handle = ${handle}
      on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`;
  });
}

/** Moves claims back in time, so lines past the payment window show overdue in host view (computed from now). */
export async function ageClaims(breakId: string, numbers: number[], hours: number): Promise<void> {
  await withDb(async (sql) => {
    await sql`update lines set claimed_at = now() - make_interval(hours => ${hours}::int)
      where break_id = ${breakId}::uuid and number in ${sql(numbers)}`;
  });
}
```

and replace its first type import with

```ts
import type { Flight, Kit } from "../src/domain/flights";
```

- [ ] **Step 3: `/dev/components` shows every Mosaic §5 state, and opens in the e2e build**

Replace the whole of `src/app/dev/components/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { FLIGHT_COLOURS, type Flight, type Kit } from "@/domain/flights";
import { Grid } from "@/components/grid/grid";
import { Cell } from "@/components/grid/cell";
import type { CellData } from "@/components/grid/cell-label";
import { MiniCells } from "@/components/mini-cells";
import { BoardLegend } from "@/components/board-legend";
import { FillBar } from "@/components/fill-bar";
import { StatusPill } from "@/components/status-pill";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { Button } from "@/components/button";
import { Demo } from "./demo";

export const metadata = { title: "Components" };
// Read per request: the e2e build (E2E_SECRET set, never on Vercel) opens this page for the density check.
export const dynamic = "force-dynamic";

type BoardCell = Parameters<typeof Grid>[0]["cells"][number];

const KIT: Kit = { dark: "plum", light: "lime" };
const KIT_VARS = { "--kit-dark": FLIGHT_COLOURS[KIT.dark].face, "--kit-light": FLIGHT_COLOURS[KIT.light].face } as CSSProperties;
const WALL: CSSProperties = { ...KIT_VARS, background: "var(--board-wall)", color: "var(--board-text)" };
const YOU: Flight = { colour: "yellow", shape: "kite" };
const THEM: Flight[] = [
  { colour: "blue", shape: "standard" }, { colour: "petrol", shape: "pear" }, { colour: "orange", shape: "slim" },
  { colour: "pink", shape: "kite" }, { colour: "lime", shape: "pear" }, { colour: "plum", shape: "slim" },
];
const BASE = { state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, place: null } as const;
const cell = (number: number, o: Record<string, unknown> = {}) => ({ ...BASE, number, ...o }) as CellData;

/** Every §5 state in the member view (holders, the host and admins see these). */
const MEMBER: { name: string; cell: CellData; selected?: boolean; struck?: boolean }[] = [
  { name: "Open", cell: cell(1) },
  { name: "Selected", cell: cell(2), selected: true },
  { name: "Sniped", cell: cell(3, { state: "taken", flight: THEM[0] }), struck: true },
  { name: "Claimed, others", cell: cell(4, { state: "taken", flight: THEM[1] }) },
  { name: "Yours, not sent", cell: cell(5, { state: "taken", mine: true, flight: YOU }) },
  { name: "Yours, sent", cell: cell(6, { state: "sent", mine: true, flight: YOU }) },
  { name: "Overdue, host view", cell: cell(7, { state: "taken", overdue: true, flight: THEM[2] }) },
  { name: "Paid, others", cell: cell(8, { state: "paid", flight: THEM[3] }) },
  { name: "Yours, paid", cell: cell(9, { state: "paid", mine: true, flight: YOU }) },
  { name: "Reserved for a mini", cell: cell(10, { state: "reserved" }) },
  { name: "Bonus", cell: cell(51, { state: "paid", bonus: true, flight: THEM[4] }) },
  { name: "Won, top spot", cell: cell(23, { state: "paid", flight: THEM[0], place: 1 }) },
  { name: "Won, 2nd", cell: cell(14, { state: "paid", flight: THEM[1], place: 2 }) },
  { name: "Won, 3rd", cell: cell(31, { state: "paid", mine: true, flight: YOU, place: 3 }) },
];
/** The kit view (anyone not holding a line, and every public surface): no flight on any cell. */
const KIT_VIEW: { name: string; cell: CellData }[] = [
  { name: "Open", cell: cell(1) },
  { name: "Taken", cell: cell(2, { state: "taken" }) },
  { name: "Sent, shown as taken", cell: cell(3, { state: "sent" }) },
  { name: "Paid", cell: cell(4, { state: "paid" }) },
  { name: "Reserved for a mini", cell: cell(5, { state: "reserved" }) },
  { name: "Won, top spot", cell: cell(23, { state: "paid", place: 1 }) },
];

/** The 50-line board at 390 (Review Focus 5): a two-digit top spot, 2nd and 3rd, and a mix of every claimed state. */
const STATES = ["open", "taken", "sent", "paid", "open", "taken", "paid", "reserved"] as const;
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 9: 2, 31: 3 };
const board: BoardCell[] = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1;
  const place = PLACES[n] ?? null;
  const state = place ? "paid" : STATES[i % STATES.length];
  const held = state !== "open" && state !== "reserved";
  const mine = held && n % 11 === 4;
  return { ...BASE, number: n, state, mine, place, holder: held ? "dev" : null, flight: held ? (mine ? YOU : THEM[n % THEM.length]) : null } as BoardCell;
});

function Swatch({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="flex w-[88px] flex-col items-start gap-1">
      <span className="block w-[44.75px]">{children}</span>
      <figcaption className="text-micro" style={{ color: "var(--board-text-2)" }}>{name}</figcaption>
    </figure>
  );
}

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && !process.env.E2E_SECRET) notFound();
  return (
    <main className="mx-auto max-w-[600px] space-y-8 px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Components</h1>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="density">
        <h2 className="text-headline font-semibold">Board at 50, member view</h2>
        <Grid cells={board} lineCount={50} label="Lines, 12 to go" view="member" kit={KIT} heat={2} />
        <BoardLegend view="member" flight={YOU} kit={KIT} />
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL}>
        <h2 className="text-headline font-semibold">Board at 12, kit view</h2>
        <Grid cells={board.slice(0, 12).map((c) => ({ ...c, holder: null, flight: null, mine: false }) as BoardCell)} lineCount={12} label="Lines, 4 to go" view="kit" kit={KIT} heat={1} />
        <BoardLegend view="kit" flight={null} kit={KIT} />
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="states-member">
        <h2 className="text-headline font-semibold">Every state, member view</h2>
        <div className="flex flex-wrap gap-3">
          {MEMBER.map((s) => <Swatch key={s.name} name={s.name}><Cell cell={s.cell} view="member" px={44.75} selected={s.selected} struck={s.struck} /></Swatch>)}
        </div>
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="states-kit">
        <h2 className="text-headline font-semibold">Every state, kit view</h2>
        <div className="flex flex-wrap gap-3">
          {KIT_VIEW.map((s) => <Swatch key={s.name} name={s.name}><Cell cell={s.cell} view="kit" px={44.75} /></Swatch>)}
        </div>
      </section>
      <section className="-mx-4 space-y-3 px-4 py-4 sm:-mx-6 sm:px-6" style={WALL} data-testid="won-sizes">
        <h2 className="text-headline font-semibold">The top spot at 44, 56 and 68</h2>
        <div className="flex flex-wrap items-end gap-3">
          {[44, 56, 68].map((px) => <Cell key={px} cell={cell(23, { state: "paid", flight: THEM[0], place: 1 })} px={px} />)}
        </div>
      </section>
      <section className="flex items-center gap-3">
        <MiniCells cells={MEMBER.slice(3, 9).map((s) => s.cell)} />
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

In `README.md`, replace

```markdown
- Shared components are in `src/components/`. In development, `/dev/components` shows them all (it 404s in production).
```

with

```markdown
- Shared components are in `src/components/`. In development, `/dev/components` shows them all, with every Mosaic §5 cell state in the member and kit views and the 50-line board at 390 (it 404s in production unless `E2E_SECRET` is set, which the e2e build sets for its density check and Vercel refuses).
```

- [ ] **Step 4: Write the Mosaic spec**

Create `e2e/mosaic.spec.ts`:

```ts
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { FLIGHT_COLOURS, FLIGHT_SHAPES } from "../src/domain/flights";
import { composeBreak, gotoReady, loginAs } from "./helpers";
import { setFlight, setKit } from "./db";

// Mosaic's privacy and motion claims in a real browser (Plan C Review Focus 1, 2 and 5).
const run = Date.now();

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => c.close())); });

async function newPage(browser: Browser, email?: string, role: "member" | "host" = "member", viewport?: { width: number; height: number }): Promise<Page> {
  const mobile = viewport ? viewport.width < 640 : false;
  const ctx = await browser.newContext(viewport ? { viewport, isMobile: mobile, hasTouch: mobile } : {});
  contexts.push(ctx);
  const page = await ctx.newPage();
  if (email) await loginAs(page, email, role);
  return page;
}

/** Every flight name a cell must never say: the colour and shape labels (Mosaic §5 accessibility). */
const FLIGHT_WORDS = [...Object.values(FLIGHT_COLOURS).map((c) => c.label), ...Object.values(FLIGHT_SHAPES).map((s) => s.label)];

/** The cells' accessible names that carry a handle, an "@" or a flight name: always empty, for every viewer. */
async function badNames(page: Page, handles: string[]): Promise<string[]> {
  const names = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names.length).toBeGreaterThan(0);
  return names.filter((n) => n.includes("@") || handles.some((h) => n.includes(h)) || FLIGHT_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(n)));
}

/**
 * The kit view (Plan C e2e privacy assertion): no data-flight, no --fc, and no holder's handle anywhere in the page,
 * the RSC payload included. (The payload may carry the signed-in viewer's own flight for the "This is your flight"
 * line, so the check is on the holders, not on the word "flight".)
 */
async function expectKitView(page: Page, cells: number, handles: string[]) {
  // The board's buttons only: legend mini cells are display-only [data-cell] elements too (Task 7).
  await expect(page.locator("button[data-cell]")).toHaveCount(cells);
  await expect(page.locator("[data-flight]")).toHaveCount(0);
  const withFc = await page.locator("[data-cell]").evaluateAll((els) =>
    els.filter((e) => (e.getAttribute("style") ?? "").includes("--fc") || e.querySelector('[style*="--fc"]') !== null).length);
  expect(withFc).toBe(0);
  const html = await page.content();
  for (const h of handles) expect(html).not.toContain(h);
}

test("strangers see the board in the host's kit, holders see the flights, and no cell name carries a handle or a flight", async ({ browser }) => {
  const hostHandle = `mk${run}`; const aliceHandle = `ma${run}`; const bobHandle = `mo${run}`;
  const host = await newPage(browser, `${hostHandle}@e2e.test`, "host");
  await setKit(hostHandle, { dark: "plum", light: "lime" });
  const url = await composeBreak(host, { title: `Mosaic ${run}`, lineCount: 12 });
  const alice = await newPage(browser, `${aliceHandle}@e2e.test`);
  await setFlight(aliceHandle, { colour: "yellow", shape: "kite" }); // light tier
  const bob = await newPage(browser, `${bobHandle}@e2e.test`);
  await setFlight(bobHandle, { colour: "blue", shape: "standard" }); // dark tier

  // alice holds lines 1 and 2 and says she sent them; bob holds line 3 and the host ticks it paid.
  await gotoReady(alice, url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("flight-line")).toContainText("This is your flight.");
  await alice.getByTestId("pay-sent").click();
  await expect(alice.getByTestId("pay-sheet")).toBeHidden();
  await gotoReady(bob, url);
  await bob.getByTestId("cell-3").click();
  await bob.getByTestId("claim-submit").click();
  await bob.getByRole("button", { name: "I'll pay later" }).click();
  await gotoReady(host, url);
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-row").filter({ hasText: bobHandle }).getByTestId("ledger-paid").click();
  await expect(host.getByTestId("paid-count")).toContainText("1 of 12 paid");
  await host.getByRole("button", { name: "Close" }).click();

  const holders = [aliceHandle, bobHandle];
  const anonymous = await newPage(browser);
  const stranger = await newPage(browser, `mz${run}@e2e.test`);
  for (const page of [anonymous, stranger]) {
    await gotoReady(page, url);
    await expectKitView(page, 12, holders);
    expect(await badNames(page, holders)).toEqual([]);
  }
  // A holder and the host see every holder's flight; the names still carry neither a handle nor a flight.
  for (const page of [alice, host]) {
    await gotoReady(page, url);
    await expect(page.getByTestId("cell-1")).toHaveAttribute("data-flight", "yellow-kite");
    await expect(page.getByTestId("cell-2")).toHaveAttribute("data-flight", "yellow-kite");
    await expect(page.getByTestId("cell-3")).toHaveAttribute("data-flight", "blue-standard");
    await expect(page.getByTestId("cell-4")).not.toHaveAttribute("data-flight");
    expect(await badNames(page, holders)).toEqual([]);
  }
});

test("the first claim as a stranger animates only the claimed cells, and nothing animates on load (Review Focus 2)", async ({ browser }) => {
  const host = await newPage(browser, `mc${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Moments ${run}`, lineCount: 12 });
  // Someone else first: a part-filled board, so the view switch turns their cells from kit faces to flight faces.
  const other = await newPage(browser, `md${run}@e2e.test`);
  await gotoReady(other, url);
  for (const n of [1, 2, 3, 4]) await other.getByTestId(`cell-${n}`).click();
  await other.getByTestId("claim-submit").click();
  await other.getByRole("button", { name: "I'll pay later" }).click();

  const carol = await newPage(browser, `me${run}@e2e.test`);
  // Record every moment any cell ever plays, from the first byte of the page on.
  await carol.addInitScript(() => {
    const seen: Record<string, string[]> = {};
    (window as unknown as { __moments: Record<string, string[]> }).__moments = seen;
    const note = (el: Element) => {
      const m = el.getAttribute("data-moment"); const n = el.getAttribute("data-cell");
      if (m && n) (seen[n] ??= []).push(m);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof Element) note(r.target);
        for (const node of r.addedNodes) {
          if (!(node instanceof Element)) continue;
          note(node);
          node.querySelectorAll("[data-moment]").forEach(note);
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-moment"] });
  });
  const moments = () => carol.evaluate(() => (window as unknown as { __moments: Record<string, string[]> }).__moments);

  await gotoReady(carol, url);
  await expect(carol.locator("[data-flight]")).toHaveCount(0); // kit view: carol holds nothing yet
  expect(await moments()).toEqual({});
  await carol.getByTestId("cell-7").click();
  await carol.getByTestId("cell-8").click();
  await carol.getByTestId("claim-submit").click();
  await expect(carol.getByTestId("pay-sheet")).toBeVisible();
  await expect(carol.getByTestId("cell-1")).toHaveAttribute("data-flight", /.+/); // now the member view
  const seen = await moments();
  expect(Object.keys(seen).sort()).toEqual(["7", "8"]);
  expect(Object.values(seen).flat().every((m) => m === "drop")).toBe(true);
});

test("/account: a host picks a kit and a member picks a flight, and the board wears both", async ({ browser }) => {
  const host = await newPage(browser, `mq${run}@e2e.test`, "host");
  await host.goto("/account");
  const picker = host.getByTestId("kit-picker");
  await picker.getByRole("radio", { name: "Petrol", exact: true }).check();
  await picker.getByRole("radio", { name: "Orange", exact: true }).check();
  await expect(picker.getByTestId("kit-petrol-orange")).toBeVisible(); // the framed preview of the pair
  await host.getByTestId("kit-save").click();
  await expect(host.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await host.reload();
  await expect(host.getByTestId("kit-picker").getByTestId("kit-petrol-orange")).toBeVisible();
  const url = await composeBreak(host, { title: `Kit ${run}`, lineCount: 4 });
  await gotoReady(host, url);
  const kitDark = await host.getByTestId("board-frame").evaluate((el) => getComputedStyle(el).getPropertyValue("--kit-dark").trim().toLowerCase());
  expect(kitDark).toBe(FLIGHT_COLOURS.petrol.face.toLowerCase());

  const member = await newPage(browser, `mp${run}@e2e.test`);
  await member.goto("/account");
  await member.getByTestId("flight-plum-pear").check();
  await member.getByTestId("flight-save").click();
  await expect(member.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await member.reload();
  await expect(member.getByTestId("flight-plum-pear")).toBeChecked();
  await gotoReady(member, url);
  await member.getByTestId("cell-2").click();
  await member.getByTestId("claim-submit").click();
  await expect(member.getByTestId("pay-sheet")).toBeVisible();
  // A chosen flight: the outcome no longer introduces it.
  await expect(member.getByTestId("flight-line")).toHaveCount(0);
  await member.getByRole("button", { name: "I'll pay later" }).click();
  await expect(member.getByTestId("cell-2")).toHaveAttribute("data-flight", "plum-pear");
});

test("the 50-line board fits a 390 × 664 phone: eight 44.75 px columns in the gutter, and the small won cell's sizes (Review Focus 5)", async ({ browser }) => {
  const page = await newPage(browser, undefined, "member", { width: 390, height: 664 });
  expect((await page.goto("/dev/components"))?.status()).toBe(200);
  const rows = page.getByTestId("density").locator("[data-grid-rows]").first();
  const cols = await rows.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
  expect(cols).toBe(8);
  const first = await rows.locator(":scope > *").first().boundingBox();
  expect(first).not.toBeNull();
  expect(first!.width).toBeCloseTo(44.75, 0);
  // The 12 px frame is spread into the 16 px gutter: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const top = page.getByTestId("density").getByRole("img", { name: "Line 23, top spot" });
  const sizes = await top.evaluate((el) => {
    const all = [...el.querySelectorAll("*")];
    const number = all.find((n) => n.children.length === 0 && n.textContent === "23");
    const disc = all.find((n) => {
      const r = n.getBoundingClientRect();
      return n.tagName.toLowerCase() !== "svg" && Math.abs(r.width - 26) < 0.6 && Math.abs(r.height - 26) < 0.6;
    });
    const glyph = all.find((n) => n.tagName.toLowerCase() === "svg" && n.getBoundingClientRect().width > 0);
    return { number: number ? getComputedStyle(number).fontSize : null, disc: disc !== undefined, glyph: glyph ? Math.round(glyph.getBoundingClientRect().width) : null };
  });
  // Under 56 px (Mosaic §5): the 26 px disc, a 14 px top-spot number, the 10 px glyph.
  expect(sizes).toEqual({ number: "14px", disc: true, glyph: 10 });
});
```

- [ ] **Step 5: Add the result page and the host's overdue view to the axe test (updates `e2e/layout.spec.ts`)**

In `e2e/layout.spec.ts`, replace

```ts
import { gotoReady, loginAs } from "./helpers";
```

with

```ts
import { composeBreak, gotoReady, loginAs } from "./helpers";
import { ageClaims } from "./db";
```

add above `async function axeViolations(`:

```ts
/** A 2-line break the host runs to the end, for the result page: one buyer takes both lines and is ticked paid. */
async function ranBreak(browser: Browser, host: Page): Promise<{ url: string; buyer: Page }> {
  const ranUrl = await composeBreak(host, { title: `Layout ran ${run}`, lineCount: 2 });
  const buyer = await signedIn(browser, `lr${run}@e2e.test`);
  await gotoReady(buyer, ranUrl);
  await buyer.getByTestId("claim-rest").click();
  await expect(buyer.getByTestId("pay-amount")).toContainText("$10");
  await host.goto(ranUrl);
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-paid").click();
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await expect(host.getByTestId("ledger-result")).toBeVisible();
  return { url: ranUrl, buyer };
}
```

and in the test `"axe finds no WCAG 2.1 A or AA violation on the main pages, the pay sheet and the ledger (D§7)"`, replace

```ts
  found.push(...(await axeViolations(host, "host ledger")));
  expect(found).toEqual([]);
```

with

```ts
  found.push(...(await axeViolations(host, "host ledger")));
  // The host's break view with an overdue line (Mosaic §5, §11): the layout buyer's lines 3 and 9, claimed 30 h ago
  // on a 24 h window. This is the file's last test, so moving the claims back changes nothing for the others.
  await ageClaims(url.split("/b/")[1], [3, 9], 30);
  await host.goto(url);
  await expect(host.getByTestId("cell-3")).toHaveAttribute("aria-label", "Line 3, taken, overdue");
  found.push(...(await axeViolations(host, "host break view with an overdue line")));
  // The result page, in the kit view (a stranger) and the member view (a holder), with the reveal at its end.
  const ran = await ranBreak(browser, host);
  for (const [who, page] of [["anonymous", anon], ["holder", ran.buyer]] as const) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${ran.url}/result`);
    await expect(page.getByTestId("winner")).toContainText("Top spot: line");
    found.push(...(await axeViolations(page, `${who} result page`)));
  }
  expect(found).toEqual([]);
```

(The axe test's existing list already covers the member view, the kit view and `/account`.)

- [ ] **Step 6: Journey 2 learns the new copy and the result page (updates `e2e/journey-2.spec.ts`)**

In `e2e/journey-2.spec.ts`, replace

```ts
  await a.getByTestId("break-card").filter({ hasText: `J2 ${run}` }).click();
```

with

```ts
  const feedCard = a.getByTestId("break-card").filter({ hasText: `J2 ${run}` });
  await expect(feedCard).toContainText("4 to go"); // the checkout count, never "4 of 4 left"
  await feedCard.click();
```

replace

```ts
  // 8. The result page for a first-time viewer: Skip hands focus to Replay, Replay deals again, Share falls back
  //    to a selectable field when the clipboard is blocked. A paused clock keeps the deal on screen: install() alone
  //    lets time run, and a 4-line deal ends in about 1.3 s, so Skip would race it (the layout spec's pattern).
```

with

```ts
  // 8. The result page for a first-time viewer: Skip ends the reveal on its last call with the bulls on the board and
  //    hands focus to Replay; Replay plays it again; Share falls back to a selectable field when the clipboard is
  //    blocked. A paused clock keeps the reveal on screen: install() alone lets time run, and a two-prize reveal ends
  //    in about 4 s, so Skip would race it (the layout spec's pattern).
```

and, in the Skip block Task 12 wrote, replace

```ts
  await expect(viewer.getByTestId("caller")).toContainText("takes the top spot.");
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
```

with

```ts
  // The caller copy (Mosaic §7): always the handle, never "You", never the prize.
  await expect(viewer.getByTestId("caller")).toHaveText(/^Line \d+\. @\S+ takes the top spot\.$/);
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
  // Two prizes, two black bulls on the visible board (the aria-hidden deal layer is gone after Skip).
  await expect(viewer.locator("[data-won]:visible")).toHaveCount(2);
```

- [ ] **Step 7: Run the new and changed specs**

Run (sandbox off): `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/mosaic.spec.ts e2e/layout.spec.ts e2e/journey-2.spec.ts`
Expected: PASS. A failure is fixed in this task when the cause is the spec (a selector or a wait); when the cause is the app (a flight on a stranger's cell, a moment on an unclaimed cell, an axe violation, the density sizes), fix the app if the fix is local, otherwise record it (next step) and report it. One round (recorded ruling 8).

- [ ] **Step 8: Record what the round left**

In `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md`, under `### Axe (Task 20)` and `### E2E (Task 20)`, add one line per finding left after Step 7: `- where: what failed, and the decision it needs`. If nothing is left, write `- None.` under each.

- [ ] **Step 9: Run every gate, the full suite**

Run (sandbox off):

```bash
/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:e2e
/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/mosaic.spec.ts
```

Expected: all green, on a freshly emptied `breaks_e2e`: journey 1, journey 2 (both tests), the layout spec, the page spec and the Mosaic spec; the second Mosaic run passes too (no flake tolerated).

- [ ] **Step 10: Commit**

```bash
git add e2e tests/helpers/fixtures.ts tests/helpers/fixtures.test.ts src/app/dev/components/page.tsx README.md docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md
git commit -m "test(e2e): stranger and holder views, first-claim moments, pickers, density and axe on the result and overdue views"
```

<!-- TASKS:END -->
