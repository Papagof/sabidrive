-- Offline GPS queuing (apps/family/src/lib/useLiveLocationSharing.ts): a
-- driver who loses network briefly now queues fixes locally and replays
-- them in order once back online, instead of silently dropping them. A
-- replayed burst landing with trip_locations.recorded_at = now() (the
-- replay time) instead of each fix's true original moment would corrupt
-- the trip's actual position history, so record_trip_location gains an
-- optional p_recorded_at, defaulting to the old now() behavior when omitted
-- (the simulator's own calls never pass it).
--
-- Per this project's own documented CREATE OR REPLACE overload trap (hit
-- for real on check_in in 0026_pickup_sms_codes.sql): appending a parameter
-- does not replace the function in place -- Postgres treats a different
-- argument list as a distinct overload. Explicitly drop the old signature
-- first.
drop function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb);

create or replace function public.record_trip_location(
  p_trip_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_heading_deg numeric default null,
  p_speed_kmh numeric default null,
  p_deviation_m numeric default null,
  p_stop_etas jsonb default '[]'::jsonb,
  p_recorded_at timestamptz default null
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

  insert into public.trip_locations (trip_id, lat, lng, heading_deg, speed_kmh, recorded_at)
  values (p_trip_id, p_lat, p_lng, p_heading_deg, p_speed_kmh, coalesce(p_recorded_at, now()));

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

revoke execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb, timestamptz) from public;
revoke execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb, timestamptz) from anon;
grant execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb, timestamptz) to authenticated;
