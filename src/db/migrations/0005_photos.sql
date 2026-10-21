CREATE TABLE "break_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"break_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"prize_slot" uuid,
	"path" text,
	"bucket" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "break_photos_bucket_chk" CHECK ("break_photos"."bucket" in ('photos-draft','photos','photo-archive')),
	CONSTRAINT "break_photos_position_chk" CHECK ("break_photos"."position" between -8 and 7),
	CONSTRAINT "break_photos_alt_chk" CHECK (char_length("break_photos"."alt") between 1 and 120),
	CONSTRAINT "break_photos_size_chk" CHECK ("break_photos"."width" > 0 and "break_photos"."height" > 0),
	CONSTRAINT "break_photos_path_chk" CHECK ("break_photos"."path" is null or "break_photos"."path" ~ ('^' || "break_photos"."break_id"::text || '/[A-Za-z0-9_-]{22}$')),
	CONSTRAINT "break_photos_gone_chk" CHECK ("break_photos"."path" is not null or "break_photos"."bucket" = 'photo-archive')
);
--> statement-breakpoint
CREATE TABLE "photo_notices_seen" (
	"user_id" uuid NOT NULL,
	"break_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "photo_notices_seen_user_id_break_id_pk" PRIMARY KEY("user_id","break_id")
);
--> statement-breakpoint
CREATE TABLE "photo_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"break_id" uuid NOT NULL,
	"incoming_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_uploads_incoming_name_unique" UNIQUE("incoming_name")
);
--> statement-breakpoint
ALTER TABLE "break_items" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "first_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "photos_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "photos_updated_note" text;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "slot_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "break_photos" ADD CONSTRAINT "break_photos_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_photos" ADD CONSTRAINT "break_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_notices_seen" ADD CONSTRAINT "photo_notices_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_notices_seen" ADD CONSTRAINT "photo_notices_seen_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "break_photos_live_position_uq" ON "break_photos" USING btree ("break_id","position") WHERE "break_photos"."removed_at" is null and "break_photos"."hidden_at" is null;--> statement-breakpoint
CREATE INDEX "break_photos_break_idx" ON "break_photos" USING btree ("break_id");--> statement-breakpoint
CREATE INDEX "photo_uploads_open_idx" ON "photo_uploads" USING btree ("host_id","break_id") WHERE "photo_uploads"."consumed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "prizes_slot_uq" ON "prizes" USING btree ("break_id","slot_key");--> statement-breakpoint
ALTER TABLE "break_items" ADD CONSTRAINT "break_items_condition_chk" CHECK ("break_items"."condition" in ('new_in_box','new_opened','used'));--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_photos_note_chk" CHECK (("breaks"."photos_updated_at" is null) = ("breaks"."photos_updated_note" is null) and char_length("breaks"."photos_updated_note") between 1 and 200);--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_photos_note_claimed_chk" CHECK ("breaks"."photos_updated_at" is null or "breaks"."first_claimed_at" is not null);--> statement-breakpoint
ALTER TABLE "break_items" DROP COLUMN "photo_paths";

--> statement-breakpoint
-- A tag names a prize slot of the same break; deleting that prize (a draft re-save that drops it) clears the tag
-- (photos spec §4.1). Hand-written: drizzle-kit cannot express ON DELETE SET NULL (column) on a composite key.
alter table break_photos add constraint break_photos_prize_slot_fk foreign key (break_id, prize_slot)
  references prizes (break_id, slot_key) on delete set null (prize_slot);
--> statement-breakpoint
-- Photo rows change only while the break is draft, open or filled (photos spec §4 "Status guard"); from the draw
-- request on, and once cancelled, they are frozen (§6), except what a moderation transaction may do (§10, see
-- src/db/photo-moderation.ts). The break is read FOR SHARE so a concurrent draw request and this change serialise.
create or replace function break_photos_guard() returns trigger language plpgsql as $$
declare
  b_id uuid := case when tg_op = 'INSERT' then new.break_id else old.break_id end;
  b_status text;
  live int;
  moderating boolean := coalesce(current_setting('breaks.photo_moderation', true), '') = 'on';
begin
  select status into b_status from breaks where id = b_id for share;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.break_id is distinct from old.break_id
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.width is distinct from old.width or new.height is distinct from old.height then
      raise exception 'a photo''s id, break, author, size and creation time are fixed' using errcode = 'check_violation';
    end if;
    if (old.removed_at is not null and new.removed_at is distinct from old.removed_at)
       or (old.hidden_at is not null and new.hidden_at is distinct from old.hidden_at) then
      raise exception 'removed_at and hidden_at are set once' using errcode = 'check_violation';
    end if;
    if new.path is distinct from old.path and new.path is not null then
      raise exception 'a photo''s path only ever changes to null (every copy gone)' using errcode = 'check_violation';
    end if;
  end if;
  if b_status in ('draft','open','filled') then
    if tg_op = 'INSERT' then
      if new.removed_at is not null or new.hidden_at is not null then
        raise exception 'a photo is added live' using errcode = 'check_violation';
      end if;
      if (b_status = 'draft') <> (new.bucket = 'photos-draft') then
        raise exception 'a draft''s photos go to photos-draft, an open break''s to photos' using errcode = 'check_violation';
      end if;
      select count(*) into live from break_photos where break_id = new.break_id and removed_at is null and hidden_at is null;
      if live >= 8 then
        raise exception 'a break has at most 8 photos' using errcode = 'check_violation';
      end if;
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and moderating
     and new.prize_slot is not distinct from old.prize_slot
     and new.alt is not distinct from old.alt
     and new.removed_at is not distinct from old.removed_at then
    return new;
  end if;
  raise exception 'photos are frozen once the draw is requested' using errcode = 'check_violation';
end $$;
--> statement-breakpoint
create trigger break_photos_guard before insert or update or delete on break_photos for each row execute function break_photos_guard();
--> statement-breakpoint
-- Live photos keep positions 0..n-1 with no gaps, so the lead is always position 0 (photos spec §4). Checked at commit,
-- once per touched row, so a renumber may park rows below zero between its two statements (ruling 5).
create or replace function break_photos_shape_check() returns trigger language plpgsql as $$
declare
  b_id uuid := coalesce(new.break_id, old.break_id);
  n int;
  closed boolean;
begin
  select count(*), coalesce(bool_and(position = rn - 1), true) into n, closed
  from (select position, row_number() over (order by position) as rn from break_photos
        where break_id = b_id and removed_at is null and hidden_at is null) live;
  if n > 8 then
    raise exception 'a break has at most 8 photos' using errcode = 'check_violation';
  end if;
  if not closed then
    raise exception 'live photo positions run 0 to n-1 without gaps' using errcode = 'check_violation';
  end if;
  return null;
end $$;
--> statement-breakpoint
create constraint trigger break_photos_shape after insert or update or delete on break_photos
  deferrable initially deferred for each row execute function break_photos_shape_check();
--> statement-breakpoint
-- Re-declare the 0001 freeze guard with three more rules: first_claimed_at is set once (photos spec decision 12), and
-- deleted_at is set once, on a draft only, after which the status never changes (Delete draft, §9).
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
  if old.first_claimed_at is not null and new.first_claimed_at is distinct from old.first_claimed_at then
    raise exception 'first_claimed_at is set once' using errcode = 'check_violation';
  end if;
  if old.deleted_at is not null and (new.deleted_at is distinct from old.deleted_at or new.status is distinct from old.status) then
    raise exception 'a deleted draft stays deleted' using errcode = 'check_violation';
  end if;
  if old.deleted_at is null and new.deleted_at is not null and (old.status <> 'draft' or new.status <> 'draft') then
    raise exception 'only a draft can be deleted' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
-- Backfill (photos spec decision 12): the earliest sign that any line of the break was ever claimed. A claim event is
-- the record; any other line event, a line still owned, or a draw with entries is a later bound used when the claim
-- event is missing (rows made outside the commands). Breaks with none of these stay null.
update breaks b set first_claimed_at = f.at
from (
  select x.id, least(
    (select min(e.created_at) from events e where e.break_id = x.id
       and e.type in ('line.claimed','line.sent','line.paid','line.unpaid','line.released','line.bonus_added','line.bonus_removed')),
    (select min(l.claimed_at) from lines l where l.break_id = x.id and l.owner_id is not null),
    (select min(d.created_at) from draws d where d.break_id = x.id and jsonb_array_length(d.entries_snapshot) > 0)
  ) as at
  from breaks x
) f
where f.id = b.id and b.first_claimed_at is null and f.at is not null;
--> statement-breakpoint
-- Deny-all RLS backstop for the new tables, as 0003 did (tests/ci/rls.test.ts checks every public table).
alter table break_photos enable row level security;
--> statement-breakpoint
alter table break_photos force row level security;
--> statement-breakpoint
alter table photo_uploads enable row level security;
--> statement-breakpoint
alter table photo_uploads force row level security;
--> statement-breakpoint
alter table photo_notices_seen enable row level security;
--> statement-breakpoint
alter table photo_notices_seen force row level security;
