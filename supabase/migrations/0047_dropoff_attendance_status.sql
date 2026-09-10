-- Real drop-off (return-leg) trips: check_in() previously only recorded a
-- 'board' event as fulfilling attendance_expectations -- an 'alight' event
-- (the only kind of check-in a genuine dropoff-direction trip would ever
-- record) left the student's status stuck at 'pending' forever. Add a
-- distinct 'alighted' status so a dropoff trip's attendance can actually be
-- marked fulfilled, symmetric with 'boarded' for pickup trips.
--
-- check_in()'s signature (p_trip_id, p_qr_token, p_event_type, p_method) is
-- unchanged from 0031_attendant_backup_crew.sql -- this is a same-signature
-- `create or replace`, not the documented overload trap, so no drop/grant
-- work is needed.

alter table public.attendance_expectations drop constraint attendance_expectations_status_check;
alter table public.attendance_expectations add constraint attendance_expectations_status_check
  check (status in ('pending', 'boarded', 'alighted', 'missed', 'excused'));

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
  elsif p_event_type = 'alight' then
    update public.attendance_expectations
    set status = 'alighted', updated_at = now()
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
