-- ===========================================================================
-- OPTIONAL — permanently remove the Events and Weekly Reviews features' data.
-- ---------------------------------------------------------------------------
-- The app no longer uses these; this just deletes the now-unused tables, the
-- event-images bucket, and their policies/functions so nothing lingers.
--
-- ⚠️  DESTRUCTIVE and IRREVERSIBLE. It deletes all event rows, all weekly-review
--     rows, and every uploaded event image. Only run it if you're sure you want
--     that data gone. (Leaving these in place is harmless — they're just unused.)
--     It does NOT touch profiles, the board, outreach, or anything else.
-- ===========================================================================
begin;

-- Events
drop table if exists public.events cascade;

-- Weekly reviews
drop table if exists public.weekly_reviews cascade;

-- Event image storage: delete the objects, then the bucket + its policies.
delete from storage.objects where bucket_id = 'event-images';
drop policy if exists event_images_read   on storage.objects;
drop policy if exists event_images_write  on storage.objects;
drop policy if exists event_images_update on storage.objects;
drop policy if exists event_images_delete on storage.objects;
delete from storage.buckets where id = 'event-images';

commit;

notify pgrst, 'reload schema';
