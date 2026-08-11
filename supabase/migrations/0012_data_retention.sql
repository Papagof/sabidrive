-- Data privacy controls (spec: "location data... auto-deleted after a
-- retention period").
create extension if not exists pg_cron;

create or replace function public.purge_old_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trip_locations where recorded_at < now() - interval '14 days';
  delete from public.notifications where is_read = true and created_at < now() - interval '90 days';
end;
$$;

select cron.schedule('purge-old-data-nightly', '0 3 * * *', 'select public.purge_old_data();');
