-- Helper functions (SECURITY DEFINER so they can read `profiles` without
-- being subject to the RLS policy they're used inside of — this is what
-- avoids infinite recursion on the profiles table itself).

create or replace function public.current_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_school_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_guardian_of(target_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.guardian_student_links
    where guardian_id = auth.uid() and student_id = target_student_id
  );
$$;

-- Single source of truth for "can this caller see this trip", reused by every
-- trip-scoped table (trips, trip_locations, trip_stop_etas, check_in_events,
-- attendance_expectations) so the three-role logic isn't duplicated per policy.
create or replace function public.can_view_trip(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trips t
    where t.id = target_trip_id
    and (
      (public.current_role() = 'admin' and t.school_id = public.current_school_id())
      or (public.current_role() = 'driver' and t.driver_id = auth.uid())
      or (public.current_role() = 'parent' and exists (
        select 1 from public.attendance_expectations ae
        where ae.trip_id = t.id and public.is_guardian_of(ae.student_id)
      ))
    )
  );
$$;

-- New Supabase Auth users get a matching `profiles` row from their signup
-- metadata (full_name/role/school_id), set by whatever creates the account
-- (seed script or, later, an admin invite flow).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, school_id, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'parent'),
    nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid,
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- === profiles ===
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_select_admin_school" on public.profiles
  for select using (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Lets a parent see the name/phone of the driver assigned to their child's
-- bus (spec: "quick-call driver", "driver verification visible to parents") —
-- scoped to only drivers actually on a bus carrying one of their children.
create policy "profiles_select_driver_of_child_bus" on public.profiles
  for select using (
    role = 'driver'
    and id in (
      select b.driver_id from public.buses b
      join public.trips t on t.bus_id = b.id
      join public.attendance_expectations ae on ae.trip_id = t.id
      where public.is_guardian_of(ae.student_id)
    )
  );

-- === schools ===
alter table public.schools enable row level security;

create policy "schools_select_member" on public.schools
  for select using (id = public.current_school_id());

create policy "schools_update_admin" on public.schools
  for update using (public.current_role() = 'admin' and id = public.current_school_id())
  with check (public.current_role() = 'admin' and id = public.current_school_id());

-- === routes ===
alter table public.routes enable row level security;

create policy "routes_admin_crud" on public.routes
  for all using (public.current_role() = 'admin' and school_id = public.current_school_id())
  with check (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "routes_select_driver" on public.routes
  for select using (
    public.current_role() = 'driver'
    and id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
  );

create policy "routes_select_parent" on public.routes
  for select using (
    public.current_role() = 'parent'
    and id in (
      select default_route_id from public.students s
      where exists (select 1 from public.guardian_student_links gsl where gsl.student_id = s.id and gsl.guardian_id = auth.uid())
    )
  );

-- === stops ===
alter table public.stops enable row level security;

create policy "stops_admin_crud" on public.stops
  for all using (public.current_role() = 'admin' and school_id = public.current_school_id())
  with check (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "stops_select_driver" on public.stops
  for select using (
    public.current_role() = 'driver'
    and route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
  );

create policy "stops_select_parent" on public.stops
  for select using (
    public.current_role() = 'parent'
    and id in (
      select default_stop_id from public.students s
      where exists (select 1 from public.guardian_student_links gsl where gsl.student_id = s.id and gsl.guardian_id = auth.uid())
    )
  );

-- === buses ===
alter table public.buses enable row level security;

create policy "buses_admin_crud" on public.buses
  for all using (public.current_role() = 'admin' and school_id = public.current_school_id())
  with check (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "buses_select_driver" on public.buses
  for select using (driver_id = auth.uid() or attendant_id = auth.uid());

create policy "buses_select_parent" on public.buses
  for select using (
    public.current_role() = 'parent'
    and id in (
      select t.bus_id from public.trips t
      join public.attendance_expectations ae on ae.trip_id = t.id
      where public.is_guardian_of(ae.student_id)
    )
  );

-- === students ===
alter table public.students enable row level security;

create policy "students_admin_crud" on public.students
  for all using (public.current_role() = 'admin' and school_id = public.current_school_id())
  with check (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "students_select_driver" on public.students
  for select using (
    public.current_role() = 'driver'
    and default_route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
  );

create policy "students_select_parent" on public.students
  for select using (public.is_guardian_of(id));

-- === guardian_student_links ===
alter table public.guardian_student_links enable row level security;

create policy "gsl_select_own" on public.guardian_student_links
  for select using (guardian_id = auth.uid());

create policy "gsl_admin_crud" on public.guardian_student_links
  for all using (
    public.current_role() = 'admin'
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = public.current_school_id())
  )
  with check (
    public.current_role() = 'admin'
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = public.current_school_id())
  );

-- === trips ===
alter table public.trips enable row level security;

create policy "trips_select_visible" on public.trips
  for select using (public.can_view_trip(id));
-- No client-side insert/update policy: trip lifecycle changes only via the
-- SECURITY DEFINER RPCs in 0004_functions_rpc.sql (start_trip/end_trip).

-- === trip_locations ===
alter table public.trip_locations enable row level security;

create policy "trip_locations_select_visible" on public.trip_locations
  for select using (public.can_view_trip(trip_id));
-- Writes come only from the trusted service-role GPS simulator (packages/gps-sim).

-- === trip_stop_etas ===
alter table public.trip_stop_etas enable row level security;

create policy "trip_stop_etas_select_visible" on public.trip_stop_etas
  for select using (public.can_view_trip(trip_id));

-- === check_in_events ===
alter table public.check_in_events enable row level security;

create policy "check_in_events_select_visible" on public.check_in_events
  for select using (public.can_view_trip(trip_id));
-- Writes only via the check_in() RPC.

-- === attendance_expectations ===
alter table public.attendance_expectations enable row level security;

create policy "attendance_expectations_select_visible" on public.attendance_expectations
  for select using (public.can_view_trip(trip_id));
-- Writes only via start_trip()/end_trip()/check_in() RPCs.

-- === notifications ===
alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (recipient_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- Inserts (fan-out) only via RPCs/service role — never directly by a client.

-- === alerts ===
alter table public.alerts enable row level security;

create policy "alerts_select_admin" on public.alerts
  for select using (public.current_role() = 'admin' and school_id = public.current_school_id());

create policy "alerts_resolve_admin" on public.alerts
  for update using (public.current_role() = 'admin' and school_id = public.current_school_id())
  with check (public.current_role() = 'admin' and school_id = public.current_school_id());
-- Inserts only via RPCs/service role.
