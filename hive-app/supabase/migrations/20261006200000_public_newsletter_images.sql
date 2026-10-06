-- Newsletter photos are public editorial assets.
--
-- The ordinary `attachments` bucket is intentionally private: it contains
-- member posts, messages and wish photos. The newsletter, however, is rendered
-- from one source into signed-in The Buzz, public the-hive.app and email clients.
-- A private attachment URL cannot serve those last two readers, and making the
-- whole attachments bucket public would reopen the privacy hole migration 146
-- closed. Give owner-approved newsletter images their own narrow public home.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'newsletter-images',
  'newsletter-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners upload newsletter images" on storage.objects;
create policy "Owners upload newsletter images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'newsletter-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_owner, false)
    )
  );

drop policy if exists "Owners update newsletter images" on storage.objects;
create policy "Owners update newsletter images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'newsletter-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_owner, false)
    )
  )
  with check (
    bucket_id = 'newsletter-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_owner, false)
    )
  );

drop policy if exists "Owners delete newsletter images" on storage.objects;
create policy "Owners delete newsletter images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'newsletter-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_owner, false)
    )
  );
