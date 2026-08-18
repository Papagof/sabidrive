-- Lets an admin (or driver) account also act as a guardian at another
-- school with the same login, e.g. someone who runs School A and whose own
-- child attends School B. Being a guardian is a capability layered on top
-- of an account's primary role, not gated by it -- students_select_parent
-- already worked this way (is_guardian_of(id), no role check); this brings
-- the other guardian-facing policies in line with that existing pattern
-- instead of inventing a new mechanism. A guardian gains only read-only
-- parent-level visibility into that one child, same as any parent -- this
-- changes nothing about admin/driver write privileges.

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
      or exists (
        select 1 from public.attendance_expectations ae
        where ae.trip_id = t.id and public.is_guardian_of(ae.student_id)
      )
    )
  );
$$;

drop policy "routes_select_parent" on public.routes;
create policy "routes_select_parent" on public.routes
  for select using (
    id in (
      select default_route_id from public.students s
      where exists (select 1 from public.guardian_student_links gsl where gsl.student_id = s.id and gsl.guardian_id = auth.uid())
    )
  );

drop policy "stops_select_parent" on public.stops;
create policy "stops_select_parent" on public.stops
  for select using (
    id in (
      select default_stop_id from public.students s
      where exists (select 1 from public.guardian_student_links gsl where gsl.student_id = s.id and gsl.guardian_id = auth.uid())
    )
  );

drop policy "buses_select_parent" on public.buses;
create policy "buses_select_parent" on public.buses
  for select using (
    id in (
      select t.bus_id from public.trips t
      join public.attendance_expectations ae on ae.trip_id = t.id
      where public.is_guardian_of(ae.student_id)
    )
  );

-- 0015_driver_pickup_visibility.sql's policy filtered the target profile by
-- role = 'parent', which would hide a cross-role guardian's name from a
-- driver's two-factor pickup lookup.
drop policy "profiles_select_guardian_of_route_student" on public.profiles;
create policy "profiles_select_guardian_of_route_student" on public.profiles
  for select using (
    id in (
      select gsl.guardian_id from public.guardian_student_links gsl
      join public.students s on s.id = gsl.student_id
      where s.default_route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
    )
  );

-- 0023_multi_school_parents.sql's create_announcement() fan-out (rewritten
-- there to be GSL-driven instead of profiles.school_id-driven) still
-- filtered recipients by p.role = 'parent', which excludes a cross-role
-- guardian from ever receiving the school's announcements. Drop that
-- filter too, for the same reason as everything else in this migration.
create or replace function public.create_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_announcement_id uuid;
begin
  if public.current_role() <> 'admin' then
    raise exception 'only an admin can create announcements';
  end if;
  v_school_id := public.current_school_id();

  insert into public.announcements (school_id, title, body, created_by)
  values (v_school_id, p_title, p_body, auth.uid())
  returning id into v_announcement_id;

  insert into public.notifications (recipient_id, type, title, body)
  select distinct p.id, 'announcement', p_title, p_body
  from public.profiles p
  join public.guardian_student_links gsl on gsl.guardian_id = p.id
  join public.students s on s.id = gsl.student_id
  where s.school_id = v_school_id;

  return v_announcement_id;
end;
$$;
