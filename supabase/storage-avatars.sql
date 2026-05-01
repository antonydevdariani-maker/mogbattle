-- Profile pictures: run this entire script once in the Supabase Dashboard
-- → SQL Editor → New query → paste → Run.
--
-- Creates a public storage bucket named "avatars" so uploaded images get a public URL.
-- Your Next.js app uploads with the service role key (already in .env).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');
