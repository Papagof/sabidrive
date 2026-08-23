-- Alternative to live tracking going dark if the driver's phone is off,
-- damaged, or lost: buses.attendant_id already existed in the schema and
-- start_trip() already let an attendant start a trip, but nothing else did
-- -- an attendant couldn't check students in/out, end the trip, report
-- location, or even SELECT the trip itself (can_view_trip only checked
-- driver_id). This wires the attendant up as a genuine second crew member
-- who can pick up every one of those if the primary driver's device fails,
-- not just a location-only backup.
--
-- is_trip_crew() centralizes "is this caller the driver or attendant of
-- this trip's bus" so it isn't repeated (and doesn't drift) across
-- can_view_trip and three separate RPCs. No explicit grant/revoke here,
-- matching the existing helper functions it sits alongside (current_role,
-- current_school_id, is_guardian_of, can_view_trip) -- none of them are
-- locked down beyond the default PUBLIC grant, since they're read-only and
-- resolve to `false`/empty for an unauthenticated caller anyway.
create or replace function public.is_trip_crew(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    join public.buses b on b.id = t.bus_id
    where t.id = p_trip_id
      and (t.driver_id = auth.uid() or b.attendant_id = auth.uid())
  );
$$;

create or replace function public.can_view_trip(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = target_trip_id
    and (
      (public.current_role() = 'admin' and t.school_id = public.current_school_id())
      or (public.current_role() = 'driver' and public.is_trip_crew(t.id))
      or exists (
        select 1 from public.attendance_expectations ae
        where ae.trip_id = t.id and public.is_guardian_of(ae.student_id)
      )
    )
  );
$$;

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
  if not public.is_trip_crew(p_trip_id) then
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
  if not public.is_trip_crew(p_trip_id) then
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

create or replace function public.record_trip_location(
  p_trip_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_heading_deg numeric default null,
  p_speed_kmh numeric default null,
  p_deviation_m numeric default null,
  p_stop_etas jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_prev_speed numeric;
  v_stop record;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'trip % not found', p_trip_id;
  end if;
  if not public.is_trip_crew(p_trip_id) then
    raise exception 'not authorized to report location for this trip';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip % is not in progress', p_trip_id;
  end if;

  select speed_kmh into v_prev_speed
  from public.trip_locations
  where trip_id = p_trip_id
  order by recorded_at desc
  limit 1;

  insert into public.trip_locations (trip_id, lat, lng, heading_deg, speed_kmh)
  values (p_trip_id, p_lat, p_lng, p_heading_deg, p_speed_kmh);

  if p_speed_kmh is not null and p_speed_kmh >= v_trip.avg_speed_kmh * 1.6 then
    if not exists (
      select 1 from public.alerts
      where trip_id = p_trip_id and type = 'speeding' and created_at > now() - interval '60 seconds'
    ) then
      insert into public.alerts (school_id, trip_id, type, severity, payload)
      values (
        v_trip.school_id, p_trip_id, 'speeding', 'warning',
        jsonb_build_object('speed_kmh', round(p_speed_kmh), 'avg_speed_kmh', v_trip.avg_speed_kmh)
      );
    end if;
  end if;

  if p_speed_kmh is not null and v_prev_speed is not null and v_prev_speed - p_speed_kmh >= 15 then
    if not exists (
      select 1 from public.alerts
      where trip_id = p_trip_id and type = 'harsh_brake' and created_at > now() - interval '60 seconds'
    ) then
      insert into public.alerts (school_id, trip_id, type, severity, payload)
      values (
        v_trip.school_id, p_trip_id, 'harsh_brake', 'warning',
        jsonb_build_object('speed_kmh', round(p_speed_kmh), 'previous_speed_kmh', round(v_prev_speed))
      );
    end if;
  end if;

  if p_deviation_m is not null and p_deviation_m > 250 then
    if not exists (
      select 1 from public.alerts
      where trip_id = p_trip_id and type = 'route_deviation' and resolved_at is null
    ) then
      insert into public.alerts (school_id, trip_id, type, severity, payload)
      values (v_trip.school_id, p_trip_id, 'route_deviation', 'warning', jsonb_build_object('deviation_m', round(p_deviation_m)));
    end if;
  end if;

  for v_stop in select * from jsonb_to_recordset(p_stop_etas) as x(stop_id uuid, eta_minutes int, distance_m numeric)
  loop
    insert into public.trip_stop_etas (trip_id, stop_id, eta_minutes, distance_m, updated_at)
    values (p_trip_id, v_stop.stop_id, v_stop.eta_minutes, v_stop.distance_m, now())
    on conflict (trip_id, stop_id) do update
      set eta_minutes = excluded.eta_minutes, distance_m = excluded.distance_m, updated_at = now();

    if v_stop.eta_minutes <= 5 then
      insert into public.trip_stop_approaches (trip_id, stop_id)
      values (p_trip_id, v_stop.stop_id)
      on conflict (trip_id, stop_id) do nothing;

      if found then
        insert into public.notifications (recipient_id, type, title, body, related_trip_id)
        select gsl.guardian_id, 'geofence', 'Bus approaching your stop',
          format('The bus is about %s minute(s) away.', greatest(0, v_stop.eta_minutes)),
          p_trip_id
        from public.students s
        join public.guardian_student_links gsl on gsl.student_id = s.id
        where s.default_stop_id = v_stop.stop_id;
      end if;
    end if;
  end loop;
end;
$$;
