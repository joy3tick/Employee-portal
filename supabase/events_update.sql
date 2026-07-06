-- ===========================================================================
-- EVENTS UPDATE — cover images on company events.
-- ---------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (paste + Run).  https://supabase.com/
-- dashboard/project/dhvgqwrazdykkgszlhlr/sql/new
--
-- Safe to run on a LIVE project: it is ADDITIVE only (adds one nullable column
-- and a new storage bucket + its policies). It does NOT touch the profiles /
-- office_days / board / reviews tables or their policies, so it can't affect
-- login or anything else. Idempotent — safe to run more than once.
-- ===========================================================================
begin;

-- Optional cover image per event (admin-uploaded); this column holds the object
-- key within the "event-images" bucket. The app builds the public URL from it.
alter table public.events add column if not exists image_path text;

-- "event-images" storage bucket — public read (everyone sees the images),
-- admin-only writes. 10 MB per image.
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

commit;

-- Pick up the new column/bucket in the API immediately.
notify pgrst, 'reload schema';
