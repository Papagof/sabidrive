-- Student pickup/drop-off address: captured while inviting a parent
-- (Admin -> Students -> "+ Invite new guardian"), editable by the admin
-- anytime via the existing student-edit panel, and self-service editable by
-- the parent anytime after -- no approval gate. Editing the address notifies
-- the school's admins; when an admin then actually reassigns the student's
-- route/stop in response, that specific change notifies the guardian(s) and
-- the new route's driver/attendant automatically.

alter table public.students add column pickup_address text;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('boarding', 'alighting', 'delay', 'geofence', 'sos', 'mismatch', 'announcement', 'message', 'pickup_address_changed', 'stop_assignment_changed'));

-- RLS is row-level, not column-level -- a blanket UPDATE grant to guardians
-- would also let them touch default_route_id/grade/names. This narrow RPC
-- only ever writes pickup_address.
create or replace function public.update_student_pickup_address(p_student_id uuid, p_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_guardian_of(p_student_id) then
    raise exception 'Not authorized';
  end if;
  update public.students set pickup_address = p_address where id = p_student_id;
end;
$$;

revoke all on function public.update_student_pickup_address(uuid, text) from public;
grant execute on function public.update_student_pickup_address(uuid, text) to authenticated;

create or replace function public.notify_pickup_address_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, related_student_id)
  select p.id, 'pickup_address_changed',
    format('Address updated: %s %s', new.first_name, new.last_name),
    coalesce(new.pickup_address, '(cleared)'),
    new.id
  from public.profiles p
  where p.school_id = new.school_id and p.role = 'admin';
  return new;
end;
$$;

create trigger students_notify_pickup_address_changed
  after update on public.students
  for each row
  when (old.pickup_address is distinct from new.pickup_address)
  execute function public.notify_pickup_address_changed();

create or replace function public.notify_stop_assignment_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, related_student_id)
  select gsl.guardian_id, 'stop_assignment_changed',
    'Pickup/drop-off assignment updated',
    format('%s %s''s route/stop assignment was updated.', new.first_name, new.last_name),
    new.id
  from public.guardian_student_links gsl
  where gsl.student_id = new.id;

  insert into public.notifications (recipient_id, type, title, body, related_student_id)
  select r.recipient_id, 'stop_assignment_changed',
    'Route assignment updated',
    format('%s %s''s route/stop assignment was updated.', new.first_name, new.last_name),
    new.id
  from public.buses b
  cross join lateral (values (b.driver_id), (b.attendant_id)) as r(recipient_id)
  where b.default_route_id = new.default_route_id and r.recipient_id is not null;

  return new;
end;
$$;

create trigger students_notify_stop_assignment_changed
  after update on public.students
  for each row
  when (old.default_route_id is distinct from new.default_route_id or old.default_stop_id is distinct from new.default_stop_id)
  execute function public.notify_stop_assignment_changed();
