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
  /** Set by the claim commands the first time any line is claimed; never cleared (photos spec decision 12). */
  firstClaimedAt: timestamp("first_claimed_at", { withTimezone: true }),
  /** The latest photo change that counts (photos spec §6) and its sentence; set together, only after a first claim. */
  photosUpdatedAt: timestamp("photos_updated_at", { withTimezone: true }),
  photosUpdatedNote: text("photos_updated_note"),
  /** Delete draft (photos spec §9): the row stays because its events reference it; set once, drafts only. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  check("breaks_kind_chk", sql`${t.kind} in ('main','mini','free')`),
  check("breaks_status_chk", sql`${t.status} in ('draft','open','filled','drawing','drawn','cancelled')`),
  check("breaks_price_chk", sql`(${t.kind} = 'free' and ${t.linePriceCents} = 0) or (${t.kind} <> 'free' and ${t.linePriceCents} > 0)`),
  check("breaks_count_chk", sql`${t.lineCount} >= 2`),
  check("breaks_claim_mode_chk", sql`${t.claimMode} in ('pick_or_random','pick_only','straight')`),
  check("breaks_photos_note_chk", sql`(${t.photosUpdatedAt} is null) = (${t.photosUpdatedNote} is null) and char_length(${t.photosUpdatedNote}) between 1 and 200`),
  check("breaks_photos_note_claimed_chk", sql`${t.photosUpdatedAt} is null or ${t.firstClaimedAt} is not null`),
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
  variantSchema: jsonb("variant_schema").$type<Record<string, string[]> | null>(),
  condition: text("condition").$type<"new_in_box" | "new_opened" | "used">(),
  expectedShipAt: timestamp("expected_ship_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [check("break_items_condition_chk", sql`${t.condition} in ('new_in_box','new_opened','used')`)]);

export const prizes = pgTable("prizes", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  rank: integer("rank").notNull(),
  itemId: uuid("item_id").references(() => breakItems.id),
  parentBreakId: uuid("parent_break_id").references(() => breaks.id),
  spotCount: integer("spot_count"),
  /** The stable key photo tags point at (photos spec §4.1); made by the composer, kept across draft saves. */
  slotKey: uuid("slot_key").notNull().defaultRandom(),
  createdAt: createdAt(),
}, (t) => [
  check("prizes_shape_chk", sql`(${t.itemId} is not null and ${t.parentBreakId} is null and ${t.spotCount} is null) or (${t.itemId} is null and ${t.parentBreakId} is not null and ${t.spotCount} > 0)`),
  uniqueIndex("prizes_item_uq").on(t.breakId, t.rank, t.itemId).where(sql`${t.itemId} is not null`),
  uniqueIndex("prizes_parent_uq").on(t.breakId, t.rank, t.parentBreakId).where(sql`${t.parentBreakId} is not null`),
  uniqueIndex("prizes_slot_uq").on(t.breakId, t.slotKey),
]);

/** Item photos (photos spec §4). Changed only by the photo commands, under the break row lock; see migration 0005's guards. */
export const breakPhotos = pgTable("break_photos", {
  id: id(),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  position: integer("position").notNull(), // 0 = the lead; live rows run 0..n-1
  prizeSlot: uuid("prize_slot"), // prizes.slot_key of the same break, or null for "the lot" (hand-written FK in 0005)
  path: text("path"), // `${breakId}/${22 url-safe chars}`, the variants' prefix; null once every copy is gone
  bucket: text("bucket").$type<"photos-draft" | "photos" | "photo-archive">().notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("break_photos_live_position_uq").on(t.breakId, t.position).where(sql`${t.removedAt} is null and ${t.hiddenAt} is null`),
  index("break_photos_break_idx").on(t.breakId),
  check("break_photos_bucket_chk", sql`${t.bucket} in ('photos-draft','photos','photo-archive')`),
  check("break_photos_position_chk", sql`${t.position} between -8 and 7`),
  check("break_photos_alt_chk", sql`char_length(${t.alt}) between 1 and 120`),
  check("break_photos_size_chk", sql`${t.width} > 0 and ${t.height} > 0`),
  check("break_photos_path_chk", sql`${t.path} is null or ${t.path} ~ ('^' || ${t.breakId}::text || '/[A-Za-z0-9_-]{22}$')`),
  // Panel ruling 26: a null path (every copy gone) only in photo-archive, on any row; retention of a cancelled break
  // archives its live rows too, so live queries filter `path is not null and bucket <> 'photo-archive'`.
  check("break_photos_gone_chk", sql`${t.path} is not null or ${t.bucket} = 'photo-archive'`),
]);

/** The upload ticket (photos spec §4, §5.2): issued with the signed upload URL, consumed once by finalise. */
export const photoUploads = pgTable("photo_uploads", {
  id: id(),
  hostId: uuid("host_id").notNull().references(() => users.id),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  incomingName: text("incoming_name").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("photo_uploads_open_idx").on(t.hostId, t.breakId).where(sql`${t.consumedAt} is null`)]);

/** When a holder last saw the break's photo notice (photos spec §4, §6); written by a client-fired action, never during a render. */
export const photoNoticesSeen = pgTable("photo_notices_seen", {
  userId: uuid("user_id").notNull().references(() => users.id),
  breakId: uuid("break_id").notNull().references(() => breaks.id),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.breakId] })]);

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
  /** When verifyInputs passed on the recorded inputs (Mosaic §9 "draws verified"); set once, never on a voided draw. */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
