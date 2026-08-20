-- Lets a parent generate a one-time SMS code (via the same Twilio Verify
-- service already used for phone verification -- 0021_phone_verification.sql)
-- to authorize their child's boarding at home (morning pickup) or alighting
-- at home (afternoon drop-off), as an alternative to the driver scanning the
-- student's QR code at those two "home end" stops. Twilio owns code
-- generation/expiry/attempt-limiting; this table only maps a pending
-- verification (identified by the phone it was sent to + which student/event
-- it's for) to the student it should check in once Twilio confirms the code.
--
-- No RLS policies are added on purpose -- like phone_verified (protected via
-- a trigger) and the invite-user/find-guardian-by-email flows, this table is
-- only ever touched by trusted server-side Route Handlers using the
-- service-role key, which re-validate the caller's identity/authorization in
-- code before reading or writing it. A bare client (anon or authenticated)
-- gets zero rows either way with RLS enabled and no policies.
create table public.pickup_codes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('board', 'alight')),
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'consumed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  consumed_trip_id uuid references public.trips (id) on delete set null
);
create index pickup_codes_student_event_status_idx on public.pickup_codes (student_id, event_type, status);
alter table public.pickup_codes enable row level security;

-- Record the new check-in method alongside the existing 'qr'/'manual' ones.
alter table public.check_in_events drop constraint check_in_events_method_check;
alter table public.check_in_events add constraint check_in_events_method_check
  check (method in ('qr', 'manual', 'sms_code'));

-- check_in() gains an optional p_method so the sms-code verify route can
-- record how the check-in was actually authorized, instead of every row
-- silently claiming 'qr'. NOTE: despite p_method having a default, appending
-- it to the arg list makes this a *different* signature to Postgres, not a
-- true CREATE OR REPLACE of the 3-arg function -- it creates a second,
-- overloaded function instead (confirmed live: pg_proc showed both
-- signatures after running just the create-or-replace below). Two overloads
-- that are both satisfiable by the same 3 named arguments
-- (p_trip_id/p_qr_token/p_event_type, with p_method defaulted) makes every
-- existing 3-arg RPC call ambiguous. The old 3-arg function must be
-- explicitly dropped, and -- per this project's documented grant-lockdown
-- gotcha -- the new signature starts with a fresh PUBLIC default EXECUTE
-- grant that must be revoked and re-granted to just `authenticated`,
-- matching what 0006/0007 originally locked the 3-arg function down to.
create or replace function public.check_in(
  p_trip_id uuid,
  p_qr_token uuid,
  p_event_type text default 'board',
  p_method text default 'qr'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_student record;
  v_time_label text;
begin
  if p_event_type not in ('board', 'alight') then
    raise exception 'invalid event_type %', p_event_type;
  end if;
  if p_method not in ('qr', 'manual', 'sms_code') then
    raise exception 'invalid method %', p_method;
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'trip % not found', p_trip_id;
  end if;
  if v_trip.driver_id is distinct from auth.uid() then
    raise exception 'not authorized to check in students on this trip';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip % is not in progress', p_trip_id;
  end if;

  select * into v_student from public.students where qr_token = p_qr_token;
  if v_student is null then
    raise exception 'unrecognized student QR code';
  end if;
  if not exists (
    select 1 from public.attendance_expectations
    where trip_id = p_trip_id and student_id = v_student.id
  ) then
    raise exception 'student % is not expected on this trip', v_student.id;
  end if;

  insert into public.check_in_events (trip_id, student_id, stop_id, event_type, method, scanned_by)
  values (p_trip_id, v_student.id, v_student.default_stop_id, p_event_type, p_method, auth.uid());

  if p_event_type = 'board' then
    update public.attendance_expectations
    set status = 'boarded', updated_at = now()
    where trip_id = p_trip_id and student_id = v_student.id;
  end if;

  v_time_label := to_char(now(), 'HH12:MI AM');

  insert into public.notifications (recipient_id, type, title, body, related_trip_id, related_student_id)
  select
    gsl.guardian_id,
    case when p_event_type = 'board' then 'boarding' else 'alighting' end,
    case when p_event_type = 'board' then 'Child boarded the bus' else 'Child dropped off' end,
    format('%s %s at %s', v_student.first_name, case when p_event_type = 'board' then 'boarded the bus' else 'was dropped off' end, v_time_label),
    p_trip_id,
    v_student.id
  from public.guardian_student_links gsl
  where gsl.student_id = v_student.id;
end;
$$;

drop function if exists public.check_in(uuid, uuid, text);
revoke execute on function public.check_in(uuid, uuid, text, text) from public;
revoke execute on function public.check_in(uuid, uuid, text, text) from anon;
grant execute on function public.check_in(uuid, uuid, text, text) to authenticated;

-- Extend the existing nightly purge (0012_data_retention.sql) to also drop
-- old pickup_codes rows -- they're short-lived by design (10 min expiry) and
-- have no legitimate reason to stick around once the trip they were for is
-- long over.
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
end;
$$;
