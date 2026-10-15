ALTER TABLE "draws" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD COLUMN "kit_dark" text;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD COLUMN "kit_light" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flight_colour" text DEFAULT (array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flight_shape" text DEFAULT (array['standard','kite','slim','pear'])[1 + floor(random() * 4)::int] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flight_chosen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_dark_chk" CHECK ("host_profiles"."kit_dark" in ('petrol','blue','plum'));--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_light_chk" CHECK ("host_profiles"."kit_light" in ('yellow','orange','lime','sky','pink'));--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_kit_pair_chk" CHECK (("host_profiles"."kit_dark" is null) = ("host_profiles"."kit_light" is null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_flight_colour_chk" CHECK ("users"."flight_colour" in ('petrol','blue','plum','yellow','orange','lime','sky','pink'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_flight_shape_chk" CHECK ("users"."flight_shape" in ('standard','kite','slim','pear'));
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
    -- Recording the check changes verified_at alone: no half-void rides along with it.
    if new.voided_by is distinct from old.voided_by or new.void_reason is distinct from old.void_reason then
      raise exception 'draws may only be voided' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.voided_at is null then
    raise exception 'draws may only be voided' using errcode = 'check_violation';
  end if;
  return new;
end $$;
