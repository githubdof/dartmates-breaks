# Dart Breaks platform — design spec

Date: 2026-10-13
Status: approved in conversation; written for review
Field notes: `research/facebook-dart-breaks.md`

## 1. Purpose

A phone-first web platform where hosts run **breaks** (an item split into
numbered lines at a price; buyers claim lines; when every line is paid a
random draw picks the winner) and **minis** (a break whose prizes are
spots in other breaks). It replaces the Facebook-group workflow: hand-
edited ledger comments, screenshots, scattered scam warnings, and draw
proofs that random.org deletes after a month.

Built and operated by one engineer (the founder, a buyer in the
community). First users are the existing hosts and buyers of groups such
as *Dart Deals and Breaks*.

Success for v1: a handful of real hosts run real breaks end to end on the
platform and buyers prefer it to the Facebook post.

## 2. Non-negotiables

- The platform **never handles break money**. Buyers pay hosts directly
  (PayPal/Venmo). The platform records what the parties assert.
- Trust comes from **computed stats + winner feedback**, not from escrow.
- **The host triggers every draw.** No automatic draws.
- The draw is **in-house, committed before the break opens, mixed with a
  public beacon, recorded permanently, verifiable by anyone**.
- Product copy and billing are **gambling-neutral**: "group buy",
  "lines", "allocation", "host tools". Never "raffle", "lottery", "odds".
  Hosts carry legal responsibility for their breaks (ToS).
- US-only at launch, 18+ self-certified.
- Hosts are **invite-only**; buyers are free.
- Hosts pay a flat subscription (v1.1); the platform takes **no cut**.

## 3. Vocabulary

| Term | Meaning |
|---|---|
| Break (main) | Group buy of an item split into `line_count` lines at `line_price`. |
| Line / spot | One numbered entry, 1..N. A buyer may hold several. |
| Mini | A break whose prizes are spots in one or more **parent** mains. |
| Ladder | Ordered prizes by rank: rank r → item, or (parent, spot_count). |
| Claim | Buyer takes a line; unpaid until the host confirms. |
| Sent | Buyer's assertion "I've paid". |
| Paid | Host's confirmation. Only this changes state. |
| Overdue | Claimed, not paid within the payment window. Host releases. |
| Filled | Lines 1..N all paid and no reserved-unowned lines. |
| Drawing | Host has requested the draw; entries frozen; waiting for beacon. |
| Drawn | Draw recorded; awards created. |
| Award | One prize for one rank for one winner; carries fulfilment. |
| Bonus line | Extra entry above N, free, host-granted, ≤10% of N. |
| Choice break | Several items at one rank; winner picks one. |
| Relist | Clone an undrawn break at a new price/count carrying paid lines. |

## 4. Scope

### v1 (target ≈ 3 months part-time)
- Magic-link auth, onboarding (handle, display name, 18+, ToS), roles
  member / host / admin, invite codes (admin-minted; hosts earn 2 per 30
  days after 1 drawn break; casual-host request path).
- Breaks: create/open, pick / random / take-the-rest claims, Sent, Paid
  (per buyer bulk), overdue + release, withdraw, bonus lines, prizes
  add-only, cancel (with reason when filled), relist.
- Minis: ladder, single or multi-parent, reserved pool, pick phase.
- Draw: commitment, draw request, drand beacon, deterministic shuffle,
  immutable record, result + verification page, share card, admin void.
- Thread per break, DM per (break, buyer) with ship-to / variant /
  shipped+tracking / received cards, single inbox, polling.
- Email: essential + updates toggle (Resend). In-app notifications.
- Feedback: would-buy-again yes/no + comment per award; host reply.
- Headline host stats; buyer stats on claim.
- Report-to-admin (replaces full disputes in v1).
- Admin: users, hosts, invites, reports, break lookup, draw void.
- Host follow + "new break from host" notification.
- No Stripe: everyone free; founding hosts flagged by hand.
- Tests: domain on Postgres, concurrency suite, crypto vectors, 2 e2e.

### v1.1
Stripe + tiers (free = 6 open mains; Pro unlimited) + founding-host Pro
(12 mo) and new-host Pro (3 mo) · scheduled draws · full disputes with
resolution log and listing pause · host announcements, digests · Facebook
login + admin "Verified Facebook host since" badge · payment_outcome
stats, refund tracking · moderators.

### v2
Priority windows, straight fill, numbered break IDs, private host
analytics, web push, search.

### Explicitly out
Mini-of-mini (parents are always mains) · cross-host parents · open DMs ·
wheels, loyalty giveaways · escrow or any payment flow · native apps.

## 5. Architecture

**Stack.** Next.js (App Router, TypeScript) on Vercel Pro; Supabase Pro
(Postgres, Auth, Storage); Drizzle ORM from server code over the
transaction-mode pooler (`prepare: false`); RLS enabled on every table
with deny-all policies as a backstop (service-role key server-only; anon
key harmless); Stripe (v1.1); Resend; Sentry. No Supabase Realtime (poll
+ client-side animation). No web push in v1.

**Shape: domain core + thin Next.js shell.**

```
src/domain/{breaks,lines,minis,draws,awards,conversations,feedback,invites}/
    commands.ts  queries.ts  rules.ts  *.test.ts
src/db/{schema.ts, migrations/, client.ts, rls.sql}
src/effects/{recipients.ts, system-messages.ts, notify.ts, email/, stats.ts}
src/auth/{session.ts, authz.ts}          # assertHostOf, assertParticipant, requireAdmin
src/crypto/{draw.ts, serialize.ts, vectors.json}   # shared with browser verifier
src/jobs/tick.ts                          # one cron route; advisory-locked jobs
src/app/...                               # routes; server actions = parse → authz → one command → revalidate
```

- A **command** is `(tx, caller, input) → result`. It never opens a
  transaction; the server action owns `db.transaction`, then drains the
  outbox after commit. Commands lock the `breaks` row first (status
  check), then lines. Multi-break commands lock all involved break rows in
  one `SELECT … FOR UPDATE ORDER BY id`.
- Every state change appends an `events` row in the same transaction;
  effects (system messages, notifications, stats) are derived from
  events idempotently (`events.processed_at`), in-request after commit
  and by the minute cron.
- Typed `DomainError`s (`LineTaken`, `NotOpen`, `TierLimit`,
  `NotYourTurn`, …) map to user messages; unknown errors go to Sentry
  with `break_id` and a request id.
- Idempotency: client generates a UUID per form mount; server stores it
  in `idempotency_keys(key, caller_id, result, expires_at)`.
- Cron: `/api/tick` (bearer secret, `maxDuration 60`) runs outbox,
  deliveries, draw finalisation, purge, stats roll; each under
  `pg_try_advisory_lock`.

## 6. Data model

Text + CHECK instead of PG enums; UUID ids; `created_at` everywhere;
UPDATE/DELETE revoked where noted. Partial indexes as listed in §6.1.

- **users** — `id` (= auth uid), `handle` (unique on lower, NFKC-
  normalised, reserved list), `display_name`, `avatar_url`, `email`,
  `role` member|host|admin, `age_confirmed_at`, `banned_at`,
  `listing_paused_at`, `founding_host` bool, `name_changed_at`,
  `last_seen_at`. Handle and display name editable 30 days, then locked.
- **host_profiles** — `user_id`, `payment_handles` jsonb
  (`{venmo, paypal}`), `payment_handles_changed_at`, `bio`,
  `verified_fb_since` (admin-set, v1.1 badge).
- **host_invites** — `code_hash`, `created_by`, `used_by`, `expires_at`.
- **host_requests** — `user_id`, `status`, `decided_by` (casual-host path).
- **follows** — `follower_id`, `host_id`.
- **breaks** — `host_id`, `kind` main|mini, `title`, `description`,
  `line_count` (frozen after open), `line_price_cents` (frozen),
  `allow_random_claims`, `payment_window_hours` (default 24),
  `max_lines_per_user`, `payment_instructions`, `one_prize_per_person`,
  `status` draft|open|filled|drawing|drawn|cancelled, `seed_commitment`
  (immutable), `opened_at`, `filled_at`, `cancel_reason`,
  `relisted_from_id`.
- **break_secrets** — `break_id` PK, `ciphertext`, `key_id`. Read only by
  the draw command; row deleted after reveal.
- **break_items** — `break_id`, `name`, `photo_paths[]`,
  `variant_schema` jsonb, `expected_ship_at`, `created_at`. Add-only
  while not drawn/cancelled (trigger).
- **prizes** — `break_id`, `rank`, `item_id` *or* (`parent_break_id`,
  `spot_count > 0`). Same rank + several items = choice set. Add-only.
- **lines** — PK (`break_id`, `number`), `owner_id`, `claimed_at`,
  `sent_at`, `paid_at`, `price_cents` (snapshot), `reserved_for_mini_id`,
  `award_id`, `is_bonus`, `payment_outcome` (v1.1), `claim_batch_id`.
  Checks: `paid ⇒ owned`; `owned ⇔ claimed`; `reserved ⇒ unowned`;
  `award_id ⇒ price 0 ∧ paid`. Pre-created at open; bonus numbers > N.
- **draw_requests** — `break_id` UNIQUE, `requested_by`, `requested_at`,
  `beacon_round`. Insert-only.
- **draws** — `id`, `break_id`, `request_id`, `secret`, `beacon_round`,
  `beacon_randomness`, `seed`, `algorithm_version`, `entries_snapshot`
  jsonb, `ranking` jsonb, `result_hash`, `run_by`, `created_at`.
  Insert-only; trigger asserts `sha256("breaks-commit-v1"‖secret) =
  breaks.seed_commitment`; partial unique on `break_id WHERE NOT voided`.
- **draw_voids** — `draw_id` PK, `voided_by`, `reason`. Insert-only.
- **awards** — `draw_id`, `break_id`, `rank`, `winner_id`, `item_id`
  (null until chosen), `variant` jsonb, `pick_deadline`, `picked_at`,
  `shipped_at`, `tracking`, `received_at`, `received_auto` bool.
- **award_spots** — `award_id`, `parent_break_id`, `spot_count`,
  `picked_at` (mini prizes).
- **ship_to** — `award_id`, encrypted structured address, `purge_after`.
- **conversations** — `break_id`, `kind` thread|dm, `buyer_id` (dm),
  UNIQUE(break, kind, buyer). **messages** — `conversation_id`,
  `author_id` (null = system), `kind` user|system|announcement|card,
  `body`, `card` jsonb, `image_path`, `deleted_at`, `hidden_at`.
  **conversation_reads** — `conversation_id`, `user_id`, `last_read_at`.
- **feedback** — `award_id` UNIQUE with `from_id`, `to_id`,
  `would_buy_again` bool, `comment`, `reply_text`, `replied_at`,
  `locked_at`.
- **reports** — `reporter_id`, `target_type`, `target_id`, `reason`,
  `images[]`, `status`, `admin_note`. (v1.1: **disputes** with
  upheld/not upheld/withdrawn and public resolution log.)
- **host_stats** — per host: breaks_drawn_90d, breaks_drawn_all,
  awards_with_tracking_pct, disputes_open, disputes_lost,
  distinct_buyers, would_buy_again_pct, would_buy_again_n,
  cancellations_unresolved, cancelled_after_filled, median_ship_days,
  computed_at.
- **notifications** — `user_id`, `event_id`, `read_at`;
  **notification_deliveries** — `notification_id`, `channel`, `status`
  queued|sending|sent|failed|dead, `attempts`, `next_attempt_at`;
  **notification_prefs** — `user_id`, `updates_email` bool, `digest`
  bool; **email_suppressions** — `email`, `reason`.
- **events** — `break_id`, `actor_id`, `type`, `payload`, `batch_id`,
  `ip_hash`, `processed_at`; UNIQUE(break_id, batch_id); append-only.
- **admin_events** — `actor_id`, `action`, `target_type`, `target_id`,
  `before`, `after`, `reason`. Includes logged reads of private content.
- **idempotency_keys**, **feature_flags**, **legal_docs**,
  **legal_acceptances** (`user_id`, `doc_id`, `accepted_at`, `ip_hash`).
- v1.1: **subscriptions** (UNIQUE user_id, Stripe ids, tier, status,
  current_period_end), **stripe_events** (id PK), **disputes**,
  **push_subscriptions**.

### 6.1 Indexes and constraints
`lines`: partial `(break_id) WHERE owner_id IS NULL`; `(owner_id)`;
`(reserved_for_mini_id)` partial; `(break_id, claimed_at) WHERE paid_at
IS NULL`. `breaks`: `(host_id) WHERE status IN ('open','filled',
'drawing')`. `messages (conversation_id, id)`. `notifications (user_id)
WHERE read_at IS NULL`. `notification_deliveries (next_attempt_at) WHERE
status='queued'`. `events (id) WHERE processed_at IS NULL`. `feedback`:
`from_id <> to_id`. `prizes`: UNIQUE natural key. Revoke UPDATE/DELETE
on `draws`, `draw_voids`, `draw_requests`, `events`, `admin_events`;
trigger-block mutation of `breaks.seed_commitment`, `line_count`,
`line_price_cents` after open.

## 7. Break lifecycle

States: `draft → open ⇄ filled → drawing → drawn`; `cancelled` from
draft/open/filled. `open → draft` does not exist.

**Open** (`breaks.open`): validate ≥1 rank-1 prize, `line_count ≥ 2`,
price > 0, host not banned/paused, tier limit (v1.1) under the user row
lock; generate secret + commitment; pre-create lines
(`generate_series`); freeze count and price; create thread; system
message. Payment instructions default from the host profile.

**Claim** (`lines.claim(numbers)`, `lines.claimRandom(n)`,
`lines.claimAllOpen()`): caller is a verified, non-banned member; lock
break (`status='open'`), then lines. Predicate: `owner_id IS NULL AND
reserved_for_mini_id IS NULL`. **Partial success is the default**
("got 4, 11; 7 was taken"). Random: `FOR UPDATE SKIP LOCKED LIMIT n`.
Enforce `max_lines_per_user`, host self-claims ≤ 10% of N, platform-wide
cap of 10 open unpaid claims per buyer. Sets `claimed_at`, `price_cents`.
Retry with lines already held by the caller counts as success. Event
`line.claimed {numbers, batch_id}`; IP hash on the event. Anonymous
visitors can start a claim; lines are held 10 minutes through sign-up.

**Sent** (`lines.markSent`): buyer sets `sent_at`; blocks the overdue
flag; notifies host.

**Paid** (`lines.markPaid(number, expectedOwner)`): host only;
conditional on `owner_id = expectedOwner AND paid_at IS NULL`; idempotent
if already paid by that owner; clears nothing else; then
`recomputeFill`. Bulk per buyer in the UI.

**Un-mark paid**: host, before `drawing`; logged; line stays with the
buyer; buyer notified with one-tap "I paid" report; `recomputeFill` may
move `filled → open`.

**Overdue**: `claimed_at + payment_window < now()` and unpaid and not
sent. Visible flag; never auto-released. Host `release` (reason
`overdue`), buyer `withdraw`, host `drop` all clear owner/claimed/sent/
price and emit `line.released {reason}`.

**Bonus** (`lines.addBonus(user)`): number > N, paid, `is_bonus`, ≤ 10%
of N, announced in thread.

**recomputeFill**: under the break lock, `filled ⇔ every line 1..N paid
∧ no line reserved-and-unowned`. Sets/clears `filled_at` (first fill
wins; `filled_at` is not reset on later re-fills).

**Cancel**: blocked while any mini referencing this break is not
drawn/cancelled, or while reserved lines / unpicked award spots exist;
cancelling a filled break requires a reason and pauses listing pending
admin review; releases all lines; buyers notified "refund comes from the
host"; buyers can tap "refund received".

**Relist**: only for undrawn breaks; clones the break (new price/count,
prizes copied), carries paid lines at their numbers (price snapshot
kept), notifies previous claimants, cancels the original with
`relisted_from_id`. Blocked while a mini references the break.

**Edits while open**: title/description/photos; prizes add-only; base
item locked once any line is paid.

## 8. Minis

Create from a parent page ("Fill open spots"): choose open lines across
one or more of the host's own **main** breaks, set lines × price
(suggested = Σ spots × parent price; shown as "raises $X for $Y of spots",
warn > 1.5×, no cap), ladder prefilled for two ranks; advanced builder
for multi-rank / multi-parent. Validation under one ordered lock of all
involved breaks: parents open, same host, kind main, ranks contiguous,
Σ spot_count per parent ≤ open lines minus lines pooled by other open
minis. Serial minis on one parent are allowed.

Open reserves the **specific chosen numbers** (`reserved_for_mini_id`)
with `FOR UPDATE ORDER BY number`; if any are no longer free the open
fails. Parent grid shows "in mini ↗"; progress bar counts them "spoken
for". While a mini is open the parent can't be cancelled or relisted;
item edits remain allowed. The host cannot claim lines in their own
mini. Mini cancel (before draw) un-reserves and releases; with paid lines
it needs a reason and counts on the profile. No mini relist in v1.

Draw as a main. Creates `awards` per rank and `award_spots` per
(award, parent). **Pick phase**, per parent, in rank order; consecutive
ranks by the same user merge into one turn; 12h deadline; winner may
"just assign me" (lowest reserved numbers); host may assign anyone any
time. `pickSpots` is idempotent (`UPDATE awards … WHERE picked_at IS
NULL`), assigns `owner = winner, paid_at = now(), price_cents = 0,
award_id`, then `recomputeFill(parent)`. Awarded lines are exempt from
caps and revenue stats.

Parent draw/cancel/relist is blocked while it has reserved lines or
unpicked award spots. Invariant (asserted in tests after every action):
for each (mini, parent) not cancelled, reserved-unowned lines = Σ
unpicked spot_count.

## 9. Draw

**Lock at open.** 32 random bytes → AES-256-GCM (env key, `key_id`,
`break_id` as AAD) in `break_secrets`; `seed_commitment =
sha256("breaks-commit-v1" ‖ secret)`, immutable, shown on the break page
and in every claim confirmation. Admins cannot read secrets before
reveal; ciphertext deleted after.

**Request.** Host taps "Run draw" (admin only on the host's written
request, shown on the result page). Transaction: lock break `WHERE
status='filled'`; insert `draw_requests` (one per break); set `status =
drawing`; `beacon_round = first drand quicknet round with time ≥
requested_at + 60s`. Entries are now hard-frozen; the request cannot be
withdrawn. This removes the host's ability to re-pick the beacon by
bouncing filled ⇄ open.

**Finalise** (second tap or cron once the round exists): lock break
`WHERE status='drawing'`; fetch beacon randomness (retry later if the
relay is unreachable; UI says so); entries = owned lines ordered by
number serialised as `uint16 number ‖ uuid owner` (no handles);
`seed = sha256("breaks-seed-v1" ‖ version ‖ secret ‖ beacon ‖ break_id ‖
sha256(entries))`; HMAC-SHA256 counter stream; Fisher–Yates with
rejection sampling; insert `draws`; create `awards` (per-line prizes by
default; `one_prize_per_person` skips to the next distinct person for
later ranks); `status = drawn`; event. Retry after a crash recomputes the
identical result. Crypto lives in one shared module (`@noble/hashes`,
`Uint8Array` only) used by server, browser verifier and a published
script, pinned by golden vectors.

**Record.** `draws` insert-only. Admin void → `draw_voids` with reason,
only before any award is shipped; a second draw on corrected entries is
allowed; both stay visible as a chain.

**Pages.** `/b/{id}/result`: winner + line, ranks 2..k, drawn-by/time,
one badge "Locked before opening · Checked ✓", entry list in ledger style
(number, handle, bonus tag), "Check it yourself" (recomputes in browser),
"Technical details" collapsed. Reveal animation client-side from
server-rendered data; scheduled draws (v1.1) animate in sync from the
timestamp. Share card + text in the community's idiom.

**Stalls.** Filled-not-drawn shows "Filled N days ago — not drawn" on the
break and host profile with escalating host nudges. No auto-draw. A
scheduled draw (v1.1) is a draw request the host files with a future
`requested_at`; it still counts as host-triggered.

## 10. Threads, DMs, notifications

**Thread** per break: lifecycle system messages only (locked, draw
requested, drawn, cancelled, prize added, line released, announcement
[v1.1]); claim/sent/paid shown collapsed. Readable by any signed-in
member; participants post; a non-participant may post one question while
the break is open. Posting closes 30 days after fulfilment.

**DM** per (break, buyer), host ↔ buyer; auto-opened for item awards;
cards: variant choice, ship-to (encrypted; rendered only in the DM),
shipped + tracking, received. One DM per buyer with one card per award.
`ship_to` kept until received or 90 days after shipped.

**Safety.** Role-driven Host badge; handles shown. Only host messages may
contain payment instructions; buyer links render as plain text; non-host
messages mentioning payment handles are flagged to the host. Addresses in
free text masked at render. Images from hosts and award winners only,
direct-to-Storage signed upload, `sharp` re-encode (EXIF stripped,
≤ 1600px, 5MB). Report → admin queue. Hide leaves a tombstone. Admin
reads of private content logged. Hidden/deleted content retained 180
days. Rate limit 10 messages/min.

**Inbox** across breaks sorted by unread. Polling: GET route with
`last_id`, 204 when empty, `no-store`, 5s open / 30s badge, paused when
hidden.

**Notifications.** Outbox from events; explicit recipient rules per
event type (a claim notifies host + buyer only). In-app always. Email in
two categories: **essential** (you won, your turn to pick, payment
confirmed, shipped, cancelled, report resolved) always sent with generic
subjects and details behind login; **updates** with one toggle and a
digest option (v1.1). Bounce/complaint webhook → suppression. Deliveries
claimed with `SKIP LOCKED`, backoff, dead-letter after 5 attempts.

## 11. Reputation

**Headline** (break page header + profile): breaks drawn (90d / all), %
of awards shipped with tracking, reports/disputes open · lost, distinct
buyers, member since, vouched by, payment handle last changed, "would buy
again X% of N" ("New host" under 5). Admin warned/suspended badge with
reason, date, appeal link.

**Feedback**: once per item award, opens at received or shipped + 21d,
locks after 7 days or the host's single reply. **Received** = buyer
confirmed, or tracking + 21d + no report. **Ship time** = median days
from `greatest(picked_at, expected_ship_at)` to shipped. **Cancellations**
split refunded (all paid buyers confirmed) vs unresolved.

**Buyer stats** (to hosts on claim): breaks, lines paid, overdue count,
no-shows, wins. v1.1 adds `payment_outcome` (on time requires host
confirmation inside the window) and contestable no-show marks.

**Reports (v1)**: any participant may report a break, message, user or
award with reason + images; admin resolves (note, badge, pause, ban);
outcomes affect **platform standing only** — the platform never
adjudicates money. v1.1 disputes add upheld / not upheld / withdrawn,
public resolution log, listing pause after 3 upheld in 90 days from
distinct invite subtrees.

**Recompute**: application effect on terminal events, full per-host
recompute into `host_stats`; nightly 90-day roll.

## 12. Accounts, invites, billing, admin

- **Sign-in**: email magic link (PKCE, 15-min TTL, "Continue"
  confirmation page). Facebook in v1.1 after App Review; auto-linking
  off; link from the account page while signed in.
- **Onboarding gate**: handle, display name, 18+ checkbox, ToS/Privacy
  acceptance (versioned); first-request upsert, no DB trigger.
- **Hosts**: invite code (128-bit, hashed, rate-limited redeem, 14-day,
  single use); admin unlimited; hosts earn 2/30 days after 1 drawn
  break; buyers with 5 paid completed lines may request; "vouched by"
  on host profiles; revoking a host pauses invitees pending review.
- **Tiers (v1.1)**: free = 6 open mains (minis, filled/drawing, relists
  excluded); Pro unlimited + scheduled draws + private analytics.
  Founding hosts Pro free 12 months; others 3 months after first drawn
  break. Stripe Checkout + Portal; `user_id` in subscription metadata;
  webhooks upsert from object status, signature + 5-min window +
  `stripe_events`; re-fetch before granting Pro; `invoice.paid`
  restores; downgrade never closes breaks; Stripe Tax; descriptor
  "Breaks host tools".
- **Account**: my lines (owed per host with payment handle), wins +
  shipping status, saved ship-to, prefs, linked methods, sign out
  everywhere (global revoke, 10-min JWTs), delete (anonymise, strip PII,
  keep ledger/draws, hard-delete auth row after 30 days; deferred while
  party to an open report).
- **Admin**: `requireAdmin()` per action; role as JWT claim; TOTP (AAL2)
  mandatory; env email allowlist; shorter sessions; `admin_events` for
  everything.
- **Hardening**: profile update field allowlist; CSP with nonces, HSTS,
  `frame-ancestors 'none'`; PII hashed/stripped from logs; secrets key
  versioned; backups stored apart from keys.

## 13. Pages

Public: `/` landing · `/breaks` feed (newest, filling fast, closing
soon; by host) · `/b/{id}` break (above the fold: photo, title, "7 of 12
open · $20/line", host + trust line, grid; condensed grid above ~30
lines; claim → confirm → sign-in → amount + Venmo/PayPal deep link + copy
handle + "leave the memo blank" + pinned Sent; OG image per state;
share-to-Facebook) · `/b/{id}/result` · `/h/{handle}` · legal.
Signed-in: `/me`, `/inbox`, `/host` (breaks by status, per-buyer
payments with one-tap Paid, overdue, fill open spots, run draw, mark
shipped), `/host/new` (defaults from last break), `/account`, `/admin`.

## 14. Errors and operations

Optimistic UI only for claims. Idempotent double-tap paths: claim, paid,
draw request/finalise, pick. Polling backoff with a stale indicator after
30s. Webhooks return 500 to trigger retries. Explicit UI states for
"beacon unavailable" and "secret unavailable". Sentry
(`sendDefaultPii: false`, `beforeSend` scrubber), structured logs with
request id. Forward-only migrations; documented restore drill. Feature
flags table. Daily admin view: filled-not-drawn, dead-letter count, open
reports.

## 15. Testing

- Domain tests per command on real Postgres (Supabase CLI locally and in
  CI with studio/storage/realtime disabled), vitest, transaction-per-test
  rollback; assert events rows inside the tx. Effects tested with
  injected fakes.
- Serial concurrency suite (TRUNCATE per test): parallel claims on the
  same lines, double draw request/finalise, claim vs mini open, pick vs
  cancel; invariants asserted by a SQL helper after every action.
- Crypto: golden vectors shared by server, browser verifier, published
  script; commitment-mismatch trigger test; crash-retry test.
- Stats: fixture host with ~8 breaks → golden JSON.
- E2E (Playwright, local server, env-gated test login): (1) buyer claims,
  marks sent, host marks paid, break fills, draw runs, result verifies;
  (2) mini from open spots through pick phase.
- CI: RLS lint (enabled everywhere, no permissive policies), anon-key
  read test, dependency audit, schema-dump drift check.

## 16. Open items (not blockers for the plan)

- One hour with a lawyer on raffle exposure and ToS wording before
  public launch.
- Facebook App Review timing (v1.1).
- Pro price point.
