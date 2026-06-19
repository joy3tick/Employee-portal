-- ===========================================================================
-- BOARD UPDATE — labels, card ordering, checklists, and comments.
-- ---------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (paste + Run).  https://supabase.com/
-- dashboard/project/dhvgqwrazdykkgszlhlr/sql/new
--
-- Why this is safe to run on the LIVE portal:
--   • It is ADDITIVE only — it adds new columns/tables and new policies for the
--     task board.
--   • It does NOT touch the profiles / office_days / weekly_reviews / events
--     tables or their security policies, so it cannot affect login, the
--     schedule, reviews, or anything else the portal depends on.
--   • It runs inside a single transaction, so if anything failed it rolls back
--     cleanly — no half-applied state.
-- ===========================================================================
begin;

-- 1) Labels + manual ordering on the existing board cards (additive columns).
alter table public.board_cards add column if not exists labels     text[] not null default '{}';
alter table public.board_cards add column if not exists sort_order double precision;
-- Backfill so existing cards keep today's order. Left NULLABLE on purpose (the
-- app treats null as 0), so this can never fail on an unexpected row.
update public.board_cards
  set sort_order = extract(epoch from coalesce(updated_at, created_at, now()))
  where sort_order is null;

-- Keep "only admins relabel cards" (employees may still move/reorder their own).
-- Re-creates the existing board trigger function with `labels` frozen for
-- non-admins; the trigger itself already exists and keeps pointing at it.
create or replace function public.protect_board_card_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.title := old.title; new.description := old.description; new.due_date := old.due_date;
    new.labels := old.labels;
    new.assignee_id := old.assignee_id; new.assignee_name := old.assignee_name;
    new.assignee_avatar := old.assignee_avatar; new.created_by := old.created_by;
    new.created_at := old.created_at; new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
    -- status and sort_order stay writable so an assignee can move/reorder.
  end if;
  return new;
end; $$;

-- 2) Checklists — admins define the items; the card's assignee ticks them off.
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

drop policy if exists checklist_select          on public.card_checklist_items;
drop policy if exists checklist_admin_all        on public.card_checklist_items;
drop policy if exists checklist_update_assignee  on public.card_checklist_items;
create policy checklist_select on public.card_checklist_items for select
  using (public.is_approved());
create policy checklist_admin_all on public.card_checklist_items for all
  using (public.is_admin()) with check (public.is_admin());
create policy checklist_update_assignee on public.card_checklist_items for update
  using (public.is_approved() and exists (
    select 1 from public.board_cards c where c.id = card_id and c.assignee_id = auth.uid()))
  with check (public.is_approved() and exists (
    select 1 from public.board_cards c where c.id = card_id and c.assignee_id = auth.uid()));

-- Freeze everything but `done` for non-admins (assignee can only tick off).
create or replace function public.protect_checklist_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.id := old.id; new.card_id := old.card_id; new.text := old.text;
    new.sort_order := old.sort_order; new.created_at := old.created_at;
  end if;
  return new;
end; $$;
drop trigger if exists protect_checklist_columns on public.card_checklist_items;
create trigger protect_checklist_columns before update on public.card_checklist_items
  for each row execute function public.protect_checklist_columns();

-- 3) Comments — any approved user posts as themselves; author or admin deletes.
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

drop policy if exists card_comments_select on public.card_comments;
drop policy if exists card_comments_insert on public.card_comments;
drop policy if exists card_comments_delete on public.card_comments;
create policy card_comments_select on public.card_comments for select
  using (public.is_approved());
create policy card_comments_insert on public.card_comments for insert
  with check (public.is_approved() and author_id = auth.uid());
create policy card_comments_delete on public.card_comments for delete
  using (author_id = auth.uid() or public.is_admin());

commit;

-- Pick up the new tables/columns in the API immediately (no waiting/erroring).
notify pgrst, 'reload schema';
