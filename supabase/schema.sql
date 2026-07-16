-- ===========================================================================
-- Redline Employee Portal — Supabase schema (static / client-direct version)
-- ---------------------------------------------------------------------------
-- HOW TO APPLY (FRESH project only):
--   1. Supabase dashboard -> SQL Editor -> "New query".
--   2. Paste this whole file and click "Run".
--
-- ⚠️  DO NOT re-run this whole file against a LIVE project that people are
--     using. It drops & recreates the profiles / office_days security policies
--     and briefly locks those tables — and because the app reads `profiles` on
--     every page load to sign you in, re-running this on a live site can make it
--     hang on "Loading…" until the script finishes.
--     To ADD a feature to a live project, run the small, isolated migration for
--     that feature instead (e.g. supabase/board_update.sql), which only adds the
--     new objects and never touches the login/schedule policies.
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
-- Whether the person is in the office, working remote, on vacation, or off sick
-- that day. (start_time/end_time apply when kind = 'in' or 'remote' — both are
-- working days; they're ignored for vacation/sick.)
alter table public.office_days
  add column if not exists kind text not null default 'in'
  check (kind in ('in', 'remote', 'vacation', 'sick'));
-- Widen the check for tables created before 'remote' existed (the add-column
-- check above only takes effect the first time the column is created).
alter table public.office_days drop constraint if exists office_days_kind_check;
alter table public.office_days
  add constraint office_days_kind_check check (kind in ('in', 'remote', 'vacation', 'sick'));

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
-- Task board (Trello-style Kanban) — everyone
-- ---------------------------------------------------------------------------
-- Stored in its OWN table (board_cards) so it never collides with the assigned
-- "tasks" feature below — this board is fully self-contained.
--
-- Cards flow through four columns: inbound -> in_progress -> awaiting_review
-- -> completed. The whole approved team can see the board. An employee moves
-- their OWN cards through the first three columns; only an ADMIN may move a
-- card into (or back out of) 'completed'. Once a card is completed, its
-- assignee — or an admin — can delete it (or just leave it there).
--
-- assignee_name + assignee_avatar are denormalized (like office_days) so
-- everyone can see whose card it is without reading each other's profiles.
create table if not exists public.board_cards (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text not null default '',
  status          text not null default 'inbound'
                    check (status in ('inbound', 'in_progress', 'awaiting_review', 'completed')),
  due_date        date,
  assignee_id     uuid references public.profiles (id) on delete set null,
  assignee_name   text not null default '',
  assignee_avatar text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  completed_by    uuid references public.profiles (id) on delete set null
);
-- In case the table predates due dates:
alter table public.board_cards add column if not exists due_date date;
-- Colored labels (preset keys picked in the app) + manual ordering within a
-- column. sort_order is a float so a card can be dropped *between* two others
-- without renumbering the rest. Backfill existing rows from their timestamp so
-- they keep today's order but get distinct values to interleave with.
alter table public.board_cards add column if not exists labels text[] not null default '{}';
alter table public.board_cards add column if not exists sort_order double precision;
-- Backfill existing rows so they keep today's order. sort_order is left NULLABLE
-- on purpose (the app treats a null as 0 and sets a value on every new/moved
-- card), so this migration can never fail on an unexpected row.
update public.board_cards
  set sort_order = extract(epoch from coalesce(updated_at, created_at, now()))
  where sort_order is null;
create index if not exists board_cards_status_idx   on public.board_cards (status);
create index if not exists board_cards_assignee_idx on public.board_cards (assignee_id);
create index if not exists board_cards_updated_idx  on public.board_cards (updated_at);

alter table public.board_cards enable row level security;

-- Everyone approved can see the whole board.
drop policy if exists board_cards_select_approved on public.board_cards;
create policy board_cards_select_approved on public.board_cards for select
  using (public.is_approved());

-- Only ADMINS create/assign cards — employees can't add their own. (The admin
-- records themselves as created_by and picks any assignee.)
drop policy if exists board_cards_insert on public.board_cards;
create policy board_cards_insert on public.board_cards for insert with check (
  public.is_admin() and created_by = auth.uid()
);

-- The assignee can update their own card ONLY while it isn't completed, and may
-- never set it to completed. A BEFORE UPDATE trigger (below) further freezes
-- every column except status for non-admins, so an employee can MOVE a card but
-- can't edit its title / details / due date / assignee — only an admin can.
drop policy if exists board_cards_update_assignee on public.board_cards;
create policy board_cards_update_assignee on public.board_cards for update
  using (assignee_id = auth.uid() and status <> 'completed')
  with check (assignee_id = auth.uid() and status <> 'completed');

-- Admins can update any card, including into/out of completed.
drop policy if exists board_cards_update_admin on public.board_cards;
create policy board_cards_update_admin on public.board_cards for update
  using (public.is_admin()) with check (public.is_admin());

-- Delete: the assignee may delete their card once it's completed; admins anytime.
drop policy if exists board_cards_delete on public.board_cards;
create policy board_cards_delete on public.board_cards for delete using (
  public.is_admin()
  or (assignee_id = auth.uid() and status = 'completed')
);

-- Only admins edit a card's content. This BEFORE UPDATE trigger freezes every
-- column except status for non-admins (mirrors protect_profile_columns above).
create or replace function public.protect_board_card_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.title           := old.title;
    new.description     := old.description;
    new.due_date        := old.due_date;
    new.labels          := old.labels;          -- only admins (re)label cards
    new.assignee_id     := old.assignee_id;
    new.assignee_name   := old.assignee_name;
    new.assignee_avatar := old.assignee_avatar;
    new.created_by      := old.created_by;
    new.created_at      := old.created_at;
    new.completed_at    := old.completed_at;
    new.completed_by    := old.completed_by;
    -- NOTE: status and sort_order are intentionally left writable, so an
    -- assignee can move and reorder their own (non-completed) cards.
  end if;
  return new;
end;
$$;

drop trigger if exists protect_board_card_columns on public.board_cards;
create trigger protect_board_card_columns
  before update on public.board_cards
  for each row execute function public.protect_board_card_columns();

-- ---------------------------------------------------------------------------
-- Card checklists — sub-tasks inside a board card.
-- ---------------------------------------------------------------------------
-- Admins define the items (the sub-steps of a task). The card's ASSIGNEE can
-- tick them off (toggle `done`) but can't add, rename, reorder, or delete them
-- — a BEFORE UPDATE trigger freezes every column except `done` for non-admins,
-- mirroring how the card body itself is admin-only.
create table if not exists public.card_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.board_cards (id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists card_checklist_card_idx on public.card_checklist_items (card_id, sort_order);

alter table public.card_checklist_items enable row level security;

-- Everyone approved can read every card's checklist (the board is shared).
drop policy if exists checklist_select on public.card_checklist_items;
create policy checklist_select on public.card_checklist_items for select
  using (public.is_approved());

-- Admins create / edit / delete checklist items.
drop policy if exists checklist_admin_all on public.card_checklist_items;
create policy checklist_admin_all on public.card_checklist_items for all
  using (public.is_admin()) with check (public.is_admin());

-- The card's assignee may UPDATE items on their own card (to tick them off).
drop policy if exists checklist_update_assignee on public.card_checklist_items;
create policy checklist_update_assignee on public.card_checklist_items for update
  using (public.is_approved() and exists (
    select 1 from public.board_cards c where c.id = card_id and c.assignee_id = auth.uid()
  ))
  with check (public.is_approved() and exists (
    select 1 from public.board_cards c where c.id = card_id and c.assignee_id = auth.uid()
  ));

-- Freeze everything except `done` for non-admins (so the assignee can only
-- check items off, never reword or reorder them).
create or replace function public.protect_checklist_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.id         := old.id;
    new.card_id    := old.card_id;
    new.text       := old.text;
    new.sort_order := old.sort_order;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_checklist_columns on public.card_checklist_items;
create trigger protect_checklist_columns
  before update on public.card_checklist_items
  for each row execute function public.protect_checklist_columns();

-- ---------------------------------------------------------------------------
-- Card comments — a discussion thread on each board card (everyone).
-- ---------------------------------------------------------------------------
-- author_name + author_avatar are denormalized (like office_days) so the whole
-- team can see who said what without reading each other's profile rows.
create table if not exists public.card_comments (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.board_cards (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null,
  author_name   text not null default '',
  author_avatar text,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at);

alter table public.card_comments enable row level security;

-- Everyone approved can read the thread.
drop policy if exists card_comments_select on public.card_comments;
create policy card_comments_select on public.card_comments for select
  using (public.is_approved());

-- Any approved user can post — but only AS themselves (author_id = auth.uid()).
drop policy if exists card_comments_insert on public.card_comments;
create policy card_comments_insert on public.card_comments for insert with check (
  public.is_approved() and author_id = auth.uid()
);

-- You can delete your own comment; admins can delete anyone's.
drop policy if exists card_comments_delete on public.card_comments;
create policy card_comments_delete on public.card_comments for delete using (
  author_id = auth.uid() or public.is_admin()
);

-- ---------------------------------------------------------------------------
-- Card attachments — files on a board card (up to 10 per card).
-- ---------------------------------------------------------------------------
-- Any approved teammate (employees included) can attach files to any card; the
-- uploader — or an admin — can remove them. The bytes live in the
-- "card-attachments" storage bucket (policies further below); this table is the
-- per-card list. `path` is the object key in that bucket; name/size/mime and the
-- denormalized uploader_name are kept for display without reading profiles.
create table if not exists public.card_attachments (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.board_cards (id) on delete cascade,
  path          text not null,
  name          text not null default '',
  size          bigint,
  mime          text,
  uploader_id   uuid references public.profiles (id) on delete set null,
  uploader_name text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists card_attachments_card_idx on public.card_attachments (card_id, created_at);

alter table public.card_attachments enable row level security;

-- Everyone approved can see a card's attachment list (the board is shared).
drop policy if exists card_attachments_select on public.card_attachments;
create policy card_attachments_select on public.card_attachments for select
  using (public.is_approved());

-- Any approved user can attach — but only AS themselves (uploader_id = auth.uid()).
drop policy if exists card_attachments_insert on public.card_attachments;
create policy card_attachments_insert on public.card_attachments for insert with check (
  public.is_approved() and uploader_id = auth.uid()
);

-- You can remove your own attachment; admins can remove anyone's.
drop policy if exists card_attachments_delete on public.card_attachments;
create policy card_attachments_delete on public.card_attachments for delete using (
  uploader_id = auth.uid() or public.is_admin()
);

-- Enforce the "max 10 attachments per card" cap in the database, so it holds
-- even if a client ignores it.
create or replace function public.enforce_card_attachment_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.card_attachments where card_id = new.card_id) >= 10 then
    raise exception 'A card can have at most 10 attachments.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_card_attachment_limit on public.card_attachments;
create trigger enforce_card_attachment_limit
  before insert on public.card_attachments
  for each row execute function public.enforce_card_attachment_limit();

-- "card-attachments" storage bucket. Files are organized as
-- <uploader_id>/<card_id>/<random>-<filename>, so the per-user folder convention
-- (same as avatars) lets the uploader delete their own files while admins can
-- delete anyone's. Reads are open to approved users via the app.
-- file_size_limit caps uploads at 50 MB per file — the maximum the Supabase Free
-- plan allows, and also its default project-wide upload limit, so this works out
-- of the box with no dashboard change. (Going above 50 MB needs the Pro plan and
-- a higher project-wide limit at Dashboard -> Storage -> Settings.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('card-attachments', 'card-attachments', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists card_attach_read   on storage.objects;
drop policy if exists card_attach_insert on storage.objects;
drop policy if exists card_attach_delete on storage.objects;
create policy card_attach_read on storage.objects for select
  using (bucket_id = 'card-attachments');
create policy card_attach_insert on storage.objects for insert with check (
  bucket_id = 'card-attachments'
  and public.is_approved()
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy card_attach_delete on storage.objects for delete using (
  bucket_id = 'card-attachments'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- ---------------------------------------------------------------------------
-- Company events / off-sites (admin-managed, everyone sees them)
-- ---------------------------------------------------------------------------
-- Admins drop events, off-sites, holidays, and socials onto the shared
-- calendar. They can span multiple days (ends_on) and optionally have a time
-- window; leaving the times empty makes it an all-day event.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default 'event' check (kind in ('event', 'offsite', 'holiday', 'social')),
  starts_on   date not null,
  ends_on     date not null,              -- = starts_on for a single-day event
  start_time  time,                       -- null/null => all-day
  end_time    time,
  location    text not null default '',
  notes       text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_on);
create index if not exists events_ends_idx   on public.events (ends_on);
-- Optional cover image per event (admin-uploaded). Stored in the "event-images"
-- bucket; this column holds the object key (the app builds the public URL).
alter table public.events add column if not exists image_path text;

alter table public.events enable row level security;

-- Every approved user can read events; only admins can create/edit/delete them.
drop policy if exists events_select_approved on public.events;
drop policy if exists events_admin_all       on public.events;
create policy events_select_approved on public.events for select
  using (public.is_approved());
create policy events_admin_all on public.events for all
  using (public.is_admin()) with check (public.is_admin());

-- "event-images" storage bucket — public read (everyone sees event cover
-- images), admin-only writes (only admins manage events, so the path doesn't
-- need to encode ownership). 10 MB per image.
insert into storage.buckets (id, name, public, file_size_limit)
values ('event-images', 'event-images', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists event_images_read   on storage.objects;
drop policy if exists event_images_write  on storage.objects;
drop policy if exists event_images_update on storage.objects;
drop policy if exists event_images_delete on storage.objects;
create policy event_images_read on storage.objects for select
  using (bucket_id = 'event-images');
create policy event_images_write on storage.objects for insert with check (
  bucket_id = 'event-images' and public.is_admin()
);
create policy event_images_update on storage.objects for update
  using (bucket_id = 'event-images' and public.is_admin())
  with check (bucket_id = 'event-images' and public.is_admin());
create policy event_images_delete on storage.objects for delete using (
  bucket_id = 'event-images' and public.is_admin()
);

-- ---------------------------------------------------------------------------
-- Outreach tracker — a shared, gamified counter (everyone).
-- ---------------------------------------------------------------------------
-- One row per user per day holds how many people they reached out to that day.
-- Everyone approved can SEE the whole leaderboard; nobody writes the table
-- directly — every change goes through adjust_outreach() below, so a user can
-- only ever nudge their OWN counter, by ±1, for a given day.
create table if not exists public.outreach_counts (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null,
  count        int  not null default 0,
  display_name text not null default '',   -- denormalized so the board shows names
  avatar_url   text,                        -- without reading each other's profiles
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists outreach_counts_day_idx on public.outreach_counts (day);

alter table public.outreach_counts enable row level security;

drop policy if exists outreach_select on public.outreach_counts;
create policy outreach_select on public.outreach_counts for select
  using (public.is_approved());
-- (No insert/update/delete policies on purpose — writes only via the RPC.)

-- Nudge my own counter for a day by ±1 and return the new total. security
-- definer so it can upsert past RLS; it always uses auth.uid(), so you can only
-- ever change your own row.
create or replace function public.adjust_outreach(p_day date, p_delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new    int;
  v_name   text;
  v_avatar text;
begin
  if not public.is_approved() then
    raise exception 'Not allowed';
  end if;
  p_delta := case when coalesce(p_delta, 1) >= 0 then 1 else -1 end;  -- clamp to a single step
  if p_day is null then p_day := current_date; end if;
  select full_name, avatar_url into v_name, v_avatar from public.profiles where id = auth.uid();
  insert into public.outreach_counts (user_id, day, count, display_name, avatar_url)
  values (auth.uid(), p_day, greatest(0, p_delta), coalesce(v_name, ''), v_avatar)
  on conflict (user_id, day) do update
    set count        = greatest(0, outreach_counts.count + p_delta),
        display_name = coalesce(v_name, outreach_counts.display_name),
        avatar_url   = v_avatar,
        updated_at   = now()
  returning count into v_new;
  return v_new;
end;
$$;
grant execute on function public.adjust_outreach(date, int) to authenticated, anon;

-- Enable Realtime so the outreach leaderboard + team totals update live.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outreach_counts'
  ) then
    alter publication supabase_realtime add table public.outreach_counts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reload the PostgREST schema cache so the new tables/columns are queryable
-- immediately (otherwise there's a brief window after a migration where the API
-- can't see them yet). Safe to run anytime.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
