-- Two-factor pickup authorization needs the driver to see, for a student on
-- their route: who's an authorized guardian (guardian_student_links) and
-- those guardians' names (profiles). Neither was previously readable by the
-- driver role — caught while wiring up the driver Scan screen's pickup
-- lookup (studentQueries.getPickupInfo).

create policy "gsl_select_driver" on public.guardian_student_links
  for select using (
    public.current_role() = 'driver'
    and student_id in (
      select s.id from public.students s
      where s.default_route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
    )
  );

create policy "profiles_select_guardian_of_route_student" on public.profiles
  for select using (
    role = 'parent'
    and id in (
      select gsl.guardian_id from public.guardian_student_links gsl
      join public.students s on s.id = gsl.student_id
      where s.default_route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
    )
  );
