-- ===========================================================================
-- Redline Employee Portal — Supabase schema (static / client-direct version)
-- ---------------------------------------------------------------------------
-- HOW TO APPLY:
--   1. Supabase dashboard -> SQL Editor -> "New query".
--   2. Paste this whole file and click "Run".  (Safe to run more than once.)
--
-- The web app talks to Supabase directly from the browser with the anon key,
-- so ALL security lives in the Row Level Security policies below.
-- ===========================================================================

-- ---- CHANGE ME -----------------------------------------------------------
-- The email that becomes the admin automatically when it signs up.
-- (Edit the value in the handle_new_user() function below if you change it.)
-- Currently: alexrogul@gmail.com
-- --------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'employee' check (role in ('employee', 'admin')),
  status      text not null default 'pending'  check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now()
);

create table if not exists public.office_days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  day           date not null,
  display_name  text not null default '',
  created_at    timestamptz not null default now(),
  unique (user_id, day)
);
-- In case an older version of this table already exists:
alter table public.office_days add column if not exists display_name text not null default '';

create index if not exists office_days_day_idx     on public.office_days (day);
create index if not exists office_days_user_id_idx on public.office_days (user_id);
create index if not exists profiles_status_idx     on public.profiles (status);

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- The configured admin email is promoted to admin + approved immediately.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text := 'alexrogul@gmail.com';   -- <- CHANGE ME if needed
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.email = admin_email then 'admin'    else 'employee' end,
    case when new.email = admin_email then 'approved' else 'pending'  end
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
-- Helper functions for RLS (security definer => no recursive policy checks)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_approved()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.office_days enable row level security;

-- profiles: read your own row; admins read + update everyone. Nobody can change
-- their own role/status (only admins can update profiles at all).
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select_own   on public.profiles for select using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select using (public.is_admin());
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- office_days: approved users see everyone's days; you can add/remove only yours.
drop policy if exists office_days_select_approved on public.office_days;
drop policy if exists office_days_insert_own      on public.office_days;
drop policy if exists office_days_delete_own      on public.office_days;
create policy office_days_select_approved on public.office_days for select
  using (public.is_approved());
create policy office_days_insert_own on public.office_days for insert
  with check (user_id = auth.uid() and public.is_approved());
create policy office_days_delete_own on public.office_days for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Let users edit their OWN profile (e.g. their display name) — but NOT their
-- role or status. A BEFORE UPDATE trigger freezes the sensitive columns for
-- non-admins, so a self-update can only really change full_name. This is what
-- keeps "edit your name" from becoming "make yourself an approved admin".
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.id     := old.id;
    new.email  := old.email;
    new.role   := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Allow users to keep the denormalized name on their own office_days in sync
-- when they rename themselves.
drop policy if exists office_days_update_own on public.office_days;
create policy office_days_update_own on public.office_days for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
