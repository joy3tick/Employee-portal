-- ===========================================================================
-- OUTREACH TRACKER — a shared, gamified daily counter.
-- ---------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (paste + Run).  https://supabase.com/
-- dashboard/project/dhvgqwrazdykkgszlhlr/sql/new
--
-- Safe on a LIVE project: ADDITIVE only (one new table + one function). It does
-- NOT touch any existing table or policy, so it can't affect login or anything
-- else. Idempotent — safe to run more than once.
-- ===========================================================================
begin;

-- One row per user per day = how many people they reached out to that day.
create table if not exists public.outreach_counts (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null,
  count        int  not null default 0,
  display_name text not null default '',
  avatar_url   text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists outreach_counts_day_idx on public.outreach_counts (day);

alter table public.outreach_counts enable row level security;

-- Everyone approved sees the whole leaderboard; nobody writes directly.
drop policy if exists outreach_select on public.outreach_counts;
create policy outreach_select on public.outreach_counts for select
  using (public.is_approved());

-- All increments go through this: nudge my own counter for a day by ±1 and
-- return the new total. security definer + always auth.uid() => you can only
-- change your own row.
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
  p_delta := case when coalesce(p_delta, 1) >= 0 then 1 else -1 end;
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

commit;

-- Pick up the new table/function in the API immediately.
notify pgrst, 'reload schema';
