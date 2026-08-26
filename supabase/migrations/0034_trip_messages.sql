-- In-app trip messaging: a shared per-trip channel, not 1:1 direct messages.
-- can_view_trip() (0031_attendant_backup_crew.sql) already answers "can this
-- person see this trip" for the admin of its school, the driver/attendant
-- crew, and every guardian of a student on its roster -- reusing it directly
-- for both SELECT and INSERT means zero new authorization logic, and matches
-- the real use case ("running late" is relevant to every parent on the
-- route, not just one).
--
-- sender_name is denormalized onto the row (not read via a profiles embed)
-- because no RLS policy lets one guardian read another guardian's profile --
-- only driver<->guardian-of-their-route visibility exists (0003/0015/0024).
-- Adding a guardian-to-guardian profiles policy just to resolve a display
-- name is more new surface than baking the name in at write time, the same
-- way notifications.body already bakes "New message from X" in rather than
-- making the reader separately resolve X. A BEFORE INSERT trigger sets it
-- server-side so a client can't spoof a display name.
create table public.trip_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index trip_messages_trip_id_created_at_idx on public.trip_messages (trip_id, created_at);

alter table public.trip_messages enable row level security;

create policy "trip_messages_select_visible" on public.trip_messages
  for select using (public.can_view_trip(trip_id));

-- A plain RLS-governed client insert, not an RPC -- unlike check_in/trigger_sos
-- there's no business-logic validation beyond row-level scoping (can't
-- impersonate another sender, can't post into a trip you can't view).
create policy "trip_messages_insert_own" on public.trip_messages
  for insert with check (sender_id = auth.uid() and public.can_view_trip(trip_id));

create or replace function public.set_trip_message_sender_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select full_name into new.sender_name from public.profiles where id = new.sender_id;
  return new;
end;
$$;

create trigger trip_messages_set_sender_name
  before insert on public.trip_messages
  for each row execute function public.set_trip_message_sender_name();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('boarding', 'alighting', 'delay', 'geofence', 'sos', 'mismatch', 'announcement', 'message'));

-- Fans out a notification to every other trip participant (guardians on the
-- roster + driver/attendant), excluding the sender. Mirrors
-- queue_sms_fallback's existing trigger-does-the-fan-out shape
-- (0011_push_and_sms.sql) rather than wrapping the primary insert in an RPC.
-- Deliberately NOT added to queue_sms_fallback's own type list -- real SMS
-- per chat message would be spammy/costly; this rides the unconditional
-- dispatch_push_notification trigger (0016_push_dispatch_trigger.sql) for
-- real push instead. `returns trigger` functions can't be invoked directly
-- via PostgREST (Postgres rejects calling them outside trigger context), so
-- this needs no explicit grant lockdown, same as queue_sms_fallback.
create or replace function public.notify_trip_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
begin
  select * into v_trip from public.trips where id = new.trip_id;

  insert into public.notifications (recipient_id, type, title, body, related_trip_id)
  select distinct gsl.guardian_id, 'message', format('New message from %s', new.sender_name), new.body, new.trip_id
  from public.attendance_expectations ae
  join public.guardian_student_links gsl on gsl.student_id = ae.student_id
  where ae.trip_id = new.trip_id and gsl.guardian_id <> new.sender_id;

  insert into public.notifications (recipient_id, type, title, body, related_trip_id)
  select p.id, 'message', format('New message from %s', new.sender_name), new.body, new.trip_id
  from public.buses b
  join public.profiles p on p.id in (b.driver_id, b.attendant_id)
  where b.id = v_trip.bus_id and p.id <> new.sender_id;

  return new;
end;
$$;

create trigger trip_messages_notify
  after insert on public.trip_messages
  for each row execute function public.notify_trip_message();
