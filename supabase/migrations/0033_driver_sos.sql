-- Driver-triggered emergency alert. Both alerts.type and notifications.type
-- (and the SMS-fallback trigger's fan-out list, 0011_push_and_sms.sql) have
-- allowed a 'sos' value since the very first schema -- it was reserved for
-- exactly this, a manual panic button on the driver's active-trip page, but
-- nothing ever actually inserted one. Mirrors end_trip/check_in's shape:
-- is_trip_crew() authorization, only while the trip is in_progress, fans
-- out to both the school's admins (alerts + notification) and the trip's
-- guardians (notification only -- guardians don't see the Alerts triage
-- page, they see their own notification timeline).
create or replace function public.trigger_sos(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_bus_label text;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'trip % not found', p_trip_id;
  end if;
  if not public.is_trip_crew(p_trip_id) then
    raise exception 'not authorized to raise an SOS for this trip';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip % is not in progress', p_trip_id;
  end if;

  select label into v_bus_label from public.buses where id = v_trip.bus_id;

  insert into public.alerts (school_id, trip_id, type, severity, payload)
  values (v_trip.school_id, p_trip_id, 'sos', 'critical', jsonb_build_object('triggered_by', auth.uid()));

  insert into public.notifications (recipient_id, type, title, body, related_trip_id)
  select p.id, 'sos', 'Emergency alert',
    format('The driver of %s has raised an emergency alert.', coalesce(v_bus_label, 'the bus')),
    p_trip_id
  from public.profiles p
  where p.school_id = v_trip.school_id and p.role = 'admin';

  insert into public.notifications (recipient_id, type, title, body, related_trip_id, related_student_id)
  select gsl.guardian_id, 'sos', 'Emergency alert on your child''s bus',
    format('The driver of %s has raised an emergency alert. Your school has been notified.', coalesce(v_bus_label, 'the bus')),
    p_trip_id, ae.student_id
  from public.attendance_expectations ae
  join public.guardian_student_links gsl on gsl.student_id = ae.student_id
  where ae.trip_id = p_trip_id;
end;
$$;

revoke execute on function public.trigger_sos(uuid) from public;
revoke execute on function public.trigger_sos(uuid) from anon;
grant execute on function public.trigger_sos(uuid) to authenticated;
