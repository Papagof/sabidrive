-- Per-school logo branding. Storage has never been used in this project
-- before -- this is the first bucket. Public bucket, so every page in
-- either app can render <img src={logo_url}> directly with zero auth dance;
-- write access (upload/replace/delete) is still scoped to the owning
-- school's own admin via RLS on storage.objects.

insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do nothing;

-- Path convention: {school_id}/logo (no extension -- contentType is set at
-- upload time, so the browser renders correctly regardless). Re-uploading
-- with upsert:true replaces the file in place, no orphans accumulate.
create policy "school_logo_admin_write" on storage.objects
  for all
  using (bucket_id = 'school-logos' and (storage.foldername(name))[1] = public.current_school_id()::text)
  with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.current_school_id()::text
    and public.current_role() = 'admin'
  );

alter table public.schools add column logo_url text;
