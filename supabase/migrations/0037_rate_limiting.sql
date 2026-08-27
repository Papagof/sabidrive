-- Rate limiting for the two Route Handlers reachable with no bearer token at
-- all (signup-school, login-with-phone) -- everything else already requires
-- a verified session first. Postgres-backed rather than in-process, since
-- Vercel serverless functions don't share memory between invocations (an
-- in-process Map wouldn't actually limit anything in production), and
-- rather than a new external service (Redis/Upstash), since this project
-- already has enough manual-external-account setups (Twilio, Firebase,
-- VAPID) and everything needed already exists in this same Supabase project.
--
-- RLS enabled with zero policies -- same "service-role only, never touched
-- by a client session" pattern as pickup_codes (0026_pickup_sms_codes.sql).
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_hits_bucket_created_at_idx on public.rate_limit_hits (bucket, created_at);

alter table public.rate_limit_hits enable row level security;

-- Logs the attempt unconditionally (every attempt counts toward the limit
-- regardless of outcome -- the standard fixed-window-log approach), then
-- reports whether the bucket is still at or under the max within the
-- window. Revoked from public/anon/authenticated entirely below -- this is
-- never meant to be called from a browser session at all, only from a
-- Route Handler's service-role client, which bypasses grants by design and
-- needs nothing granted to it explicitly.
create or replace function public.check_rate_limit(p_bucket text, p_max_attempts int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_hits (bucket) values (p_bucket);

  select count(*) into v_count
  from public.rate_limit_hits
  where bucket = p_bucket and created_at > now() - (p_window_seconds || ' seconds')::interval;

  return v_count <= p_max_attempts;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public;
revoke execute on function public.check_rate_limit(text, int, int) from anon;
revoke execute on function public.check_rate_limit(text, int, int) from authenticated;

-- purge_old_data() (0012_data_retention.sql, last extended by 0026) -- same
-- no-signature-change, safe-to-reissue edit every prior extension has been.
create or replace function public.purge_old_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trip_locations where recorded_at < now() - interval '14 days';
  delete from public.notifications where is_read = true and created_at < now() - interval '90 days';
  delete from public.pickup_codes where created_at < now() - interval '1 day';
  delete from public.rate_limit_hits where created_at < now() - interval '1 day';
end;
$$;
