-- Real GPS, phase 1: the driver's own phone (via the browser Geolocation API
-- on the trip page) reports live position instead of packages/gps-sim's
-- time-based simulation. gps-sim stays available as a separate dev/demo
-- tool (`pnpm sim:dev`) -- this just adds a second, real-world path that
-- writes to the same trip_locations table, so every downstream consumer
-- (useTripLocation, ETAs, the admin fleet map) needs no changes at all.
--
-- Route-projection math (distance-along-route, deviation-from-route,
-- per-stop ETA) is pure geometry with no security weight, so it's computed
-- client-side in the browser using @sabidrive/gps-sim's existing engine --
-- reusing exactly what gps-sim already does, rather than re-deriving it in
-- SQL. What this RPC does NOT trust the client for is *whether an alert or
-- notification fires*: it independently re-applies the same thresholds
-- packages/gps-sim/src/telemetry.ts uses (speeding = 1.6x average,
-- harsh-brake = 15kmh drop between consecutive fixes) against the numbers
-- the client reports, with its own cooldown/dedupe state kept in Postgres
-- (the alerts table's own history, plus the new trip_stop_approaches table)
-- instead of an in-memory Map the way run-local.ts does it -- there's no
-- long-running process here to hold that state.
create table public.trip_stop_approaches (
  trip_id uuid not null references public.trips (id) on delete cascade,
  stop_id uuid not null references public.stops (id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (trip_id, stop_id)
);
alter table public.trip_stop_approaches enable row level security;
-- No client policies, same reasoning as pickup_codes (0026): only ever
-- touched from inside record_trip_location() below.

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
  if v_trip.driver_id is distinct from auth.uid() then
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

revoke execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb) from public;
revoke execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb) from anon;
grant execute on function public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb) to authenticated;

-- Extend the existing nightly purge (0012, extended again in 0026) --
-- trip_stop_approaches is meaningless once trip_locations for the trip has
-- already been purged.
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
  delete from public.trip_stop_approaches tsa
    using public.trips t
    where tsa.trip_id = t.id and t.status = 'completed' and t.ended_at < now() - interval '1 day';
end;
$$;
