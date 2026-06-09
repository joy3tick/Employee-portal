-- ===========================================================================
-- Redline Employee Portal — Supabase schema
-- ---------------------------------------------------------------------------
-- HOW TO APPLY:
--   1. Open your Supabase project -> SQL Editor -> "New query".
--   2. Paste this entire file and click "Run".
-- It is safe to run more than once (idempotent).
--
-- The Express backend talks to the database with the service_role key, which
-- bypasses Row Level Security. RLS is still enabled below as defense-in-depth
-- so the database is safe even if the anon key is ever used directly.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One profile row per auth user. Holds our app-specific state: approval status
-- and role. Linked 1:1 to Supabase's auth.users table.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'employee' check (role in ('employee', 'admin')),
  status      text not null default 'pending'  check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now()
);

-- A row means "this user is in the office on this day".
create table if not exists public.office_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists office_days_day_idx     on public.office_days (day);
create index if not exists office_days_user_id_idx on public.office_days (user_id);
create index if not exists profiles_status_idx     on public.profiles (status);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper functions for RLS (security definer => avoids recursive policy checks)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.office_days enable row level security;

-- profiles: a user can read their own row; admins can read/update everyone.
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_own   on public.profiles for select using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select using (public.is_admin());
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- office_days: approved users can see everyone's days (so they know who's in),
-- and can add/remove only their own.
drop policy if exists office_days_select_approved on public.office_days;
drop policy if exists office_days_insert_own      on public.office_days;
drop policy if exists office_days_delete_own       on public.office_days;

create policy office_days_select_approved on public.office_days for select
  using (public.is_approved());
create policy office_days_insert_own on public.office_days for insert
  with check (user_id = auth.uid() and public.is_approved());
create policy office_days_delete_own on public.office_days for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- (Optional) Manually promote an existing account to admin:
--   update public.profiles set role = 'admin', status = 'approved'
--   where email = 'you@redline.com';
-- The backend also bootstraps the ADMIN_EMAIL account automatically on startup.
-- ---------------------------------------------------------------------------
