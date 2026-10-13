# Dart Breaks platform — design spec

Date: 2026-10-13 (revised after spec panel)
Status: approved in conversation; written for review
Field notes: `research/facebook-dart-breaks.md`

## 1. Purpose

A phone-first web platform where hosts run **breaks** (an item split into
numbered lines at a price; buyers claim lines; when every line is paid a
random draw picks the winner), **minis** (a break whose prizes are spots
in another break) and **free draws** (price-zero giveaways for a host's
community). It replaces the Facebook-group workflow: hand-edited ledger
comments, screenshots, scattered scam warnings, and draw proofs that
random.org deletes after a month.

Built and operated by one engineer (the founder, a buyer in the
community). First users are the existing hosts and buyers of groups such
as *Dart Deals and Breaks*.

Success for v1: a handful of real hosts run real breaks end to end on the
platform and buyers prefer it to the Facebook post.

## 2. Non-negotiables

- The platform **never handles break money**. Buyers pay hosts directly
  (PayPal/Venmo). The platform records what the parties assert and never
  adjudicates money; moderation outcomes affect platform standing only.
- Trust comes from **computed stats + winner feedback**, not from escrow.
- **The host triggers every draw.** No automatic draws. A scheduled
  draw (v1.1) is a host-filed request with a future time.
- The draw is **in-house, committed before the break opens, mixed with a
  public beacon, recorded permanently, verifiable by anyone**.
- Product copy and billing are **gambling-neutral**: "group buy",
  "lines", "allocation", "host tools". Never "raffle", "lottery", "odds".
  Hosts carry legal responsibility for their breaks (ToS).
- US-only at launch, 18+ self-certified.
- Hosts are **invite-only**; buyers are free.
- Pro hosts pay a flat subscription (v1.1); the platform takes **no cut**.

## 3. Vocabulary

| Term | Meaning |
|---|---|
| Break (main) | Group buy of an item split into `line_count` lines at `line_price`. |
| Free draw | A break with `line_price = 0`, one line per user, claims auto-paid. No consideration. |
| Line / spot | One numbered entry, 1..N. A buyer may hold several. |
| Mini | A break whose prizes are spots in a **parent** main. |
| Ladder | Ordered prizes by rank: rank r → item, or (parent, spot_count). |
| Base item | The rank-1 item(s) present when the first line is paid. |
| Claim | Buyer takes a line; unpaid until the host confirms. |
| Sent | Buyer's assertion "I've paid". |
| Paid | Host's confirmation. Only this changes state. |
| Overdue | Claimed, not Sent, not Paid, past the payment window. Host releases. |
| Filled | Lines 1..N all paid and no reserved-unowned lines. |
| Drawing | Host has requested the draw; entries frozen; waiting for beacon. |
| Drawn | Draw recorded; awards created. |
| Award | One prize for one rank for one winner; carries fulfilment. |
| Fulfilment | All of a break's item awards are received (or auto-received). |
| Participant | A user who holds or has held a line in the break. |
| Onboarded | Signed in, handle + display name set, 18+ confirmed, ToS accepted. |
| Bonus line | Extra entry above N, free, host-granted, max(1, 10% of N). |
| Choice break | Several items at one rank; winner picks one. |
| Relist (v1.1) | Clone a draft/open/filled break at a new price/count carrying paid lines. |

## 4. Scope

### 4.0 Tracer bullet (first demoable path, ~weeks 1–5)
Schema + migrations + RLS backstop → magic-link auth + onboarding → host
opens a break → buyer claims (pick / random / take-the-rest) → Sent →
host marks Paid → break fills → host requests draw → beacon → result
page with "Check it yourself". Email is a console logger, stats show
"New host", admin is an env allowlist, no images, no DMs. Everything
else hangs off this path.

### v1 (target ≈ 3 months part-time)
- Magic-link auth (custom SMTP + OTP code), onboarding, roles member /
  host / admin, **admin-minted** invite codes.
- Breaks: open, pick / random / take-the-rest claims, Sent, Paid (bulk
  per buyer), un-mark Paid, overdue + release, withdraw, bonus lines,
  prizes add-only after first Paid, cancel (reason when filled).
- **Free draws**: price 0, one line per user, optional entry rule
  "bought from me in the last N days".
- Minis: **single parent, up to three ranks**, specific reserved
  numbers, pick phase with timeout auto-assign.
- Draw: commitment, draw request, drand beacon, deterministic shuffle,
  immutable record, result + verification page, share text, admin void
  with re-draw.
- Thread per break (lifecycle system messages, host announcements, host
  may close after draw), DM per (break, buyer) with ship-to / variant /
  shipped+tracking / received cards, single inbox, polling.
- Email: essential always; updates toggle. In-app notifications.
- Feedback: would-buy-again yes/no + comment per item award; host reply.
- Headline host stats; buyer stats on claim.
- Report-to-admin (replaces disputes in v1).
- Admin: users, hosts, invites, reports, break lookup, draw void;
  account deletion by runbook.
- Tests: domain on Postgres, concurrency suite, crypto vectors, 2 e2e.

### v1.1
Stripe + tiers (free = 6 open mains; Pro unlimited) + founding-host Pro
(12 mo) and new-host Pro (3 mo) · multi-parent minis + advanced ladder ·
relist · scheduled draws · disputes with resolution log and listing
pause · digests · Facebook login + admin "Verified Facebook host since"
badge · host-earned invites, casual-host requests, "vouched by" · host
follow · per-state OG images · anonymous claim hold through sign-up ·
admin TOTP · self-service deletion · `payment_outcome` stats, refund
tracking · moderators.

### v2
Priority windows, straight fill, numbered break IDs, private host
analytics, web push, search.

### Explicitly out
Mini-of-mini (parents are always mains) · cross-host parents · open DMs ·
wheels · escrow or any payment flow · native apps.

## 5. Architecture

**Stack.** Next.js (App Router, TypeScript) on Vercel Pro; Supabase Pro
(Postgres, Auth, Storage); Drizzle ORM from server code over the
transaction-mode pooler (`prepare: false`); RLS enabled on every table
with deny-all policies as a backstop (service-role key server-only; anon
key harmless); Resend (also as Supabase custom SMTP); Sentry; Stripe in
v1.1. No Supabase Realtime (poll + client-side animation). No web push.

**Shape: domain core + thin Next.js shell.**

```
src/domain/{breaks,lines,minis,draws,awards,conversations,feedback,invites}/
    commands.ts  queries.ts  rules.ts  *.test.ts
src/db/{schema.ts, migrations/, client.ts, rls.sql}
src/effects/{recipients.ts, system-messages.ts, notify.ts, email/, stats.ts}
src/auth/{session.ts, authz.ts}          # assertHostOf, assertParticipant, requireAdmin
src/crypto/{draw.ts, serialize.ts, beacon.ts, vectors.json}   # shared with browser verifier
src/jobs/tick.ts                          # one cron route; advisory-locked jobs
src/app/...                               # server actions = parse → authz → one command → revalidate
```

- A **command** is `(tx, caller, input) → result`. It never opens a
  transaction; the server action owns `db.transaction`, then drains the
  outbox after commit. Commands lock the `breaks` row first (status
  check), then lines. Multi-break commands lock all involved break rows
  in one `SELECT … FOR UPDATE ORDER BY id`.
- Every state change appends an `events` row in the same transaction;
  effects (system messages, notifications, stats) are derived from
  events idempotently (`events.processed_at`), in-request after commit
  and swept by the cron.
- Typed `DomainError`s (`LineTaken`, `NotOpen`, `NotYourTurn`, …) map to
  user messages; unknown errors go to Sentry with `break_id` and a
  request id.
- Idempotency: client generates a UUID per form mount; server stores it
  in `idempotency_keys(key, caller_id, result, expires_at)`.
- `BeaconSource` interface (`roundAt(time)`, `fetch(round)`) with the
  drand implementation and a deterministic fake for tests.
- Cron: `/api/tick` (bearer secret, `maxDuration 60`, every minute)
  runs, each under `pg_try_advisory_lock`: outbox sweep, deliveries,
  **draw finalisation** (requests whose beacon round exists), **pick
  timeouts**, stall nudges, `ship_to` purge, nightly stats roll.
  Fallback pinger: a GitHub Actions schedule hitting the same route.

## 6. Data model

Text + CHECK instead of PG enums; UUID ids; `created_at` everywhere;
UPDATE/DELETE revoked where noted. Indexes in §6.1.

- **users** — `id` (= auth uid), `handle` (unique on lower, NFKC-
  normalised, reserved list), `display_name`, `avatar_url`, `email`,
  `role` member|host|admin, `age_confirmed_at`, `banned_at`,
  `listing_paused_at`, `founding_host` bool, `name_changed_at`,
  `last_seen_at`. Handle and display name editable 30 days, then locked.
- **host_profiles** — `user_id`, `payment_handles` jsonb
  (`{venmo, paypal}`), `payment_handles_changed_at`, `bio`,
  `verified_fb_since` (v1.1).
- **host_invites** — `code_hash`, `created_by`, `used_by`, `expires_at`.
- **breaks** — `host_id`, `kind` main|mini|free, `title`, `description`,
  `line_count` (frozen after open), `line_price_cents` (frozen; 0 only
  for `free`), `allow_random_claims`, `payment_window_hours` (default
  24), `max_lines_per_user` (forced 1 for `free`), `entry_rule` jsonb
  (`free` only: `{bought_from_host_days: N}` or null), `payment_
  instructions`, `one_prize_per_person`, `mini_timeout_auto_assign`
  bool (default true), `thread_closed_at`, `status`
  draft|open|filled|drawing|drawn|cancelled, `seed_commitment`
  (immutable), `opened_at`, `filled_at` (first fill; never reset),
  `cancel_reason`, `relisted_from_id` (v1.1).
- **break_secrets** — `break_id` PK, `ciphertext`, `key_id`. Read only
  by the draw command; row deleted after reveal.
- **break_items** — `break_id`, `name`, `photo_paths[]`,
  `variant_schema` jsonb, `expected_ship_at`, `created_at`. Editable
  until the break's first `paid_at`; add-only after; never while
  drawn/cancelled (trigger).
- **prizes** — `break_id`, `rank`, `item_id` *or* (`parent_break_id`,
  `spot_count > 0`). Same rank + several items = choice set. Same
  mutability rule as items. UNIQUE on the natural key.
- **lines** — PK (`break_id`, `number`), `owner_id`, `claimed_at`,
  `sent_at`, `paid_at`, `price_cents` (snapshot), `reserved_for_mini_id`,
  `award_id`, `is_bonus`, `refund_confirmed_at`, `claim_batch_id`,
  `payment_outcome` (v1.1). Checks: `paid ⇒ owned`; `owned ⇔ claimed`;
  `reserved ⇒ unowned`; `award_id ⇒ price 0 ∧ paid`. Pre-created at
  open; bonus numbers > N.
- **draw_requests** — `break_id`, `attempt` (1..), `requested_by`,
  `requested_at`, `beacon_round`, `on_behalf_note` (admin), `status`
  pending|done. UNIQUE (`break_id`, `attempt`). Insert-only except the
  single `pending → done` transition set by finalise.
- **draws** — `id`, `break_id`, `request_id` UNIQUE, `secret`,
  `beacon_round`, `beacon_randomness`, `beacon_signature`, `seed`,
  `algorithm_version`, `entries_snapshot` jsonb (every owned line incl.
  bonus and award-assigned lines: `{number, owner_id, handle_at_draw,
  is_bonus}`), `ranking` jsonb, `result_hash`, `run_by`, `voided_at`,
  `voided_by`, `void_reason`, `created_at`. Only `voided_*` may be
  written after insert (trigger allows exactly that transition once);
  partial unique on `break_id WHERE voided_at IS NULL`; trigger asserts
  `sha256("breaks-commit-v1"‖secret) = breaks.seed_commitment`.
- **awards** — `draw_id`, `break_id`, `rank`, `winner_id`, `item_id`
  (null until chosen), `variant` jsonb, `pick_deadline`, `picked_at`
  (= `created_at` for item awards; set on pick for spot awards),
  `shipped_at`, `tracking`, `received_at`, `received_auto` bool.
- **award_spots** — `award_id`, `parent_break_id`, `spot_count`,
  `picked_at`.
- **ship_to** — `award_id`, encrypted structured address, `key_id`,
  `purge_after`.
- **conversations** — `break_id`, `kind` thread|dm, `buyer_id` (dm);
  partial unique `(break_id) WHERE kind='thread'` and unique
  `(break_id, buyer_id) WHERE kind='dm'`. **messages** —
  `conversation_id`, `author_id` (null = system), `kind`
  user|system|announcement|card, `body`, `card` jsonb, `image_path`,
  `deleted_at`, `hidden_at`. **conversation_reads** — `conversation_id`,
  `user_id`, `last_read_at`.
- **feedback** — `award_id` UNIQUE, `from_id`, `to_id`,
  `would_buy_again` bool, `comment`, `reply_text`, `replied_at`,
  `locked_at`.
- **reports** — `reporter_id`, `target_type` break|message|user|award,
  `target_id`, `reason`, `images[]`, `status` open|closed, `admin_note`.
- **host_stats** — per host: `breaks_drawn_90d`, `breaks_drawn_all`,
  `awards_with_tracking_pct`, `reports_open`, `distinct_buyers`,
  `would_buy_again_pct`, `would_buy_again_n`, `cancellations_unresolved`,
  `cancelled_after_filled`, `median_ship_days`, `computed_at`.
- **notifications** — `user_id`, `event_id`, `read_at`;
  **notification_deliveries** — `notification_id`, `channel`, `status`
  queued|sending|sent|failed|dead, `attempts`, `next_attempt_at`;
  **notification_prefs** — `user_id`, `updates_email` bool;
  **email_suppressions** — `email`, `reason`.
- **events** — `break_id`, `actor_id`, `type`, `payload`, `batch_id`,
  `ip_hash`, `processed_at`; UNIQUE(break_id, batch_id); append-only.
- **admin_events** — `actor_id`, `action`, `target_type`, `target_id`,
  `before`, `after`, `reason`. Includes logged reads of private content.
- **idempotency_keys**, **feature_flags**, **legal_docs**,
  **legal_acceptances** (`user_id`, `doc_id`, `accepted_at`, `ip_hash`).
- v1.1: **subscriptions**, **stripe_events**, **disputes**,
  **host_requests**, **follows**, **push_subscriptions**.

### 6.1 Indexes and constraints
`lines`: partial `(break_id) WHERE owner_id IS NULL`; `(owner_id)`;
`(reserved_for_mini_id)` partial; `(break_id, claimed_at) WHERE paid_at
IS NULL`. `breaks`: `(host_id) WHERE status IN ('open','filled',
'drawing')`. `messages (conversation_id, id)`. `notifications (user_id)
WHERE read_at IS NULL`. `notification_deliveries (next_attempt_at) WHERE
status='queued'`. `events (id) WHERE processed_at IS NULL`.
`draw_requests (beacon_round) WHERE status='pending'`. `feedback`:
`from_id <> to_id`. Revoke DELETE on `draw_requests`, `draws`; revoke
UPDATE/DELETE on `events`, `admin_events`; triggers restrict
`draw_requests` and `draws` updates to their single allowed transition;
trigger-block mutation of `breaks.seed_commitment`, `line_count`,
`line_price_cents` after open.

## 7. Break lifecycle

States: `draft → open ⇄ filled → drawing → drawn`; `drawn → drawing` on
admin void; `cancelled` from draft/open/filled. `open → draft` does not
exist.

**Open** (`breaks.open`): validate ≥1 rank-1 prize, `line_count ≥ 2`,
price > 0 (or `kind = free` with price 0 and `max_lines_per_user = 1`),
host not banned/paused; generate secret + commitment; pre-create lines;
freeze count and price; create thread; system message. Payment
instructions default from the host profile.

**Claim** (`lines.claim(numbers)`, `lines.claimRandom(n)`,
`lines.claimAllOpen()`): caller is onboarded and not banned; lock break
(`status='open'`), then lines. Predicate: `owner_id IS NULL AND
reserved_for_mini_id IS NULL`. **Partial success is the default** ("got
4, 11; 7 was taken"). Random: `FOR UPDATE SKIP LOCKED LIMIT n`. Enforce
`max_lines_per_user`, host self-claims ≤ 10% of N (0 for own minis and
free draws), platform-wide cap of **30 open unpaid lines** per buyer.
Free draws: `entry_rule` checked (buyer has a paid line in a drawn break
of this host within N days); claimed lines are set paid immediately.
Sets `claimed_at`, `price_cents`. Retry with lines already held by the
caller counts as success. Event `line.claimed {numbers, batch_id}`; IP
hash on the event.

**Sent** (`lines.markSent`): buyer sets `sent_at`; suppresses overdue;
notifies host.

**Paid** (`lines.markPaid(number, expectedOwner)`): host only;
conditional on `owner_id = expectedOwner AND paid_at IS NULL`; idempotent
if already paid by that owner; then `recomputeFill`. Bulk per buyer in
the UI.

**Un-mark paid**: host, only in `open|filled`; logged; line stays with
the buyer; buyer notified with one-tap "I paid" report; `recomputeFill`
may move `filled → open`.

**Overdue**: `claimed_at + payment_window < now()`, unpaid, not Sent.
Visible flag; never auto-released. Host `release` (reason `overdue`),
buyer `withdraw` (unpaid lines only, any status before `drawing`), host
`drop` all clear owner/claimed/sent/price and emit `line.released
{reason}`.

**Bonus** (`lines.addBonus(user)`): number > N, paid, `is_bonus`, at
most max(1, 10% of N), announced in thread. Not for free draws.

**recomputeFill**: under the break lock, `filled ⇔ every line 1..N paid
∧ no line reserved-and-unowned`. Sets `filled_at` only if null.

**Cancel** (`draft|open|filled`): blocked while any mini referencing this
break is not drawn/cancelled, or while reserved lines / unpicked award
spots exist; cancelling a **filled** break (main or mini) requires a
reason, counts as `cancelled_after_filled`, and flags the host for admin
review; releases all lines; buyers notified "refund comes from the
host"; each paid buyer may tap "refund received" (`refund_confirmed_at`).

**Edits while open**: title/description/photos; items and prizes
editable until the first `paid_at`, add-only after.

## 8. Minis

Create from a parent page ("Fill open spots"): choose open lines of
**one** of the host's own main breaks, set lines × price (suggested =
Σ spots × parent price; shown as "raises $X for $Y of spots", warn >
1.5×, no cap), ladder of up to three ranks `(rank → spot_count)`.
Validation under one ordered lock of mini + parent: parent open, same
host, kind main, ranks contiguous, Σ spot_count ≤ open lines minus lines
pooled by other open minis. Serial minis on one parent are allowed.
Multi-parent ladders are v1.1.

Open reserves the **specific chosen numbers** (`reserved_for_mini_id`)
with `FOR UPDATE ORDER BY number`; if any are no longer free the open
fails. Parent grid shows "in mini ↗"; progress bar counts them "spoken
for". While a mini is open the parent can't be cancelled; item edits
follow §7. The host cannot claim lines in their own mini. Mini cancel
(before `drawing`) un-reserves and releases; when filled it needs a
reason (§7).

Draw as a main. Creates `awards` per rank and `award_spots`. **Pick
phase** in rank order; consecutive ranks by the same user merge into one
turn; `pick_deadline = now() + 12h`; winner may "just assign me" (lowest
reserved numbers); host may assign anyone any time. **Timeout**: the
cron runs `minis.autoAssign` when `pick_deadline` passes and
`mini_timeout_auto_assign` is true (default); otherwise it notifies the
host daily. `pickSpots` is idempotent (`UPDATE awards … WHERE picked_at
IS NULL`), assigns `owner = winner, claimed_at = paid_at = now(),
price_cents = 0, award_id`, **clears `reserved_for_mini_id`**, sets
`award_spots.picked_at`, then `recomputeFill(parent)`. Awarded lines are
exempt from caps and revenue stats.

Parent draw request and cancel are blocked while it has reserved lines
or unpicked award spots. Invariant (asserted in tests after every
action): for each (mini, parent) not cancelled, reserved-unowned lines =
Σ unpicked spot_count.

## 9. Draw

**Lock at open.** 32 random bytes → AES-256-GCM (env key `DRAW_KEY_v<n>`,
`key_id`, `break_id` as AAD) in `break_secrets`; `seed_commitment =
sha256("breaks-commit-v1" ‖ secret)`, immutable, shown on the break page
and in every claim confirmation. Admins cannot read secrets before
reveal; ciphertext deleted after.

**Request** (`draws.request`). Host taps "Run draw" (admin only on the
host's written request, stored in `on_behalf_note` and shown on the
result page). Transaction: lock break `WHERE status='filled'`; insert
`draw_requests` (`attempt` = previous + 1); set `status = drawing`;
`beacon_round = ceil((requested_at + 60s − genesis) / period)` for drand
**quicknet** (period 3s, chain hash
`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`).
Entries are hard-frozen; the request cannot be withdrawn. This removes
the host's ability to re-pick the beacon by bouncing filled ⇄ open.

**Finalise** (`draws.finalise`, second tap or cron once the round
exists): lock break `WHERE status='drawing'`; fetch the round from
relays in order (`api.drand.sh`, `api2.drand.sh`, `api3.drand.sh`,
`drand.cloudflare.com`), store `randomness` and `signature`; retry later
if none respond (UI: "waiting for the public beacon"); entries = owned
lines (1..N, bonus, award-assigned) ordered by number serialised as
`uint16 number ‖ uuid owner`; `seed = sha256("breaks-seed-v1" ‖ version
‖ secret ‖ beacon_randomness ‖ break_id ‖ sha256(entries))`; HMAC-SHA256
counter stream; Fisher–Yates with rejection sampling; insert `draws`;
create `awards` (per-line prizes by default; `one_prize_per_person`
skips to the next distinct person for later ranks; item awards get
`picked_at = created_at`); `status = drawn`; event. Retry after a crash
recomputes the identical result. Crypto lives in one shared module
(`@noble/hashes`, `Uint8Array` only) used by server, browser verifier
and a published script, pinned by golden vectors.

**Verifier trust model.** The browser recomputes seed → ranking from the
published inputs (secret, beacon randomness, entries) and shows a link to
the drand round on a public relay so anyone can confirm the randomness
value. BLS verification of the beacon signature in the browser is not in
scope; the signature is stored for offline verification.

**Void** (`draws.void`, admin): only before any award is shipped and
before any award spot is picked; sets `voided_*` on the draw, removes
its awards, returns the break to **`filled`** with a system message
giving the reason. The host may then correct the ledger (un-mark/mark
paid, release — each logged), which may move the break to `open`, and
request again (`attempt` + 1, new beacon round). All draws stay visible
as a chain on the result page.

**Pages.** `/b/{id}/result`: winner + line, ranks 2..k, drawn-by/time,
one badge "Locked before opening · Checked ✓", entry list in ledger style
(number, handle, bonus tag), "Check it yourself", "Technical details"
collapsed, void chain if any. Reveal animation client-side from server-
rendered data. Share text in the community's idiom.

**Stalls.** Filled-not-drawn shows "Filled N days ago — not drawn" on
the break and host profile; host nudged at 24h, 72h, then weekly. No
auto-draw.

## 10. Threads, DMs, notifications

**Thread** per break: lifecycle system messages only (entries locked,
draw requested, drawn, cancelled, prize added, line released, void,
announcement); claim/sent/paid shown collapsed. Readable by any signed-in
member; participants post; a non-participant may post one question while
the break is open. Host may **close the thread** after the draw
(`thread_closed_at`; read-only, tombstone shown). Otherwise posting
closes 30 days after fulfilment.

**Announcement**: host message kind that notifies all participants
(option: unpaid only), max 3 per break per day.

**DM** per (break, buyer), host ↔ buyer; auto-opened for item awards;
cards: variant choice, ship-to (encrypted; rendered only in the DM),
shipped + tracking, received. One DM per buyer with one card per award.
`ship_to` kept until received or 90 days after shipped.

**Recipient rules** (effects/recipients.ts):

| Event | In-app | Essential email |
|---|---|---|
| line.claimed / line.sent | host | — |
| line.paid | buyer | buyer |
| line.released | buyer (+host if withdraw) | buyer if host-released |
| break.filled | host | host |
| draw.requested / draw.drawn | participants | winners only |
| award.your_turn | winner | winner |
| award.shipped / received | buyer / host | buyer |
| break.cancelled / voided | participants | participants |
| announcement | participants (filtered) | updates email |
| message in DM | counterpart | updates email |
| thread user message | @mentioned only | — |
| report.closed | reporter, target | reporter |

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

**Notifications.** Outbox from events per the table above. In-app
always. Email: **essential** always (generic subjects, details behind
login); **updates** with one toggle. Bounce/complaint webhook →
suppression. Deliveries claimed with `SKIP LOCKED`, backoff, dead-letter
after 5 attempts.

## 11. Reputation

**Headline** (break page header + profile): breaks drawn (90d / all), %
of item awards shipped with tracking, reports open, distinct buyers,
member since, payment handle last changed, "would buy again X% of N"
("New host" under 5). Admin warned/suspended badge with reason, date,
appeal link.

**Feedback**: once per item award, opens at received or shipped + 21d,
locks after 7 days or the host's single reply. **Received** = buyer
confirmed, or tracking + 21d + no open report on the award. **Ship
time** = median days from `greatest(picked_at, expected_ship_at)` to
shipped, item awards only, excluding unshipped awards younger than 21
days. **Cancellations** split refunded (all paid buyers confirmed) vs
unresolved.

**Buyer stats** (to hosts on claim): breaks, lines paid, overdue count,
released-by-host count, wins. v1.1 adds `payment_outcome` and
contestable no-show marks.

**Reports (v1)**: any onboarded user may report a break, message, user
or award with reason + images; admin closes with a note and may apply a
badge, pause or ban. Outcomes affect **platform standing only**. v1.1
disputes add upheld / not upheld / withdrawn, a public resolution log,
and listing pause after 3 upheld in 90 days.

**Recompute**: application effect on terminal events, full per-host
recompute into `host_stats`; nightly 90-day roll.

## 12. Accounts, invites, billing, admin

- **Sign-in**: email magic link via Supabase Auth with **custom SMTP
  through Resend** (SPF/DKIM/DMARC from day one), PKCE, 15-min TTL, and
  a 6-digit OTP in the same email as a fallback for link-prefetching
  scanners; "Continue" confirmation page before token exchange. Facebook
  in v1.1 after App Review; auto-linking off.
- **Onboarding gate**: handle, display name, 18+ checkbox, ToS/Privacy
  acceptance (versioned); first-request upsert, no DB trigger.
- **Hosts (v1)**: admin-minted invite codes (128-bit, hashed,
  rate-limited redeem, 14-day, single use). Revoking a host cancels
  their open breaks with the standard message. v1.1: host-earned codes,
  casual-host requests, "vouched by".
- **Tiers (v1.1)**: free = 6 open mains (minis, free draws,
  filled/drawing, relists excluded); Pro unlimited + scheduled draws +
  private analytics. Founding hosts Pro free 12 months; others 3 months
  after first drawn break. Stripe Checkout + Portal; `user_id` in
  subscription metadata; webhooks upsert from object status, signature +
  5-min window + `stripe_events`; re-fetch before granting Pro;
  `invoice.paid` restores; downgrade never closes breaks; Stripe Tax;
  descriptor "Breaks host tools".
- **Account**: my lines (owed per host with payment handle), wins +
  shipping status, saved ship-to, prefs, sign out everywhere (global
  revoke, 10-min JWTs). Deletion in v1 is an admin runbook: anonymise,
  strip PII, keep ledger/draws, hard-delete auth row after 30 days;
  deferred while party to an open report.
- **Keys**: `DRAW_KEY_v<n>` and `SHIP_KEY_v<n>` in env; rows carry
  `key_id`; rotation = add new key, re-encrypt in a job, retire old;
  backups stored apart from keys.
- **Admin (v1)**: `requireAdmin()` per action; role as JWT claim via
  auth hook; admin emails in an env allowlist (TOTP in v1.1); shorter
  sessions; `admin_events` for everything.
- **Hardening**: profile update field allowlist; CSP with nonces, HSTS,
  `frame-ancestors 'none'`; PII hashed/stripped from logs.

## 13. Pages

Public: `/` landing · `/breaks` feed (sorts: *newest* = `opened_at`
desc; *filling fast* = paid lines in the last 24h desc; *closing soon* =
fewest open lines first; filter by host) · `/b/{id}` break (above the
fold: photo, title, "7 of 12 open · $20/line", host + trust line, grid;
condensed grid above ~30 lines; claim → sign in if needed → confirm →
amount + deep links `venmo://paycharge?txn=pay&recipients=<handle>&
amount=<n>&note=` (empty note) and `https://paypal.me/<handle>/<n>` +
copy handle + "leave the memo blank" + pinned Sent; share text) ·
`/b/{id}/result` · `/h/{handle}` · legal.
Signed-in: `/me`, `/inbox`, `/host` (breaks by status, per-buyer
payments with one-tap Paid, overdue, fill open spots, run draw, mark
shipped), `/host/new` (defaults from last break), `/account`, `/admin`.

## 14. Errors and operations

Optimistic UI only for claims. Idempotent double-tap paths: claim, paid,
draw request/finalise, pick. Polling backoff with a stale indicator after
30s. Explicit UI states for "waiting for the public beacon" and "secret
unavailable". Sentry (`sendDefaultPii: false`, `beforeSend` scrubber),
structured logs with request id. Forward-only migrations; documented
restore drill. Feature flags table. Daily admin view: filled-not-drawn,
dead-letter count, open reports.

## 15. Testing

- Domain tests per command on real Postgres, vitest, transaction-per-
  test rollback; assert events rows inside the tx. Effects tested with
  injected fakes; beacon via the fake `BeaconSource`.
- Serial concurrency suite (TRUNCATE per test): parallel claims on the
  same lines, double draw request/finalise, claim vs mini open, pick vs
  cancel; invariants asserted by a SQL helper after every action.
- Crypto: golden vectors shared by server, browser verifier, published
  script; commitment-mismatch trigger test; crash-retry test.
- Stats: fixture host with ~8 breaks → golden JSON.
- E2E (Playwright, local `next start`, `/test/login` route enabled only
  when `E2E_SECRET` is set and excluded from production builds):
  (1) buyer claims, marks sent, host marks paid, break fills, draw
  request + finalise with fake beacon, result verifies; (2) mini from
  open spots through pick phase.
- CI Postgres: Supabase CLI locally; in CI a `postgres:16` service with
  migrations applied by psql and a stub `auth` schema (`auth.users`,
  `auth.uid()`), so RLS SQL runs unchanged.
- CI checks: RLS lint (enabled everywhere, no permissive policies),
  anon-key read test, dependency audit, schema-dump drift check.

## 16. Open items (not blockers for the plan)

- One hour with a lawyer on raffle exposure and ToS wording before
  public launch; free draws are the cleanest headline feature.
- Facebook App Review timing (v1.1).
- Pro price point.
- Revisit specific-number vs count-based mini reservations if hosts
  find reserved numbers get in the way of direct sales.
