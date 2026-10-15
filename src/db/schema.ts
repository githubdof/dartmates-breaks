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
  /** The name on the buyer's Venmo or PayPal, when it differs; hosts match payments by it. Hosts and the owner only. */
  paymentName: text("payment_name"),
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
  check("users_payment_name_chk", sql`char_length(${t.paymentName}) <= 60`),
]);

export const hostProfiles = pgTable("host_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  paymentHandles: jsonb("payment_handles").$type<{ venmo?: string; paypal?: string }>().notNull().default({}),
  paymentHandlesChangedAt: timestamp("payment_handles_changed_at", { withTimezone: true }),
  bio: text("bio"),
  verifiedFbSince: integer("verified_fb_since"), // nullable now; avoids a later migration
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
  // Superseded by claim_mode (migration 0001). createDraft keeps it equal to claim_mode = 'pick_or_random'; drop it in a later migration.
  allowRandomClaims: boolean("allow_random_claims").notNull().default(true),
  claimMode: text("claim_mode").$type<"pick_or_random" | "pick_only" | "straight">().notNull().default("pick_or_random"),
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
  relistedFromId: uuid("relisted_from_id"), // nullable now; relist is v1.1
  createdAt: createdAt(),
}, (t) => [
  check("breaks_kind_chk", sql`${t.kind} in ('main','mini','free')`),
  check("breaks_status_chk", sql`${t.status} in ('draft','open','filled','drawing','drawn','cancelled')`),
  check("breaks_price_chk", sql`(${t.kind} = 'free' and ${t.linePriceCents} = 0) or (${t.kind} <> 'free' and ${t.linePriceCents} > 0)`),
  check("breaks_count_chk", sql`${t.lineCount} >= 2`),
  check("breaks_claim_mode_chk", sql`${t.claimMode} in ('pick_or_random','pick_only','straight')`),
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
  paymentOutcome: text("payment_outcome"), // nullable now; written by later plans
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.breakId, t.number] }),
  check("lines_payment_outcome_chk", sql`${t.paymentOutcome} is null or ${t.paymentOutcome} in ('on_time','late','no_show','released')`),
  check("lines_paid_owned_chk", sql`${t.paidAt} is null or ${t.ownerId} is not null`),
  check("lines_owned_claimed_chk", sql`(${t.ownerId} is null) = (${t.claimedAt} is null)`),
  check("lines_reserved_unowned_chk", sql`${t.reservedForMiniId} is null or ${t.ownerId} is null`),
  check("lines_award_paid_chk", sql`${t.awardId} is null or (${t.priceCents} = 0 and ${t.paidAt} is not null)`),
  index("lines_open_idx").on(t.breakId).where(sql`${t.ownerId} is null`),
  index("lines_owner_idx").on(t.ownerId),
  index("lines_unpaid_idx").on(t.breakId, t.claimedAt).where(sql`${t.paidAt} is null`),
  index("lines_reserved_idx").on(t.reservedForMiniId).where(sql`${t.reservedForMiniId} is not null`),
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
  createdAt: createdAt(),
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

export const legalAcceptances = pgTable("legal_acceptances", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  docKind: text("doc_kind").notNull(), // e.g. 'terms'
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: uuid("key").primaryKey(),
  callerId: uuid("caller_id").notNull(),
  result: jsonb("result").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Fixed-window counters for rate limits (handle checks). Buckets carry an IP hash or a user id, never a raw address. */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  bucket: text("bucket").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("rate_limits_bucket_window_uq").on(t.bucket, t.windowStart)]);
