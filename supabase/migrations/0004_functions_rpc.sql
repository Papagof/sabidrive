-- RPCs are the only way trip-lifecycle rows get written by client sessions.
-- Each one re-checks authorization against auth.uid() internally, so being
-- SECURITY DEFINER (needed to fan out notifications to *other* users) never
-- grants more than "act as the driver/admin who is legitimately calling this".

create or replace function public.start_trip(p_bus_id uuid, p_direction text default 'pickup')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus record;
  v_trip_id uuid;
begin
  select * into v_bus from public.buses where id = p_bus_id;
  if v_bus is null then
    raise exception 'bus % not found', p_bus_id;
  end if;
  if v_bus.driver_id is distinct from auth.uid() and v_bus.attendant_id is distinct from auth.uid() then
    raise exception 'not authorized to start a trip for this bus';
  end if;
  if v_bus.default_route_id is null then
    raise exception 'bus % has no route assigned', p_bus_id;
  end if;
  if v_bus.current_trip_id is not null then
    raise exception 'bus % already has an active trip', p_bus_id;
  end if;

  insert into public.trips (school_id, bus_id, route_id, driver_id, status, direction, started_at)
  values (v_bus.school_id, p_bus_id, v_bus.default_route_id, auth.uid(), 'in_progress', p_direction, now())
  returning id into v_trip_id;

  insert into public.attendance_expectations (trip_id, student_id)
  select v_trip_id, s.id
  from public.students s
  where s.default_route_id = v_bus.default_route_id and s.school_id = v_bus.school_id
  on conflict (trip_id, student_id) do nothing;

  update public.buses set status = 'active', current_trip_id = v_trip_id where id = p_bus_id;

  return v_trip_id;
end;
$$;

create or replace function public.end_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_missed_count integer;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'trip % not found', p_trip_id;
  end if;
  if v_trip.driver_id is distinct from auth.uid() then
    raise exception 'not authorized to end this trip';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip % is not in progress', p_trip_id;
  end if;

  update public.trips set status = 'completed', ended_at = now() where id = p_trip_id;
  update public.buses set status = 'inactive', current_trip_id = null where current_trip_id = p_trip_id;

  update public.attendance_expectations
  set status = 'missed', updated_at = now()
  where trip_id = p_trip_id and status = 'pending';
  get diagnostics v_missed_count = row_count;

  if v_missed_count > 0 then
    insert into public.alerts (school_id, trip_id, type, severity, payload)
    values (v_trip.school_id, p_trip_id, 'attendance_mismatch', 'warning', jsonb_build_object('missed_count', v_missed_count));

    insert into public.notifications (recipient_id, type, title, body, related_trip_id)
    select p.id, 'mismatch', 'Attendance mismatch',
      format('%s student(s) did not check in before the trip ended.', v_missed_count),
      p_trip_id
    from public.profiles p
    where p.school_id = v_trip.school_id and p.role = 'admin';
  end if;
end;
$$;

create or replace function public.check_in(p_trip_id uuid, p_qr_token uuid, p_event_type text default 'board')
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
  values (p_trip_id, v_student.id, v_student.default_stop_id, p_event_type, 'qr', auth.uid());

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
