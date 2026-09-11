-- CRITICAL fix: profiles_update_own (0003_rls_policies.sql) lets any
-- signed-in user update ANY column on their own profiles row -- the policy
-- only checks `id = auth.uid()`, with no column restriction. current_role()
-- and current_school_id() (also 0003) -- which every admin-scoped RLS
-- policy in the whole schema gates on (routes_admin_crud, stops_admin_crud,
-- buses_admin_crud, students_admin_crud, schools_update_admin,
-- alerts_select_admin, audit_log_select_admin, ...) -- both read role/
-- school_id straight off that same row. Before this fix, any authenticated
-- parent or driver could run a single client-side update --
-- `.from('profiles').update({ role: 'admin', school_id: '<any-school>' })`
-- -- and instantly gain full read/write access to that school's students,
-- routes, buses, alerts, and audit log. A full cross-tenant privilege
-- escalation, found in an audit, not reported live.
--
-- verification_status and deactivated_at are also authorization-relevant
-- (the driver verification badge, the deactivation ban) and email is a
-- read-only denormalized mirror of auth.users.email (0019_profiles_email.sql)
-- that should never drift from it via a client write. Same "protect an
-- authorization-relevant column from the client, only service-role (or, for
-- verification_status, the already-RLS-scoped admin path) may touch it"
-- shape as protect_phone_verified (0021_phone_verification.sql).
--
-- verification_status keeps a narrow exception for the existing admin flow
-- (Buses page click-to-cycle, profiles_update_driver_admin policy already
-- restricts this to an admin updating a driver in their own school) --
-- everything else here has no legitimate authenticated-role write path at
-- all: role/school_id are only ever set at account creation via
-- auth.admin.createUser/inviteUserByEmail (service-role, an INSERT via
-- handle_new_user, not a profiles UPDATE), and deactivated_at is only ever
-- set by the service-role deactivate-driver Route Handler.
create or replace function public.protect_profile_privilege_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.school_id is distinct from old.school_id then
      new.school_id := old.school_id;
    end if;
    if new.email is distinct from old.email then
      new.email := old.email;
    end if;
    if new.deactivated_at is distinct from old.deactivated_at then
      new.deactivated_at := old.deactivated_at;
    end if;
    if new.verification_status is distinct from old.verification_status
       and public.current_role() is distinct from 'admin' then
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privilege_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privilege_columns();

-- Smaller, lower-severity instance of the same shape of gap:
-- notifications_update_own (0003_rls_policies.sql) lets a recipient update
-- any column on their own notification row, not just is_read (the only
-- field packages/supabase/src/hooks/useNotifications.ts ever actually
-- writes). Impact is self-only (a user can only deface their own
-- notification history, no other user or privilege is affected), but the
-- same "lock down everything the client isn't supposed to touch" discipline
-- applies -- type/title/body/recipient/related_* should be immutable once
-- inserted by whichever trigger/RPC created them.
create or replace function public.protect_notification_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    new.recipient_id := old.recipient_id;
    new.type := old.type;
    new.title := old.title;
    new.body := old.body;
    new.related_trip_id := old.related_trip_id;
    new.related_student_id := old.related_student_id;
  end if;
  return new;
end;
$$;

create trigger notifications_protect_immutable_fields
  before update on public.notifications
  for each row execute function public.protect_notification_immutable_fields();
