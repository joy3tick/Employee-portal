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
-- Hours the person will be in the office (open 24/7, so any time is valid;
-- end <= start means an overnight shift into the next day).
alter table public.office_days add column if not exists start_time time;
alter table public.office_days add column if not exists end_time   time;
-- Whether the person is in the office, on vacation, or off sick that day.
-- (start_time/end_time only apply when kind = 'in'.)
alter table public.office_days
  add column if not exists kind text not null default 'in'
  check (kind in ('in', 'vacation', 'sick'));

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

-- ---------------------------------------------------------------------------
-- Profile pictures
-- ---------------------------------------------------------------------------
-- avatar_url lives on the profile, and is denormalized onto office_days (like
-- display_name) so the shared calendar can show everyone's photo even though
-- employees can't read each other's profile rows.
alter table public.profiles    add column if not exists avatar_url text;
alter table public.office_days add column if not exists avatar_url text;

-- Public "avatars" storage bucket (read by anyone; uploads are restricted below).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Each user can write to the folder named after their own id; admins can write
-- to anyone's folder (so an admin can set a photo for an employee).
drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert with check (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
create policy avatars_update on storage.objects for update using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
) with check (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
create policy avatars_delete on storage.objects for delete using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- ---------------------------------------------------------------------------
-- Let admins manage everyone's office days (edit hours, fix or add entries).
-- ---------------------------------------------------------------------------
drop policy if exists office_days_admin_all on public.office_days;
create policy office_days_admin_all on public.office_days for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Weekly performance reviews (admin-only)
-- ---------------------------------------------------------------------------
-- One review per employee per week. week_start is the Monday of the reviewed
-- week, so the unique (user_id, week_start) constraint enforces "once a week".
create table if not exists public.weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  week_start  date not null,
  rating      int  not null check (rating between 1 and 10),
  note        text not null default '',
  reviewer_id uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_reviews_user_idx on public.weekly_reviews (user_id);
create index if not exists weekly_reviews_week_idx on public.weekly_reviews (week_start);

alter table public.weekly_reviews enable row level security;

-- Admins can read and write every review.
drop policy if exists weekly_reviews_admin_all on public.weekly_reviews;
create policy weekly_reviews_admin_all on public.weekly_reviews for all
  using (public.is_admin()) with check (public.is_admin());

-- Employees can READ their own reviews once posted (but never write them).
drop policy if exists weekly_reviews_select_own on public.weekly_reviews;
create policy weekly_reviews_select_own on public.weekly_reviews for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Weekly goals / OKRs (everyone)
-- ---------------------------------------------------------------------------
-- Each approved person sets their own weekly targets tied to their role
-- (growth metrics, partnership pipeline, content output, …). Goals are visible
-- to EVERY approved user, so the team keeps each other accountable without
-- anyone having to chase. A goal can be quantitative (target + progress, e.g.
-- "5 / 5 articles") or a simple done / not-done checkbox (target left null).
--
-- Like office_days, display_name + avatar_url are denormalized onto each goal
-- so the whole team can see whose goal it is without being able to read each
-- other's profile rows.
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  week_start    date not null,
  title         text not null,
  target        numeric,                              -- null => done/not-done goal
  progress      numeric not null default 0,
  unit          text not null default '',
  done          boolean not null default false,       -- only used when target is null
  display_name  text not null default '',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists goals_week_idx on public.goals (week_start);

alter table public.goals enable row level security;

-- Everyone approved can read the whole team's goals.
drop policy if exists goals_select_approved on public.goals;
create policy goals_select_approved on public.goals for select
  using (public.is_approved());

-- You can only create goals for yourself (and must be approved).
drop policy if exists goals_insert_own on public.goals;
create policy goals_insert_own on public.goals for insert
  with check (user_id = auth.uid() and public.is_approved());

-- You can edit + delete your own goals (the with-check stops you reassigning a
-- goal to someone else); admins can manage everyone's.
drop policy if exists goals_update_own on public.goals;
drop policy if exists goals_delete_own on public.goals;
drop policy if exists goals_admin_all  on public.goals;
create policy goals_update_own on public.goals for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete_own on public.goals for delete
  using (user_id = auth.uid());
create policy goals_admin_all on public.goals for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Task board (Trello-style Kanban) — everyone
-- ---------------------------------------------------------------------------
-- Cards flow through four columns: inbound -> in_progress -> awaiting_review
-- -> completed. The whole approved team can see the board. An employee moves
-- their OWN cards through the first three columns; only an ADMIN may move a
-- card into (or back out of) 'completed'. Once a card is completed, its
-- assignee — or an admin — can delete it (or just leave it there).
--
-- assignee_name + assignee_avatar are denormalized (like office_days/goals) so
-- everyone can see whose card it is without reading each other's profiles.
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text not null default '',
  status          text not null default 'inbound'
                    check (status in ('inbound', 'in_progress', 'awaiting_review', 'completed')),
  assignee_id     uuid references public.profiles (id) on delete set null,
  assignee_name   text not null default '',
  assignee_avatar text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  completed_by    uuid references public.profiles (id) on delete set null
);
create index if not exists tasks_status_idx   on public.tasks (status);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_updated_idx  on public.tasks (updated_at);

alter table public.tasks enable row level security;

-- Everyone approved can see the whole board.
drop policy if exists tasks_select_approved on public.tasks;
create policy tasks_select_approved on public.tasks for select
  using (public.is_approved());

-- Approved users create cards as themselves; only admins may assign to someone else.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert with check (
  public.is_approved()
  and created_by = auth.uid()
  and (assignee_id = auth.uid() or public.is_admin())
);

-- The assignee can update their own card ONLY while it isn't completed, and may
-- never set it to completed (USING freezes completed cards; WITH CHECK blocks the
-- completed status). That's what makes "an admin has to move it to completed" real.
drop policy if exists tasks_update_assignee on public.tasks;
create policy tasks_update_assignee on public.tasks for update
  using (assignee_id = auth.uid() and status <> 'completed')
  with check (assignee_id = auth.uid() and status <> 'completed');

-- Admins can update any card, including into/out of completed.
drop policy if exists tasks_update_admin on public.tasks;
create policy tasks_update_admin on public.tasks for update
  using (public.is_admin()) with check (public.is_admin());

-- Delete: the assignee may delete their card once it's completed; admins anytime.
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete using (
  public.is_admin()
  or (assignee_id = auth.uid() and status = 'completed')
);
