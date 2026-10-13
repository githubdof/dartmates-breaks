--> statement-breakpoint
-- Deny-all RLS backstop. The app connects as the `postgres` role from DATABASE_URL, which has BYPASSRLS.
-- The anon/authenticated roles get no policies, so a leaked anon key reads nothing.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
