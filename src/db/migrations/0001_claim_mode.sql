ALTER TABLE "breaks" ADD COLUMN "claim_mode" text DEFAULT 'pick_or_random' NOT NULL;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_claim_mode_chk" CHECK ("breaks"."claim_mode" in ('pick_or_random','pick_only','straight'));
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
