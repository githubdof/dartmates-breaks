27:- Ruling: Task 13 `claim` action hashes the IP like the random/rest actions (plan text left pick-path ipHash undefined with a "keep it consistent" note) — spec §7 says "IP hash on the event" for claims generally — cost if wrong: one extra hash per claim, trivially reversible.
28:- Ruling: Task 1 scaffolding runs `create-next-app` in `$TMPDIR` and rsyncs in (per panel fix); if the sandbox blocks writing to `$TMPDIR`, the implementer may scaffold directly in-repo by temporarily moving `docs/ research/` aside and back — cost if wrong: a messy first commit, reversible.
33:Task 1: minor (deferred): @types/node ^20 vs vitest peer ^22 warning on install
34:Task 1: minor (deferred): inline eslint-disable in env.test.ts — prefer varsIgnorePattern "^_" in eslint config
35:Task 1: minor (deferred): DRAW_KEY_V1 base64 check is lenient (Buffer.from ignores invalid chars)
36:Task 1: minor (deferred): unused scaffold svgs in public/ with Next/Vercel branding
37:Task 1: minor (deferred): placeholder page dark-mode contrast
45:Task 2: Ruling: plan's trigger SQL under-covers spec §6 ("only voided_* may be written", events append-only, items add-only) — fix guards to compare every column incl. id/created_at/batch_id/ip_hash and reject break_id changes on items/prizes; also reject status moving back to draft (freeze bypass) — cost if wrong: stricter triggers that a later migration can relax.
46:Task 2: Ruling: amending the already-applied 0000_init.sql is allowed while Plan 1 is unmerged (no deployed DB; spec's forward-only rule applies from first deploy) — implementer must reset the local DB and re-apply — cost if wrong: none in production.
47:Task 2: minor (deferred): legal_acceptances has accepted_at not created_at (plan-mandated)
48:Task 2: minor (deferred): void transition does not require voided_by/void_reason alongside voided_at
49:Task 2: minor (deferred): untested guard paths (items guard, events guard, seed_commitment immutability, draws_active_uq, request delete block, done→pending)
50:Task 2: minor (deferred): schema.test.ts never closes the postgres connection (afterAll sql.end())
51:Task 2: minor (deferred): draws.request_id not asserted to belong to the same break
54:Task 2: minor (deferred): schema tests commit rows (by design) and freshRequest helper hard-codes a ZERO_SECRET commitment
59:Task 3: minor (deferred): version byte encoding not true uint32be in deriveSeed (guarded by version===1 in computeRanking)
60:Task 3: minor (deferred): serializeEntries doesn't assert unique line numbers (DB PK guarantees it)
61:Task 3: minor (deferred): rejection branch never exercised by vectors (bounds ≤13) — white-box test with injected stream would pin it
62:Task 3: minor (deferred): commitment test weak — add a frozen commitment vector shared with the DB trigger test
67:Task 4: minor (deferred): openBreakWithLines returns stale seedCommitment/openedAt (null) — use .returning(); Task 9 tests use b.secret/b.id only
68:Task 4: minor (deferred): rollback check counts whole users table; makeBreak status/kind typed as string
73:Task 5: minor (deferred): beacon.ts "+1" comment says the spec omits it (spec was corrected) — trim comment
74:Task 5: minor (deferred): roundAt(now) may name a round ~3s ahead → wasted relay calls near the boundary
75:Task 5: minor (deferred): bare `fetch` reference as default fetchFn (Illegal invocation on some runtimes); swallowed per-relay errors (add console.warn)
76:Task 5: minor (deferred): add a tampered-ciphertext test; BLS signature verification not implemented (spec: out of scope, track for final review)
81:Task 6: minor (deferred): appendEvent comment overstates "only events_batch_uq can conflict"; batchId with null breakId is never de-duplicated (callers must pass breakId); invalid-uuid ids raise 22P02 not NotFound — validate at the boundary (actions use zod)
86:Task 7: minor (deferred): savePaymentHandles inserts an empty profile when {} passed with no prior profile; replaces whole handles object (document); item names not validated; listOpenBreaks untested
91:Task 8: Ruling: add a per-user `pg_advisory_xact_lock(hashtext('user:'||caller.id))` in all three claim paths after lockBreak and before globalUnpaid; lock order is break → user → lines (Task 7 openBreak already does break → users row) — spec §7 cap must hold under concurrency — cost if wrong: slight serialization of one buyer's parallel claims.
92:Task 8: minor (deferred): same-batch retry that obtains new lines leaves no event (onConflictDoNothing) — consider fallback event without batchId
93:Task 8: minor (deferred): markPaid throws OwnerChanged for a nonexistent line (should be InvalidInput); markPaid/unmarkPaid skip assertOnboarded (banned host) — product decision for Plan 4
94:Task 8: minor (deferred): unpaidByBuyer handle typed non-null; globalUnpaid counts cancelled breaks (cancel must clear owners — Plan 2); recomputeFill assumes rows 1..N exist
96:Task 8: minor (deferred): markSent mixed request (own already-sent + someone else's line) is a silent no-op rather than NotAuthorized
102:Task 9: minor (deferred): beacon re-fetch branch untested (needs void flow); drawn early-return assumes an active draw exists (guard when void lands); any onboarded caller can trigger a relay fetch (rate-limit at the action layer); handleAtDraw "" fallback should fail loudly; voided chain lacks ids/attempt; assignAwards assumes contiguous ranks (document)
107:Task 10: minor (deferred): ten-buyer test name overstates what it checks; commit subject omits the cap race
110:Task 10: minor (deferred): cap test never mutation-verified against a removed lockUser (manual check for the human)
114:Task 11a: Ruling: admin promotion requires `email_confirmed_at`; `action()` rethrows Next control-flow errors via `unstable_rethrow`; repeat onboarding must not write legal_acceptances/event; middleware matcher excludes static assets; also bound PUBLIC regexes and add `server-only` imports — spec §12 (admin allowlist, audit-grade events) — cost if wrong: none (strictly safer).
115:Task 11a: minor (deferred): admin demotion is manual (document); login handler must validate `next` (Task 11b); cleared cookies lost on middleware redirect; getCaller upserts on every render (throttle lastSeenAt later); display-name control chars; action() leaves banned/onboarded checks to commands (document)
120:Task 11b: Ruling: the lint failure blocks `pnpm build` and therefore Task 16 — fix now via typed narrowing (no blanket eslint disables) in this fix round even though the files belong to Tasks 3/11a — cost if wrong: a few lines of test typing.
124:Task 11b: minor (deferred): sendMagicLink echoes raw Supabase error text (map to fixed messages); ⚠️ browser-only checks (PKCE cookie round-trip, OTP code in local template, emailRedirectTo with ?next=) — human to verify once with Mailpit
130:Task 12: minor (deferred): zod v4 generic messages lack field names; blank hours field → 0 instead of default 24; handles can't be cleared from the composer; price input min=1 vs schema positive
135:Task 13: minor (deferred): release action lacks .max(1100); IP hash unsalted (HMAC with server secret in Plan 4); host Release is N transactions and unconfirmed; SSR/hydration overdue-class mismatch at the deadline; draft breaks viewable by id; formatCents no thousands separator
141:Task 14: minor (deferred): voided note says "see technical details" but none rendered; draw time formatted in server locale; ownerId uuids present in RSC payload for Verify (by design, same as result.json)
146:Task 15: Ruling: finalisePendingDraws must isolate failures per break — catch any error per savepoint, record `failed: [{breakId, code}]`, log, continue, so the sweep commits its successes and never 500s on one bad row (spec §14 "cron is a sweeper"; §5 jobs idempotent) — cost if wrong: a failing break is surfaced in logs/response instead of as a 500.
147:Task 15: Ruling: concurrency setup gets an `afterAll` truncate + SYSTEM re-seed so the shared local DB is left clean — cost if wrong: none.
149:Task 15: minor (deferred): `pnpm test` leaves 2 committed pending draw_requests without secrets (Task 2 schema tests commit rows; sweep now reports them as failed) — make schema tests clean up or use withTx
151:Task 15: minor (deferred): sweep has no time budget while holding the job lock (4 relays × 4s per break could exceed maxDuration) — memoise beacon per round + 45s deadline before traffic
152:Task 15: minor (deferred): bearer guard compares string lengths not byte lengths (non-ASCII header → RangeError 500, no bypass); withJobLock/"locked" path untested
157:Task 16: minor (deferred): test-login secret compared with !== and sent in the query string (test-only); VERCEL_ENV guard only covers Vercel (deploy target is Vercel)
163:Task 17: Ruling: Node 22 is the floor (plan's "Node 20+" global constraint predates the Vitest 5 pin) — `.nvmrc` 22, CI `node-version-file`, README "Node 22.12+" — cost if wrong: none (22 is LTS).
166:Task 3: minor (deferred): repo-wide `pnpm lint` fails on `no-explicit-any` at src/crypto/draw.test.ts:22 (brief-mandated `as any`) — fix in final wave (type the extra-property entry or disable the rule for that line)

## Out-of-scope observations from the final re-review
- myLines (src/domain/lines/queries.ts) still counts sent-but-unpaid lines in owedCents; no UI caller yet — apply the unsent-only rule when the /me page lands (Plan 3).
- Email-template links carry no `next`; sign-in from email lands on the default path.
- Each tick logs 4 relay_failed warns while a round is not yet published — noise, consider debouncing.

## Manual checks before first deploy
- One real sign-in via Mailpit (link and 6-digit code) through the Continue page to onboarding.
- One real drand quicknet fetch from the deployed environment.
- Mutation-check the cross-break cap test: comment out lockUser in src/domain/lines/commands.ts and confirm tests/concurrency/claims.test.ts fails.
- Set IP_HASH_KEY, DRAW_KEY_V1, CRON_SECRET, ADMIN_EMAILS on Vercel; never set BEACON or E2E_SECRET there.
