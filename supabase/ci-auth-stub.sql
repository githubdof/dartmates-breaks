-- CI only: minimal stand-in for Supabase's auth schema on a plain postgres:16 service.
-- Local development uses the real Supabase stack.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
