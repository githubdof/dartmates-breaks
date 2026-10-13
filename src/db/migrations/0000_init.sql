CREATE TABLE "awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"break_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"winner_id" uuid NOT NULL,
	"item_id" uuid,
	"variant" jsonb,
	"pick_deadline" timestamp with time zone,
	"picked_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"tracking" text,
	"received_at" timestamp with time zone,
	"received_auto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid NOT NULL,
	"name" text NOT NULL,
	"photo_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant_schema" jsonb,
	"expected_ship_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_secrets" (
	"break_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"kind" text DEFAULT 'main' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"line_count" integer NOT NULL,
	"line_price_cents" integer NOT NULL,
	"allow_random_claims" boolean DEFAULT true NOT NULL,
	"payment_window_hours" integer DEFAULT 24 NOT NULL,
	"max_lines_per_user" integer,
	"entry_rule" jsonb,
	"payment_instructions" text DEFAULT '' NOT NULL,
	"one_prize_per_person" boolean DEFAULT false NOT NULL,
	"mini_timeout_auto_assign" boolean DEFAULT true NOT NULL,
	"thread_closed_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"seed_commitment" text,
	"opened_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancel_reason" text,
	"relisted_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breaks_kind_chk" CHECK ("breaks"."kind" in ('main','mini','free')),
	CONSTRAINT "breaks_status_chk" CHECK ("breaks"."status" in ('draft','open','filled','drawing','drawn','cancelled')),
	CONSTRAINT "breaks_price_chk" CHECK (("breaks"."kind" = 'free' and "breaks"."line_price_cents" = 0) or ("breaks"."kind" <> 'free' and "breaks"."line_price_cents" > 0)),
	CONSTRAINT "breaks_count_chk" CHECK ("breaks"."line_count" >= 2)
);
--> statement-breakpoint
CREATE TABLE "draw_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beacon_round" integer NOT NULL,
	"on_behalf_note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_requests_status_chk" CHECK ("draw_requests"."status" in ('pending','done'))
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"beacon_round" integer NOT NULL,
	"beacon_randomness" text NOT NULL,
	"beacon_signature" text NOT NULL,
	"seed" text NOT NULL,
	"algorithm_version" integer NOT NULL,
	"entries_snapshot" jsonb NOT NULL,
	"ranking" jsonb NOT NULL,
	"result_hash" text NOT NULL,
	"run_by" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draws_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"batch_id" uuid,
	"ip_hash" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payment_handles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_handles_changed_at" timestamp with time zone,
	"bio" text,
	"verified_fb_since" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" uuid PRIMARY KEY NOT NULL,
	"caller_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"doc_kind" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"break_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"owner_id" uuid,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"price_cents" integer,
	"reserved_for_mini_id" uuid,
	"award_id" uuid,
	"is_bonus" boolean DEFAULT false NOT NULL,
	"refund_confirmed_at" timestamp with time zone,
	"claim_batch_id" uuid,
	"payment_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lines_break_id_number_pk" PRIMARY KEY("break_id","number"),
	CONSTRAINT "lines_payment_outcome_chk" CHECK ("lines"."payment_outcome" is null or "lines"."payment_outcome" in ('on_time','late','no_show','released')),
	CONSTRAINT "lines_paid_owned_chk" CHECK ("lines"."paid_at" is null or "lines"."owner_id" is not null),
	CONSTRAINT "lines_owned_claimed_chk" CHECK (("lines"."owner_id" is null) = ("lines"."claimed_at" is null)),
	CONSTRAINT "lines_reserved_unowned_chk" CHECK ("lines"."reserved_for_mini_id" is null or "lines"."owner_id" is null),
	CONSTRAINT "lines_award_paid_chk" CHECK ("lines"."award_id" is null or ("lines"."price_cents" = 0 and "lines"."paid_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"item_id" uuid,
	"parent_break_id" uuid,
	"spot_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prizes_shape_chk" CHECK (("prizes"."item_id" is not null and "prizes"."parent_break_id" is null and "prizes"."spot_count" is null) or ("prizes"."item_id" is null and "prizes"."parent_break_id" is not null and "prizes"."spot_count" > 0))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"handle" text,
	"display_name" text,
	"avatar_url" text,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"banned_at" timestamp with time zone,
	"listing_paused_at" timestamp with time zone,
	"founding_host" boolean DEFAULT false NOT NULL,
	"name_changed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_chk" CHECK ("users"."role" in ('member','host','admin'))
);
--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_item_id_break_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."break_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_items" ADD CONSTRAINT "break_items_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_secrets" ADD CONSTRAINT "break_secrets_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draw_requests" ADD CONSTRAINT "draw_requests_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draw_requests" ADD CONSTRAINT "draw_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_request_id_draw_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."draw_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_reserved_for_mini_id_breaks_id_fk" FOREIGN KEY ("reserved_for_mini_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_item_id_break_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."break_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_parent_break_id_breaks_id_fk" FOREIGN KEY ("parent_break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "awards_break_idx" ON "awards" USING btree ("break_id");--> statement-breakpoint
CREATE INDEX "breaks_host_active_idx" ON "breaks" USING btree ("host_id") WHERE "breaks"."status" in ('open','filled','drawing');--> statement-breakpoint
CREATE UNIQUE INDEX "draw_requests_attempt_uq" ON "draw_requests" USING btree ("break_id","attempt");--> statement-breakpoint
CREATE INDEX "draw_requests_pending_idx" ON "draw_requests" USING btree ("beacon_round") WHERE "draw_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "draws_active_uq" ON "draws" USING btree ("break_id") WHERE "draws"."voided_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "events_batch_uq" ON "events" USING btree ("break_id","batch_id") WHERE "events"."batch_id" is not null;--> statement-breakpoint
CREATE INDEX "events_unprocessed_idx" ON "events" USING btree ("id") WHERE "events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "lines_open_idx" ON "lines" USING btree ("break_id") WHERE "lines"."owner_id" is null;--> statement-breakpoint
CREATE INDEX "lines_owner_idx" ON "lines" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lines_unpaid_idx" ON "lines" USING btree ("break_id","claimed_at") WHERE "lines"."paid_at" is null;--> statement-breakpoint
CREATE INDEX "lines_reserved_idx" ON "lines" USING btree ("reserved_for_mini_id") WHERE "lines"."reserved_for_mini_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prizes_item_uq" ON "prizes" USING btree ("break_id","rank","item_id") WHERE "prizes"."item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prizes_parent_uq" ON "prizes" USING btree ("break_id","rank","parent_break_id") WHERE "prizes"."parent_break_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_idx" ON "users" USING btree (lower("handle"));
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
-- Append-only tables refuse deletes outright (a rule would silently swallow them).
create or replace function forbid_delete() returns trigger language plpgsql as $$
begin
  raise exception '% rows cannot be deleted', tg_table_name using errcode = 'check_violation';
end $$;
--> statement-breakpoint
-- draws: insert-only except setting voided_at/voided_by/void_reason once.
create or replace function draws_update_guard() returns trigger language plpgsql as $$
begin
  if old.voided_at is not null then
    raise exception 'voided draws are immutable' using errcode = 'check_violation';
  end if;
  if new.voided_at is null
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
  return new;
end $$;
--> statement-breakpoint
create trigger draws_update before update on draws for each row execute function draws_update_guard();
--> statement-breakpoint
create trigger draws_no_delete before delete on draws for each row execute function forbid_delete();
--> statement-breakpoint
-- draws: the revealed secret must match the commitment made at open (built-in sha256(), no extension needed).
create or replace function draws_commitment_guard() returns trigger language plpgsql as $$
declare c text;
begin
  select seed_commitment into c from breaks where id = new.break_id;
  if c is null or c <> encode(sha256('breaks-commit-v1'::bytea || decode(new.secret, 'base64')), 'hex') then
    raise exception 'secret does not match seed_commitment' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger draws_commitment before insert on draws for each row execute function draws_commitment_guard();
--> statement-breakpoint
-- draw_requests: pending -> done only; every other column is frozen.
create or replace function draw_requests_update_guard() returns trigger language plpgsql as $$
begin
  if not (old.status = 'pending' and new.status = 'done')
     or new.break_id is distinct from old.break_id
     or new.attempt is distinct from old.attempt
     or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at
     or new.beacon_round is distinct from old.beacon_round
     or new.on_behalf_note is distinct from old.on_behalf_note then
    raise exception 'draw_requests may only move pending -> done' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger draw_requests_update before update on draw_requests for each row execute function draw_requests_update_guard();
--> statement-breakpoint
create trigger draw_requests_no_delete before delete on draw_requests for each row execute function forbid_delete();
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
create trigger events_no_delete before delete on events for each row execute function forbid_delete();
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
-- SYSTEM caller (cron finalise): draws.run_by and events.actor_id reference users, so the row must exist.
insert into users (id, email, role, handle, display_name, age_confirmed_at)
values ('00000000-0000-4000-8000-000000000000', 'system@breaks.local', 'admin', 'system', 'System', now())
on conflict (id) do nothing;
--> statement-breakpoint
-- Deny-all RLS backstop. The app connects as the `postgres` role from DATABASE_URL, which has BYPASSRLS.
-- The anon/authenticated roles get no policies, so a leaked anon key reads nothing.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
