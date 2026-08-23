-- Last-resort alternative to live tracking: if every phone on the bus is
-- unreachable (driver's and attendant's alike), an admin can manually set
-- the bus's approximate position -- e.g. after a phone call from the
-- driver -- so parents aren't left with nothing at all. `source` marks it
-- as manually-entered rather than real GPS, so the family/admin apps can
-- (and do, see AttendancePage) show it honestly instead of implying it's
-- live telemetry.
alter table public.trip_locations add column source text not null default 'gps' check (source in ('gps', 'manual'));

create or replace function public.record_manual_trip_location(p_trip_id uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'trip % not found', p_trip_id;
  end if;
  if public.current_role() <> 'admin' or v_trip.school_id <> public.current_school_id() then
    raise exception 'not authorized to manually update this trip''s position';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip % is not in progress', p_trip_id;
  end if;

  insert into public.trip_locations (trip_id, lat, lng, source)
  values (p_trip_id, p_lat, p_lng, 'manual');
end;
$$;

revoke execute on function public.record_manual_trip_location(uuid, double precision, double precision) from public;
revoke execute on function public.record_manual_trip_location(uuid, double precision, double precision) from anon;
grant execute on function public.record_manual_trip_location(uuid, double precision, double precision) to authenticated;
