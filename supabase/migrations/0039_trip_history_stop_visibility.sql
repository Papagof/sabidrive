-- Found live while building parent trip history: stops_select_parent only
-- covers a student's *current* default_stop_id, so a guardian couldn't see
-- the stop name for a past check-in at a different stop (a real case after
-- a route/stop reassignment, or -- as this migration's own live test caught
-- -- simply when a student was never assigned a default stop at all).
-- Extends the policy with a second clause granting visibility for any stop
-- the guardian's child actually has a check_in_events row at, mirroring the
-- same "historical access via a permanent linking row" pattern
-- can_view_trip()/attendance_expectations already established for trips.
drop policy "stops_select_parent" on public.stops;
create policy "stops_select_parent" on public.stops
  for select using (
    id in (
      select default_stop_id from public.students s
      where exists (select 1 from public.guardian_student_links gsl where gsl.student_id = s.id and gsl.guardian_id = auth.uid())
    )
    or id in (
      select ce.stop_id from public.check_in_events ce
      where ce.stop_id is not null and public.is_guardian_of(ce.student_id)
    )
  );
